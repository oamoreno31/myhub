import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** Registro pendiente de revisión (movimiento de cuenta o compra con tarjeta). */
export type ItemRevision = {
  registro: "movimiento" | "compra_tc";
  id: string;
  fecha: string;
  tipo: "gasto" | "ingreso" | "transferencia";
  monto: number;
  descripcion: string | null;
  comercio: string | null;
  cuenta_id: string;
  origen: string;
  ultimos4: string | null;
  destino: string | null;
  cuenta_destino_id: string | null;
  obligacion_periodo_id: string | null;
  reembolsable: boolean;
  adjunto_path: string | null;
  tarjeta_id: string | null;
  categoria_id: string | null;
  categoria_nombre: string | null;
  por_clasificar: boolean;
  num_cuotas: number | null;
  origen_registro: string | null;
  cerrado: boolean;
};

/** Cuántos registros esperan revisión (para el aviso de Inicio y Movimientos). */
export const contarPorRevisar = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count, error } = await supabase.from("v_por_revisar").select("id", { count: "exact", head: true });
  return error ? 0 : (count ?? 0);
});

export async function obtenerPorRevisar(): Promise<ItemRevision[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_por_revisar")
    .select("*")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((f) => ({
    registro: f.registro === "compra_tc" ? "compra_tc" : "movimiento",
    id: f.id!,
    fecha: f.fecha!,
    tipo: (f.tipo as ItemRevision["tipo"]) ?? "gasto",
    monto: Number(f.monto ?? 0),
    descripcion: f.descripcion,
    comercio: f.comercio,
    cuenta_id: f.cuenta_id!,
    origen: f.origen_nombre ?? "",
    ultimos4: f.ultimos4,
    destino: f.destino_nombre,
    cuenta_destino_id: f.cuenta_destino_id,
    obligacion_periodo_id: f.obligacion_periodo_id,
    reembolsable: Boolean(f.reembolsable),
    adjunto_path: f.adjunto_path,
    tarjeta_id: f.tarjeta_id,
    categoria_id: f.categoria_id,
    categoria_nombre: f.categoria_nombre,
    por_clasificar: Boolean(f.por_clasificar),
    num_cuotas: f.num_cuotas,
    origen_registro: f.origen_registro,
    cerrado: f.estado_periodo === "cerrado",
  }));
}

export type TokenUI = {
  id: string;
  nombre: string;
  prefijo: string;
  usos: number;
  ultimo_uso_en: string | null;
  ultimo_uso_fuente: string | null;
  expira_en: string | null;
  revocado_en: string | null;
  created_at: string;
};
export type AliasUI = { id: string; tipo: string; valor: string; cuenta_id: string; usos: number; ultimo_uso: string };
export type CapturaUI = {
  id: string;
  fuente: string;
  etapa: string;
  resultado: string;
  mensaje: string | null;
  texto_enmascarado: string | null;
  creado_en: string;
};

/** Tokens (sin el hash), alias aprendidos y actividad reciente de los atajos. */
export async function obtenerDatosAtajos() {
  const supabase = await createClient();
  const [tokens, alias, capturas] = await Promise.all([
    supabase
      .from("tokens_api")
      .select("id, nombre, prefijo, usos, ultimo_uso_en, ultimo_uso_fuente, expira_en, revocado_en, created_at")
      .order("revocado_en", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: false }),
    supabase
      .from("alias_origen")
      .select("id, tipo, valor, cuenta_id, usos, ultimo_uso")
      .order("ultimo_uso", { ascending: false }),
    supabase
      .from("capturas_atajo")
      .select("id, fuente, etapa, resultado, mensaje, texto_enmascarado, creado_en")
      .order("creado_en", { ascending: false })
      .limit(40),
  ]);
  for (const r of [tokens, alias, capturas]) if (r.error) throw new Error(r.error.message);
  return {
    tokens: (tokens.data ?? []) as TokenUI[],
    alias: (alias.data ?? []) as AliasUI[],
    capturas: (capturas.data ?? []) as CapturaUI[],
  };
}
