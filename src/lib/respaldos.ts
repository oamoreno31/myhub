import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { respaldosParaBorrar } from "@/lib/domain/recordatorios";
import type { Database } from "@/types/database";

export const BUCKET_RESPALDOS = "respaldos";

/**
 * Respaldo semanal de un usuario (cron): JSON completo en respaldos/{user}/{fecha}.json
 * y borra los de más de 8 semanas.
 */
export async function respaldarUsuario(admin: SupabaseClient<Database>, userId: string, hoy: string) {
  const { data, error } = await admin.rpc("exportar_respaldo_usuario", { p_user: userId });
  if (error) throw new Error(error.message);
  const cuerpo = JSON.stringify(data);
  const ruta = `${userId}/${hoy}.json`;
  const subida = await admin.storage
    .from(BUCKET_RESPALDOS)
    .upload(ruta, new Blob([cuerpo], { type: "application/json" }), { contentType: "application/json", upsert: true });
  if (subida.error) throw new Error(subida.error.message);
  const { data: lista, error: e2 } = await admin.storage.from(BUCKET_RESPALDOS).list(userId, { limit: 200 });
  if (e2) throw new Error(e2.message);
  const viejos = respaldosParaBorrar(
    (lista ?? []).map((o) => o.name),
    hoy,
  );
  if (viejos.length) await admin.storage.from(BUCKET_RESPALDOS).remove(viejos.map((n) => `${userId}/${n}`));
  return { ruta, bytes: cuerpo.length, borrados: viejos.length };
}
