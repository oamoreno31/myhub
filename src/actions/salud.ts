"use server";

import { revalidatePath } from "next/cache";
import { type EstadoAccion, exito, falla } from "@/lib/acciones";
import { createClient } from "@/lib/supabase/server";
import { anidarCampos, erroresPorCampo, metaSchema, pilaSchema, umbralesSchema, uuid } from "@/lib/validaciones";

const revalidar = () => revalidatePath("/", "layout");

const invalido = (error: Parameters<typeof erroresPorCampo>[0]): EstadoAccion => ({
  ok: false,
  error: "Revisa los campos marcados.",
  errores: erroresPorCampo(error),
});

// ── Metas ────────────────────────────────────────────────────────────────

export async function guardarMeta(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const parsed = metaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalido(parsed.error);
  const { id, ...m } = parsed.data;
  const supabase = await createClient();
  const { error } = id ? await supabase.from("metas").update(m).eq("id", id) : await supabase.from("metas").insert(m);
  if (error) return falla(error);
  revalidar();
  return exito(id ? "Meta actualizada" : "Meta creada");
}

export async function cambiarEstadoMeta(id: string, activa: boolean): Promise<EstadoAccion> {
  if (!uuid.safeParse(id).success) return falla("Meta inválida");
  const supabase = await createClient();
  const { error } = await supabase.from("metas").update({ activa }).eq("id", id);
  if (error) return falla(error);
  revalidar();
  return exito(activa ? "Meta reactivada" : "Meta archivada");
}

export async function eliminarMeta(id: string): Promise<EstadoAccion> {
  if (!uuid.safeParse(id).success) return falla("Meta inválida");
  const supabase = await createClient();
  const { error } = await supabase.from("metas").delete().eq("id", id);
  if (error) return falla(error);
  revalidar();
  return exito("Meta eliminada");
}

// ── Parámetros de salud ────────────────────────────────────────────────────

export async function guardarUmbrales(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const parsed = umbralesSchema.safeParse(anidarCampos(Object.fromEntries(formData)));
  if (!parsed.success) return invalido(parsed.error);
  const { tasa_usura_ea, ...umbrales } = parsed.data;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub;
  if (!userId) return falla("Sesión vencida");
  const { error } = await supabase
    .from("parametros")
    .update({ umbrales_salud: umbrales, tasa_usura_ea })
    .eq("user_id", userId);
  if (error) return falla(error);
  revalidar();
  return exito("Umbrales guardados");
}

export async function guardarParametrosPila(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const parsed = pilaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalido(parsed.error);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub;
  if (!userId) return falla("Sesión vencida");
  const { error } = await supabase.from("parametros").update({ seguridad_social: parsed.data }).eq("user_id", userId);
  if (error) return falla(error);
  revalidar();
  return exito("Parámetros de seguridad social guardados");
}
