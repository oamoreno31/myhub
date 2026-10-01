/**
 * Salud financiera — indicadores, score y acciones sugeridas (docs/02 §4 y §4.1).
 *
 * La BD entrega los insumos del mes (función insumos_salud); aquí se convierten en indicadores
 * con los umbrales editables del usuario, cada uno en una banda (sano · atención · riesgo) y un
 * puntaje 0–100, y el score es el promedio ponderado de los puntajes disponibles.
 */
import { aCentavos } from "./dinero";

export type Insumos = {
  ingresos: number;
  /** Consumo personal: sin gastos reembolsables ni lo registrado como ahorro. */
  gasto_personal: number;
  ahorro_registrado: number;
  costo_financiero: number;
  pagos_deuda: number;
  obligaciones_fijas: number;
  oblig_evaluables: number;
  oblig_a_tiempo: number;
  tc_total: number;
  tc_otro: number;
  tc_minimo: number;
  deuda_tc: number;
  cupo_tc: number;
  ahorro_liquido: number;
  gasto_esencial: number;
};

const CAMPOS: (keyof Insumos)[] = [
  "ingresos",
  "gasto_personal",
  "ahorro_registrado",
  "costo_financiero",
  "pagos_deuda",
  "obligaciones_fijas",
  "oblig_evaluables",
  "oblig_a_tiempo",
  "tc_total",
  "tc_otro",
  "tc_minimo",
  "deuda_tc",
  "cupo_tc",
  "ahorro_liquido",
  "gasto_esencial",
];

/** Lee el JSON de insumos_salud (números que pueden llegar como texto). Null si no es válido. */
export function leerInsumos(json: unknown): Insumos | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const r = {} as Insumos;
  for (const c of CAMPOS) {
    const v = Number(o[c] ?? 0);
    if (!Number.isFinite(v)) return null;
    r[c] = v;
  }
  return r;
}

export type ClaveUmbral =
  | "tasa_ahorro"
  | "carga_deuda"
  | "utilizacion_tc"
  | "costo_financiero"
  | "gastos_fijos"
  | "fondo_emergencia"
  | "puntualidad";
export type ClaveIndicador = ClaveUmbral | "pago_tc";
export type Umbral = { sano: number; riesgo: number };
export type Umbrales = Record<ClaveUmbral, Umbral>;

export const UMBRALES_DEFECTO: Umbrales = {
  tasa_ahorro: { sano: 0.2, riesgo: 0.1 },
  carga_deuda: { sano: 0.3, riesgo: 0.4 },
  utilizacion_tc: { sano: 0.3, riesgo: 0.6 },
  costo_financiero: { sano: 0.03, riesgo: 0.08 },
  gastos_fijos: { sano: 0.5, riesgo: 0.65 },
  fondo_emergencia: { sano: 6, riesgo: 3 },
  puntualidad: { sano: 1, riesgo: 0.9 },
};

/** Umbrales guardados en parametros.umbrales_salud; lo que falte o no sea válido toma el defecto. */
export function leerUmbrales(json: unknown): Umbrales {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, { sano?: unknown; riesgo?: unknown }>;
  const r = {} as Umbrales;
  for (const k of Object.keys(UMBRALES_DEFECTO) as ClaveUmbral[]) {
    const sano = Number(o[k]?.sano);
    const riesgo = Number(o[k]?.riesgo);
    r[k] =
      Number.isFinite(sano) && Number.isFinite(riesgo) && o[k]?.sano !== null && o[k]?.riesgo !== null
        ? { sano, riesgo }
        : UMBRALES_DEFECTO[k];
  }
  return r;
}

type Definicion = {
  nombre: string;
  /** true: más es mejor (ahorro, fondo, puntualidad). */
  mayorEsMejor: boolean;
  /** Valor con puntaje 0 (más allá del riesgo). */
  extremo: number;
  formato: "pct" | "meses";
  peso: number;
  formula: string;
};

