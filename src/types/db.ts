/**
 * Atajos de tipos sobre `database.ts` (que se regenera con `pnpm db:types`; no editarlo a mano).
 */
import type { Database } from "./database";

type Public = Database["public"];

export type Tabla<T extends keyof Public["Tables"]> = Public["Tables"][T]["Row"];
export type NuevaFila<T extends keyof Public["Tables"]> = Public["Tables"][T]["Insert"];
export type Vista<T extends keyof Public["Views"]> = Public["Views"][T]["Row"];
export type Enum<T extends keyof Public["Enums"]> = Public["Enums"][T];

export type ObligacionMesFila = Vista<"v_obligaciones_mes">;
export type MovimientoFila = Vista<"v_movimientos">;
export type ResumenPeriodoFila = Vista<"v_resumen_periodo">;
export type SaldoCuentaFila = Vista<"v_saldos_cuentas">;
export type GastoCategoriaFila = Vista<"v_gasto_categoria_mes">;
