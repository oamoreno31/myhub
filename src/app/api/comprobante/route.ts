import { NextResponse } from "next/server";
import { BUCKET_COMPROBANTES, rutaValida } from "@/lib/comprobantes";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Abre un comprobante: redirige a una URL firmada de 60 s (el bucket es privado). */
export async function GET(request: Request) {
  const ruta = new URL(request.url).searchParams.get("ruta") ?? "";
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  if (!rutaValida(ruta, userId)) return NextResponse.json({ error: "Comprobante inválido" }, { status: 400 });
  const { data: firmada, error } = await supabase.storage.from(BUCKET_COMPROBANTES).createSignedUrl(ruta, 60);
  if (error || !firmada) return NextResponse.json({ error: "No se encontró el comprobante" }, { status: 404 });
  return NextResponse.redirect(firmada.signedUrl, { status: 302, headers: { "cache-control": "no-store" } });
}
