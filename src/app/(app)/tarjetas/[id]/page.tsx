import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DetalleTarjetaPantalla } from "@/components/tarjetas/detalle-tarjeta";
import { obtenerCatalogos } from "@/lib/datos";
import { hoyISO } from "@/lib/domain/obligaciones";
import { serverEnv } from "@/lib/env.server";
import { obtenerDetalleTarjeta } from "@/lib/tarjetas";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PESTANAS = ["resumen", "compras", "cuotas", "extractos", "pagos"] as const;
const HOJAS = ["pago", "extracto", "compra"] as const;

export async function generateMetadata({ params }: PageProps<"/tarjetas/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Tarjeta" };
  const detalle = await obtenerDetalleTarjeta(id);
  return { title: detalle?.tarjeta.nombre ?? "Tarjeta" };
}

export default async function TarjetaPage({ params, searchParams }: PageProps<"/tarjetas/[id]">) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const sp = await searchParams;
  const [detalle, catalogos] = await Promise.all([obtenerDetalleTarjeta(id), obtenerCatalogos()]);
  if (!detalle) notFound();

  // ?pagar=1 (desde el mes) abre el pago; ?registrar=extracto|compra abre ese formulario.
  const hoja = sp.pagar ? "pago" : HOJAS.find((h) => h === sp.registrar);
  const pestana = PESTANAS.find((p) => p === sp.tab);

  return (
    <DetalleTarjetaPantalla
      key={id}
      detalle={detalle}
      cuentas={catalogos.cuentas}
      categorias={catalogos.categorias}
      hoy={hoyISO(new Date(), serverEnv().APP_TIMEZONE)}
      inicial={{ pestana, hoja }}
    />
  );
}
