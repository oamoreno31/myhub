import "server-only";
import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env.server";

/** Vercel Cron envía `Authorization: Bearer <CRON_SECRET>`. Comparación en tiempo constante. */
export function autorizarCron(request: Request): boolean {
  const { CRON_SECRET } = serverEnv();
  if (!CRON_SECRET) return false;
  const recibido = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${CRON_SECRET}`);
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}
