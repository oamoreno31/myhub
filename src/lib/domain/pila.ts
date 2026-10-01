/**
 * Calculadora de seguridad social para independientes (PILA) — HU-28, docs/02 §7.
 *
 * Todos los porcentajes y el SMMLV son parámetros editables (cambian cada año; no se consultan).
 * Reglas usadas (referencia; verificar con la norma vigente):
 *  · IBC = ingreso mensual × % de IBC (40 % para independientes), mínimo 1 SMMLV y máximo 25 SMMLV.
 *  · Salud 12,5 % y pensión 16 % del IBC.
 *  · Fondo de Solidaridad Pensional: 1 % desde 4 SMMLV; entre 16 y 20 SMMLV sube 0,2 puntos por
 *    cada salario adicional (1,2 % … 1,8 %) y 2 % por encima de 20 SMMLV.
 *  · ARL según la clase de riesgo (I a V).
 *  · Cada aporte se aproxima al múltiplo de 100 superior.
 */
import { aCentavos } from "./dinero";

export type ParamsPila = {
  ibc_pct: number;
  salud_pct: number;
  pension_pct: number;
  arl_clase: 1 | 2 | 3 | 4 | 5;
  smmlv: number | null;
};

export const PILA_DEFECTO: ParamsPila = {
  ibc_pct: 0.4,
  salud_pct: 0.125,
  pension_pct: 0.16,
  arl_clase: 1,
  smmlv: null,
};

/** Tarifa ARL por clase de riesgo. */
export const TARIFAS_ARL: Record<ParamsPila["arl_clase"], number> = {
  1: 0.00522,
  2: 0.01044,
  3: 0.02436,
  4: 0.0435,
  5: 0.0696,
};

export function leerParamsPila(json: unknown): ParamsPila {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const num = (v: unknown, d: number) => (v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : d);
  const clase = Math.round(num(o.arl_clase, 1));
  const smmlv = o.smmlv === null || o.smmlv === undefined || o.smmlv === "" ? null : num(o.smmlv, 0) || null;
  return {
    ibc_pct: num(o.ibc_pct, PILA_DEFECTO.ibc_pct),
    salud_pct: num(o.salud_pct, PILA_DEFECTO.salud_pct),
    pension_pct: num(o.pension_pct, PILA_DEFECTO.pension_pct),
    arl_clase: (clase >= 1 && clase <= 5 ? clase : 1) as ParamsPila["arl_clase"],
    smmlv,
  };
}

/** Tarifa del Fondo de Solidaridad Pensional según el IBC en salarios mínimos. */
export function tarifaFsp(ibcEnSmmlv: number): number {
  if (ibcEnSmmlv < 4) return 0;
  if (ibcEnSmmlv < 16) return 0.01;
  if (ibcEnSmmlv >= 20) return 0.02;
  return 0.01 + 0.002 * (Math.floor(ibcEnSmmlv) - 15);
}

const alCien = (centavos: number) => Math.ceil(centavos / 10_000) * 100; // pesos, múltiplo de 100 superior

export type ResultadoPila = {
  ibc: number;
  ajuste: "minimo" | "maximo" | null;
  salud: number;
  pension: number;
  fsp: number;
  fspPct: number;
  arl: number;
  arlPct: number;
  total: number;
};

export function calcularPila(ingreso: number, p: ParamsPila): ResultadoPila | null {
  if (!p.smmlv || p.smmlv <= 0 || ingreso < 0) return null;
  const smmlv = aCentavos(p.smmlv);
  const bruto = Math.ceil((aCentavos(ingreso) * p.ibc_pct) / 100) * 100; // al peso superior
  const min = smmlv;
  const max = 25 * smmlv;
  const ibc = Math.min(Math.max(bruto, min), max);
  const ajuste = bruto < min ? "minimo" : bruto > max ? "maximo" : null;
  const fspPct = tarifaFsp(ibc / smmlv);
  const arlPct = TARIFAS_ARL[p.arl_clase];
  const salud = alCien(ibc * p.salud_pct);
  const pension = alCien(ibc * p.pension_pct);
  const fsp = fspPct > 0 ? alCien(ibc * fspPct) : 0;
  const arl = alCien(ibc * arlPct);
  return {
    ibc: ibc / 100,
    ajuste,
    salud,
    pension,
    fsp,
    fspPct,
    arl,
    arlPct,
    total: salud + pension + fsp + arl,
  };
}