export const INDICADORES: Record<ClaveIndicador, Definicion> = {
  tasa_ahorro: {
    nombre: "Tasa de ahorro",
    mayorEsMejor: true,
    extremo: 0,
    formato: "pct",
    peso: 20,
    formula: "(Ingresos − consumo personal) ÷ ingresos",
  },
  carga_deuda: {
    nombre: "Carga de deuda",
    mayorEsMejor: false,
    extremo: 0.6,
    formato: "pct",
    peso: 20,
    formula: "(Mínimos de tarjetas + cuotas de préstamos) ÷ ingresos",
  },
  utilizacion_tc: {
    nombre: "Uso de tarjetas",
    mayorEsMejor: false,
    extremo: 1,
    formato: "pct",
    peso: 15,
    formula: "Deuda de tarjetas ÷ cupo total",
  },
  fondo_emergencia: {
    nombre: "Fondo de emergencia",
    mayorEsMejor: true,
    extremo: 0,
    formato: "meses",
    peso: 15,
    formula: "Plata disponible en cuentas ÷ gasto esencial de un mes",
  },
  costo_financiero: {
    nombre: "Costo financiero",
    mayorEsMejor: false,
    extremo: 0.15,
    formato: "pct",
    peso: 10,
    formula: "(Intereses + cuota de manejo + seguros + otros cargos) ÷ ingresos",
  },
  puntualidad: {
    nombre: "Puntualidad",
    mayorEsMejor: true,
    extremo: 0.5,
    formato: "pct",
    peso: 10,
    formula: "Obligaciones pagadas a tiempo ÷ obligaciones vencidas del mes",
  },
  pago_tc: {
    nombre: "Forma de pago de tarjetas",
    mayorEsMejor: true,
    extremo: 0,
    formato: "pct",
    peso: 10,
    formula: "Extractos pagados en total (100) · otro valor (50) · mínimo o menos (0)",
  },
  gastos_fijos: {
    nombre: "Gastos fijos",
    mayorEsMejor: false,
    extremo: 0.85,
    formato: "pct",
    peso: 0,
    formula: "Obligaciones del mes (sin ahorro) ÷ ingresos",
  },
};

export type Banda = "sano" | "atencion" | "riesgo";

export type Indicador = {
  clave: ClaveIndicador;
  nombre: string;
  valor: number | null;
  banda: Banda | null;
  puntaje: number | null;
  peso: number;
  formato: "pct" | "meses";
  umbral: Umbral | null;
  formula: string;
  /** Texto corto cuando no aplica (p. ej. "Sin tarjetas"). */
  motivo?: string;
};

export function bandaDe(valor: number, u: Umbral, mayorEsMejor: boolean): Banda {
  if (mayorEsMejor) return valor >= u.sano ? "sano" : valor >= u.riesgo ? "atencion" : "riesgo";
  return valor <= u.sano ? "sano" : valor <= u.riesgo ? "atencion" : "riesgo";
}

/**
 * Puntaje 0–100 por tramos: el umbral sano vale 100, el de riesgo 50 y el extremo 0
 * (lineal en cada tramo). Así una mejora dentro de la banda también se nota en el score.
 */
export function puntajeDe(valor: number, u: Umbral, mayorEsMejor: boolean, extremo: number): number {
  // Se trabaja en "más es mejor" invirtiendo el signo cuando hace falta.
  const s = mayorEsMejor ? 1 : -1;
  const v = s * valor;
  const sano = s * u.sano;
  const riesgo = s * u.riesgo;
  let ext = s * extremo;
  if (ext >= riesgo) ext = riesgo - Math.abs(sano - riesgo || 1);
  if (v >= sano) return 100;
  if (v >= riesgo) return sano === riesgo ? 50 : 50 + (50 * (v - riesgo)) / (sano - riesgo);
  if (v <= ext) return 0;
  return (50 * (v - ext)) / (riesgo - ext);
}

const redondear = (x: number) => Math.round(x * 10) / 10;

