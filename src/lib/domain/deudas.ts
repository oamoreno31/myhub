/**
 * Deudas y préstamos — lógica pura (docs/02 §6 y §7).
 *
 * Préstamos en Colombia: tasa Efectiva Anual (EA) → tasa mensual (1 + EA)^(1/12) − 1.
 * Sistema francés (cuota fija): cuota = P · i / (1 − (1 + i)^−n).
 * Cada cuota paga primero los intereses del mes (saldo × i) y el resto abona a capital.
 * Todos los cálculos internos van en CENTAVOS enteros; las cuotas se redondean al peso.
 */
import { aCentavos } from "./dinero";
import { fechaEnMes } from "./obligaciones";
import { desplazarPeriodo } from "./periodos";
import { tasaMensual } from "./tarjetas";

export type TipoDeuda = "banco" | "libranza" | "cooperativa" | "persona" | "otro";

export const ETIQUETA_TIPO_DEUDA: Record<TipoDeuda, string> = {
  banco: "Banco",
  libranza: "Libranza",
  cooperativa: "Cooperativa",
  persona: "Persona",
  otro: "Otro",
};

const alPeso = (centavos: number) => Math.round(centavos / 100) * 100;

/** Cuota fija de capital + intereses en pesos (redondeada al peso). Tasa 0 → capital / plazo. */
export function cuotaFija(principal: number, tasaEA: number, plazoMeses: number): number {
  const p = aCentavos(principal);
  const n = Math.max(1, Math.trunc(plazoMeses));
  const i = tasaMensual(tasaEA);
  const cuota = i === 0 ? p / n : (p * i) / (1 - (1 + i) ** -n);
  return alPeso(Math.ceil(cuota)) / 100;
}

export type FilaAmortizacion = {
  numero: number;
  fecha: string;
  saldoInicial: number;
  interes: number;
  capital: number;
  cuota: number;
  saldo: number;
};

export type Proyeccion = {
  filas: FilaAmortizacion[];
  /** false si la cuota no alcanza a cubrir los intereses (la deuda nunca baja). */
  termina: boolean;
  meses: number;
  interesesTotales: number;
  fechaFin: string | null;
};

/**
 * Proyección desde un saldo de capital con una cuota fija de capital + intereses.
 * `primerPeriodo` es el mes ("YYYY-MM") de la próxima cuota y `diaPago` su día.
 */
export function proyectarDeuda(p: {
  saldo: number;
  tasaEA: number;
  cuota: number;
  primerPeriodo: string;
  diaPago: number;
  maxMeses?: number;
}): Proyeccion {
  const i = tasaMensual(p.tasaEA);
  const cuota = aCentavos(p.cuota);
  const max = p.maxMeses ?? 600;
  let saldo = aCentavos(p.saldo);
  const filas: FilaAmortizacion[] = [];
  let intereses = 0;
  for (let k = 0; saldo > 0 && k < max; k++) {
    const interes = alPeso(saldo * i);
    if (cuota <= interes) {
      return { filas, termina: false, meses: filas.length, interesesTotales: intereses / 100, fechaFin: null };
    }
    const capital = Math.min(cuota - interes, saldo);
    const fila = {
      numero: k + 1,
      fecha: fechaEnMes(desplazarPeriodo(p.primerPeriodo, k), p.diaPago),
      saldoInicial: saldo / 100,
      interes: interes / 100,
      capital: capital / 100,
      cuota: (capital + interes) / 100,
      saldo: (saldo - capital) / 100,
    };
    filas.push(fila);
    intereses += interes;
    saldo -= capital;
  }
  const termina = saldo <= 0;
  return {
    filas,
    termina,
    meses: filas.length,
    interesesTotales: intereses / 100,
    fechaFin: termina && filas.length > 0 ? filas[filas.length - 1].fecha : null,
  };
}

