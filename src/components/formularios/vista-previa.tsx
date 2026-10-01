"use client";

import { Loader2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Piezas compartidas de los formularios con vista previa (regla 10 del proyecto):
 * caja de vista previa, línea etiqueta/valor, selector segmentado y botón de guardar.
 */

export function VistaPrevia({ children, tono = "normal" }: { children: ReactNode; tono?: "normal" | "alerta" }) {
  return (
    <div
      aria-live="polite"
      className={cn(
        "flex flex-col gap-1.5 rounded-xl px-4 py-3 text-sm",
        tono === "alerta" ? "bg-warning-soft text-foreground" : "bg-accent text-accent-foreground",
      )}
    >
      {children}
    </div>
  );
}

export function Linea({ etiqueta, valor, fuerte }: { etiqueta: ReactNode; valor: ReactNode; fuerte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0">{etiqueta}</span>
      <span className={cn("text-right whitespace-nowrap", fuerte && "font-bold")}>{valor}</span>
    </div>
  );
}

export function Segmentos<T extends string>({
  opciones,
  valor,
  onCambio,
  etiqueta,
}: {
  opciones: { valor: T; etiqueta: string; detalle?: string }[];
  valor: T;
  onCambio: (v: T) => void;
  etiqueta: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={etiqueta}
      className={cn(
        "grid gap-1 rounded-xl bg-secondary p-1",
        opciones.length === 4 ? "grid-cols-2 sm:grid-cols-4" : opciones.length === 2 ? "grid-cols-2" : "grid-cols-3",
      )}
    >
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onCambio(o.valor)}
            className={cn(
              "flex min-h-10 min-w-0 flex-col items-center justify-center rounded-lg px-1 py-1 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm",
              activo ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            <span className="truncate">{o.etiqueta}</span>
            {o.detalle ? <span className="truncate text-[11px] font-semibold opacity-80">{o.detalle}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function BotonGuardar({
  pendiente,
  children,
  disabled,
}: {
  pendiente: boolean;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Button type="submit" size="lg" disabled={pendiente || disabled}>
      {pendiente ? <Loader2Icon className="animate-spin" /> : null}
      {children}
    </Button>
  );
}
