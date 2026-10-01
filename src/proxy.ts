import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Todo excepto: archivos estáticos, imágenes optimizadas, íconos/manifest de la PWA
     * y las rutas de cron (se autentican con CRON_SECRET, no con sesión).
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|api/cron/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
