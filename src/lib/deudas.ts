import "server-only";
import { cache } from "react";
import type { TipoDeuda } from "@/lib/domain/deudas";
import { createClient } from "@/lib/supabase/server";
import type { Vista } from "@/types/db";

const num = (v: unknown) => Number(v ?? 0);

export type DeudaResumen = ReturnType<typeof normalizarDeuda>;

function normalizarDeuda(d: Vista<"v_estado_deudas">) {
  return {
    id: d.id!,
    nombre: d.nombre!,
    acreedor: d.acreedor,
    tipo: d.tipo as TipoDeuda,
    monto_original: num(d.monto_original),
    fecha_desembolso: d.fecha_desembolso!,
    tasa_ea: num(d.tasa_ea),
    plazo_meses: d.plazo_meses!,
    cuota: num(d.cuota),
    seguro_mensual: num(d.seguro_mensual),
    aporte_mensual: num(d.aporte_mensual),
    cuenta_aportes_id: d.cuenta_aportes_id,
    cuenta_aportes_nombre: d.cuenta_aportes_nombre,
    dia_pago: d.dia_pago!,
    cuenta_pago_default_id: d.cuenta_pago_default_id,
    cuenta_pago_nombre: d.cuenta_pago_nombre,
    saldo_inicial: num(d.saldo_inicial),
    fecha_saldo_inicial: d.fecha_saldo_inicial!,
    cuenta_desembolso_id: d.cuenta_desembolso_id,
    activa: Boolean(d.activa),
    notas: d.notas,
    cuota_total: num(d.cuota_total),
    saldo_capital: num(d.saldo_capital),
    pagado_capital: num(d.pagado_capital),
    pagado_intereses: num(d.pagado_intereses),
    pagado_seguros: num(d.pagado_seguros),
    pagado_aportes: num(d.pagado_aportes),
    intereses_anio: num(d.intereses_anio),
    pagado_total: num(d.pagado_total),
    n_pagos: d.n_pagos ?? 0,
    ultimo_pago: d.ultimo_pago,
    obligacion_id: d.obligacion_id,
    /** Avance sobre el monto prestado (lo ya pagado antes del registro cuenta como avance). */
    avance: num(d.monto_original) > 0 ? 1 - num(d.saldo_capital) / num(d.monto_original) : 0,
  };
}

/** Deudas del usuario (activas primero, luego por saldo). */
export const obtenerDeudas = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_estado_deudas")
    .select("*")
    .order("activa", { ascending: false })
    .order("saldo_capital", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(normalizarDeuda);
});

export type PagoDeudaUI = {
  id: string;
  fecha: string;
  monto: number;
  a_capital: number;
  a_intereses: number;
  a_seguros: number;
  a_aporte: number;
  cuenta_origen_id: string;
  cuenta_origen_nombre: string;
  obligacion_periodo_id: string | null;
  nota: string | null;
  cerrado: boolean;
};

