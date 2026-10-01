/**
 * Periodos (meses) — lógica pura, sin dependencias de React ni Supabase.
 * Un periodo se identifica como "YYYY-MM". En la BD se guarda como fecha "YYYY-MM-01".
 */
import { TZDate } from "@date-fns/tz";
import { addMonths, format } from "date-fns";
import { es } from "date-fns/locale";

export type PeriodoId = string;

export const ZONA_HORARIA_DEFECTO = "America/Bogota";

const PERIODO_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function esPeriodoValido(valor: unknown): valor is PeriodoId {
  return typeof valor === "string" && PERIODO_RE.test(valor);
}

function partes(periodo: PeriodoId): { anio: number; mes: number } {
  const m = PERIODO_RE.exec(periodo);
  if (!m) throw new Error(`Periodo inválido: "${periodo}" (se espera YYYY-MM)`);
  return { anio: Number(m[1]), mes: Number(m[2]) };
}

/** Periodo al que pertenece un instante, evaluado en la zona horaria dada. */
export function periodoDeFecha(fecha: Date, zonaHoraria: string = ZONA_HORARIA_DEFECTO): PeriodoId {
  return format(new TZDate(fecha, zonaHoraria), "yyyy-MM");
}

/** Periodo actual en Bogotá (o la zona indicada). */
export function periodoActual(ahora: Date = new Date(), zonaHoraria: string = ZONA_HORARIA_DEFECTO): PeriodoId {
  return periodoDeFecha(ahora, zonaHoraria);
}

/** Suma (o resta) meses a un periodo. */
export function desplazarPeriodo(periodo: PeriodoId, meses: number): PeriodoId {
  const { anio, mes } = partes(periodo);
  return format(addMonths(new Date(anio, mes - 1, 1), meses), "yyyy-MM");
}

/** Fecha del primer día, como se guarda en `periodos.mes`. */
export function primerDiaDelPeriodo(periodo: PeriodoId): string {
  partes(periodo);
  return `${periodo}-01`;
}

/** Convierte "YYYY-MM-DD" (columna date) a su periodo. */
export function periodoDeFechaISO(fechaISO: string): PeriodoId {
  const periodo = fechaISO.slice(0, 7);
  if (!esPeriodoValido(periodo)) throw new Error(`Fecha inválida: "${fechaISO}"`);
  return periodo;
}

function capitalizar(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "Septiembre 2026" */
export function nombrePeriodo(periodo: PeriodoId): string {
  const { anio, mes } = partes(periodo);
  return capitalizar(format(new Date(anio, mes - 1, 1), "LLLL yyyy", { locale: es }));
}

/** "Sep 2026" */
export function nombreCortoPeriodo(periodo: PeriodoId): string {
  const { anio, mes } = partes(periodo);
  return capitalizar(format(new Date(anio, mes - 1, 1), "LLL yyyy", { locale: es }).replace(".", ""));
}

/** Compara dos periodos: negativo si a < b, 0 si iguales, positivo si a > b. */
export function compararPeriodos(a: PeriodoId, b: PeriodoId): number {
  return a.localeCompare(b);
}
