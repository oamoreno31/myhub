import "server-only";
import { serverEnv } from "@/lib/env.server";

export type ResultadoCorreo = { ok: true; id: string } | { ok: false; error: string };

/** Envía un correo con la API HTTP de Resend (sin SDK). Requiere RESEND_API_KEY. */
export async function enviarCorreo(p: {
  para: string;
  asunto: string;
  html: string;
  texto: string;
}): Promise<ResultadoCorreo> {
  const { RESEND_API_KEY, RESEND_API_URL, EMAIL_FROM } = serverEnv();
  if (!RESEND_API_KEY) return { ok: false, error: "Correo desactivado (falta RESEND_API_KEY)" };
  try {
    const res = await fetch(`${RESEND_API_URL.replace(/\/$/, "")}/emails`, {
      method: "POST",
      headers: { authorization: `Bearer ${RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [p.para], subject: p.asunto, html: p.html, text: p.texto }),
      signal: AbortSignal.timeout(10_000),
    });
    const cuerpo = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { ok: false, error: cuerpo.message ?? `HTTP ${res.status}` };
    return { ok: true, id: cuerpo.id ?? "" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
