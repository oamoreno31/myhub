import type { PostgrestError } from "@supabase/supabase-js";
import type { ErroresCampo } from "@/lib/validaciones";

/** Resultado estándar de una server action usada con useActionState. */
export type EstadoAccion = {
  ok?: boolean;
  error?: string;
  errores?: ErroresCampo;
  mensaje?: string;
  /** Cambia en cada envío exitoso para que el cliente reaccione (cerrar hoja, toast). */
  marca?: number;
  id?: string;
};

export const ESTADO_INICIAL: EstadoAccion = {};

export function exito(mensaje: string, extra: Partial<EstadoAccion> = {}): EstadoAccion {
  return { ok: true, mensaje, marca: Date.now(), ...extra };
}

/**
 * Traduce errores de Supabase/Postgres a mensajes para el usuario.
 * Las excepciones de nuestras funciones SQL ya vienen en español.
 */
export function mensajeError(error: Pick<PostgrestError, "code" | "message"> | null | undefined): string {
  if (!error) return "Ocurrió un error inesperado.";
  switch (error.code) {
    case "23505":
      return "Ya existe un registro con ese nombre.";
    case "23503":
      return "No se puede completar: el registro está en uso o la referencia no existe.";
    case "23514":
      return "Algún valor no cumple las reglas (revisa montos y fechas).";
    case "42501":
      return "No tienes permiso para esta acción.";
    case "PGRST116":
      return "No se encontró el registro.";
    case "P0001":
    case "P0002":
      return error.message;
    default:
      return error.message || "Ocurrió un error inesperado.";
  }
}

export function falla(error: Pick<PostgrestError, "code" | "message"> | string | null | undefined): EstadoAccion {
  return { ok: false, error: typeof error === "string" ? error : mensajeError(error) };
}