/** Una deuda con sus pagos y la cuota del mes pendiente en el checklist (si la hay). */
export const obtenerDetalleDeuda = cache(async (id: string) => {
  const supabase = await createClient();
  const [deuda, pagos] = await Promise.all([
    supabase.from("v_estado_deudas").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("pagos_deuda")
      .select("*, cuentas(nombre), movimientos!pagos_deuda_movimiento_id_fkey(periodos(estado))")
      .eq("deuda_id", id)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (deuda.error) throw new Error(deuda.error.message);
  if (pagos.error) throw new Error(pagos.error.message);
  if (!deuda.data) return null;

  const d = normalizarDeuda(deuda.data);
  const obligaciones = d.obligacion_id
    ? await supabase
        .from("v_obligaciones_mes")
        .select("id, nombre, mes, fecha_vencimiento, monto_esperado, pagado, pendiente, estado_periodo")
        .eq("deuda_id", id)
        .is("resolucion", null)
        .eq("pagada", false)
        .eq("estado_periodo", "abierto")
        .order("fecha_vencimiento")
    : { data: [], error: null };
  if (obligaciones.error) throw new Error(obligaciones.error.message);

  return {
    deuda: d,
    pagos: (pagos.data ?? []).map((p): PagoDeudaUI => ({
      id: p.id,
      fecha: p.fecha,
      monto: num(p.monto),
      a_capital: num(p.a_capital),
      a_intereses: num(p.a_intereses),
      a_seguros: num(p.a_seguros),
      a_aporte: num(p.a_aporte),
      cuenta_origen_id: p.cuenta_origen_id,
      cuenta_origen_nombre: (p.cuentas as { nombre: string } | null)?.nombre ?? "",
      obligacion_periodo_id: p.obligacion_periodo_id,
      nota: p.nota,
      cerrado: (p.movimientos as { periodos: { estado: string } | null } | null)?.periodos?.estado === "cerrado",
    })),
    /** Cuotas del checklist aún sin pagar (la más antigua primero). */
    cuotasPendientes: (obligaciones.data ?? []).map((o) => ({
      id: o.id!,
      nombre: o.nombre!,
      fecha_vencimiento: o.fecha_vencimiento!,
      monto_esperado: num(o.monto_esperado),
      pagado: num(o.pagado),
      pendiente: num(o.pendiente),
    })),
  };
});

export type DetalleDeuda = NonNullable<Awaited<ReturnType<typeof obtenerDetalleDeuda>>>;

export type PrestamoUI = ReturnType<typeof normalizarPrestamo> & {
  abonos: {
    id: string;
    fecha: string;
    monto: number;
    cuenta_id: string;
    cuenta_nombre: string;
    descripcion: string | null;
    cerrado: boolean;
  }[];
};

function normalizarPrestamo(p: Vista<"v_prestamos_otorgados">) {
  return {
    id: p.id!,
    deudor: p.deudor!,
    monto: num(p.monto),
    fecha: p.fecha!,
    fecha_esperada: p.fecha_esperada,
    cuenta_origen_id: p.cuenta_origen_id!,
    cuenta_origen_nombre: p.cuenta_origen_nombre ?? "",
    castigado_en: p.castigado_en,
    motivo_castigo: p.motivo_castigo,
    notas: p.notas,
    abonado: num(p.abonado),
    saldo: num(p.saldo),
    n_abonos: p.n_abonos ?? 0,
    ultimo_abono: p.ultimo_abono,
    cerrado: p.estado_periodo === "cerrado",
  };
}

/** Préstamos que hiciste, con sus abonos. */
export const obtenerPrestamos = cache(async (): Promise<PrestamoUI[]> => {
  const supabase = await createClient();
  const [prestamos, abonos] = await Promise.all([
    supabase.from("v_prestamos_otorgados").select("*").order("fecha", { ascending: false }),
    supabase
      .from("v_movimientos")
      .select("id, fecha, monto, cuenta_id, cuenta_nombre, descripcion, prestamo_otorgado_id, estado_periodo")
      .eq("tipo", "recuperacion_prestamo")
      .order("fecha", { ascending: false }),
  ]);
  if (prestamos.error) throw new Error(prestamos.error.message);
  if (abonos.error) throw new Error(abonos.error.message);
  return (prestamos.data ?? []).map((p) => ({
    ...normalizarPrestamo(p),
    abonos: (abonos.data ?? [])
      .filter((a) => a.prestamo_otorgado_id === p.id)
      .map((a) => ({
        id: a.id!,
        fecha: a.fecha!,
        monto: num(a.monto),
        cuenta_id: a.cuenta_id!,
        cuenta_nombre: a.cuenta_nombre ?? "",
        descripcion: a.descripcion,
        cerrado: a.estado_periodo === "cerrado",
      })),
  }));
});

export type ReembolsoPendiente = {
  origen: "movimiento" | "compra_tc";
  id: string;
  fecha: string;
  monto: number;
  descripcion: string;
  categoria_nombre: string | null;
  medio: string;
};

/** Lo que Devtopia te debe y los últimos reembolsos recibidos. */
export const obtenerReembolsos = cache(async () => {
  const supabase = await createClient();
  const [pendientes, recibidos] = await Promise.all([
    supabase.from("v_reembolsos_pendientes").select("*").order("fecha"),
    supabase.from("v_reembolsos").select("*").order("fecha", { ascending: false }).limit(12),
  ]);
  if (pendientes.error) throw new Error(pendientes.error.message);
  if (recibidos.error) throw new Error(recibidos.error.message);
  return {
    pendientes: (pendientes.data ?? []).map((p): ReembolsoPendiente => ({
      origen: p.origen as ReembolsoPendiente["origen"],
      id: p.id!,
      fecha: p.fecha!,
      monto: num(p.monto),
      descripcion: p.descripcion ?? "Gasto",
      categoria_nombre: p.categoria_nombre,
      medio: p.medio ?? "",
    })),
    recibidos: (recibidos.data ?? []).map((r) => ({
      id: r.id!,
      fecha: r.fecha!,
      monto: num(r.monto),
      descripcion: r.descripcion,
      cuenta_nombre: r.cuenta_nombre ?? "",
      n_items: r.n_items ?? 0,
      total_items: num(r.total_items),
      cerrado: r.estado_periodo === "cerrado",
    })),
  };
});
