/**
 * Análisis y presupuesto — lógica pura (docs/01 §10 y HU-19/20, docs/02 §5).
 *
 * Trabaja sobre filas agregadas de `v_consumo_mes` (consumo por categoría hoja y mes) y
 * `v_caja_mes`. Todo se suma en CENTAVOS enteros y se devuelve en pesos.
 */
import { aCentavos } from "./dinero";
import { desplazarPeriodo } from "./periodos";

export type Bolsa = "necesidad" | "deseo" | "ahorro_deuda" | "no_aplica";

export type FilaConsumo = {
  /** "YYYY-MM" */
  periodo: string;
  categoria_id: string;
  categoria_nombre: string;
  padre_id: string | null;
  padre_nombre: string | null;
  bolsa: Bolsa;
  es_fija: boolean;
  origen: string;
  reembolsable: boolean;
  total: number;
};

export type TotalCategoria = {
  id: string;
  nombre: string;
  /** "Otros gastos › Mercado" cuando es subcategoría. */
  etiqueta: string;
  padre_id: string | null;
  bolsa: Bolsa;
  es_fija: boolean;
  total: number;
};

const pesos = (c: number) => c / 100;

/** Últimos `n` periodos terminando en `hasta` (incluido), del más antiguo al más reciente. */
export function ventanaPeriodos(hasta: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => desplazarPeriodo(hasta, i - n + 1));
}

export function filtrarConsumo(filas: FilaConsumo[], opciones: { excluirReembolsables?: boolean } = {}) {
  return opciones.excluirReembolsables ? filas.filter((f) => !f.reembolsable) : filas;
}

/** Gasto por categoría hoja en uno o varios periodos, de mayor a menor. */
export function totalesPorCategoria(filas: FilaConsumo[], periodos: string | string[]): TotalCategoria[] {
  const set = new Set(Array.isArray(periodos) ? periodos : [periodos]);
  const mapa = new Map<string, TotalCategoria & { c: number }>();
  for (const f of filas) {
    if (!set.has(f.periodo)) continue;
    const t = mapa.get(f.categoria_id) ?? {
      id: f.categoria_id,
      nombre: f.categoria_nombre,
      etiqueta: f.padre_nombre ? `${f.padre_nombre} › ${f.categoria_nombre}` : f.categoria_nombre,
      padre_id: f.padre_id,
      bolsa: f.bolsa,
      es_fija: f.es_fija,
      total: 0,
      c: 0,
    };
    t.c += aCentavos(f.total);
    mapa.set(f.categoria_id, t);
  }
  return [...mapa.values()]
    .filter((t) => t.c !== 0)
    .map(({ c, ...t }) => ({ ...t, total: pesos(c) }))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, "es"));
}

/** Total de consumo por periodo (en el orden recibido). */
export function totalPorPeriodo(filas: FilaConsumo[], periodos: string[]): number[] {
  const mapa = new Map<string, number>();
  for (const f of filas) mapa.set(f.periodo, (mapa.get(f.periodo) ?? 0) + aCentavos(f.total));
  return periodos.map((p) => pesos(mapa.get(p) ?? 0));
}

export type SerieCategoria = { id: string; nombre: string; valores: number[] };

/**
 * Series para barras apiladas: las `max` categorías con más gasto en la ventana (color fijo por
 * categoría, en ese orden) y el resto sumado en "Otras".
 */
export function serieApilada(filas: FilaConsumo[], periodos: string[], max = 5): SerieCategoria[] {
  const ranking = totalesPorCategoria(filas, periodos);
  const principales = ranking.slice(0, max);
  const ids = new Set(principales.map((p) => p.id));
  const series: SerieCategoria[] = principales.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    valores: periodos.map(() => 0),
  }));
  const otras: SerieCategoria = { id: "otras", nombre: "Otras", valores: periodos.map(() => 0) };
  const idx = new Map(periodos.map((p, i) => [p, i]));
  for (const f of filas) {
    const i = idx.get(f.periodo);
    if (i === undefined) continue;
    const s = ids.has(f.categoria_id) ? series.find((x) => x.id === f.categoria_id)! : otras;
    s.valores[i] += aCentavos(f.total);
  }
  const resultado = ranking.length > max ? [...series, otras] : series;
  return resultado.map((s) => ({ ...s, valores: s.valores.map(pesos) }));
}

export type Comparacion = TotalCategoria & {
  actual: number;
  promedio: number;
  diferencia: number;
  /** null si no hay promedio con qué comparar. */
  variacion: number | null;
};

/**
 * Cada categoría del mes contra su promedio de los `n` meses anteriores (los meses sin gasto
 * cuentan como 0). Incluye las categorías que tuvieron gasto antes aunque este mes no.
 */
