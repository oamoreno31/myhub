import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "@/types/database";

/**
 * Cliente con la llave secreta: SALTA RLS.
 * Uso exclusivo en rutas /api/cron/* protegidas con CRON_SECRET.
 * Nunca importarlo desde páginas, componentes ni server actions de usuario.
 */
export function createAdminClient() {
  const { SUPABASE_SECRET_KEY } = serverEnv();
  if (!SUPABASE_SECRET_KEY) {
    throw new Error("Falta SUPABASE_SECRET_KEY para el cliente administrativo");
  }
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
