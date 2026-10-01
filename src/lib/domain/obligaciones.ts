/**
 * Obligaciones del mes — lógica pura (estados, agrupación, vistas previas).
 * Espejo en SQL: `obligacion_aplica`, `fecha_en_mes` y la vista `v_obligaciones_mes`
 * (supabase/migrations/20260926000100_nucleo_mensual.sql). La prueba de contrato
 * en tests/db/contrato-obligaciones.test.ts compara ambas implementaciones.
 */
import { TZDate } from "@date-fns/tz";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { aCentavos } from "./dinero";
import { desplazarPeriodo, type PeriodoId, ZONA_HORARIA_DEFECTO } from "./periodos";

export type Frecuencia = "mensual" | "bimestral" | "trimestral" | "semestral" | "anual";
export type Resolucion = "omitida" | "arrastrada" | null;
export type EstadoObligacion =
  "pagada" | "parcial" | "vencida" | "vence_pronto" | "pendiente" | "omitida" | "arrastrada";

export const MESES_POR_FRECUENCIA: Record<Frecuencia, number> = {
  mensual: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

export const ETIQUETA_FRECUENCIA: Record<Frecuencia, string> = {
  mensual: "Mensual",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

/** Días antes del vencimiento en los que una obligación se marca "vence pronto". */
export const DIAS_AVISO = 3;

export type ObligacionMes = {
  id: string;
  nombre: string;
  es_ingreso: boolean;
  monto_esperado: number | string;
  pagado: number | string;
  fecha_vencimiento: string;
  resolucion: Resolucion;
};

type Variante = "success" | "warning" | "danger" | "neutral" | "info";

export const ESTADOS: Record<EstadoObligacion, { etiqueta: string; simbolo: string; variante: Variante }> = {
  pagada: { etiqueta: "Pagada", simbolo: "✓", variante: "success" },
  parcial: { etiqueta: "Parcial", simbolo: "◐", variante: "warning" },
  vencida: { etiqueta: "Vencida", simbolo: "!", variante: "danger" },
  vence_pronto: { etiqueta: "Vence pronto", simbolo: "○", variante: "warning" },
  pendiente: { etiqueta: "Pendiente", simbolo: "○", variante: "neutral" },
  omitida: { etiqueta: "Omitida", simbolo: "—", variante: "neutral" },
  arrastrada: { etiqueta: "Pasó al mes siguiente", simbolo: "»", variante: "info" },
};

/** Etiquetas para ingresos esperados (mismo estado, otras palabras). */
export const ESTADOS_INGRESO: Partial<Record<EstadoObligacion, string>> = {
  pagada: "Recibido",
  parcial: "Recibido en parte",
  vencida: "Atrasado",
  vence_pronto: "Llega pronto",
  pendiente: "Por recibir",
};

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria dada. */
export function hoyISO(ahora: Date = new Date(), zonaHoraria: string = ZONA_HORARIA_DEFECTO): string {
  return format(new TZDate(ahora, zonaHoraria), "yyyy-MM-dd");
}

/** Días de calendario desde `hoy` hasta `fecha` (negativo si ya pasó). */
export function diasHasta(fechaISO: string, hoy: string): number {
  return differenceInCalendarDays(parseISO(fechaISO), parseISO(hoy));
}

export function etiquetaRelativa(fechaISO: string, hoy: string): string {
  const d = diasHasta(fechaISO, hoy);
  if (d === 0) return "hoy";
  if (d === 1) return "mañana";
  if (d === -1) return "ayer";
  if (d > 1) return `en ${d} días`;
  return `hace ${-d} días`;
}

export function estaPagada(o: Pick<ObligacionMes, "monto_esperado" | "pagado">): boolean {
  const pagado = aCentavos(o.pagado);
  return pagado > 0 && pagado >= aCentavos(o.monto_esperado);
}

/** Pendiente por pagar (0 si está resuelta o pagada). */
export function pendienteDe(o: Pick<ObligacionMes, "monto_esperado" | "pagado" | "resolucion">): number {
  if (o.resolucion) return 0;
  return Math.max(aCentavos(o.monto_esperado) - aCentavos(o.pagado), 0) / 100;
}

export function estadoObligacion(o: ObligacionMes, hoy: string, diasAviso = DIAS_AVISO): EstadoObligacion {
  if (o.resolucion) return o.resolucion;
  if (estaPagada(o)) return "pagada";
  if (aCentavos(o.pagado) > 0) return "parcial";
  const d = diasHasta(o.fecha_vencimiento, hoy);
  if (d < 0) return "vencida";
  if (d <= diasAviso) return "vence_pronto";
  return "pendiente";
}

export type GruposObligaciones<T> = {
  vencidas: T[];
  proximas: T[];
  resto: T[];
  pagadas: T[];
  cerradas: T[];
};

/**
 * Agrupa para la pantalla "Mes": vencidas, próximos 7 días, resto del mes,
 * pagadas y cerradas (omitidas / pasadas al mes siguiente).
 */
export function agruparObligaciones<T extends ObligacionMes>(lista: T[], hoy: string): GruposObligaciones<T> {
  const grupos: GruposObligaciones<T> = { vencidas: [], proximas: [], resto: [], pagadas: [], cerradas: [] };
  const ordenadas = [...lista].sort(
    (a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento) || a.nombre.localeCompare(b.nombre, "es"),
  );
  for (const o of ordenadas) {
    if (o.resolucion) grupos.cerradas.push(o);
    else if (estaPagada(o)) grupos.pagadas.push(o);
    else {
      const d = diasHasta(o.fecha_vencimiento, hoy);
      if (d < 0) grupos.vencidas.push(o);
      else if (d <= 7) grupos.proximas.push(o);
      else grupos.resto.push(o);
    }
  }
  return grupos;
}

export type ResumenObligaciones = {
  total: number;
  pagadas: number;
  pendientes: number;
  /** Sin pagar del todo y con fecha pasada (incluye las parciales). */
  vencidas: number;
  montoEsperado: number;
  montoPagado: number;
  montoPendiente: number;
  avance: number;
};

/** Resumen de obligaciones de egreso (sin ingresos esperados ni arrastradas). */
export function resumirObligaciones(lista: ObligacionMes[], hoy: string): ResumenObligaciones {
  const egresos = lista.filter((o) => !o.es_ingreso && o.resolucion !== "arrastrada");
  let esperado = 0;
  let pagado = 0;
  let pendiente = 0;
  let pagadas = 0;
  let vencidas = 0;
  for (const o of egresos) {
    if (o.resolucion !== "omitida") esperado += aCentavos(o.monto_esperado);
    pagado += aCentavos(o.pagado);
    pendiente += aCentavos(pendienteDe(o));
    if (estaPagada(o)) pagadas++;
    if (!o.resolucion && !estaPagada(o) && diasHasta(o.fecha_vencimiento, hoy) < 0) vencidas++;
  }
  const activas = egresos.filter((o) => o.resolucion !== "omitida").length;
  return {
    total: egresos.length,
    pagadas,
    pendientes: egresos.filter((o) => !o.resolucion && !estaPagada(o)).length,
    vencidas,
    montoEsperado: esperado / 100,
    montoPagado: pagado / 100,
    montoPendiente: pendiente / 100,
    avance: activas === 0 ? 1 : pagadas / activas,
  };
}

export type VistaPreviaPago = {
  estado: "pagada" | "parcial";
  faltante: number;
  excedente: number;
};

/** Qué pasará con la obligación si se registra este pago. */
export function vistaPreviaPago(
  montoEsperado: number | string,
  pagadoPrevio: number | string,
  monto: number,
): VistaPreviaPago {
  const esperado = aCentavos(montoEsperado);
  const total = aCentavos(pagadoPrevio) + aCentavos(monto);
  if (total >= esperado && total > 0) {
    return { estado: "pagada", faltante: 0, excedente: (total - esperado) / 100 };
  }
  return { estado: "parcial", faltante: (esperado - total) / 100, excedente: 0 };
}

// ---------------------------------------------------------------------------
// Plantillas (espejo de las funciones SQL)
// ---------------------------------------------------------------------------

function indiceMes(periodo: PeriodoId): number {
  const [a, m] = periodo.split("-").map(Number);
  return a * 12 + (m - 1);
}

/** Equivalente a `obligacion_aplica` en SQL. Periodos "YYYY-MM"; `fin` puede ser null. */
export function aplicaEnMes(
  frecuencia: Frecuencia,
  ancla: PeriodoId,
  inicio: PeriodoId,
  fin: PeriodoId | null,
  mes: PeriodoId,
): boolean {
  if (mes < inicio) return false;
  if (fin && mes > fin) return false;
  const paso = MESES_POR_FRECUENCIA[frecuencia];
  const diff = indiceMes(mes) - indiceMes(ancla);
  return ((diff % paso) + paso) % paso === 0;
}

/** Equivalente a `fecha_en_mes`: día N del mes, recortado al último día. */
export function fechaEnMes(periodo: PeriodoId, dia: number): string {
  const [a, m] = periodo.split("-").map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  return `${periodo}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

/** Próximos `n` meses (desde `desde`, incluido) en que aplica la plantilla. Para vistas previas. */
export function proximosMeses(
  p: { frecuencia: Frecuencia; ancla: PeriodoId; inicio: PeriodoId; fin: PeriodoId | null },
  desde: PeriodoId,
  n = 4,
): PeriodoId[] {
  const resultado: PeriodoId[] = [];
  let mes = desde < p.inicio ? p.inicio : desde;
  for (let i = 0; i < 36 && resultado.length < n; i++) {
    if (p.fin && mes > p.fin) break;
    if (aplicaEnMes(p.frecuencia, p.ancla, p.inicio, p.fin, mes)) resultado.push(mes);
    mes = desplazarPeriodo(mes, 1);
  }
  return resultado;
}