/** Saldo de capital teórico después de pagar `k` cuotas (para registrar un préstamo que ya venía pagando). */
export function saldoTrasCuotas(principal: number, tasaEA: number, cuota: number, k: number): number {
  const i = tasaMensual(tasaEA);
  let saldo = aCentavos(principal);
  const c = aCentavos(cuota);
  for (let j = 0; j < k && saldo > 0; j++) {
    const interes = alPeso(saldo * i);
    saldo -= Math.min(Math.max(c - interes, 0), saldo);
  }
  return saldo / 100;
}

export type Desglose = {
  a_aporte: number;
  a_seguros: number;
  a_intereses: number;
  a_capital: number;
  sobrante: number;
};

/**
 * Desglose sugerido de un pago: primero el aporte (cooperativa), luego seguros, luego los
 * intereses del mes (saldo × tasa mensual) y el resto a capital. El usuario puede corregirlo
 * con el recibo del banco. `sobrante` > 0 si el abono a capital supera el saldo.
 */
export function desgloseSugerido(p: {
  monto: number;
  saldo: number;
  tasaEA: number;
  seguro?: number;
  aporte?: number;
}): Desglose {
  let resto = aCentavos(p.monto);
  const aporte = Math.min(aCentavos(p.aporte ?? 0), resto);
  resto -= aporte;
  const seguro = Math.min(aCentavos(p.seguro ?? 0), resto);
  resto -= seguro;
  const saldo = aCentavos(p.saldo);
  const interes = Math.min(alPeso(saldo * tasaMensual(p.tasaEA)), resto);
  resto -= interes;
  return {
    a_aporte: aporte / 100,
    a_seguros: seguro / 100,
    a_intereses: interes / 100,
    a_capital: resto / 100,
    sobrante: Math.max(resto - saldo, 0) / 100,
  };
}

/** Efecto de un abono extra a capital: meses e intereses que te ahorras. */
export function efectoAbonoExtra(p: {
  saldo: number;
  tasaEA: number;
  cuota: number;
  extra: number;
  primerPeriodo: string;
  diaPago: number;
}): { mesesAhorrados: number; interesesAhorrados: number; antes: Proyeccion; despues: Proyeccion } {
  const antes = proyectarDeuda(p);
  const despues = proyectarDeuda({ ...p, saldo: Math.max(p.saldo - p.extra, 0) });
  return {
    antes,
    despues,
    mesesAhorrados: antes.termina && despues.termina ? antes.meses - despues.meses : 0,
    interesesAhorrados:
      antes.termina && despues.termina
        ? (aCentavos(antes.interesesTotales) - aCentavos(despues.interesesTotales)) / 100
        : 0,
  };
}

/** Próxima fecha de cuota (hoy incluido) según el día de pago. */
export function proximaCuota(hoy: string, diaPago: number): string {
  const esteMes = fechaEnMes(hoy.slice(0, 7), diaPago);
  return esteMes >= hoy ? esteMes : fechaEnMes(desplazarPeriodo(hoy.slice(0, 7), 1), diaPago);
}

// ── Préstamos que hiciste (cuentas por cobrar) ───────────────────────────

export type EstadoPrestamo = "vigente" | "vencido" | "pagado" | "castigado";

export function estadoPrestamo(
  p: { saldo: number; fecha_esperada: string | null; castigado_en: string | null },
  hoy: string,
): EstadoPrestamo {
  if (p.saldo <= 0) return "pagado";
  if (p.castigado_en) return "castigado";
  if (p.fecha_esperada && p.fecha_esperada < hoy) return "vencido";
  return "vigente";
}

export const ESTADOS_PRESTAMO: Record<
  EstadoPrestamo,
  { etiqueta: string; simbolo: string; variante: "neutral" | "success" | "warning" | "danger" | "info" }
> = {
  vigente: { etiqueta: "Al día", simbolo: "○", variante: "info" },
  vencido: { etiqueta: "Vencido", simbolo: "!", variante: "danger" },
  pagado: { etiqueta: "Pagado", simbolo: "✓", variante: "success" },
  castigado: { etiqueta: "Castigado", simbolo: "✕", variante: "neutral" },
};
