"use server";

import { revalidatePath } from "next/cache";
import { type EstadoAccion, exito, falla } from "@/lib/acciones";
import { formatearCOP } from "@/lib/domain/dinero";
import { ETIQUETA_TIPO_COMPRA } from "@/lib/domain/tarjetas";
import { createClient } from "@/lib/supabase/server";
import { borrarComprobante, leerComprobante } from "@/lib/comprobantes";
import { compraTCSchema, erroresPorCampo, extractoSchema, pagoTCSchema, tarjetaSchema, uuid } from "@/lib/validaciones";
import type { NuevaFila } from "@/types/db";

function revalidar() {
  revalidatePath("/", "layout");
}

const invalido = (error: Parameters<typeof erroresPorCampo>[0]): EstadoAccion => ({
  ok: false,
  error: "Revisa los campos marcados.",
  errores: erroresPorCampo(error),
});

// ── Tarjeta ──────────────────────────────────────────────────────────────

export async function guardarTarjeta(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const parsed = tarjetaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalido(parsed.error);
  const { id, nombre, entidad, ...t } = parsed.data;
  const supabase = await createClient();

  if (!id) {
    const { data, error } = await supabase.rpc("crear_tarjeta", {
      p_nombre: nombre,
      p_franquicia: t.franquicia,
      p_ultimos4: t.ultimos4 ?? "",
      p_cupo: t.cupo,
      p_dia_corte: t.dia_corte,
      p_dia_limite_pago: t.dia_limite_pago,
      p_tasa_ea_ref: t.tasa_ea_ref ?? undefined,
      p_cuota_manejo_ref: t.cuota_manejo_ref ?? undefined,
      p_cuenta_pago_default_id: t.cuenta_pago_default_id ?? undefined,
      p_entidad: entidad ?? undefined,
    });
    if (error) return falla(error);
    revalidar();
    return exito(`Tarjeta ${nombre} creada.`, { id: data });
  }

  const { data: actual, error: e1 } = await supabase
    .from("tarjetas_credito")
    .update(t)
    .eq("id", id)
    .select("cuenta_id")
    .single();
  if (e1) return falla(e1);
  const { error: e2 } = await supabase.from("cuentas").update({ nombre, entidad }).eq("id", actual.cuenta_id);
  if (e2) return falla(e2);
  revalidar();
  return exito(`Tarjeta ${nombre} actualizada.`, { id });
}

/** Archiva o reactiva una tarjeta (conserva toda su historia). */
export async function alternarTarjeta(id: string, activa: boolean): Promise<EstadoAccion> {
  if (!uuid.safeParse(id).success) return falla("Tarjeta inválida");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tarjetas_credito")
    .update({ activa })
    .eq("id", id)
    .select("cuenta_id")
    .single();
  if (error) return falla(error);
  const { error: e2 } = await supabase.from("cuentas").update({ activa }).eq("id", data.cuenta_id);
  if (e2) return falla(e2);
  revalidar();
  return exito(activa ? "Tarjeta reactivada." : "Tarjeta archivada.");
}

/** Elimina una tarjeta sin actividad (si ya tiene historia, se archiva). */
export async function eliminarTarjeta(id: string): Promise<EstadoAccion> {
  if (!uuid.safeParse(id).success) return falla("Tarjeta inválida");
  const supabase = await createClient();
  const [c, e, p] = await Promise.all(
    (["compras_tc", "extractos_tc", "pagos_tc"] as const).map((t) =>
      supabase.from(t).select("id", { count: "exact", head: true }).eq("tarjeta_id", id),
    ),
  );
  if ((c.count ?? 0) + (e.count ?? 0) + (p.count ?? 0) > 0) {
    return falla("La tarjeta ya tiene movimientos: archívala para conservar su historia.");
  }
  const { data, error } = await supabase.from("tarjetas_credito").select("cuenta_id").eq("id", id).single();
  if (error) return falla(error);
  // Borrar la cuenta borra la tarjeta en cascada.
  const { error: e2 } = await supabase.from("cuentas").delete().eq("id", data.cuenta_id);
  if (e2) return falla(e2);
  revalidar();
  return exito("Tarjeta eliminada.");
}

// ── Compras, avances, devoluciones y ajustes ─────────────────────────────

