"use client";

import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Vuelve a pedir la página que se intentó abrir (el service worker mostró este aviso en su lugar). */
export function BotonReintentar() {
  return (
    <Button onClick={() => window.location.reload()}>
      <RefreshCwIcon /> Reintentar
    </Button>
  );
}
