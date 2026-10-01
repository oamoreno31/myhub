import { WifiOffIcon } from "lucide-react";
import type { Metadata } from "next";
import { Logo } from "@/components/marca/logo";
import { BotonReintentar } from "./reintentar";

export const metadata: Metadata = { title: "Sin conexión" };
export const dynamic = "force-static";

/** Se muestra desde el service worker cuando no hay red (no trae datos: nada financiero queda guardado). */
export default function SinConexion() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo className="size-12 text-primary" />
      <WifiOffIcon className="size-8 text-muted-foreground" aria-hidden="true" />
      <h1 className="font-display text-2xl font-semibold">Estás sin conexión</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Plata Clara necesita internet para mostrar tus cifras al día (por seguridad, no guarda tus datos en el
        teléfono). Revisa la conexión e intenta de nuevo.
      </p>
      <BotonReintentar />
    </main>
  );
}