export function compararConPromedio(filas: FilaConsumo[], periodo: string, n = 3): Comparacion[] {
  const previos = ventanaPeriodos(desplazarPeriodo(periodo, -1), n);
  const actual = new Map(totalesPorCategoria(filas, periodo).map((t) => [t.id, t]));
  const antes = new Map(totalesPorCategoria(filas, previos).map((t) => [t.id, t]));
  const ids = new Set([...actual.keys(), ...antes.keys()]);
  return [...ids]
    .map((id) => {
      const base = (actual.get(id) ?? antes.get(id))!;
      const a = aCentavos(actual.get(id)?.total ?? 0);
      const p = Math.round(aCentavos(antes.get(id)?.total ?? 0) / n);
      return {
        ...base,
        total: pesos(a),
        actual: pesos(a),
        promedio: pesos(p),
        diferencia: pesos(a - p),
        variacion: p > 0 ? (a - p) / p : null,
      };
    })
    .sort((x, y) => Math.abs(y.diferencia) - Math.abs(x.diferencia));
}

/** Fijo vs variable del mes (según la marca "gasto fijo" de la categoría o de su padre). */
export function fijoVariable(filas: FilaConsumo[], periodo: string): { fijo: number; variable: number } {
  let fijo = 0;
  let variable = 0;
  for (const f of filas) {
    if (f.periodo !== periodo) continue;
    if (f.es_fija) fijo += aCentavos(f.total);
    else variable += aCentavos(f.total);
  }
  return { fijo: pesos(fijo), variable: pesos(variable) };
}

// ── Regla 50/30/20 ───────────────────────────────────────────────────────

export const METAS_BOLSA = { necesidad: 0.5, deseo: 0.3, ahorro: 0.2 } as const;

export type EstadoMeta = "ok" | "atencion" | "riesgo";

export type Resultado503020 = {
  ingreso: number;
  necesidad: { total: number; pct: number | null; estado: EstadoMeta };
  deseo: { total: number; pct: number | null; estado: EstadoMeta };
  /** Lo que queda del ingreso después del consumo (tasa de ahorro real). */
  ahorro: { total: number; pct: number | null; estado: EstadoMeta };
  sinClasificar: number;
};

/**
 * Cómo se reparte el ingreso del mes: necesidades ≤ 50 %, deseos ≤ 30 %, ahorro ≥ 20 %.
 * "Atención" es hasta 10 puntos por fuera de la meta; más allá, "riesgo".
 */
export function reparto503020(filas: FilaConsumo[], periodo: string, ingreso: number): Resultado503020 {
  const c = { necesidad: 0, deseo: 0, otros: 0 };
  for (const f of filas) {
    if (f.periodo !== periodo) continue;
    const v = aCentavos(f.total);
    if (f.bolsa === "necesidad") c.necesidad += v;
    else if (f.bolsa === "deseo") c.deseo += v;
    else c.otros += v;
  }
  const ing = aCentavos(ingreso);
  const pct = (v: number) => (ing > 0 ? v / ing : null);
  const tope = (p: number | null, meta: number): EstadoMeta =>
    p === null ? "ok" : p <= meta ? "ok" : p <= meta + 0.1 ? "atencion" : "riesgo";
  const ahorro = ing - c.necesidad - c.deseo - c.otros;
  const pAhorro = pct(ahorro);
  return {
    ingreso,
    necesidad: {
      total: pesos(c.necesidad),
      pct: pct(c.necesidad),
      estado: tope(pct(c.necesidad), METAS_BOLSA.necesidad),
    },
    deseo: { total: pesos(c.deseo), pct: pct(c.deseo), estado: tope(pct(c.deseo), METAS_BOLSA.deseo) },
    ahorro: {
      total: pesos(ahorro),
      pct: pAhorro,
      estado:
        pAhorro === null
          ? "ok"
          : pAhorro >= METAS_BOLSA.ahorro
            ? "ok"
            : pAhorro >= METAS_BOLSA.ahorro - 0.1
              ? "atencion"
              : "riesgo",
    },
    sinClasificar: pesos(c.otros),
  };
}

// ── Presupuesto ──────────────────────────────────────────────────────────

/** "tope": gastado exactamente lo presupuestado (p. ej. el arriendo); no es alerta. */
export type EstadoPresupuesto = "ok" | "atencion" | "tope" | "excedido";
export const UMBRAL_ATENCION = 0.8;

export function estadoPresupuesto(gastado: number, presupuesto: number): { pct: number; estado: EstadoPresupuesto } {
  const p = aCentavos(presupuesto);
  const g = aCentavos(gastado);
  const pct = p > 0 ? g / p : 0;
  if (p <= 0) return { pct, estado: "ok" };
  return { pct, estado: g > p ? "excedido" : g === p ? "tope" : pct >= UMBRAL_ATENCION ? "atencion" : "ok" };
}

export type LineaPresupuesto = { categoria_id: string; monto: number };
export type Categoria = { id: string; padre_id: string | null };

/**
 * Gasto que cuenta para cada línea del presupuesto: el de la propia categoría y, si es una
 * categoría padre, el de sus subcategorías que no tienen presupuesto propio.
 */
