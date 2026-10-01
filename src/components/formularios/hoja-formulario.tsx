"use client";

import { type ReactNode, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/**
 * Hoja inferior (móvil) / centrada (escritorio) que contiene un formulario.
 * Controlada o no controlada; el contenido recibe `cerrar` para llamarlo al guardar.
 */
export function HojaFormulario({
  trigger,
  titulo,
  descripcion,
  children,
  open,
  onOpenChange,
}: {
  trigger?: ReactNode;
  titulo: string;
  descripcion?: string;
  children: (cerrar: () => void) => ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [abiertaInterna, setAbiertaInterna] = useState(false);
  const abierta = open ?? abiertaInterna;
  const cambiar = onOpenChange ?? setAbiertaInterna;

  return (
    <Sheet open={abierta} onOpenChange={cambiar}>
      {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{titulo}</SheetTitle>
          <SheetDescription className={descripcion ? undefined : "sr-only"}>{descripcion ?? titulo}</SheetDescription>
        </SheetHeader>
        {abierta ? children(() => cambiar(false)) : null}
      </SheetContent>
    </Sheet>
  );
}
