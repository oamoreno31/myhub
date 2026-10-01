import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Todo excepto: archivos estáticos, imágenes optimizadas, íconos/manifest/service worker
     * de la PWA, la página sin conexión y las rutas de cron (se autentican con CRON_SECRET).
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|robots.txt|sw.js|offline|icons/|api/cron/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
