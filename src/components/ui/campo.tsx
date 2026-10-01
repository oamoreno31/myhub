import type * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

/** Etiqueta + control + ayuda + error, con los atributos ARIA conectados. */
function Campo({
  id,
  etiqueta,
  error,
  ayuda,
  className,
  children,
}: {
  id: string;
  etiqueta: React.ReactNode;
  error?: string;
  ayuda?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{etiqueta}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-semibold text-destructive">
          {error}
        </p>
      ) : ayuda ? (
        <p id={`${id}-ayuda`} className="text-xs text-muted-foreground">
          {ayuda}
        </p>
      ) : null}
    </div>
  );
}

/** Props ARIA para el control dentro de un Campo. */
function ariaCampo(id: string, error?: string) {
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : undefined,
  } as const;
}

function Casilla({ className, children, ...props }: React.ComponentProps<"input"> & { children: React.ReactNode }) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold", className)}>
      <input type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" {...props} />
      <span>{children}</span>
    </label>
  );
}

export { ariaCampo, Campo, Casilla };
