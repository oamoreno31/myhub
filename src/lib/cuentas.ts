/** Prioridad para sugerir la cuenta de un movimiento: bancos, luego billeteras, al final efectivo. */
const PRIORIDAD_CUENTA: Record<string, number> = { ahorros: 0, corriente: 1, billetera: 2, efectivo: 3 };

export function cuentaPorDefecto<T extends { tipo?: string }>(cuentas: T[]): T | undefined {
  return [...cuentas].sort((a, b) => (PRIORIDAD_CUENTA[a.tipo ?? ""] ?? 9) - (PRIORIDAD_CUENTA[b.tipo ?? ""] ?? 9))[0];
}
