import { NextResponse } from "next/server";
import { autorizarCron } from "@/lib/cron";
import { enviarCorreo } from "@/lib/correo";
import { hoyISO } from "@/lib/domain/obligaciones";
import { periodoActual, primerDiaDelPeriodo } from "@/lib/domain/periodos";
import { armarCorreoRecordatorio, esDomingo, type ObligacionRecordatorio } from "@/lib/domain/recordatorios";
import { serverEnv } from "@/lib/env.server";
import { respaldarUsuario } from "@/lib/respaldos";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Paso = { ok: boolean; [k: string]: unknown };

/**
 * Tarea diaria (Vercel Cron, 07:00 Bogotá). Cada paso es independiente: si uno falla, los
 * demás siguen y el resultado lo reporta.
 * 1. Mantiene activo el proyecto gratuito de Supabase y asegura el mes en curso (idempotente).
 * 2. Correo de recordatorios: vencidas y lo que vence en ≤ 3 días (si hay RESEND_API_KEY).
 * 3. Domingos: respaldo JSON de cada usuario en Storage (retención 8 semanas).
 *    `?respaldo=1` lo fuerza cualquier día (para probar).
 */
export async function GET(request: Request) {
  if (!autorizarCron(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const env = serverEnv();
  const admin = createAdminClient();
  const hoy = hoyISO(new Date(), env.APP_TIMEZONE);
  const url = new URL(request.url);
  const resultado: Record<string, Paso> = {};

  // 1. Mes en curso
  const mes = primerDiaDelPeriodo(periodoActual(new Date(), env.APP_TIMEZONE));
  {
    const { data, error } = await admin.rpc("generar_periodo_todos", { p_mes: mes });
    resultado.mes = error ? { ok: false, error: error.message } : { ok: true, mes, usuarios: data };
  }

  // 2. Recordatorios
  try {
    const { data, error } = await admin.rpc("recordatorios_hoy", { p_hoy: hoy });
    if (error) throw new Error(error.message);
    const envios: { para: string; obligaciones: number; resultado: string }[] = [];
    for (const fila of data ?? []) {
      const correo = armarCorreoRecordatorio({
        obligaciones: (fila.obligaciones as ObligacionRecordatorio[]).map((o) => ({
          ...o,
          pendiente: Number(o.pendiente),
          esperado: Number(o.esperado),
        })),
        hoy,
        urlApp: env.APP_URL ?? null,
      });
      if (!correo) continue;
      const r = await enviarCorreo({ para: fila.email, asunto: correo.asunto, html: correo.html, texto: correo.texto });
      envios.push({
        para: fila.email.replace(/^(.).*(@.*)$/, "$1…$2"),
        obligaciones: (fila.obligaciones as unknown[]).length,
        resultado: r.ok ? "enviado" : r.error,
      });
    }
    resultado.recordatorios = { ok: true, correo: Boolean(env.RESEND_API_KEY), envios };
  } catch (e) {
    resultado.recordatorios = { ok: false, error: (e as Error).message };
  }

  // 3. Respaldo dominical
  if (esDomingo(hoy) || url.searchParams.get("respaldo") === "1") {
    try {
      const { data: usuarios, error } = await admin.from("parametros").select("user_id");
      if (error) throw new Error(error.message);
      const hechos = [];
      for (const u of usuarios ?? []) hechos.push(await respaldarUsuario(admin, u.user_id, hoy));
      resultado.respaldo = { ok: true, archivos: hechos.length, bytes: hechos.reduce((a, h) => a + h.bytes, 0) };
    } catch (e) {
      resultado.respaldo = { ok: false, error: (e as Error).message };
    }
  }

  const ok = Object.values(resultado).every((p) => p.ok);
  return NextResponse.json({ ok, hoy, ...resultado, ejecutado: new Date().toISOString() }, { status: ok ? 200 : 500 });
}
