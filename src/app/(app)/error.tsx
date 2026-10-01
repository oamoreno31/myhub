"use client";

import { AlertTriangleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ErrorApp({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card className="mx-auto mt-10 max-w-lg items-start">
      <span className="flex size-10 items-center justify-center rounded-xl bg-destructive-soft text-destructive">
        <AlertTriangleIcon className="size-5" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold">Algo salió mal</h1>
        <p className="text-sm text-muted-foreground">
          No se pudo cargar esta pantalla. Si el problema sigue, revisa la conexión con Supabase.
        </p>
        {error.digest ? <p className="text-xs text-muted-foreground">Código: {error.digest}</p> : null}
      </div>
      <Button onClick={reset}>Reintentar</Button>
    </Card>
  );
}
