import "server-only";
import { cache } from "react";
import type { Bolsa, FilaConsumo } from "@/lib/domain/analisis";
import { primerDiaDelPeriodo } from "@/lib/domain/periodos";
import { createClient } from "@/lib/supabase/server";

const num = (v: unknown) => Number(v ?? 0);
const PAGINA = 1000;

/** Trae todas las filas de una consulta paginando (PostgREST limita cada respuesta). */
async function todas<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return filas;
  }
}

/** Consumo por categoría hoja y mes entre dos periodos "YYYY-MM" (incluidos). */
export const obtenerConsumo = cache(async (desde: string, hasta: string): Promise<FilaConsumo[]> => {
  const supabase = await createClient();
  const filas = await todas((a, b) =>
    supabase
      .from("v_consumo_mes")
      .select(
        "mes, categoria_id, categoria_nombre, padre_id, padre_nombre, bolsa, es_fija, origen, reembolsable, total",
      )
      .gte("mes", primerDiaDelPeriodo(desde))
      .lte("mes", primerDiaDelPeriodo(hasta))
      .order("mes")
      .order("categoria_id")
      .order("origen")
      .order("reembolsable")
      .range(a, b),
  );
  return filas.map((f) => ({
    periodo: f.mes!.slice(0, 7),
    categoria_id: f.categoria_id!,
    categoria_nombre: f.categoria_nombre!,
    padre_id: f.padre_id,
    padre_nombre: f.padre_nombre,
    bolsa: (f.bolsa ?? "no_aplica") as Bolsa,
    es_fija: Boolean(f.es_fija),
    origen: f.origen ?? "cuenta",
    reembolsable: Boolean(f.reembolsable),
    total: num(f.total),
  }));
});

export type FilaCaja = {
  periodo: string;
  tipo: string;
  categoria_id: string | null;
  concepto: string;
  reembolsable: boolean;
  total: number;
};

/** Salidas de caja por concepto y mes. */
export const obtenerCaja = cache(async (desde: string, hasta: string): Promise<FilaCaja[]> => {
  const supabase = await createClient();
  const filas = await todas((a, b) =>
    supabase
      .from("v_caja_mes")
      .select("mes, tipo, categoria_id, concepto, reembolsable, total")
      .gte("mes", primerDiaDelPeriodo(desde))
      .lte("mes", primerDiaDelPeriodo(hasta))
      .order("mes")
      .order("concepto")
      .order("reembolsable")
      .range(a, b),
  );
  return filas.map((f) => ({
    periodo: f.mes!.slice(0, 7),
    tipo: f.tipo!,
    categoria_id: f.categoria_id,
    concepto: f.concepto ?? "Otros",
    reembolsable: Boolean(f.reembolsable),
    total: num(f.total),
  }));
});

export type ResumenMes = {
  periodo: string;
  periodo_id: string;
  estado: "abierto" | "cerrado";
  ingresos: number;
  recuperaciones: number;
  gastos: number;
  salidas_caja: number;
  reembolsos: number;
  gastos_reembolsables: number;
  obligaciones_total: number;
  obligaciones_pagadas: number;
  /** Patrimonio guardado en la foto del cierre (null si el mes está abierto o se cerró antes de F4). */
  patrimonio: number | null;
};

/** Resumen de cada mes existente entre dos periodos, con el patrimonio de la foto de cierre. */
export const obtenerResumenes = cache(async (desde: string, hasta: string): Promise<ResumenMes[]> => {
  const supabase = await createClient();
  const [resumen, periodos] = await Promise.all([
    supabase
      .from("v_resumen_periodo")
      .select(
        "periodo_id, mes, estado, ingresos, recuperaciones, gastos, salidas_caja, reembolsos, gastos_reembolsables, obligaciones_total, obligaciones_pagadas",
      )
      .gte("mes", primerDiaDelPeriodo(desde))
      .lte("mes", primerDiaDelPeriodo(hasta))
      .order("mes"),
    supabase
      .from("periodos")
      .select("id, snapshot")
      .gte("mes", primerDiaDelPeriodo(desde))
      .lte("mes", primerDiaDelPeriodo(hasta)),
  ]);
  if (resumen.error) throw new Error(resumen.error.message);
  if (periodos.error) throw new Error(periodos.error.message);
  const fotos = new Map(
    (periodos.data ?? []).map((p) => [
      p.id,
      (p.snapshot as { patrimonio?: { patrimonio?: number | string } } | null)?.patrimonio?.patrimonio,
    ]),
  );
  return (resumen.data ?? []).map((r) => {
    const foto = fotos.get(r.periodo_id!);
    return {
      periodo: r.mes!.slice(0, 7),
      periodo_id: r.periodo_id!,
      estado: r.estado as "abierto" | "cerrado",
      ingresos: num(r.ingresos),
      recuperaciones: num(r.recuperaciones),
      gastos: num(r.gastos),
      salidas_caja: num(r.salidas_caja),
      reembolsos: num(r.reembolsos),
      gastos_reembolsables: num(r.gastos_reembolsables),
      obligaciones_total: r.obligaciones_total ?? 0,
      obligaciones_pagadas: r.obligaciones_pagadas ?? 0,
      patrimonio: foto === undefined || foto === null ? null : Number(foto),
    };
  });
});

export type ComercioMes = { clave: string; comercio: string; total: number; n: number; reembolsable: boolean };

