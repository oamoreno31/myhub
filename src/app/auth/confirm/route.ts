import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { rutaSegura } from "@/lib/auth/lista-blanca";
import { createClient } from "@/lib/supabase/server";

/**
 * Destino del enlace mágico. Soporta los dos formatos de Supabase:
 * - `?code=` (flujo PKCE, plantilla de correo por defecto)
 * - `?token_hash=&type=` (plantilla de correo personalizada)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = rutaSegura(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  return NextResponse.redirect(new URL("/login?error=enlace-invalido", origin));
}
