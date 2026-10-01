import "server-only";
import { cookies } from "next/headers";
import { esPeriodoValido, type PeriodoId, periodoActual } from "@/lib/domain/periodos";
import { serverEnv } from "@/lib/env.server";

export const COOKIE_PERIODO = "pc_periodo";

/** Periodo elegido en el selector global; si no hay uno válido, el mes actual en Bogotá. */
export async function obtenerPeriodoSeleccionado(): Promise<PeriodoId> {
  const valor = (await cookies()).get(COOKIE_PERIODO)?.value;
  return esPeriodoValido(valor) ? valor : periodoActual(new Date(), serverEnv().APP_TIMEZONE);
}

export function obtenerPeriodoActual(): PeriodoId {
  return periodoActual(new Date(), serverEnv().APP_TIMEZONE);
}
