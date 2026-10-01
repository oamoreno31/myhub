import type { Metadata } from "next";
import { type Pestana, PantallaDeudas } from "@/components/deudas/pantalla-deudas";
import { obtenerCatalogos } from "@/lib/datos";
import { obtenerDeudas, obtenerPrestamos, obtenerReembolsos } from "@/lib/deudas";
import { hoyISO } from "@/lib/domain/obligaciones";
import { serverEnv } from "@/lib/env.server";

export const metadata: Metadata = { title: "Deudas y préstamos" };

const PESTANAS: Pestana[] = ["debo", "me-deben", "devtopia"];
const HOJAS = ["deuda", "prestamo", "abono"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DeudasPage({ searchParams }: PageProps<"/deudas">) {
  const sp = await searchParams;
  const [deudas, prestamos, reembolsos, catalogos] = await Promise.all([
    obtenerDeudas(),
    obtenerPrestamos(),
    obtenerReembolsos(),
    obtenerCatalogos(),
  ]);
  const prestamo = typeof sp.prestamo === "string" && UUID_RE.test(sp.prestamo) ? sp.prestamo : undefined;
  return (
    <PantallaDeudas
      deudas={deudas}
      prestamos={prestamos}
      reembolsos={reembolsos}
      cuentas={catalogos.cuentas}
      hoy={hoyISO(new Date(), serverEnv().APP_TIMEZONE)}
      inicial={{
        pestana: PESTANAS.find((p) => p === sp.tab) ?? (prestamo ? "me-deben" : undefined),
        prestamo,
        hoja: HOJAS.find((h) => h === sp.registrar),
      }}
    />
  );
}