export function calcularIndicadores(i: Insumos, umbrales: Umbrales = UMBRALES_DEFECTO): Indicador[] {
  const ing = i.ingresos > 0 ? i.ingresos : null;
  const nTc = i.tc_total + i.tc_otro + i.tc_minimo;
  const valores: Record<ClaveIndicador, { valor: number | null; motivo?: string }> = {
    tasa_ahorro: { valor: ing ? (ing - i.gasto_personal) / ing : null, motivo: "Sin ingresos este mes" },
    carga_deuda: { valor: ing ? i.pagos_deuda / ing : null, motivo: "Sin ingresos este mes" },
    utilizacion_tc: { valor: i.cupo_tc > 0 ? i.deuda_tc / i.cupo_tc : null, motivo: "Sin tarjetas" },
    fondo_emergencia: {
      valor: i.gasto_esencial > 0 ? i.ahorro_liquido / i.gasto_esencial : null,
      motivo: "Aún sin gasto esencial registrado",
    },
    costo_financiero: { valor: ing ? i.costo_financiero / ing : null, motivo: "Sin ingresos este mes" },
    puntualidad: {
      valor: i.oblig_evaluables > 0 ? i.oblig_a_tiempo / i.oblig_evaluables : null,
      motivo: "Aún no vence ninguna obligación",
    },
    pago_tc: {
      valor: nTc > 0 ? (i.tc_total + 0.5 * i.tc_otro) / nTc : null,
      motivo: "Sin extractos que vencieran este mes",
    },
    gastos_fijos: { valor: ing ? i.obligaciones_fijas / ing : null, motivo: "Sin ingresos este mes" },
  };

  return (Object.keys(INDICADORES) as ClaveIndicador[]).map((clave) => {
    const d = INDICADORES[clave];
    const { valor, motivo } = valores[clave];
    const base = { clave, nombre: d.nombre, peso: d.peso, formato: d.formato, formula: d.formula };
    if (valor === null) return { ...base, valor: null, banda: null, puntaje: null, umbral: null, motivo };
    if (clave === "pago_tc") {
      const banda: Banda = i.tc_minimo > 0 ? "riesgo" : i.tc_otro > 0 ? "atencion" : "sano";
      return { ...base, valor, banda, puntaje: redondear(valor * 100), umbral: null };
    }
    const u = umbrales[clave];
    return {
      ...base,
      valor,
      banda: bandaDe(valor, u, d.mayorEsMejor),
      puntaje: redondear(puntajeDe(valor, u, d.mayorEsMejor, d.extremo)),
      umbral: u,
    };
  });
}

export type LecturaScore = "solida" | "estable" | "fragil" | "critica";

export const LECTURAS: Record<LecturaScore, { etiqueta: string; desde: number }> = {
  solida: { etiqueta: "Sólida", desde: 80 },
  estable: { etiqueta: "Estable", desde: 60 },
  fragil: { etiqueta: "Frágil", desde: 40 },
  critica: { etiqueta: "Crítica", desde: 0 },
};

export type Score = {
  valor: number | null;
  lectura: LecturaScore | null;
  /** Peso de los indicadores que sí se pudieron calcular (de 100). */
  cobertura: number;
};

/** Promedio ponderado de los puntajes disponibles. Sin ingresos del mes no hay score. */
export function calcularScore(indicadores: Indicador[]): Score {
  const conPeso = indicadores.filter((x) => x.peso > 0);
  const disponibles = conPeso.filter((x) => x.puntaje !== null);
  const cobertura = disponibles.reduce((a, x) => a + x.peso, 0);
  const ahorro = indicadores.find((x) => x.clave === "tasa_ahorro");
  if (!ahorro || ahorro.puntaje === null || cobertura === 0) return { valor: null, lectura: null, cobertura };
  const valor = Math.round(disponibles.reduce((a, x) => a + x.peso * (x.puntaje ?? 0), 0) / cobertura);
  const lectura = (Object.keys(LECTURAS) as LecturaScore[]).find((k) => valor >= LECTURAS[k].desde) ?? "critica";
  return { valor, lectura, cobertura };
}