export async function guardarCompra(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const parsed = compraTCSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalido(parsed.error);
  const { id, signo, ...c } = parsed.data;
  const esCategorizable = c.tipo === "compra" || c.tipo === "devolucion";
  const fila = {
    ...c,
    monto: c.tipo === "ajuste" && signo === "-" ? -c.monto : c.monto,
    num_cuotas: c.tipo === "compra" || c.tipo === "avance" ? c.num_cuotas : 1,
    categoria_id: esCategorizable ? c.categoria_id : null,
    cuenta_destino_id: c.tipo === "avance" ? c.cuenta_destino_id : null,
    reembolsable: esCategorizable && c.tipo === "compra" ? c.reembolsable : false,
    monto_origen: c.moneda === "USD" ? c.monto_origen : null,
    trm: c.moneda === "USD" ? c.trm : null,
  };

  const supabase = await createClient();
  const adjunto = await leerComprobante(supabase, formData);
  if (adjunto.error) return falla(adjunto.error);
  const conAdjunto = adjunto.valor === undefined ? {} : { adjunto_path: adjunto.valor };
  // periodo_id lo asigna el trigger según la fecha.
  const { data, error } = id
    ? await supabase
        .from("compras_tc")
        .update({ ...fila, ...conAdjunto })
        .eq("id", id)
        .select("id")
        .single()
    : await supabase
        .from("compras_tc")
        .insert({
          ...(fila satisfies Omit<NuevaFila<"compras_tc">, "periodo_id"> as NuevaFila<"compras_tc">),
          ...conAdjunto,
        })
        .select("id")
        .single();
  if (error) return falla(error);
  if (adjunto.anterior && adjunto.anterior !== adjunto.valor && adjunto.valor !== undefined)
    await borrarComprobante(supabase, adjunto.anterior);
  revalidar();
  const cuotas = fila.num_cuotas > 1 ? ` a ${fila.num_cuotas} cuotas` : "";
  return exito(
    `${ETIQUETA_TIPO_COMPRA[c.tipo]} de ${formatearCOP(Math.abs(fila.monto))}${cuotas} ${id ? "actualizada" : "registrada"}.`,
    { id: data.id },
  );
}

export async function eliminarCompra(id: string): Promise<EstadoAccion> {
  if (!uuid.safeParse(id).success) return falla("Compra inválida");
  const supabase = await createClient();
  const { data: previo } = await supabase.from("compras_tc").select("adjunto_path").eq("id", id).maybeSingle();
  const { error, count } = await supabase.from("compras_tc").delete({ count: "exact" }).eq("id", id);
  if (error) return falla(error);
  if (!count) return falla("No se encontró la compra.");
  await borrarComprobante(supabase, previo?.adjunto_path);
  revalidar();
  return exito("Compra eliminada. La deuda se recalculó.");
}

// ── Extractos ────────────────────────────────────────────────────────────

export async function guardarExtracto(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const parsed = extractoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalido(parsed.error);
  const { id, ...e } = parsed.data;
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("extractos_tc").update(e).eq("id", id).select("id").single()
    : await supabase
        .from("extractos_tc")
        .insert(e satisfies Omit<NuevaFila<"extractos_tc">, "periodo_id"> as NuevaFila<"extractos_tc">)
        .select("id")
        .single();
  if (error) {
    if (error.code === "23505") return falla("Ya registraste un extracto con esa fecha de corte.");
    return falla(error);
  }
  revalidar();
  // RETURNING devuelve la fila antes del recálculo (trigger AFTER): se lee de nuevo.
  const { data: calc } = await supabase
    .from("extractos_tc")
    .select("otros_generados, alerta")
    .eq("id", data.id)
    .single();
  const otros = Number(calc?.otros_generados ?? 0);
  const detalle =
    calc?.alerta === "conciliacion_negativa"
      ? " Revisa: el banco cobra menos de lo que tienes registrado."
      : otros > 0
        ? ` Otros cargos del periodo: ${formatearCOP(otros)}.`
        : "";
  return exito(`Extracto ${id ? "actualizado" : "registrado"}.${detalle}`, { id: data.id });
}

export async function eliminarExtracto(id: string): Promise<EstadoAccion> {
  if (!uuid.safeParse(id).success) return falla("Extracto inválido");
  const supabase = await createClient();
  const { error, count } = await supabase.from("extractos_tc").delete({ count: "exact" }).eq("id", id);
  if (error) return falla(error);
  if (!count) return falla("No se encontró el extracto.");
  revalidar();
  return exito("Extracto eliminado.");
}

// ── Pagos ────────────────────────────────────────────────────────────────

export async function guardarPago(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const parsed = pagoTCSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalido(parsed.error);
  const { id, ...p } = parsed.data;
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("pagos_tc").update(p).eq("id", id).select("id").single()
    : await supabase.from("pagos_tc").insert(p).select("id").single();
  if (error) return falla(error);
  revalidar();
  const { data: calc } = await supabase.from("pagos_tc").select("tipo_calculado").eq("id", data.id).single();
  const aviso = calc?.tipo_calculado === "inferior_minimo" ? " Quedó por debajo del mínimo: genera mora." : "";
  return exito(`Pago de ${formatearCOP(p.monto)} ${id ? "actualizado" : "registrado"}.${aviso}`, { id: data.id });
}

export async function eliminarPago(id: string): Promise<EstadoAccion> {
  if (!uuid.safeParse(id).success) return falla("Pago inválido");
  const supabase = await createClient();
  const { error, count } = await supabase.from("pagos_tc").delete({ count: "exact" }).eq("id", id);
  if (error) return falla(error);
  if (!count) return falla("No se encontró el pago.");
  revalidar();
  return exito("Pago eliminado (y su movimiento de caja).");
}
