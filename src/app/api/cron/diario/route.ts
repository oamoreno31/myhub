import { NextResponse } from "next/server";
import { autorizarCron } from "@/lib/cron";
import { periodoActual, primerDiaDelPeriodo } from "@/lib/domain/periodos";
import { serverEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Tarea diaria (Vercel Cron, 07:00 Bogotá).
 * - Mantiene activo el proyecto gratuito de Supabase.
 * - Respaldo del día 1: si el cron mensual falló, genera el mes igualmente (idempotente).
 * Fase 6: correo de recordatorios y respaldo dominical.
 */
export async function GET(request: Request) {
  if (!autorizarCron(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const mes = primerDiaDelPeriodo(periodoActual(new Date(), serverEnv().APP_TIMEZONE));
  const { data, error } = await supabase.rpc("generar_periodo_todos", { p_mes: mes });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, mes, usuarios: data, ejecutado: new Date().toISOString() });
}
