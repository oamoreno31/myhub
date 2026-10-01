"use server";

import { revalidatePath } from "next/cache";
import { type EstadoAccion, exito, falla } from "@/lib/acciones";
import { formatearCOP } from "@/lib/domain/dinero";
import { createClient } from "@/lib/supabase/server";
import { borrarComprobante, leerComprobante } from "@/lib/comprobantes";
import { erroresPorCampo, movimientoSchema, uuid } from "@/lib/validaciones";
import type { NuevaFila } from "@/types/db";

function revalidar() {
  revalidatePath("/", "layout");
}

/** Crea o edita un ingreso, gasto o transferencia (y pagos de obligaciones del mes). */
export async function guardarMovimiento(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const parsed = movimientoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos marcados.", errores: erroresPorCampo(parsed.error) };
  }
  const { id, ...m } = parsed.data;
  const fila = {
    ...m,
    categoria_id: m.tipo === "transferencia" ? null : m.categoria_id,
    cuenta_destino_id: m.tipo === "transferencia" ? m.cuenta_destino_id : null,
    obligacion_periodo_id: m.tipo === "transferencia" ? null : m.obligacion_periodo_id,
  };

  // periodo_id lo asigna el trigger `movimientos_10_periodo` según la fecha.
  const insercion = fila satisfies Omit<NuevaFila<"movimientos">, "periodo_id"> as NuevaFila<"movimientos">;

  const supabase = await createClient();
  const adjunto = await leerComprobante(supabase, formData);
  if (adjunto.error) return falla(adjunto.error);
  const conAdjunto = adjunto.valor === undefined ? {} : { adjunto_path: adjunto.valor };
  const { data, error } = id
    ? await supabase
        .from("movimientos")
        .update({ ...fila, ...conAdjunto })
        .eq("id", id)
        .select("id")
        .single()
    : await supabase
        .from("movimientos")
        .insert({ ...insercion, ...conAdjunto })
        .select("id")
        .single();
  if (error) return falla(error);
  if (adjunto.anterior && adjunto.anterior !== adjunto.valor && adjunto.valor !== undefined)
    await borrarComprobante(supabase, adjunto.anterior);

  revalidar();
  const que = m.tipo === "ingreso" ? "Ingreso" : m.tipo === "gasto" ? "Gasto" : "Transferencia";
  return exito(`${que} de ${formatearCOP(m.monto)} ${id ? "actualizado" : "registrado"}.`, { id: data.id });
}

export async function eliminarMovimiento(id: string): Promise<EstadoAccion> {
  if (!uuid.safeParse(id).success) return falla("Movimiento inválido");
  const supabase = await createClient();
  const { data: previo } = await supabase.from("movimientos").select("adjunto_path").eq("id", id).maybeSingle();
  const { error, count } = await supabase.from("movimientos").delete({ count: "exact" }).eq("id", id);
  if (error) return falla(error);
  if (!count) return falla("No se encontró el movimiento.");
  await borrarComprobante(supabase, previo?.adjunto_path);
  revalidar();
  return exito("Movimiento eliminado.");
}
