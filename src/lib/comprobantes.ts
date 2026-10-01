import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const BUCKET_COMPROBANTES = "comprobantes";

/** {user_id}/{uuid}.{ext}: la primera carpeta es el dueño (así lo exige la política de Storage). */
export const RE_COMPROBANTE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic|heif|pdf)$/i;

export function rutaValida(ruta: string, userId: string) {
  return RE_COMPROBANTE.test(ruta) && ruta.startsWith(`${userId}/`);
}

/**
 * Lee del formulario el comprobante nuevo y el anterior.
 * `valor` es undefined si el formulario no trae el campo (no se toca la columna).
 */
export async function leerComprobante(supabase: Supabase, formData: FormData) {
  if (!formData.has("adjunto_path")) return { valor: undefined, anterior: null, error: null };
  const nuevo = String(formData.get("adjunto_path") ?? "").trim() || null;
  const anterior = String(formData.get("adjunto_anterior") ?? "").trim() || null;
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (nuevo && (!userId || !rutaValida(nuevo, userId)))
    return { valor: undefined, anterior, error: "Comprobante inválido" };
  return { valor: nuevo, anterior: anterior && userId && rutaValida(anterior, userId) ? anterior : null, error: null };
}

/** Borra un archivo que ya no se usa (sin fallar si no existe). */
export async function borrarComprobante(supabase: Supabase, ruta: string | null | undefined) {
  if (!ruta) return;
  await supabase.storage.from(BUCKET_COMPROBANTES).remove([ruta]);
}
