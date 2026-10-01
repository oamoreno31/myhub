"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { esPeriodoValido } from "@/lib/domain/periodos";
import { COOKIE_PERIODO } from "@/lib/periodo-seleccionado";

/** Cambia el periodo del selector global (se guarda en una cookie por 1 año). */
export async function cambiarPeriodo(periodo: string) {
  if (!esPeriodoValido(periodo)) {
    throw new Error("Periodo inválido");
  }
  (await cookies()).set(COOKIE_PERIODO, periodo, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
