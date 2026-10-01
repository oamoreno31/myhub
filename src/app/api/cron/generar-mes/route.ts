import { NextResponse } from "next/server";
import { autorizarCron } from "@/lib/cron";
import { periodoActual, primerDiaDelPeriodo } from "@/lib/domain/periodos";
import { serverEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Día 1 de cada mes (00:05 Bogotá): crea el periodo y sus obligaciones para todos
 * los usuarios. Idempotente: si ya existían, no duplica nada.
 */
export async function GET(request: Request) {
  if (!autorizarCron(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const mes = primerDiaDelPeriodo(periodoActual(new Date(), serverEnv().APP_TIMEZONE));
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("generar_periodo_todos", { p_mes: mes });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, mes, usuarios: data });
}
