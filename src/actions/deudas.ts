"use server";

import { revalidatePath } from "next/cache";
import { type EstadoAccion, exito, falla } from "@/lib/acciones";
import { formatearCOP } from "@/lib/domain/dinero";
import { proximaCuota } from "@/lib/domain/deudas";
import { hoyISO } from "@/lib/domain/obligaciones";
import { primerDiaDelPeriodo } from "@/lib/domain/periodos";
import { serverEnv } from "@/lib/env.server";
import { createClient } from "@/lib/supabase/server";
import {
  abonoSchema,
  castigoSchema,
  deudaSchema,
  erroresPorCampo,
  pagoDeudaSchema,
  prestamoSchema,
  reembolsoSchema,
  uuid,
} from "@/lib/validaciones";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function revalidar() {
  revalidatePath("/", "layout");
}

const invalido = (error: Parameters<typeof erroresPorCampo>[0]): EstadoAccion => ({
  ok: false,
  error: "Revisa los campos marcados.",
  errores: erroresPorCampo(error),
});

const hoy = () => hoyISO(new Date(), serverEnv().APP_TIMEZONE);

async function categoriaGasto(supabase: Supabase, nombre: string) {
  const { data } = await supabase
    .from("categorias")
    .select("id")
    .eq("tipo", "gasto")
    .eq("nombre", nombre)
    .is("padre_id", null)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

// ── Deudas ───────────────────────────────────────────────────────────────

/**
 * Crea o edita una deuda. Con "crear_obligacion" mantiene una obligación mensual (plantilla)
 * con la cuota total, para que aparezca en el checklist del mes desde la próxima cuota.
 */
export async function guardarDeuda(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const parsed = deudaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalido(parsed.error);
  const { id, registrar_desembolso, crear_obligacion, ...d } = parsed.data;
  const fila = {
    ...d,
    tasa_ea: d.tasa_ea ?? 0,
    seguro_mensual: d.seguro_mensual ?? 0,
    aporte_mensual: d.aporte_mensual ?? 0,
    cuenta_aportes_id: (d.aporte_mensual ?? 0) > 0 ? d.cuenta_aportes_id : null,
    cuenta_desembolso_id: registrar_desembolso ? d.cuenta_desembolso_id : null,
  };

  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("deudas").update(fila).eq("id", id).select("id").single()
    : await supabase.from("deudas").insert(fila).select("id").single();
  if (error) return falla(error);

  // Obligación mensual (cuota + seguro + aporte) en el checklist.
  const cuotaTotal = fila.cuota + fila.seguro_mensual + fila.aporte_mensual;
  const { data: plantilla } = await supabase.from("obligaciones").select("id").eq("deuda_id", data.id).maybeSingle();
  let detalle = "";
  if (crear_obligacion && cuotaTotal > 0) {
    const esCoop = fila.tipo === "cooperativa";
    const categoria = await categoriaGasto(supabase, esCoop ? "Cooperativas" : "Préstamos");
    if (!categoria) return falla("No encontré la categoría de préstamos para crear la obligación del mes.");
    const comun = {
      nombre: fila.nombre,
      tipo: esCoop ? ("cooperativa" as const) : ("deuda" as const),
      categoria_id: categoria,
      monto_estimado: cuotaTotal,
      dia_vencimiento: fila.dia_pago,
      cuenta_default_id: fila.cuenta_pago_default_id,
      activa: true,
    };
    const r = plantilla
      ? await supabase.from("obligaciones").update(comun).eq("id", plantilla.id)
      : await supabase.from("obligaciones").insert({
          ...comun,
          deuda_id: data.id,
          frecuencia: "mensual",
          es_variable: false,
          // Desde el mes de la próxima cuota, para no marcar como vencida una que ya pagaste.
          fecha_inicio: primerDiaDelPeriodo(proximaCuota(hoy(), fila.dia_pago).slice(0, 7)),
        });
    if (r.error) return falla(r.error);
    detalle = plantilla ? "" : " Su cuota ya aparece en el checklist del mes.";
  } else if (plantilla) {
    const r = await supabase.from("obligaciones").update({ activa: false }).eq("id", plantilla.id);
    if (r.error) return falla(r.error);
  }

  revalidar();
  return exito(`Deuda ${fila.nombre} ${id ? "actualizada" : "registrada"}.${detalle}`, { id: data.id });
}

/** Archiva o reactiva una deuda (y su obligación mensual). */
export async function alternarDeuda(id: string, activa: boolean): Promise<EstadoAccion> {
  if (!uuid.safeParse(id).success) return falla("Deuda inválida");
  const supabase = await createClient();
  const { error } = await supabase.from("deudas").update({ activa }).eq("id", id);
  if (error) return falla(error);
  await supabase.from("obligaciones").update({ activa }).eq("deuda_id", id);
  revalidar();
  return exito(activa ? "Deuda reactivada." : "Deuda archivada. Su historial se conserva.");
}

/** Elimina una deuda sin pagos (con su desembolso y su obligación mensual). */
export async function eliminarDeuda(id: string): Promise<EstadoAccion> {
  if (!uuid.safeParse(id).success) return falla("Deuda inválida");
  const supabase = await createClient();
  const { count } = await supabase.from("pagos_deuda").select("id", { count: "exact", head: true }).eq("deuda_id", id);
  if ((count ?? 0) > 0) return falla("La deuda ya tiene pagos: archívala para conservar su historia.");
  const { data: plantilla } = await supabase.from("obligaciones").select("id").eq("deuda_id", id).maybeSingle();
  if (plantilla) {
    // Las cuotas del checklist sin pagos en meses abiertos se van con ella.
    const inst = await supabase
      .from("v_obligaciones_mes")
      .select("id")
      .eq("obligacion_id", plantilla.id)
      .eq("estado_periodo", "abierto")
      .eq("n_pagos", 0);
    const ids = (inst.data ?? []).map((i) => i.id!);
    if (ids.length) {
      const r = await supabase.from("obligaciones_periodo").delete().in("id", ids);
      if (r.error) return falla(r.error);
    }
    const r = await supabase.from("obligaciones").delete().eq("id", plantilla.id);
    if (r.error) return falla(r.error);
  }
  const { error } = await supabase.from("deudas").delete().eq("id", id);
  if (error) return falla(error);
  revalidar();
  return exito("Deuda eliminada.");
}

// ── Pagos de deuda ───────────────────────────────────────────────────────

export async function guardarPagoDeuda(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const parsed = pagoDeudaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalido(parsed.error);
  const { id, ...p } = parsed.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("pagos_deuda").update(p).eq("id", id)
    : await supabase.from("pagos_deuda").insert(p);
  if (error) return falla(error);

  // ¿Quedó pagada? Se archiva con su obligación mensual.
  const { data: d } = await supabase
    .from("v_estado_deudas")
    .select("nombre, saldo_capital, activa")
    .eq("id", p.deuda_id)
    .single();
  let detalle = "";
  if (d && Number(d.saldo_capital) <= 0 && d.activa) {
    await supabase.from("deudas").update({ activa: false }).eq("id", p.deuda_id);
    await supabase.from("obligaciones").update({ activa: false }).eq("deuda_id", p.deuda_id);
    detalle = ` 🎉 ¡Terminaste de pagar ${d.nombre}!`;
  } else if (d) {
    detalle = ` Saldo de capital: ${formatearCOP(Number(d.saldo_capital))}.`;
  }
  revalidar();
  return exito(`Pago de ${formatearCOP(p.monto)} ${id ? "actualizado" : "registrado"}.${detalle}`);
}

export async function eliminarPagoDeuda(id: string): Promise<EstadoAccion> {
  if (!uuid.safeParse(id).success) return falla("Pago inválido");
  const supabase = await createClient();
  const { error, count } = await supabase.from("pagos_deuda").delete({ count: "exact" }).eq("id", id);
  if (error) return falla(error);
  if (!count) return falla("No se encontró el pago.");
  revalidar();
  return exito("Pago eliminado (y sus movimientos de caja).");
}

// ── Préstamos que hiciste ────────────────────────────────────────────────

export async function guardarPrestamo(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const parsed = prestamoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalido(parsed.error);
  const { id, ...p } = parsed.data;
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("prestamos_otorgados").update(p).eq("id", id).select("id").single()
    : await supabase.from("prestamos_otorgados").insert(p).select("id").single();
  if (error) return falla(error);
  revalidar();
  return exito(`Préstamo a ${p.deudor} por ${formatearCOP(p.monto)} ${id ? "actualizado" : "registrado"}.`, {
    id: data.id,
  });
}

export async function eliminarPrestamo(id: string): Promise<EstadoAccion> {
  if (!uuid.safeParse(id).success) return falla("Préstamo inválido");
  const supabase = await createClient();
  const { error, count } = await supabase.from("prestamos_otorgados").delete({ count: "exact" }).eq("id", id);
  if (error) {
    if (error.code === "23503")
      return falla("El préstamo ya tiene abonos: elimínalos primero o márcalo como castigado.");
    return falla(error);
  }
  if (!count) return falla("No se encontró el préstamo.");
  revalidar();
  return exito("Préstamo eliminado.");
}

export async function castigarPrestamo(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const parsed = castigoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalido(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase
    .from("prestamos_otorgados")
    .update({ castigado_en: hoy(), motivo_castigo: parsed.data.motivo_castigo })
    .eq("id", parsed.data.id);
  if (error) return falla(error);
  revalidar();
  return exito("Préstamo marcado como castigado: deja de contar como plata por cobrar.");
}

export async function quitarCastigo(id: string): Promise<EstadoAccion> {
  if (!uuid.safeParse(id).success) return falla("Préstamo inválido");
  const supabase = await createClient();
  const { error } = await supabase
    .from("prestamos_otorgados")
    .update({ castigado_en: null, motivo_castigo: null })
    .eq("id", id);
  if (error) return falla(error);
  revalidar();
  return exito("El préstamo vuelve a estar por cobrar.");
}

/** Abono de un deudor: entra plata como recuperación (no es ingreso operativo). */
export async function guardarAbono(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const parsed = abonoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalido(parsed.error);
  const { id, ...a } = parsed.data;
  const supabase = await createClient();
  const fila = { ...a, tipo: "recuperacion_prestamo" as const };
  const { error } = id
    ? await supabase.from("movimientos").update(fila).eq("id", id)
    : await supabase.from("movimientos").insert(fila as typeof fila & { periodo_id: string });
  if (error) return falla(error);
  const { data: p } = await supabase
    .from("v_prestamos_otorgados")
    .select("deudor, saldo")
    .eq("id", a.prestamo_otorgado_id)
    .single();
  revalidar();
  const detalle = p
    ? Number(p.saldo) <= 0
      ? ` ✓ ${p.deudor} terminó de pagarte.`
      : ` ${p.deudor} te debe ${formatearCOP(Number(p.saldo))}.`
    : "";
  return exito(`Abono de ${formatearCOP(a.monto)} ${id ? "actualizado" : "registrado"}.${detalle}`);
}

export async function eliminarAbono(id: string): Promise<EstadoAccion> {
  if (!uuid.safeParse(id).success) return falla("Abono inválido");
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("movimientos")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("tipo", "recuperacion_prestamo");
  if (error) return falla(error);
  if (!count) return falla("No se encontró el abono.");
  revalidar();
  return exito("Abono eliminado.");
}

// ── Reembolsos Devtopia ──────────────────────────────────────────────────

export async function registrarReembolso(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const parsed = reembolsoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalido(parsed.error);
  const r = parsed.data;
  if (r.movimientos.length + r.compras.length === 0) return falla("Elige al menos un gasto reembolsado.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_reembolso", {
    p_cuenta: r.cuenta_id,
    p_fecha: r.fecha,
    p_monto: r.monto,
    p_movimientos: r.movimientos,
    p_compras: r.compras,
    p_descripcion: r.descripcion ?? undefined,
  });
  if (error) return falla(error);
  revalidar();
  const n = r.movimientos.length + r.compras.length;
  return exito(
    `Reembolso de ${formatearCOP(r.monto)} registrado: ${n} gasto${n === 1 ? "" : "s"} cobrado${n === 1 ? "" : "s"}.`,
  );
}

/** Deshace un reembolso: sus gastos vuelven a quedar por cobrar. */
export async function eliminarReembolso(id: string): Promise<EstadoAccion> {
  if (!uuid.safeParse(id).success) return falla("Reembolso inválido");
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("movimientos")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("tipo", "reembolso_devtopia");
  if (error) return falla(error);
  if (!count) return falla("No se encontró el reembolso.");
  revalidar();
  return exito("Reembolso eliminado: sus gastos vuelven a estar por cobrar.");
}
