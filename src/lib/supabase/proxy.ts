import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { correoPermitido } from "@/lib/auth/lista-blanca";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "@/types/database";

/** Rutas accesibles sin sesión. */
const RUTAS_PUBLICAS = ["/login", "/auth/confirm"];

function esPublica(pathname: string) {
  return RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/**
 * Refresca la sesión de Supabase en cada petición y aplica la protección de rutas:
 * - Sin sesión → /login?next=<ruta>
 * - Sesión de un correo fuera de la lista blanca → se cierra y va a /login?error=no-autorizado
 * - Con sesión en /login → /
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // No poner lógica entre createServerClient y getClaims(): puede desloguear al usuario al azar.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const { pathname, search } = request.nextUrl;

  const redirigir = (ruta: string, params?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = ruta;
    url.search = "";
    Object.entries(params ?? {}).forEach(([k, v]) => url.searchParams.set(k, v));
    const destino = NextResponse.redirect(url);
    // Conserva las cookies de sesión que se hayan refrescado.
    response.cookies.getAll().forEach((c) => destino.cookies.set(c));
    return destino;
  };

  if (!claims) {
    if (esPublica(pathname)) return response;
    return redirigir("/login", pathname === "/" ? undefined : { next: `${pathname}${search}` });
  }

  if (!correoPermitido(claims.email as string | undefined, serverEnv().ALLOWED_EMAILS)) {
    await supabase.auth.signOut();
    return redirigir("/login", { error: "no-autorizado" });
  }

  if (pathname === "/login") return redirigir("/");

  return response;
}
