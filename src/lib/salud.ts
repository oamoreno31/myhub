import "server-only";
import { cache } from "react";
import { type Insumos, leerInsumos, leerUmbrales, type Umbrales } from "@/lib/domain/salud";
import { leerParamsPila, type ParamsPila } from "@/lib/domain/pila";
import type { TipoMeta } from "@/lib/domain/metas";
import { primerDiaDelPeriodo } from "@/lib/domain/periodos";
import { createClient } from "@/lib/supabase/server";

const num = (v: unknown) => Number(v ?? 0);

export type ParametrosSalud = { umbrales: Umbrales; pila: ParamsPila; usuraEA: number | null };

export const obtenerParametrosSalud = cache(async (): Promise<ParametrosSalud> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parametros")
    .select("umbrales_salud, seguridad_social, tasa_usura_ea")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    umbrales: leerUmbrales(data?.umbrales_salud),
    pila: leerParamsPila(data?.seguridad_social),
    usuraEA: data?.tasa_usura_ea === null || data?.tasa_usura_ea === undefined ? null : Number(data.tasa_usura_ea),
  };
});

export type InsumosMes = { insumos: Insumos | null; origen: "foto" | "vivo"; calculadoEn: string | null };

/**
 * Insumos de un mes: de la foto del cierre si el mes está cerrado y la tiene (desde F5);
 * si no, calculados ahora.
 */
export const obtenerInsumos = cache(
  async (periodoId: string, estado: string, snapshot: unknown): Promise<InsumosMes> => {
    const foto = (snapshot as { salud?: unknown } | null)?.salud;
    if (estado === "cerrado" && foto) {
      return {
        insumos: leerInsumos(foto),
        origen: "foto",
        calculadoEn: String((foto as { calculado_en?: string }).calculado_en ?? ""),
      };
    }
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("insumos_salud", { p_periodo: periodoId });
    if (error) throw new Error(error.message);
    return { insumos: leerInsumos(data), origen: "vivo", calculadoEn: null };
  },
);

/** Fotos de salud de los meses cerrados entre dos periodos (para la evolución del score). */
export const obtenerFotosSalud = cache(async (desde: string, hasta: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("periodos")
    .select("id, mes, estado, snapshot")
    .gte("mes", primerDiaDelPeriodo(desde))
    .lte("mes", primerDiaDelPeriodo(hasta))
    .order("mes");
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({
    periodo: p.mes.slice(0, 7),
    id: p.id,
    estado: p.estado,
    insumos: p.estado === "cerrado" ? leerInsumos((p.snapshot as { salud?: unknown } | null)?.salud) : null,
  }));
});

export type MetaVista = {
  id: string;
  nombre: string;
  tipo: TipoMeta;
  monto_objetivo: number;
  fecha_objetivo: string | null;
  cuenta_id: string | null;
  cuenta_nombre: string | null;
  deuda_id: string | null;
  deuda_nombre: string | null;
  deuda_saldo: number | null;
  aporte_mensual: number | null;
  activa: boolean;
  notas: string | null;
  actual: number;
};

export const obtenerMetas = cache(async (): Promise<MetaVista[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_metas")
    .select("*")
    .order("activa", { ascending: false })
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => ({
    id: m.id!,
    nombre: m.nombre!,
    tipo: m.tipo as TipoMeta,
    monto_objetivo: num(m.monto_objetivo),
    fecha_objetivo: m.fecha_objetivo,
    cuenta_id: m.cuenta_id,
    cuenta_nombre: m.cuenta_nombre,
    deuda_id: m.deuda_id,
    deuda_nombre: m.deuda_nombre,
    deuda_saldo: m.deuda_saldo === null ? null : num(m.deuda_saldo),
    aporte_mensual: m.aporte_mensual === null ? null : num(m.aporte_mensual),
    activa: Boolean(m.activa),
    notas: m.notas,
    actual: num(m.actual),
  }));
});

export type DeudaPlan = {
  id: string;
  nombre: string;
  clase: "tarjeta" | "prestamo";
  saldo: number;
  tasaEA: number | null;
  minimo: number;
  href: string;
};

/** Deudas vivas para el plan de deudas: tarjetas (deuda total, último mínimo) y préstamos. */
export const obtenerDeudasPlan = cache(async (): Promise<DeudaPlan[]> => {
  const supabase = await createClient();
  const [tarjetas, deudas] = await Promise.all([
    supabase
      .from("v_estado_tarjetas")
      .select("id, nombre, deuda_total, tasa_ea_ref, ultimo_pago_minimo, activa")
      .eq("activa", true),
    supabase.from("v_estado_deudas").select("id, nombre, saldo_capital, tasa_ea, cuota, activa").eq("activa", true),
  ]);
  if (tarjetas.error) throw new Error(tarjetas.error.message);
  if (deudas.error) throw new Error(deudas.error.message);
  return [
    ...(tarjetas.data ?? [])
      .filter((t) => num(t.deuda_total) > 0)
      .map((t) => {
        const saldo = num(t.deuda_total);
        const minimo = num(t.ultimo_pago_minimo);
        return {
          id: t.id!,
          nombre: t.nombre!,
          clase: "tarjeta" as const,
          saldo,
          tasaEA: t.tasa_ea_ref === null ? null : num(t.tasa_ea_ref),
          // Sin extracto aún: se estima un mínimo del 5 % del saldo.
          minimo: minimo > 0 ? Math.min(minimo, saldo) : Math.ceil((saldo * 0.05) / 1000) * 1000,
          href: `/tarjetas/${t.id}`,
        };
      }),
    ...(deudas.data ?? [])
      .filter((d) => num(d.saldo_capital) > 0)
      .map((d) => ({
        id: d.id!,
        nombre: d.nombre!,
        clase: "prestamo" as const,
        saldo: num(d.saldo_capital),
        tasaEA: d.tasa_ea === null ? null : num(d.tasa_ea),
        minimo: num(d.cuota),
        href: `/deudas/${d.id}`,
      })),
  ];
});

/** Otros cargos (intereses, manejo, seguros) de cada tarjeta en los extractos del mes. */
export const obtenerCargosTarjetasMes = cache(async (periodoId: string) => {
  const supabase = await createClient();
  const [ext, tarjetas] = await Promise.all([
    supabase.from("extractos_tc").select("tarjeta_id, otros_generados").eq("periodo_id", periodoId),
    supabase.from("v_estado_tarjetas").select("id, nombre, deuda_total, cupo, tasa_ea_ref, activa").eq("activa", true),
  ]);
  if (ext.error) throw new Error(ext.error.message);
  if (tarjetas.error) throw new Error(tarjetas.error.message);
  const cargos = new Map<string, number>();
  for (const x of ext.data ?? []) cargos.set(x.tarjeta_id, (cargos.get(x.tarjeta_id) ?? 0) + num(x.otros_generados));
  return (tarjetas.data ?? []).map((t) => ({
    id: t.id!,
    nombre: t.nombre!,
    deuda: Math.max(num(t.deuda_total), 0),
    cupo: num(t.cupo),
    otrosCargos: cargos.get(t.id!) ?? 0,
    tasaEA: t.tasa_ea_ref === null ? null : num(t.tasa_ea_ref),
  }));
});
