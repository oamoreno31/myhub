import Link from "next/link";
import { Logo } from "@/components/marca/logo";
import { Button } from "@/components/ui/button";

export default function NoEncontrado() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo className="size-12 text-primary" />
      <h1 className="font-display text-3xl font-semibold">Página no encontrada</h1>
      <p className="text-muted-foreground">La dirección no existe o el periodo no es válido.</p>
      <Button asChild>
        <Link href="/">Volver al inicio</Link>
      </Button>
    </main>
  );
}
