/**
 * Dinero — reglas del proyecto:
 * - En BD: numeric(14,2).
 * - En TypeScript: aritmética en CENTAVOS enteros; nunca sumar floats directamente.
 * - En pantalla: COP sin decimales, separador de miles con punto ("$ 1.250.000").
 */

export type Centavos = number;

const formatoCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Convierte pesos (number o string de numeric) a centavos enteros. */
export function aCentavos(pesos: number | string): Centavos {
  const valor = typeof pesos === "string" ? Number(pesos) : pesos;
  if (!Number.isFinite(valor)) throw new Error(`Monto inválido: ${pesos}`);
  return Math.round(valor * 100);
}

/** Convierte centavos a pesos (para enviar a la BD). */
export function aPesos(centavos: Centavos): number {
  return centavos / 100;
}

export function sumar(...montos: Centavos[]): Centavos {
  return montos.reduce((acc, m) => acc + m, 0);
}

/** "$ 1.250.000" (usa espacio normal; Intl devuelve espacio duro). */
export function formatearCOP(pesos: number | string, opciones: { signo?: boolean } = {}): string {
  const valor = typeof pesos === "string" ? Number(pesos) : pesos;
  const texto = formatoCOP
    .format(Math.abs(valor))
    .replace(/\s/g, " ")
    .replace(/^\$(?=\d)/, "$ ");
  if (valor < 0) return `−${texto}`;
  if (opciones.signo && valor > 0) return `+ ${texto}`;
  return texto;
}

/** Interpreta lo que el usuario escribe ("1.250.000", "$ 45.000", "1250000,50") a pesos. */
export function parsearMontoCOP(texto: string): number | null {
  const limpio = texto.replace(/[^\d,.-]/g, "");
  if (!limpio) return null;
  // En es-CO el punto separa miles y la coma los decimales.
  const normalizado = limpio.replace(/\./g, "").replace(",", ".");
  const valor = Number(normalizado);
  return Number.isFinite(valor) ? Math.round(valor * 100) / 100 : null;
}
