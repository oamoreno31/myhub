/**
 * Tarjetas de crédito — lógica pura (fuente de verdad: docs/03-tarjetas-de-credito.md).
 *
 * La app lleva solo el CAPITAL. Los "otros cargos" (intereses, cuota de manejo, seguros…)
 * se deducen en cada extracto:  otros_generados = pago_total_banco − saldo_sistema_al_corte.
 * Cada pago se imputa primero a otros cargos y luego a capital.
 *
 * Espejo en SQL: función `recalcular_tarjeta` (supabase/migrations/20260927000100_tarjetas.sql).
 * La prueba de contrato tests/db/contrato-tarjetas.test.ts compara ambas implementaciones.
 * Internamente todo se calcula en CENTAVOS enteros.
 */
import { aCentavos } from "./dinero";
import { fechaEnMes } from "./obligaciones";
import { desplazarPeriodo } from "./periodos";

export type TipoCompra = "compra" | "avance" | "devolucion" | "ajuste";
export type TipoPago = "total" | "minimo" | "otro" | "inferior_minimo";
export type EstadoExtracto = "pendiente" | "parcial" | "minimo_cubierto" | "pagado_total";
export type AlertaExtracto = "conciliacion_negativa" | "diferencia_no_explicada" | null;

type Monto = number | string;

export type CompraTC = {
  id: string;
  fecha: string;
  tipo: TipoCompra;
  /** Pesos. Positivo; en `ajuste` puede ser negativo. */
  monto: Monto;
  num_cuotas: number;
  created_at?: string;
};

export type ExtractoTC = {
  id: string;
  fecha_corte: string;
  fecha_limite_pago: string;
  pago_total_banco: Monto;
  pago_minimo_banco: Monto;
  intereses?: Monto | null;
  cuota_manejo?: Monto | null;
  seguros?: Monto | null;
  otros_declarados?: Monto | null;
  created_at?: string;
};

export type PagoTC = { id: string; fecha: string; monto: Monto; created_at?: string };

export type OpcionesTarjeta = {
  diaCorte: number;
  /** Tolerancia para clasificar pagos (por defecto $1.000). */
  tolerancia?: number;
  /** Diferencia de conciliación a partir de la cual se alerta (por defecto $20.000). */
  umbralConciliacion?: number;
};

export type ExtractoCalculado = {
  saldo_sistema_al_corte: number;
  otros_generados: number;
  capital_facturado: number;
  minimo_estimado: number;
  diferencia_no_explicada: number | null;
  alerta: AlertaExtracto;
  pagado: number;
  estado: EstadoExtracto;
};

export type PagoCalculado = {
  extracto_id: string | null;
  tipo_calculado: TipoPago;
  imputado_otros: number;
  imputado_capital: number;
  saldo_a_favor: number;
};

export type ResultadoLibro = {
  extractos: Record<string, ExtractoCalculado>;
  pagos: Record<string, PagoCalculado>;
  /** Capital final (negativo = saldo a favor). */
  capital: number;
  /** Otros cargos pendientes al final. */
  otros: number;
};

export const TOLERANCIA_DEFECTO = 1000;
export const UMBRAL_CONCILIACION_DEFECTO = 20000;

// ---------------------------------------------------------------------------
// Cortes y cuotas
// ---------------------------------------------------------------------------

/** Corte en el que se factura una compra: el del mes si la compra es hasta ese día; si no, el siguiente. */
export function corteDeCompra(fechaISO: string, diaCorte: number): string {
  const periodo = fechaISO.slice(0, 7);
  const corteMes = fechaEnMes(periodo, diaCorte);
  return fechaISO <= corteMes ? corteMes : fechaEnMes(desplazarPeriodo(periodo, 1), diaCorte);
}

export type Cuota = { numero: number; corte: string; valor: number };

/** Signo con que una compra afecta el capital. */
export function efectoCapital(tipo: TipoCompra, monto: Monto): number {
  const c = aCentavos(monto);
  return tipo === "devolucion" ? -Math.abs(c) : tipo === "ajuste" ? c : Math.abs(c);
}

/**
 * Calendario de capital. Compras y avances se difieren en N cuotas iguales (la última
 * absorbe el redondeo); devoluciones se descuentan completas en su primer corte;
 * los ajustes no se facturan.
 */
