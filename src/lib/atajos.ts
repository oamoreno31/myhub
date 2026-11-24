import "server-only";
import { createClient, type PostgrestError } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Piezas comunes de /api/atajos/v1/* (docs/08 §3).
 * - Sin sesión ni cookies: el token personal es la credencial y viaja en `Authorization: Bearer`.
 * - Se usa la llave PUBLICABLE (rol anon). La secret key no se usa aquí: las funciones SQL
 *   `atajo_*` (security definer) validan el token y fijan el user_id.
 */

export function clienteAtajos() {
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Token de `Authorization: Bearer pc_…`. Solo encabezado: nunca en la URL. */
export function tokenDe(request: Request): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization")?.trim() ?? "");
  return m ? m[1] : null;
}

/** Respuesta JSON sin caché. */
export function responder(cuerpo: Record<string, unknown>, status = 200) {
  return NextResponse.json(cuerpo, { status, headers: { "Cache-Control": "no-store" } });
}

export function fallo(mensaje: string, status: number) {
  return responder({ ok: false, mensaje: `⚠️ ${mensaje}` }, status);
}

export const SIN_TOKEN = () =>
  fallo("Falta el token. Configúralo en el atajo (Plata Clara → Configuración → Atajos de iPhone).", 401);

/**
 * Lee el cuerpo: JSON (aunque llegue sin Content-Type, como "Archivo" desde Atajos) o formulario
 * ("Formulario" en Atajos). Un cuerpo vacío o inválido cuenta como {}.
 */
export async function leerJson(request: Request): Promise<unknown> {
  const tipo = request.headers.get("content-type") ?? "";
  if (/multipart\/form-data|application\/x-www-form-urlencoded/i.test(tipo)) {
    try {
      const datos = await request.formData();
      return Object.fromEntries([...datos.entries()].filter(([, v]) => typeof v === "string"));
    } catch {
      return {};
    }
  }
  try {
    const texto = await request.text();
    return texto.trim() ? JSON.parse(texto) : {};
  } catch {
    return {};
  }
}

/**
 * Errores de las funciones SQL: PTxxx = código HTTP elegido en SQL (token, frecuencia).
 * El resto no se detalla al cliente (puede traer información interna).
 */
export function respuestaDeError(error: PostgrestError) {
  const http = /^PT(\d{3})$/.exec(error.code ?? "");
  if (http) return fallo(error.message, Number(http[1]));
  console.error("[atajos]", error.code, error.message);
  return fallo("No se pudo completar. Intenta de nuevo en un momento.", 500);
}
