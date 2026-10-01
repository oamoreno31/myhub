"use server";

import { revalidatePath } from "next/cache";
import { type EstadoAccion, exito, falla } from "@/lib/acciones";
import { formatearCOP } from "@/lib/domain/dinero";
import { createClient } from "@/lib/supabase/server";
import {
  ajusteObligacionSchema,
  decisionesCierreSchema,
  erroresPorCampo,
  obligacionPuntualSchema,
  omitirSchema,
  reabrirSchema,
  uuid,
} from "@/lib/validaciones";

function revalidar() {
  revalidatePath("/", "layout");
}

/** Agrega al mes una obligación que no viene de una plantilla (p. ej. una multa, un regalo). */
export async function crearObligacionPuntual(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const parsed = obligacionPuntualSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Revisa los campos.", errores: erroresPorCampo(parsed.error) };
  const { es_ingreso, ...o } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("obligaciones_periodo")
    .insert({ ...o, tipo: es_ingreso ? "ingreso_esperado" : "otro" });
  if (error) return falla(error);
  revalidar();
  return exito(`"${o.nombre}" agregada al mes.`);
}

/** Ajusta el monto o la fecha de una obligación de este mes (p. ej. llegó la factura real). */
export async function ajustarObligacion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const parsed = ajusteObligacionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Revisa los campos.", errores: erroresPorCampo(parsed.error) };
  const { id, ...cambios } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("obligaciones_periodo").update(cambios).eq("id", id);
  if (error) return falla(error);
  revalidar();
  return exito(`Ajustada a ${formatearCOP(cambios.monto_esperado)}.`);
}

export async function omitirObligacion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const parsed = omitirSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Revisa los campos.", errores: erroresPorCampo(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase
    .from("obligaciones_periodo")
    .update({ resolucion: "omitida", motivo: parsed.data.motivo })
    .eq("id", parsed.data.id)
    .is("resolucion", null);
  if (error) return falla(error);
  revalidar();
  return exito("Obligación omitida este mes.");
}

export async function restaurarObligacion(id: string): Promise<EstadoAccion> {
  if (!uuid.safeParse(id).success) return falla("Obligación inválida");
  const supabase = await createClient();
  const { error } = await supabase
    .from("obligaciones_periodo")
    .update({ resolucion: null, motivo: null })
    .eq("id", id)
    .eq("resolucion", "omitida");
  if (error) return falla(error);
  revalidar();
  return exito("Obligación restaurada.");
}

/** Solo se pueden eliminar obligaciones puntuales sin pagos; las de plantilla se omiten. */
export async function eliminarObligacionPuntual(id: string): Promise<EstadoAccion> {
  if (!uuid.safeParse(id).success) return falla("Obligación inválida");
  const supabase = await createClient();
  const { data: op, error: e1 } = await supabase
    .from("v_obligaciones_mes")
    .select("obligacion_id, arrastrada_de_id, n_pagos")
    .eq("id", id)
    .single();
  if (e1) return falla(e1);
  if (op.obligacion_id || op.arrastrada_de_id)
    return falla("Esta obligación viene de una plantilla: omítela en su lugar.");
  if ((op.n_pagos ?? 0) > 0) return falla("Tiene pagos registrados. Elimina primero los pagos.");
  const { error } = await supabase.from("obligaciones_periodo").delete().eq("id", id);
  if (error) return falla(error);
  revalidar();
  return exito("Obligación eliminada.");
}

export async function cerrarMes(periodoId: string, decisiones: unknown): Promise<EstadoAccion> {
  if (!uuid.safeParse(periodoId).success) return falla("Mes inválido");
  const parsed = decisionesCierreSchema.safeParse(decisiones);
  if (!parsed.success) return falla("Decisiones de cierre inválidas");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cerrar_periodo", { p_periodo: periodoId, p_decisiones: parsed.data });
  if (error) return falla(error);
  revalidar();
  return exito("Mes cerrado. Quedó guardada la foto de tus indicadores.");
}

export async function reabrirMes(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const parsed = reabrirSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Revisa los campos.", errores: erroresPorCampo(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reabrir_periodo", {
    p_periodo: parsed.data.periodo_id,
    p_motivo: parsed.data.motivo,
  });
  if (error) return falla(error);
  revalidar();
  return exito("Mes reabierto.");
}
