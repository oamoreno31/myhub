"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type EstadoAccion, exito, falla } from "@/lib/acciones";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validaciones";

function revalidar() {
  revalidatePath("/", "layout");
}

// ── Tokens ─────────────────────────────────────────────────────────────────

/** Crea un token; el token en claro viaja una sola vez en `token` (no se guarda en la app). */
export async function crearTokenApi(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre || nombre.length > 40) {
    return { ok: false, error: "Revisa el nombre.", errores: { nombre: "Escribe un nombre de máximo 40 caracteres" } };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crear_token_api", { p_nombre: nombre });
  if (error) return falla(error);
  revalidar();
  const r = data as { id: string; token: string };
  return exito(`Token "${nombre}" creado. Cópialo ahora: no se vuelve a mostrar.`, { id: r.id, token: r.token });
}

export async function revocarTokenApi(id: string): Promise<EstadoAccion> {
  if (!uuid.safeParse(id).success) return falla("Token inválido");
  const supabase = await createClient();
  const { error } = await supabase.rpc("revocar_token_api", { p_id: id });
  if (error) return falla(error);
  revalidar();
  return exito("Token revocado. Los atajos que lo usen dejan de funcionar.");
}

// ── Alias aprendidos ───────────────────────────────────────────────────────

export async function cambiarAlias(id: string, cuentaId: string): Promise<EstadoAccion> {
  if (!uuid.safeParse(id).success || !uuid.safeParse(cuentaId).success) return falla("Selección inválida");
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("alias_origen")
    .update({ cuenta_id: cuentaId }, { count: "exact" })
    .eq("id", id);
  if (error) return falla(error);
  if (!count) return falla("No se encontró el alias.");
  revalidar();
  return exito("Listo: la próxima vez se sugiere esa cuenta.");
}

export async function eliminarAlias(id: string): Promise<EstadoAccion> {
  if (!uuid.safeParse(id).success) return falla("Alias inválido");
  const supabase = await createClient();
  const { error, count } = await supabase.from("alias_origen").delete({ count: "exact" }).eq("id", id);
  if (error) return falla(error);
  if (!count) return falla("No se encontró el alias.");
  revalidar();
  return exito("Alias olvidado. Se volverá a aprender la próxima vez que elijas el origen.");
}

// ── Bandeja "Por revisar" ──────────────────────────────────────────────────

const revisionSchema = z
  .array(
    z.object({
      registro: z.enum(["movimiento", "compra_tc"]),
      id: uuid,
      /** null: se confirma con la categoría que ya tiene (o sin categoría, si es transferencia). */
      categoria_id: uuid.nullable(),
    }),
  )
  .min(1, "Nada que revisar")
  .max(100, "Máximo 100 a la vez");

export type ItemConfirmacion = z.infer<typeof revisionSchema>[number];

/**
 * Confirma registros de la bandeja: fija la categoría (si se eligió) y apaga "por revisar".
 * "Por clasificar" no cuenta como categoría elegida (la base de datos lo mantiene en la bandeja).
 */
export async function confirmarRevision(items: ItemConfirmacion[]): Promise<EstadoAccion> {
  const parsed = revisionSchema.safeParse(items);
  if (!parsed.success) return falla(parsed.error.issues[0]?.message ?? "Datos inválidos");
  const supabase = await createClient();

  const elegidas = [...new Set(parsed.data.map((i) => i.categoria_id).filter((c): c is string => Boolean(c)))];
  if (elegidas.length) {
    const { data, error } = await supabase
      .from("categorias")
      .select("id")
      .in("id", elegidas)
      .eq("es_sistema", true)
      .eq("nombre", "Por clasificar");
    if (error) return falla(error);
    if (data.length) return falla("Elige una categoría distinta de «Por clasificar».");
  }

  const resultados = await Promise.all(
    parsed.data.map(async (i) => {
      const cambios = i.categoria_id ? { categoria_id: i.categoria_id, por_revisar: false } : { por_revisar: false };
      const tabla = i.registro === "compra_tc" ? "compras_tc" : "movimientos";
      const { error } = await supabase.from(tabla).update(cambios).eq("id", i.id);
      return error;
    }),
  );
  revalidar();
  const errores = resultados.filter(Boolean);
  const ok = resultados.length - errores.length;
  if (errores.length) {
    return falla(
      `${ok ? `${ok} revisado${ok > 1 ? "s" : ""}; ` : ""}${errores.length} no se pudo${errores.length > 1 ? "eron" : ""}: ${errores[0]!.message}`,
    );
  }
  return exito(ok === 1 ? "Registro revisado." : `${ok} registros revisados.`);
}
