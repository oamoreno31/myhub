import "server-only";
import { cache } from "react";
import type { CompraTC, EstadoExtracto, ExtractoTC, PagoTC, TipoCompra, TipoPago } from "@/lib/domain/tarjetas";
import { createClient } from "@/lib/supabase/server";
import type { Vista } from "@/types/db";

/** Resumen de una tarjeta (vista v_estado_tarjetas) con montos en número. */
export type TarjetaResumen = ReturnType<typeof normalizarTarjeta>;

function normalizarTarjeta(t: Vista<"v_estado_tarjetas">) {
  const cupo = Number(t.cupo ?? 0);
  const deuda = Number(t.deuda_total ?? 0);
  return {
    id: t.id!,
    cuenta_id: t.cuenta_id!,
    nombre: t.nombre!,
    entidad: t.entidad,
    franquicia: t.franquicia ?? "visa",
    ultimos4: t.ultimos4,
    cupo,
    dia_corte: t.dia_corte!,
    dia_limite_pago: t.dia_limite_pago!,
    tasa_ea_ref: t.tasa_ea_ref === null ? null : Number(t.tasa_ea_ref),
    cuota_manejo_ref: t.cuota_manejo_ref === null ? null : Number(t.cuota_manejo_ref),
    cuenta_pago_default_id: t.cuenta_pago_default_id,
    activa: Boolean(t.activa),
    capital: Number(t.capital ?? 0),
    otros_pendientes: Number(t.otros_pendientes ?? 0),
    deuda_total: deuda,
    cupo_disponible: cupo - Math.max(deuda, 0),
    utilizacion: cupo > 0 ? Math.max(deuda, 0) / cupo : 0,
    costo_financiero_anio: Number(t.costo_financiero_anio ?? 0),
    costo_financiero_total: Number(t.costo_financiero_total ?? 0),
    pagado_anio: Number(t.pagado_anio ?? 0),
    n_compras: t.n_compras ?? 0,
    primera_actividad: t.primera_actividad,
    ultimo_extracto: t.ultimo_extracto_id
      ? {
          id: t.ultimo_extracto_id,
          fecha_corte: t.ultimo_corte!,
          fecha_limite_pago: t.ultima_fecha_limite!,
          pago_total: Number(t.ultimo_pago_total ?? 0),
          pago_minimo: Number(t.ultimo_pago_minimo ?? 0),
          pagado: Number(t.ultimo_pagado ?? 0),
          estado: (t.ultimo_estado ?? "pendiente") as EstadoExtracto,
          alerta: t.ultima_alerta,
        }
      : null,
  };
}

/** Todas las tarjetas del usuario (activas primero). */
export const obtenerTarjetas = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_estado_tarjetas")
    .select("*")
    .order("activa", { ascending: false })
    .order("nombre");
  if (error) throw new Error(error.message);
  return (data ?? []).map(normalizarTarjeta);
});

export type CompraUI = Omit<CompraTC, "monto"> & {
  monto: number;
  tarjeta_id: string;
  descripcion: string | null;
  comercio: string | null;
  categoria_id: string | null;
  categoria_nombre: string | null;
  cuenta_destino_id: string | null;
  cuenta_destino_nombre: string | null;
  moneda: string;
  monto_origen: number | null;
  trm: number | null;
  reembolsable: boolean;
  reembolsado: boolean;
  primer_corte: string;
  estado_periodo: string;
};

export type ExtractoUI = ExtractoTC & {
  saldo_sistema_al_corte: number;
  otros_generados: number;
  capital_facturado: number;
  minimo_estimado: number;
  diferencia_no_explicada: number | null;
  alerta: string | null;
  pagado: number;
  estado: EstadoExtracto;
  estado_periodo: string;
};

export type PagoUI = PagoTC & {
  cuenta_origen_id: string;
  cuenta_origen_nombre: string;
  movimiento_id: string | null;
  tipo_elegido: TipoPago;
  tipo_calculado: TipoPago | null;
  extracto_id: string | null;
  imputado_otros: number;
  imputado_capital: number;
  saldo_a_favor: number;
  nota: string | null;
  estado_periodo: string;
};