export function cuotasDeCompra(compra: CompraTC, diaCorte: number): Cuota[] {
  if (compra.tipo === "ajuste") return [];
  const total = efectoCapital(compra.tipo, compra.monto);
  const n = compra.tipo === "devolucion" ? 1 : Math.max(1, Math.trunc(compra.num_cuotas || 1));
  const primero = corteDeCompra(compra.fecha, diaCorte);
  const base = Math.trunc(total / n);
  return Array.from({ length: n }, (_, i) => ({
    numero: i + 1,
    corte: fechaEnMes(desplazarPeriodo(primero.slice(0, 7), i), diaCorte),
    valor: (i === n - 1 ? total - base * (n - 1) : base) / 100,
  }));
}

// ---------------------------------------------------------------------------
// Clasificación de pagos
// ---------------------------------------------------------------------------

/** Clasifica lo pagado acumulado frente a un extracto (valores en centavos). */
function clasificarCentavos(acumulado: number, total: number, minimo: number, tol: number): TipoPago {
  if (acumulado >= total - tol) return "total";
  if (Math.abs(acumulado - minimo) <= tol) return "minimo";
  if (acumulado > minimo) return "otro";
  return "inferior_minimo";
}

/** Versión en pesos, para vistas previas. */
export function clasificarPago(
  acumulado: Monto,
  total: Monto,
  minimo: Monto,
  tolerancia = TOLERANCIA_DEFECTO,
): TipoPago {
  return clasificarCentavos(aCentavos(acumulado), aCentavos(total), aCentavos(minimo), aCentavos(tolerancia));
}

function estadoDe(pagado: number, total: number, minimo: number, tol: number): EstadoExtracto {
  if (pagado >= total - tol) return "pagado_total";
  if (pagado > 0 && pagado >= minimo - tol) return "minimo_cubierto";
  if (pagado > 0) return "parcial";
  return "pendiente";
}

// ---------------------------------------------------------------------------
// Libro mayor
// ---------------------------------------------------------------------------

type Evento =
  | { orden: 0; fecha: string; clave: string; compra: CompraTC }
  | { orden: 1; fecha: string; clave: string; extracto: ExtractoTC }
  | { orden: 2; fecha: string; clave: string; pago: PagoTC };

/**
 * Recorre cronológicamente compras → extractos → pagos (en ese orden dentro del mismo día)
 * y calcula otros cargos, clasificación e imputación. Determinístico: el resultado no
 * depende del orden en que se registraron los datos.
 */
