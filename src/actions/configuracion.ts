"use server";

import { revalidatePath } from "next/cache";
import { type EstadoAccion, exito, falla } from "@/lib/acciones";
import { obtenerPeriodoActual } from "@/lib/periodo-seleccionado";
import { fechaEnMes } from "@/lib/domain/obligaciones";
import { primerDiaDelPeriodo } from "@/lib/domain/periodos";
import { createClient } from "@/lib/supabase/server";
import {
  categoriaSchema,
  cuentaSchema,
  erroresPorCampo,
  parametrosSchema,
  plantillaSchema,
  uuid,
} from "@/lib/validaciones";

function revalidar() {
  revalidatePath("/", "layout");
}

// ── Cuentas ────────────────────────────────────────────────────────────────

export async function guardarCuenta(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const parsed = cuentaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Revisa los campos.", errores: erroresPorCampo(parsed.error) };
  const { id, ...c } = parsed.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("cuentas").update(c).eq("id", id)
    : await supabase.from("cuentas").insert(c);
  if (error) return falla(error);
  revalidar();
  return exito(`Cuenta "${c.nombre}" ${id ? "actualizada" : "creada"}.`);
}

export async function alternarCuenta(id: string, activa: boolean): Promise<EstadoAccion> {
  if (!uuid.safeParse(id).success) return falla("Cuenta inválida");
  const supabase = await createClient();
  const { error } = await supabase.from("cuentas").update({ activa }).eq("id", id);
  if (error) return falla(error);
  revalidar();
  return exito(activa ? "Cuenta activada." : "Cuenta archivada. Su historial se conserva.");
}

// ── Categorías ─────────────────────────────────────────────────────────────

export async function guardarCategoria(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const parsed = categoriaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Revisa los campos.", errores: erroresPorCampo(parsed.error) };
  const { id, ...c } = parsed.data;
  const supabase = await createClient();

  if (id) {
    const actual = await supabase.from("categorias").select("es_sistema").eq("id", id).single();
    if (actual.error) return falla(actual.error);
    // En categorías del sistema solo se ajustan la bolsa 50/30/20 y la descripción obligatoria.
    const cambios = actual.data.es_sistema
      ? { bolsa: c.bolsa, requiere_descripcion: c.requiere_descripcion, es_fija: c.es_fija }
      : c;
    const { error } = await supabase.from("categorias").update(cambios).eq("id", id);
    if (error) return falla(error);
  } else {
    const { error } = await supabase.from("categorias").insert(c);
    if (error) return falla(error);
  }
  revalidar();
  return exito(`Categoría "${c.nombre}" ${id ? "actualizada" : "creada"}.`);
}

export async function alternarCategoria(id: string, activa: boolean): Promise<EstadoAccion> {
  if (!uuid.safeParse(id).success) return falla("Categoría inválida");
  const supabase = await createClient();
  const { data, error: e1 } = await supabase.from("categorias").select("es_sistema").eq("id", id).single();
  if (e1) return falla(e1);
  if (data.es_sistema && !activa) return falla("Las categorías del sistema no se pueden desactivar.");
  const { error } = await supabase.from("categorias").update({ activa }).eq("id", id);
  if (error) return falla(error);
  revalidar();
  return exito(activa ? "Categoría activada." : "Categoría desactivada. Su historial se conserva.");
}

// ── Obligaciones recurrentes (plantillas) ─────────────────────────────────

export async function guardarPlantilla(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const parsed = plantillaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Revisa los campos.", errores: erroresPorCampo(parsed.error) };
  const { id, aplicar_mes_actual, fecha_inicio, mes_ancla, fecha_fin, ...p } = parsed.data;
  const fila = {
    ...p,
    fecha_inicio: primerDiaDelPeriodo(fecha_inicio),
    mes_ancla: mes_ancla ? primerDiaDelPeriodo(mes_ancla) : null,
    fecha_fin: fecha_fin ? primerDiaDelPeriodo(fecha_fin) : null,
  };

  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("obligaciones").update(fila).eq("id", id).select("id").single()
    : await supabase.from("obligaciones").insert(fila).select("id").single();
  if (error) return falla(error);

  const periodoActual = obtenerPeriodoActual();
  const mesActual = primerDiaDelPeriodo(periodoActual);
  let detalle = "";
  if (id && aplicar_mes_actual) {
    // Actualiza la instancia de este mes solo si aún no tiene pagos.
    const inst = await supabase
      .from("v_obligaciones_mes")
      .select("id, n_pagos, estado_periodo")
      .eq("obligacion_id", id)
      .eq("mes", mesActual)
      .is("arrastrada_de_id", null)
      .maybeSingle();
    if (inst.data && inst.data.estado_periodo === "abierto" && (inst.data.n_pagos ?? 0) === 0) {
      const { error: e2 } = await supabase
        .from("obligaciones_periodo")
        .update({
          nombre: p.nombre,
          tipo: p.tipo,
          categoria_id: p.categoria_id,
          cuenta_default_id: p.cuenta_default_id,
          monto_esperado: p.monto_estimado,
          fecha_vencimiento: fechaEnMes(periodoActual, p.dia_vencimiento),
        })
        .eq("id", inst.data.id!);
      if (e2) return falla(e2);
      detalle = " También se actualizó este mes.";
    } else if (inst.data) {
      detalle = " Este mes ya tiene pagos: el cambio aplica desde el próximo.";
    }
  }
  // Si la plantilla aplica a este mes y aún no está, se agrega.
  await supabase.rpc("generar_periodo", { p_mes: mesActual });

  revalidar();
  return exito(`Obligación "${p.nombre}" ${id ? "actualizada" : "creada"}.${detalle}`, { id: data.id });
}

export async function alternarPlantilla(id: string, activa: boolean): Promise<EstadoAccion> {
  if (!uuid.safeParse(id).success) return falla("Obligación inválida");
  const supabase = await createClient();
  const { error } = await supabase.from("obligaciones").update({ activa }).eq("id", id);
  if (error) return falla(error);
  if (activa) await supabase.rpc("generar_periodo", { p_mes: primerDiaDelPeriodo(obtenerPeriodoActual()) });
  revalidar();
  return exito(
    activa
      ? "Obligación activada."
      : "Obligación pausada: no se generará en los próximos meses. Lo de este mes se conserva.",
  );
}

// ── Parámetros ────────────────────────────────────────────────────────────

export async function guardarParametros(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const parsed = parametrosSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Revisa los campos.", errores: erroresPorCampo(parsed.error) };
  const supabase = await createClient();
  const { data: sesion } = await supabase.auth.getClaims();
  const userId = sesion?.claims.sub;
  if (!userId) return falla("Sesión requerida");
  const { error } = await supabase
    .from("parametros")
    .update({
      meta_ahorro_pct: parsed.data.meta_ahorro_pct / 100,
      recordatorios_email: parsed.data.recordatorios_email,
    })
    .eq("user_id", userId);
  if (error) return falla(error);
  revalidar();
  return exito("Preferencias guardadas.");
}