export type CuotaFutura = {
  compra_id: string;
  descripcion: string;
  numero: number;
  num_cuotas: number;
  corte: string;
  valor: number;
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Todo lo necesario para la pantalla de una tarjeta (y las vistas previas del libro). */
export const obtenerDetalleTarjeta = cache(async (id: string) => {
  const supabase = await createClient();
  const [tarjeta, compras, extractos, pagos, cuotas] = await Promise.all([
    supabase.from("v_estado_tarjetas").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("v_compras_tc")
      .select("*")
      .eq("tarjeta_id", id)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("extractos_tc")
      .select("*, periodos(estado)")
      .eq("tarjeta_id", id)
      .order("fecha_corte", { ascending: false }),
    supabase
      .from("pagos_tc")
      .select("*, cuentas(nombre), movimientos(periodos(estado))")
      .eq("tarjeta_id", id)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("v_cuotas_tc").select("*").eq("tarjeta_id", id).order("corte"),
  ]);
  for (const r of [tarjeta, compras, extractos, pagos, cuotas]) if (r.error) throw new Error(r.error.message);
  if (!tarjeta.data) return null;

  const listaCompras: CompraUI[] = (compras.data ?? []).map((c) => ({
    id: c.id!,
    tarjeta_id: c.tarjeta_id!,
    fecha: c.fecha!,
    tipo: c.tipo as TipoCompra,
    monto: Number(c.monto),
    num_cuotas: c.num_cuotas ?? 1,
    created_at: c.created_at ?? undefined,
    descripcion: c.descripcion,
    comercio: c.comercio,
    categoria_id: c.categoria_id,
    categoria_nombre: c.categoria_padre_nombre
      ? `${c.categoria_padre_nombre} › ${c.categoria_nombre}`
      : (c.categoria_nombre ?? null),
    cuenta_destino_id: c.cuenta_destino_id,
    cuenta_destino_nombre: c.cuenta_destino_nombre,
    moneda: c.moneda ?? "COP",
    monto_origen: num(c.monto_origen),
    trm: num(c.trm),
    reembolsable: Boolean(c.reembolsable),
    reembolsado: Boolean(c.reembolsado_por_id),
    primer_corte: c.primer_corte!,
    estado_periodo: c.estado_periodo ?? "abierto",
  }));

  const listaExtractos: ExtractoUI[] = (extractos.data ?? []).map((e) => ({
    id: e.id,
    fecha_corte: e.fecha_corte,
    fecha_limite_pago: e.fecha_limite_pago,
    pago_total_banco: Number(e.pago_total_banco),
    pago_minimo_banco: Number(e.pago_minimo_banco),
    intereses: num(e.intereses),
    cuota_manejo: num(e.cuota_manejo),
    seguros: num(e.seguros),
    otros_declarados: num(e.otros_declarados),
    created_at: e.created_at,
    saldo_sistema_al_corte: Number(e.saldo_sistema_al_corte ?? 0),
    otros_generados: Number(e.otros_generados ?? 0),
    capital_facturado: Number(e.capital_facturado ?? 0),
    minimo_estimado: Number(e.minimo_estimado ?? 0),
    diferencia_no_explicada: num(e.diferencia_no_explicada),
    alerta: e.alerta,
    pagado: Number(e.pagado ?? 0),
    estado: e.estado,
    estado_periodo: (e.periodos as { estado: string } | null)?.estado ?? "abierto",
  }));

  const listaPagos: PagoUI[] = (pagos.data ?? []).map((p) => ({
    id: p.id,
    fecha: p.fecha,
    monto: Number(p.monto),
    created_at: p.created_at,
    cuenta_origen_id: p.cuenta_origen_id,
    cuenta_origen_nombre: (p.cuentas as { nombre: string } | null)?.nombre ?? "",
    movimiento_id: p.movimiento_id,
    tipo_elegido: p.tipo_elegido,
    tipo_calculado: p.tipo_calculado,
    extracto_id: p.extracto_id,
    imputado_otros: Number(p.imputado_otros),
    imputado_capital: Number(p.imputado_capital),
    saldo_a_favor: Number(p.saldo_a_favor),
    nota: p.nota,
    estado_periodo: (p.movimientos as { periodos: { estado: string } | null } | null)?.periodos?.estado ?? "abierto",
  }));

  const nombres = new Map(
    listaCompras.map((c) => [c.id, c.descripcion ?? c.comercio ?? c.categoria_nombre ?? "Compra"]),
  );
  const listaCuotas: CuotaFutura[] = (cuotas.data ?? []).map((q) => ({
    compra_id: q.compra_id!,
    descripcion: nombres.get(q.compra_id!) ?? "Compra",
    numero: q.numero!,
    num_cuotas: q.num_cuotas!,
    corte: q.corte!,
    valor: Number(q.valor),
  }));

  return {
    tarjeta: normalizarTarjeta(tarjeta.data),
    compras: listaCompras,
    extractos: listaExtractos,
    pagos: listaPagos,
    cuotas: listaCuotas,
  };
});

export type DetalleTarjeta = NonNullable<Awaited<ReturnType<typeof obtenerDetalleTarjeta>>>;