export function gastoPorLinea(filas: FilaConsumo[], periodo: string, lineas: LineaPresupuesto[]): Map<string, number> {
  const conLinea = new Set(lineas.map((l) => l.categoria_id));
  const gasto = new Map<string, number>();
  for (const f of filas) {
    if (f.periodo !== periodo) continue;
    const destino = conLinea.has(f.categoria_id)
      ? f.categoria_id
      : f.padre_id && conLinea.has(f.padre_id)
        ? f.padre_id
        : null;
    if (!destino) continue;
    gasto.set(destino, (gasto.get(destino) ?? 0) + aCentavos(f.total));
  }
  return new Map([...gasto].map(([k, v]) => [k, pesos(v)]));
}

/** Gasto del mes que no está cubierto por ninguna línea del presupuesto. */
export function gastoSinPresupuesto(filas: FilaConsumo[], periodo: string, lineas: LineaPresupuesto[]): number {
  const cubierto = [...gastoPorLinea(filas, periodo, lineas).values()].reduce((a, v) => a + aCentavos(v), 0);
  const total = filas.filter((f) => f.periodo === periodo).reduce((a, f) => a + aCentavos(f.total), 0);
  return pesos(total - cubierto);
}

export type PromedioCategoria = { categoria_id: string; bolsa: Bolsa; promedio: number };

export type Propuesta503020 = {
  items: LineaPresupuesto[];
  bolsas: Record<"necesidad" | "deseo" | "ahorro", { meta: number; promedio: number; propuesto: number }>;
};

const redondearMil = (c: number) => Math.round(c / 100_000) * 100_000;

/**
 * Propuesta de presupuesto con la regla 50/30/20 y el ingreso promedio (docs/02 §5):
 * cada bolsa parte del gasto promedio de sus categorías; si se pasa de su meta, se reduce en
 * proporción hasta la meta (hay que recortar); si queda por debajo, se deja como está. El ahorro
 * apunta al 20 % en la categoría de ahorro, si existe. Montos redondeados a miles.
 */
export function propuesta503020(p: {
  ingresoPromedio: number;
  promedios: PromedioCategoria[];
  categoriaAhorroId?: string | null;
}): Propuesta503020 {
  const ing = aCentavos(p.ingresoPromedio);
  const items: LineaPresupuesto[] = [];
  const bolsas = {} as Propuesta503020["bolsas"];
  for (const bolsa of ["necesidad", "deseo"] as const) {
    const cats = p.promedios.filter((c) => c.bolsa === bolsa && c.promedio > 0);
    const suma = cats.reduce((a, c) => a + aCentavos(c.promedio), 0);
    const meta = Math.round(ing * METAS_BOLSA[bolsa]);
    const factor = suma > meta && suma > 0 ? meta / suma : 1;
    let propuesto = 0;
    for (const c of cats) {
      const monto = redondearMil(aCentavos(c.promedio) * factor);
      if (monto > 0) {
        items.push({ categoria_id: c.categoria_id, monto: pesos(monto) });
        propuesto += monto;
      }
    }
    bolsas[bolsa] = { meta: pesos(meta), promedio: pesos(suma), propuesto: pesos(propuesto) };
  }
  const metaAhorro = Math.round(ing * METAS_BOLSA.ahorro);
  const promAhorro = p.promedios
    .filter((c) => c.bolsa === "ahorro_deuda")
    .reduce((a, c) => a + aCentavos(c.promedio), 0);
  if (p.categoriaAhorroId && metaAhorro > 0) {
    items.push({ categoria_id: p.categoriaAhorroId, monto: pesos(redondearMil(metaAhorro)) });
  }
  bolsas.ahorro = {
    meta: pesos(metaAhorro),
    promedio: pesos(promAhorro),
    propuesto: p.categoriaAhorroId ? pesos(redondearMil(metaAhorro)) : 0,
  };
  return { items, bolsas };
}

/** Promedio de gasto por categoría en los `n` meses anteriores a `periodo`. */
export function promediosPorCategoria(filas: FilaConsumo[], periodo: string, n = 3): PromedioCategoria[] {
  const previos = ventanaPeriodos(desplazarPeriodo(periodo, -1), n);
  return totalesPorCategoria(filas, previos).map((t) => ({
    categoria_id: t.id,
    bolsa: t.bolsa,
    promedio: pesos(Math.round(aCentavos(t.total) / n)),
  }));
}

/** Variación relativa segura (null si la base es 0). */
export function variacion(actual: number, base: number): number | null {
  const b = aCentavos(base);
  return b === 0 ? null : (aCentavos(actual) - b) / Math.abs(b);
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Etiqueta corta para ejes: "sep"; enero lleva el año ("ene 27") para ubicar el cambio de año. */
export function etiquetaEjeMes(periodo: string): string {
  const mes = Number(periodo.slice(5, 7));
  const base = MESES_CORTOS[mes - 1];
  return mes === 1 ? `${base} ${periodo.slice(2, 4)}` : base;
}