export function libroMayor(
  compras: CompraTC[],
  extractos: ExtractoTC[],
  pagos: PagoTC[],
  opciones: OpcionesTarjeta,
): ResultadoLibro {
  const tol = aCentavos(opciones.tolerancia ?? TOLERANCIA_DEFECTO);
  const umbral = aCentavos(opciones.umbralConciliacion ?? UMBRAL_CONCILIACION_DEFECTO);

  // Capital facturado por periodo de corte (YYYY-MM).
  const facturado = new Map<string, number>();
  for (const c of compras) {
    for (const q of cuotasDeCompra(c, opciones.diaCorte)) {
      const p = q.corte.slice(0, 7);
      facturado.set(p, (facturado.get(p) ?? 0) + aCentavos(q.valor));
    }
  }

  const eventos: Evento[] = [
    ...compras.map((c) => ({ orden: 0 as const, fecha: c.fecha, clave: `${c.created_at ?? ""}|${c.id}`, compra: c })),
    ...extractos.map((e) => ({
      orden: 1 as const,
      fecha: e.fecha_corte,
      clave: `${e.created_at ?? ""}|${e.id}`,
      extracto: e,
    })),
    ...pagos.map((p) => ({ orden: 2 as const, fecha: p.fecha, clave: `${p.created_at ?? ""}|${p.id}`, pago: p })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden || a.clave.localeCompare(b.clave));

  let capital = 0;
  let otros = 0;
  let extractoVigente: ExtractoTC | null = null;
  const pagadoPorExtracto = new Map<string, number>();
  const rExtractos: Record<string, ExtractoCalculado> = {};
  const rPagos: Record<string, PagoCalculado> = {};

  for (const ev of eventos) {
    if (ev.orden === 0) {
      capital += efectoCapital(ev.compra.tipo, ev.compra.monto);
    } else if (ev.orden === 1) {
      const e = ev.extracto;
      const total = aCentavos(e.pago_total_banco);
      const saldoSistema = capital + otros;
      const generados = total - saldoSistema;
      if (generados > 0) otros += generados;
      const capFact = facturado.get(e.fecha_corte.slice(0, 7)) ?? 0;
      const desglose = [e.intereses, e.cuota_manejo, e.seguros, e.otros_declarados].filter(
        (v): v is Monto => v !== null && v !== undefined && v !== "",
      );
      const diferencia =
        desglose.length > 0 ? generados - desglose.reduce<number>((a, v) => a + aCentavos(v), 0) : null;
      rExtractos[e.id] = {
        saldo_sistema_al_corte: saldoSistema / 100,
        otros_generados: generados / 100,
        capital_facturado: capFact / 100,
        minimo_estimado: (Math.min(Math.max(capFact, 0), Math.max(capital, 0)) + otros) / 100,
        diferencia_no_explicada: diferencia === null ? null : diferencia / 100,
        alerta:
          generados < 0
            ? "conciliacion_negativa"
            : diferencia !== null && Math.abs(diferencia) > umbral
              ? "diferencia_no_explicada"
              : null,
        pagado: 0,
        estado: "pendiente",
      };
      extractoVigente = e;
      pagadoPorExtracto.set(e.id, 0);
    } else {
      const p = ev.pago;
      const monto = aCentavos(p.monto);
      let tipo: TipoPago = "otro";
      if (extractoVigente) {
        const acumulado = (pagadoPorExtracto.get(extractoVigente.id) ?? 0) + monto;
        pagadoPorExtracto.set(extractoVigente.id, acumulado);
        tipo = clasificarCentavos(
          acumulado,
          aCentavos(extractoVigente.pago_total_banco),
          aCentavos(extractoVigente.pago_minimo_banco),
          tol,
        );
      }
      const aOtros = Math.min(monto, Math.max(otros, 0));
      otros -= aOtros;
      const resto = monto - aOtros;
      const aCapital = Math.min(resto, Math.max(capital, 0));
      const aFavor = resto - aCapital;
      capital -= aCapital + aFavor;
      rPagos[p.id] = {
        extracto_id: extractoVigente?.id ?? null,
        tipo_calculado: tipo,
        imputado_otros: aOtros / 100,
        imputado_capital: aCapital / 100,
        saldo_a_favor: aFavor / 100,
      };
    }
  }

  for (const e of extractos) {
    const pagado = pagadoPorExtracto.get(e.id) ?? 0;
    rExtractos[e.id].pagado = pagado / 100;
    rExtractos[e.id].estado = estadoDe(pagado, aCentavos(e.pago_total_banco), aCentavos(e.pago_minimo_banco), tol);
  }

  return { extractos: rExtractos, pagos: rPagos, capital: capital / 100, otros: otros / 100 };
}

// ---------------------------------------------------------------------------
// Vistas previas para formularios
// ---------------------------------------------------------------------------

export type VistaPreviaPagoTC = PagoCalculado & {
  capital_restante: number;
  otros_restantes: number;
  pct_otros: number;
  extracto: {
    id: string;
    total: number;
    minimo: number;
    pagado_antes: number;
    pendiente_total: number;
    pendiente_minimo: number;
  } | null;
};

/** Simula un pago nuevo sobre el libro actual: qué tipo sería y cómo se imputaría. */
export function simularPago(
  compras: CompraTC[],
  extractos: ExtractoTC[],
  pagos: PagoTC[],
  nuevo: { fecha: string; monto: number; excluirId?: string },
  opciones: OpcionesTarjeta,
): VistaPreviaPagoTC {
  const base = pagos.filter((p) => p.id !== nuevo.excluirId);
  const id = "__simulado__";
  const r = libroMayor(
    compras,
    extractos,
    [...base, { id, fecha: nuevo.fecha, monto: nuevo.monto, created_at: "9999" }],
    opciones,
  );
  const calc = r.pagos[id];
  const ext = calc.extracto_id ? extractos.find((e) => e.id === calc.extracto_id)! : null;
  const pagadoAntes = ext ? r.extractos[ext.id].pagado - nuevo.monto : 0;
  return {
    ...calc,
    capital_restante: r.capital,
    otros_restantes: r.otros,
    pct_otros: nuevo.monto > 0 ? calc.imputado_otros / nuevo.monto : 0,
    extracto: ext
      ? {
          id: ext.id,
          total: Number(ext.pago_total_banco),
          minimo: Number(ext.pago_minimo_banco),
          pagado_antes: pagadoAntes,
          pendiente_total: Math.max(Number(ext.pago_total_banco) - pagadoAntes, 0),
          pendiente_minimo: Math.max(Number(ext.pago_minimo_banco) - pagadoAntes, 0),
        }
      : null,
  };
}

/** Simula el registro (o edición) de un extracto: cómo concilia con lo que lleva el sistema. */
export function simularExtracto(
  compras: CompraTC[],
  extractos: ExtractoTC[],
  pagos: PagoTC[],
  nuevo: Omit<ExtractoTC, "id">,
  opciones: OpcionesTarjeta & { excluirId?: string },
): ExtractoCalculado {
  const id = "__simulado__";
  const lista = [...extractos.filter((e) => e.id !== opciones.excluirId), { ...nuevo, id, created_at: "9999" }];
  return libroMayor(compras, lista, pagos, opciones).extractos[id];
}

/** Saldos a una fecha (inclusive): capital y otros cargos pendientes. */
export function saldoAFecha(
  compras: CompraTC[],
  extractos: ExtractoTC[],
  pagos: PagoTC[],
  fecha: string,
  opciones: OpcionesTarjeta,
): { capital: number; otros: number } {
  const r = libroMayor(
    compras.filter((c) => c.fecha <= fecha),
    extractos.filter((e) => e.fecha_corte <= fecha),
    pagos.filter((p) => p.fecha <= fecha),
    opciones,
  );
  return { capital: r.capital, otros: r.otros };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Tasa mensual equivalente a una efectiva anual: (1 + EA)^(1/12) − 1. */
export function tasaMensual(ea: number): number {
  return (1 + ea) ** (1 / 12) - 1;
}

/** Último corte ocurrido hasta hoy (inclusive) según el día de corte. */
export function ultimoCorte(hoy: string, diaCorte: number): string {
  const corteMes = fechaEnMes(hoy.slice(0, 7), diaCorte);
  return corteMes <= hoy ? corteMes : fechaEnMes(desplazarPeriodo(hoy.slice(0, 7), -1), diaCorte);
}

/** Próximo corte (estrictamente después de hoy). */
export function proximoCorte(hoy: string, diaCorte: number): string {
  const corteMes = fechaEnMes(hoy.slice(0, 7), diaCorte);
  return corteMes > hoy ? corteMes : fechaEnMes(desplazarPeriodo(hoy.slice(0, 7), 1), diaCorte);
}

/** Fecha límite de pago de un corte: el día de pago siguiente al corte (mismo mes o el siguiente). */
export function fechaLimiteDeCorte(corte: string, diaLimite: number): string {
  const mismoMes = fechaEnMes(corte.slice(0, 7), diaLimite);
  return mismoMes > corte ? mismoMes : fechaEnMes(desplazarPeriodo(corte.slice(0, 7), 1), diaLimite);
}

/** Mejor día para comprar: el día siguiente al corte (más días hasta el pago). */
export function mejorDiaDeCompra(diaCorte: number): number {
  return diaCorte >= 28 ? 1 : diaCorte + 1;
}

/**
 * ¿Falta registrar el extracto del último corte? Solo si ya pasó el corte, hubo movimiento
 * en la tarjeta antes de él y no hay un extracto en ese mismo periodo.
 */
export function extractoPendiente(
  hoy: string,
  diaCorte: number,
  extractos: Pick<ExtractoTC, "fecha_corte">[],
  primeraActividad: string | null,
): string | null {
  const corte = ultimoCorte(hoy, diaCorte);
  if (!primeraActividad || primeraActividad > corte) return null;
  const periodo = corte.slice(0, 7);
  return extractos.some((e) => e.fecha_corte.slice(0, 7) === periodo) ? null : corte;
}

/** Nivel de uso del cupo: sano < 30 %, atención hasta 60 %, alto por encima (alerta en Inicio). */
export type NivelUtilizacion = "sano" | "atencion" | "alto";
export const UMBRAL_UTILIZACION_ALERTA = 0.6;

export function nivelUtilizacion(utilizacion: number): NivelUtilizacion {
  if (utilizacion > UMBRAL_UTILIZACION_ALERTA) return "alto";
  if (utilizacion >= 0.3) return "atencion";
  return "sano";
}

export const ETIQUETA_TIPO_PAGO: Record<TipoPago, string> = {
  total: "Pago total",
  minimo: "Pago mínimo",
  otro: "Otro valor",
  inferior_minimo: "Inferior al mínimo",
};

export const ETIQUETA_TIPO_COMPRA: Record<TipoCompra, string> = {
  compra: "Compra",
  avance: "Avance en efectivo",
  devolucion: "Devolución",
  ajuste: "Ajuste de capital",
};

export const ETIQUETA_ESTADO_EXTRACTO: Record<EstadoExtracto, string> = {
  pendiente: "Por pagar",
  parcial: "Pago parcial",
  minimo_cubierto: "Mínimo cubierto",
  pagado_total: "Pagado total",
};
