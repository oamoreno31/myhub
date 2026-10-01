/**
 * Metas (HU-22): avance, aporte mensual sugerido y fecha estimada.
 * Fechas como periodos "YYYY-MM"; montos en pesos (cálculo en centavos).
 */
import { aCentavos } from "./dinero";
import { compararPeriodos, desplazarPeriodo, type PeriodoId } from "./periodos";

export type TipoMeta = "ahorro" | "fondo_emergencia" | "pagar_deuda" | "compra";

export const TIPOS_META: Record<TipoMeta, { etiqueta: string; detalle: string }> = {
  fondo_emergencia: { etiqueta: "Fondo de emergencia", detalle: "Meses de gasto esencial guardados para imprevistos" },
  ahorro: { etiqueta: "Ahorro", detalle: "Plata apartada para algo que quieres" },
  compra: { etiqueta: "Compra", detalle: "Juntar para comprar algo sin endeudarte" },
  pagar_deuda: { etiqueta: "Pagar una deuda", detalle: "Dejar una deuda en cero" },
};

/** Meses entre dos periodos (b − a). */
export function mesesEntre(a: PeriodoId, b: PeriodoId): number {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

export type Avance = {
  pct: number;
  restante: number;
  completa: boolean;
  /** Con el aporte mensual declarado: meses que faltan y mes en que se llega. */
  mesesConAporte: number | null;
  fechaEstimada: PeriodoId | null;
  /** Con fecha objetivo: meses que quedan y cuánto habría que aportar cada mes. */
  mesesHastaFecha: number | null;
  aporteParaFecha: number | null;
  /** El aporte declarado no alcanza para la fecha objetivo (o la fecha ya pasó). */
  atrasada: boolean;
};

export function avanceMeta(p: {
  objetivo: number;
  actual: number;
  aporteMensual: number | null;
  /** "YYYY-MM-DD" o null */
  fechaObjetivo: string | null;
  hoy: PeriodoId;
}): Avance {
  const obj = aCentavos(p.objetivo);
  const act = Math.max(0, aCentavos(p.actual));
  const rest = Math.max(obj - act, 0);
  const completa = rest === 0;
  const aporte = p.aporteMensual && p.aporteMensual > 0 ? aCentavos(p.aporteMensual) : null;
  const mesesConAporte = completa ? 0 : aporte ? Math.ceil(rest / aporte) : null;
  // El mes en curso cuenta como el primer aporte: 3 aportes desde septiembre terminan en noviembre.
  const fechaEstimada = mesesConAporte === null ? null : desplazarPeriodo(p.hoy, Math.max(mesesConAporte - 1, 0));
  const periodoObjetivo = p.fechaObjetivo ? p.fechaObjetivo.slice(0, 7) : null;
  // El mes en curso cuenta como un mes de aporte.
  const mesesHastaFecha = periodoObjetivo ? Math.max(mesesEntre(p.hoy, periodoObjetivo) + 1, 0) : null;
  const aporteParaFecha =
    completa || mesesHastaFecha === null
      ? null
      : mesesHastaFecha === 0
        ? rest / 100
        : Math.ceil(rest / mesesHastaFecha / 100_000) * 1000;
  const atrasada =
    !completa &&
    periodoObjetivo !== null &&
    (mesesHastaFecha === 0 || (fechaEstimada !== null && compararPeriodos(fechaEstimada, periodoObjetivo) > 0));
  return {
    pct: obj > 0 ? Math.min(act / obj, 1) : 0,
    restante: rest / 100,
    completa,
    mesesConAporte,
    fechaEstimada,
    mesesHastaFecha,
    aporteParaFecha,
    atrasada,
  };
}

/** Objetivo sugerido del fondo de emergencia: N meses de gasto esencial, redondeado hacia arriba a 100.000. */
export function objetivoFondo(gastoEsencial: number, meses = 6): number {
  return Math.ceil((aCentavos(gastoEsencial) * meses) / 10_000_000) * 100_000;
}
