import "server-only";
import { cache } from "react";
import type { CategoriaBasica } from "@/lib/categorias";
import type { Vista } from "@/types/db";
import { primerDiaDelPeriodo, type PeriodoId } from "@/lib/domain/periodos";
import { createClient } from "@/lib/supabase/server";

export type CuentaBasica = {
  id: string;
  nombre: string;
  tipo: string;
  saldo: number;
  activa: boolean;
};

/** Cuentas y categorías del usuario (una sola consulta por petición). */
export const obtenerCatalogos = cache(async () => {
  const supabase = await createClient();
  const [cuentas, categorias] = await Promise.all([
    supabase.from("v_saldos_cuentas").select("id, nombre, tipo, saldo, activa, orden").order("orden").order("nombre"),
    supabase
      .from("categorias")
      .select("id, nombre, tipo, grupo, padre_id, requiere_descripcion, es_sistema, activa, orden, color")
      .order("orden")
      .order("nombre"),
  ]);
  if (cuentas.error) throw new Error(cuentas.error.message);
  if (categorias.error) throw new Error(categorias.error.message);

  const todasLasCuentas: CuentaBasica[] = (cuentas.data ?? []).map((c) => ({
    id: c.id!,
    nombre: c.nombre!,
    tipo: c.tipo!,
    saldo: Number(c.saldo ?? 0),
    activa: Boolean(c.activa),
  }));

  return {
    /** Cuentas de dinero (sin tarjetas de crédito): origen de gastos, ingresos y pagos. */
    cuentas: todasLasCuentas.filter((c) => c.activa && c.tipo !== "tarjeta_credito"),
    todasLasCuentas,
    categorias: (categorias.data ?? []) as CategoriaBasica[],
  };
});

export type Catalogos = Awaited<ReturnType<typeof obtenerCatalogos>>;

/**
 * Garantiza que el mes exista y tenga sus obligaciones generadas (idempotente:
 * solo agrega lo que falte, p. ej. una plantilla nueva). Devuelve la fila del periodo.
 * Un mes cerrado no se modifica.
 */
export const asegurarPeriodo = cache(async (periodo: PeriodoId) => {
  const supabase = await createClient();
  const mes = primerDiaDelPeriodo(periodo);
  const { data: id, error } = await supabase.rpc("generar_periodo", { p_mes: mes });
  if (error) throw new Error(error.message);
  const { data, error: e2 } = await supabase.from("periodos").select("*").eq("id", id).single();
  if (e2) throw new Error(e2.message);
  return data;
});

/** Obligaciones del mes (vista con lo pagado), ordenadas por vencimiento. */
export const obtenerObligacionesMes = cache(async (periodoId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_obligaciones_mes")
    .select("*")
    .eq("periodo_id", periodoId)
    .order("fecha_vencimiento")
    .order("nombre");
  if (error) throw new Error(error.message);
  return (data ?? []).map(normalizarObligacion);
});

export type ObligacionMesUI = ReturnType<typeof normalizarObligacion>;

function normalizarObligacion(o: Vista<"v_obligaciones_mes">) {
  return {
    id: o.id!,
    periodo_id: o.periodo_id!,
    obligacion_id: o.obligacion_id,
    nombre: o.nombre!,
    tipo: o.tipo!,
    es_ingreso: Boolean(o.es_ingreso),
    categoria_id: o.categoria_id!,
    categoria_nombre: o.categoria_nombre ?? "",
    categoria_icono: o.categoria_icono,
    cuenta_default_id: o.cuenta_default_id,
    cuenta_default_nombre: o.cuenta_default_nombre,
    monto_esperado: Number(o.monto_esperado ?? 0),
    pagado: Number(o.pagado ?? 0),
    pendiente: Number(o.pendiente ?? 0),
    n_pagos: o.n_pagos ?? 0,
    ultimo_pago: o.ultimo_pago,
    fecha_vencimiento: o.fecha_vencimiento!,
    resolucion: (o.resolucion as "omitida" | "arrastrada" | null) ?? null,
    motivo: o.motivo,
    nota: o.nota,
    arrastrada_de_id: o.arrastrada_de_id,
    es_variable: Boolean(o.es_variable),
    referencia_pago: o.referencia_pago,
    frecuencia: o.frecuencia,
    estado_periodo: o.estado_periodo,
    /** Solo en obligaciones de tarjeta (nacen del extracto). */
    extracto_id: o.extracto_id,
    tarjeta_id: o.tarjeta_id,
    pago_total_tc: o.pago_total_tc === null ? null : Number(o.pago_total_tc),
    pago_minimo_tc: o.pago_minimo_tc === null ? null : Number(o.pago_minimo_tc),
    /** Solo en cuotas de préstamos (plantilla ligada a una deuda). */
    deuda_id: o.deuda_id,
  };
}

/** ¿El usuario ya configuró algo más que lo sembrado? (para mostrar el asistente inicial) */
export async function necesitaBienvenida(): Promise<boolean> {
  const supabase = await createClient();
  const { count, error } = await supabase.from("obligaciones").select("id", { count: "exact", head: true });
  if (error) return false;
  return (count ?? 0) === 0;
}
