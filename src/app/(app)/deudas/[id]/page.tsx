import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DetalleDeudaPantalla } from "@/components/deudas/detalle-deuda";
import { obtenerCatalogos } from "@/lib/datos";
import { obtenerDetalleDeuda } from "@/lib/deudas";
import { hoyISO } from "@/lib/domain/obligaciones";
import { serverEnv } from "@/lib/env.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PESTANAS = ["resumen", "proyeccion", "pagos"] as const;

export async function generateMetadata({ params }: PageProps<"/deudas/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Deuda" };
  const detalle = await obtenerDetalleDeuda(id);
  return { title: detalle?.deuda.nombre ?? "Deuda" };
}

export default async function DeudaPage({ params, searchParams }: PageProps<"/deudas/[id]">) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const sp = await searchParams;
  const [detalle, catalogos] = await Promise.all([obtenerDetalleDeuda(id), obtenerCatalogos()]);
  if (!detalle) notFound();
  // ?pagar=1&ob=<obligación del mes> llega desde el checklist de Mes.
  const ob = typeof sp.ob === "string" && detalle.cuotasPendientes.some((c) => c.id === sp.ob) ? sp.ob : undefined;

  return (
    <DetalleDeudaPantalla
      key={id}
      detalle={detalle}
      cuentas={catalogos.cuentas}
      hoy={hoyISO(new Date(), serverEnv().APP_TIMEZONE)}
      inicial={{ pestana: PESTANAS.find((p) => p === sp.tab), pagar: Boolean(sp.pagar), obligacion: ob }}
    />
  );
}