export const obtenerComercios = cache(async (periodo: string): Promise<ComercioMes[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_comercios_mes")
    .select("clave, comercio, reembolsable, total, n")
    .eq("mes", primerDiaDelPeriodo(periodo))
    .order("total", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({
    clave: c.clave!,
    comercio: c.comercio!,
    total: num(c.total),
    n: c.n ?? 0,
    reembolsable: Boolean(c.reembolsable),
  }));
});

export type Patrimonio = {
  cuentas: number;
  por_cobrar: number;
  devtopia: number;
  deuda_tarjetas: number;
  prestamos: number;
  patrimonio: number;
};

/** Patrimonio neto actual (docs/02 §3). */
export const obtenerPatrimonio = cache(async (): Promise<Patrimonio> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_patrimonio").select("*").maybeSingle();
  if (error) throw new Error(error.message);
  return {
    cuentas: num(data?.cuentas),
    por_cobrar: num(data?.por_cobrar),
    devtopia: num(data?.devtopia),
    deuda_tarjetas: num(data?.deuda_tarjetas),
    prestamos: num(data?.prestamos),
    patrimonio: num(data?.patrimonio),
  };
});

export type Presupuesto = {
  /** Líneas del mes; si el mes no tiene, las de la plantilla. */
  lineas: { categoria_id: string; monto: number }[];
  origen: "mes" | "plantilla" | "ninguno";
  plantilla: { categoria_id: string; monto: number }[];
};

export const obtenerPresupuesto = cache(async (periodoId: string): Promise<Presupuesto> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("presupuestos")
    .select("periodo_id, categoria_id, monto")
    .or(`periodo_id.eq.${periodoId},periodo_id.is.null`);
  if (error) throw new Error(error.message);
  const filas = (data ?? []).map((p) => ({
    periodo_id: p.periodo_id,
    categoria_id: p.categoria_id,
    monto: num(p.monto),
  }));
  const delMes = filas
    .filter((f) => f.periodo_id === periodoId)
    .map(({ categoria_id, monto }) => ({ categoria_id, monto }));
  const plantilla = filas
    .filter((f) => f.periodo_id === null)
    .map(({ categoria_id, monto }) => ({ categoria_id, monto }));
  return {
    lineas: delMes.length ? delMes : plantilla,
    origen: delMes.length ? "mes" : plantilla.length ? "plantilla" : "ninguno",
    plantilla,
  };
});

export type CategoriaGasto = {
  id: string;
  nombre: string;
  grupo: string;
  padre_id: string | null;
  bolsa: Bolsa;
  es_fija: boolean;
  activa: boolean;
  es_sistema: boolean;
  orden: number;
};

/** Categorías de gasto con su bolsa 50/30/20 (para presupuesto). */
export const obtenerCategoriasGasto = cache(async (): Promise<CategoriaGasto[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categorias")
    .select("id, nombre, grupo, padre_id, bolsa, es_fija, activa, es_sistema, orden")
    .eq("tipo", "gasto")
    .order("orden")
    .order("nombre");
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({ ...c, bolsa: c.bolsa as Bolsa }));
});

/** Líneas propias de un mes (sin caer a la plantilla); vacío si el mes no existe o no tiene. */
export const obtenerLineasDeMes = cache(async (periodo: string): Promise<{ categoria_id: string; monto: number }[]> => {
  const supabase = await createClient();
  const { data: p, error } = await supabase
    .from("periodos")
    .select("id")
    .eq("mes", primerDiaDelPeriodo(periodo))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!p) return [];
  const { data, error: e2 } = await supabase.from("presupuestos").select("categoria_id, monto").eq("periodo_id", p.id);
  if (e2) throw new Error(e2.message);
  return (data ?? []).map((l) => ({ categoria_id: l.categoria_id, monto: num(l.monto) }));
});

export type ObligacionPlantilla = { id: string; nombre: string; activa: boolean; es_ingreso: boolean; tipo: string };

/** Plantillas de obligaciones (activas primero) para el historial por obligación. */
export const obtenerObligacionesPlantilla = cache(async (): Promise<ObligacionPlantilla[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("obligaciones")
    .select("id, nombre, activa, es_ingreso, tipo")
    .order("activa", { ascending: false })
    .order("orden")
    .order("nombre");
  if (error) throw new Error(error.message);
  return (data ?? []).map((o) => ({ ...o, es_ingreso: Boolean(o.es_ingreso) }));
});

export type MesObligacion = {
  periodo: string;
  esperado: number;
  pagado: number;
  pagada: boolean;
  n_pagos: number;
  vence: string | null;
  ultimo_pago: string | null;
  resolucion: string | null;
};

/** Lo esperado y lo pagado de una obligación en cada mes del rango (HU-14). */
export const obtenerHistorialObligacion = cache(
  async (obligacionId: string, desde: string, hasta: string): Promise<MesObligacion[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("v_obligaciones_mes")
      .select("mes, monto_esperado, pagado, pagada, n_pagos, fecha_vencimiento, ultimo_pago, resolucion")
      .eq("obligacion_id", obligacionId)
      .gte("mes", primerDiaDelPeriodo(desde))
      .lte("mes", primerDiaDelPeriodo(hasta))
      .order("mes");
    if (error) throw new Error(error.message);
    return (data ?? []).map((o) => ({
      periodo: o.mes!.slice(0, 7),
      esperado: num(o.monto_esperado),
      pagado: num(o.pagado),
      pagada: Boolean(o.pagada),
      n_pagos: o.n_pagos ?? 0,
      vence: o.fecha_vencimiento,
      ultimo_pago: o.ultimo_pago,
      resolucion: o.resolucion,
    }));
  },
);
