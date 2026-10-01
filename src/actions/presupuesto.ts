"use server";

import { revalidatePath } from "next/cache";
import { type EstadoAccion, exito, falla } from "@/lib/acciones";
import { createClient } from "@/lib/supabase/server";
import { erroresPorCampo, presupuestoSchema } from "@/lib/validaciones";

/**
 * Guarda el presupuesto del mes (reemplaza sus líneas). Con "plantilla" también lo deja como
 * plantilla: los meses sin presupuesto propio la usan automáticamente.
 */
export async function guardarPresupuesto(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const parsed = presupuestoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Revisa los montos del presupuesto.", errores: erroresPorCampo(parsed.error) };
  }
  const { periodo_id, plantilla, items } = parsed.data;
  const lineas = items.filter((i) => i.monto > 0);
  const supabase = await createClient();
  const { error } = await supabase.rpc("guardar_presupuesto", { p_periodo: periodo_id, p_items: lineas });
  if (error) return falla(error);
  if (plantilla) {
    // p_periodo null = plantilla (el tipo generado no marca el argumento como opcional).
    const { error: e2 } = await supabase.rpc("guardar_presupuesto", {
      p_periodo: null as unknown as string,
      p_items: lineas,
    });
    if (e2) return falla(e2);
  }
  revalidatePath("/", "layout");
  return exito(
    lineas.length === 0
      ? "Presupuesto del mes vacío"
      : plantilla
        ? "Presupuesto guardado para este mes y como plantilla"
        : "Presupuesto del mes guardado",
  );
}