// ── Acciones sugeridas ────────────────────────────────────────────────────

export type ContextoAcciones = {
  tarjetas: { id: string; nombre: string; deuda: number; cupo: number; otrosCargos: number; tasaEA: number | null }[];
  deudas: { id: string; nombre: string; saldo: number; tasaEA: number }[];
  /** Categoría con el mayor aumento frente al promedio de 3 meses. */
  categoriaQueMasSubio?: { nombre: string; diferencia: number } | null;
  tieneMetaFondo: boolean;
  usuraEA: number | null;
};

export type Accion = {
  id: string;
  titulo: string;
  detalle: string;
  href: string;
  /** Puntos de score en juego (peso × lo que le falta al indicador). */
  impacto: number;
  indicador: ClaveIndicador | "usura";
};

const pesos = (v: number) => Math.max(0, Math.ceil(aCentavos(v) / 100_000)) * 1000; // al millar, hacia arriba
const fmt = (v: number) => `$ ${pesos(v).toLocaleString("es-CO")}`;
const pct = (v: number) => `${(Math.round(v * 1000) / 10).toLocaleString("es-CO")} %`;

/** Las 3 acciones de mayor impacto en el score (docs/02 §4.1). */
export function accionesSugeridas(indicadores: Indicador[], i: Insumos, ctx: ContextoAcciones, cuantas = 3): Accion[] {
  const acciones: Accion[] = [];
  const por = new Map(indicadores.map((x) => [x.clave, x]));
  const impacto = (k: ClaveIndicador) => {
    const x = por.get(k);
    return x && x.puntaje !== null ? (x.peso * (100 - x.puntaje)) / 100 : 0;
  };
  const flojo = (k: ClaveIndicador) => {
    const x = por.get(k);
    return x && x.banda !== null && x.banda !== "sano";
  };

  if (flojo("pago_tc") || flojo("costo_financiero")) {
    const conCargos = [...ctx.tarjetas].filter((t) => t.otrosCargos > 0).sort((a, b) => b.otrosCargos - a.otrosCargos);
    const t = conCargos[0];
    if (t) {
      acciones.push({
        id: `pago-total-${t.id}`,
        titulo: `Paga el total de ${t.nombre}, no solo una parte`,
        detalle: `Este mes se fueron ${fmt(t.otrosCargos)} en intereses y cargos de esa tarjeta: plata que no compra nada.`,
        href: `/tarjetas/${t.id}`,
        impacto: impacto("pago_tc") + impacto("costo_financiero"),
        indicador: "pago_tc",
      });
    } else if (flojo("costo_financiero")) {
      const cara = [...ctx.deudas].sort((a, b) => b.tasaEA - a.tasaEA)[0];
      if (cara)
        acciones.push({
          id: `deuda-cara-${cara.id}`,
          titulo: `Abona extra a ${cara.nombre}, tu deuda más cara`,
          detalle: `Cobra ${pct(cara.tasaEA)} E.A. Cada peso que abones a capital deja de generar intereses; mira cuánto antes sales en el plan de deudas.`,
          href: "/salud?tab=deudas",
          impacto: impacto("costo_financiero"),
          indicador: "costo_financiero",
        });
    }
  }

  if (flojo("tasa_ahorro") && i.ingresos > 0) {
    const meta = por.get("tasa_ahorro")?.umbral?.sano ?? 0.2;
    const falta = meta * i.ingresos - (i.ingresos - i.gasto_personal);
    const sube = ctx.categoriaQueMasSubio;
    acciones.push({
      id: "tasa-ahorro",
      titulo: `Recorta ${fmt(falta)} de consumo para ahorrar el ${pct(meta)}`,
      detalle: sube
        ? `Donde más subiste frente a tu promedio: ${sube.nombre} (+${fmt(sube.diferencia)}).`
        : "Revisa en Análisis las categorías que más crecieron.",
      href: "/analisis",
      impacto: impacto("tasa_ahorro"),
      indicador: "tasa_ahorro",
    });
  }

  if (flojo("utilizacion_tc")) {
    const meta = por.get("utilizacion_tc")?.umbral?.sano ?? 0.3;
    const t = [...ctx.tarjetas].filter((x) => x.cupo > 0).sort((a, b) => b.deuda / b.cupo - a.deuda / a.cupo)[0];
    if (t && t.deuda > meta * t.cupo)
      acciones.push({
        id: `uso-${t.id}`,
        titulo: `Abona ${fmt(t.deuda - meta * t.cupo)} a ${t.nombre}`,
        detalle: `Así su uso baja del ${pct(t.deuda / t.cupo)} al ${pct(meta)} del cupo (lo que mejor ven las centrales de riesgo).`,
        href: `/tarjetas/${t.id}`,
        impacto: impacto("utilizacion_tc"),
        indicador: "utilizacion_tc",
      });
  }

  if (flojo("fondo_emergencia") && i.gasto_esencial > 0) {
    const meses = por.get("fondo_emergencia")?.umbral?.sano ?? 6;
    const falta = meses * i.gasto_esencial - i.ahorro_liquido;
    acciones.push({
      id: "fondo",
      titulo: `Construye tu fondo de emergencia: te faltan ${fmt(falta)}`,
      detalle: `Son ${meses} meses de gasto esencial. Apartando ${fmt(falta / 12)} al mes lo completas en un año${
        ctx.tieneMetaFondo ? "." : "; créalo como meta para verle el avance."
      }`,
      href: "/salud?tab=metas",
      impacto: impacto("fondo_emergencia"),
      indicador: "fondo_emergencia",
    });
  }

  if (flojo("carga_deuda") && ctx.deudas.length + ctx.tarjetas.length > 0) {
    acciones.push({
      id: "carga",
      titulo: `Tus cuotas se llevan el ${pct(por.get("carga_deuda")?.valor ?? 0)} de tus ingresos`,
      detalle: "Compara avalancha y bola de nieve en el plan de deudas y evita deudas nuevas hasta bajar del 30 %.",
      href: "/salud?tab=deudas",
      impacto: impacto("carga_deuda"),
      indicador: "carga_deuda",
    });
  }

  if (flojo("puntualidad")) {
    const tarde = i.oblig_evaluables - i.oblig_a_tiempo;
    acciones.push({
      id: "puntualidad",
      titulo: `${tarde} ${tarde === 1 ? "obligación se pagó tarde o sigue vencida" : "obligaciones se pagaron tarde o siguen vencidas"}`,
      detalle: "Pagar a tiempo evita intereses de mora y reportes. Revisa el checklist del mes.",
      href: "/mes",
      impacto: impacto("puntualidad"),
      indicador: "puntualidad",
    });
  }

  if (ctx.usuraEA !== null) {
    const sobre = [
      ...ctx.deudas.map((d) => ({ nombre: d.nombre, tasa: d.tasaEA })),
      ...ctx.tarjetas.filter((t) => t.tasaEA !== null).map((t) => ({ nombre: t.nombre, tasa: t.tasaEA as number })),
    ].filter((x) => x.tasa > (ctx.usuraEA as number));
    if (sobre.length)
      acciones.push({
        id: "usura",
        titulo: `${sobre[0].nombre} cobra más que la tasa de usura que registraste`,
        detalle: `${pct(sobre[0].tasa)} E.A. frente a ${pct(ctx.usuraEA)}. Verifica la tasa en el extracto y, si se confirma, reclama al banco.`,
        href: "/salud?tab=deudas",
        impacto: 25,
        indicador: "usura",
      });
  }

  return acciones
    .filter((a) => a.impacto > 0)
    .sort((a, b) => b.impacto - a.impacto)
    .slice(0, cuantas);
}
