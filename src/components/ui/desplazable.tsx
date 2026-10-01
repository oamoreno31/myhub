import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Contenedor con desplazamiento horizontal para tablas anchas en móvil. Es enfocable y tiene
 * nombre para que también se pueda recorrer con el teclado (WCAG: scrollable-region-focusable).
 */
function Desplazable({
  etiqueta,
  className,
  children,
}: {
  etiqueta: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={etiqueta}
      tabIndex={0}
      className={cn(
        "relative overflow-x-auto rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
    </div>
  );
}

export { Desplazable };
