import { NextResponse } from "next/server";
import { hoyISO } from "@/lib/domain/obligaciones";
import { serverEnv } from "@/lib/env.server";
import { BUCKET_RESPALDOS } from "@/lib/respaldos";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // límite de cuerpo de las funciones de Vercel (~4,5 MB)

async function sesion() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, userId: data?.claims.sub as string | undefined };
}

/**
 * GET: descarga el respaldo completo en JSON.
 * GET ?semanal=AAAA-MM-DD.json: abre un respaldo automático del cron (URL firmada de 60 s).
 */
export async function GET(request: Request) {
  const { supabase, userId } = await sesion();
  if (!userId) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  const semanal = new URL(request.url).searchParams.get("semanal");
  if (semanal) {
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(semanal))
      return NextResponse.json({ error: "Archivo inválido" }, { status: 400 });
    const { data, error } = await supabase.storage
      .from(BUCKET_RESPALDOS)
      .createSignedUrl(`${userId}/${semanal}`, 60, { download: `plata-clara_respaldo_${semanal}` });
    if (error || !data) return NextResponse.json({ error: "No se encontró el respaldo" }, { status: 404 });
    return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "cache-control": "no-store" } });
  }
  const { data, error } = await supabase.rpc("exportar_respaldo");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const hoy = hoyISO(new Date(), serverEnv().APP_TIMEZONE);
  return new NextResponse(JSON.stringify(data, null, 1), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="plata-clara_respaldo_${hoy}.json"`,
      "cache-control": "no-store",
    },
  });
}

/** POST: restaura un respaldo (reemplaza TODOS tus datos). Cuerpo: el JSON del respaldo. */
export async function POST(request: Request) {
  const { supabase, userId } = await sesion();
  if (!userId) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  if (request.headers.get("x-confirmar") !== "reemplazar-todo")
    return NextResponse.json({ error: "Falta la confirmación" }, { status: 400 });
  const texto = await request.text();
  if (texto.length > MAX_BYTES)
    return NextResponse.json(
      { error: "El archivo pesa más de 4 MB; restáuralo desde la base de datos." },
      { status: 413 },
    );
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    return NextResponse.json({ error: "El archivo no es un JSON válido" }, { status: 400 });
  }
  const { data, error } = await supabase.rpc("restaurar_respaldo", { p_datos: datos as never });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, filas: data });
}
