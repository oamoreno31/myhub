"use client";

import { Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/** Botón de eliminar con confirmación (la acción no se puede deshacer). */
export function BotonConfirmar({
  etiqueta,
  titulo,
  detalle,
  confirmar = "Eliminar",
  icono = <Trash2Icon />,
  onConfirmar,
  disabled,
}: {
  etiqueta: ReactNode;
  titulo: string;
  detalle: string;
  confirmar?: string;
  icono?: ReactNode;
  onConfirmar: () => void;
  disabled?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="text-destructive" disabled={disabled}>
          {icono} {etiqueta}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{titulo}</AlertDialogTitle>
        <AlertDialogDescription>{detalle}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction destructivo onClick={onConfirmar}>
            {confirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
