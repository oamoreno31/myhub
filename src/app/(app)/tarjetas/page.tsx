import type { Metadata } from "next";
import { ListaTarjetas } from "@/components/tarjetas/lista-tarjetas";
import { obtenerCatalogos } from "@/lib/datos";
import { hoyISO } from "@/lib/domain/obligaciones";
import { serverEnv } from "@/lib/env.server";
import { obtenerTarjetas } from "@/lib/tarjetas";

export const metadata: Metadata = { title: "Tarjetas de crédito" };

export default async function TarjetasPage() {
  const [tarjetas, catalogos] = await Promise.all([obtenerTarjetas(), obtenerCatalogos()]);
  return (
    <ListaTarjetas tarjetas={tarjetas} cuentas={catalogos.cuentas} hoy={hoyISO(new Date(), serverEnv().APP_TIMEZONE)} />
  );
}
