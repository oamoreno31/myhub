/**
 * Plan de deudas: avalancha vs bola de nieve (docs/02 §6) y proyección pagando solo mínimos.
 *
 * Cada mes: se suman los intereses del mes a cada saldo (tasa EA → mensual), se paga el mínimo
 * de cada deuda y el excedente (extra + mínimos de las deudas ya saldadas) va a la deuda objetivo:
 *  · avalancha: la de mayor tasa primero;
 *  · bola de nieve: la de menor saldo primero;
 *  · mínimos: sin extra y sin reutilizar lo que se libera (lo que pasa si no cambias nada).
 * Supone un mínimo fijo cada mes (en tarjetas el real baja con el saldo). En centavos enteros.
 */
import { aCentavos } from "./dinero";
import { tasaMensual } from "./tarjetas";

export type DeudaSim = { id: string; nombre: string; saldo: number; tasaEA: number; minimo: number };
export type Metodo = "minimos" | "avalancha" | "bola_nieve";

export type ResultadoSim = {
  metodo: Metodo;
  /** Meses hasta quedar sin deudas (null si con esos pagos no se termina). */
  meses: number | null;
  intereses: number;
  pagado: number;
  /** Mes (1…) en que queda saldada cada deuda. */
  saldadas: Record<string, number>;
  /** Orden en que se atacan las deudas. */
  orden: string[];
  /** Saldo total al cierre de cada mes; [0] = hoy. */
  serie: number[];
  /** Deudas cuyo mínimo no alcanza ni para los intereses. */
  noAlcanza: string[];
};

export const MAX_MESES = 600;

export function ordenar(deudas: DeudaSim[], metodo: Metodo): DeudaSim[] {
  const copia = [...deudas];
  if (metodo === "avalancha") return copia.sort((a, b) => b.tasaEA - a.tasaEA || a.saldo - b.saldo);
  return copia.sort((a, b) => a.saldo - b.saldo || b.tasaEA - a.tasaEA);
}

export function simular(deudas: DeudaSim[], extraMensual: number, metodo: Metodo): ResultadoSim {
  const activas = deudas.filter((d) => d.saldo > 0);
  const orden = ordenar(activas, metodo).map((d) => d.id);
  const saldo = new Map(activas.map((d) => [d.id, aCentavos(d.saldo)]));
  const tasa = new Map(activas.map((d) => [d.id, tasaMensual(d.tasaEA)]));
  const minimo = new Map(activas.map((d) => [d.id, aCentavos(d.minimo)]));
  const extra = metodo === "minimos" ? 0 : Math.max(0, aCentavos(extraMensual));
  // Presupuesto mensual constante: suma de mínimos originales + extra (la "bola" que crece).
  const presupuesto = [...minimo.values()].reduce((a, v) => a + v, 0) + extra;
  const noAlcanza = activas
    .filter((d) => aCentavos(d.minimo) <= Math.round(aCentavos(d.saldo) * (tasa.get(d.id) ?? 0)))
    .map((d) => d.id);

  let intereses = 0;
  let pagado = 0;
  const saldadas: Record<string, number> = {};
  const total = () => [...saldo.values()].reduce((a, v) => a + v, 0);
  const serie = [total() / 100];
  let mes = 0;

  while (total() > 0 && mes < MAX_MESES) {
    mes++;
    for (const id of orden) {
      const s = saldo.get(id)!;
      if (s <= 0) continue;
      const i = Math.round(s * tasa.get(id)!);
      intereses += i;
      saldo.set(id, s + i);
    }
    let disponible = metodo === "minimos" ? Infinity : presupuesto;
    // 1) mínimos
    for (const id of orden) {
      const s = saldo.get(id)!;
      if (s <= 0) continue;
      const p = Math.min(minimo.get(id)!, s, disponible);
      saldo.set(id, s - p);
      pagado += p;
      if (disponible !== Infinity) disponible -= p;
    }
    // 2) excedente a la deuda objetivo, en cascada
    if (metodo !== "minimos") {
      for (const id of orden) {
        if (disponible <= 0) break;
        const s = saldo.get(id)!;
        if (s <= 0) continue;
        const p = Math.min(s, disponible);
        saldo.set(id, s - p);
        pagado += p;
        disponible -= p;
      }
    }
    for (const id of orden) if (saldo.get(id)! <= 0 && saldadas[id] === undefined) saldadas[id] = mes;
    serie.push(total() / 100);
  }

  return {
    metodo,
    meses: total() > 0 ? null : mes,
    intereses: intereses / 100,
    pagado: pagado / 100,
    saldadas,
    orden,
    serie,
    noAlcanza,
  };
}
