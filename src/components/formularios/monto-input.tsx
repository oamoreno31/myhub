"use client";

import { useState } from "react";
import { formatearCOP, parsearMontoCOP } from "@/lib/domain/dinero";
import { cn } from "@/lib/utils";

function formatear(valor: number | null) {
  return valor === null ? "" : formatearCOP(valor).replace("$ ", "");
}

/**
 * Campo de monto en COP: teclado numérico en móvil, formatea con puntos de miles
 * al salir del campo y envía el texto (el servidor lo interpreta con parsearMontoCOP).
 */
export function MontoInput({
  name,
  id,
  defaultValue,
  onValor,
  className,
  grande,
  ...props
}: Omit<React.ComponentProps<"input">, "defaultValue" | "onChange" | "type"> & {
  name: string;
  defaultValue?: number | string | null;
  onValor?: (valor: number | null) => void;
  grande?: boolean;
}) {
  const inicial =
    defaultValue === undefined || defaultValue === null || defaultValue === "" ? null : Number(defaultValue);
  const [texto, setTexto] = useState(formatear(inicial));

  return (
    <div className="relative">
      <span
        className={cn(
          "pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-bold text-muted-foreground",
          grande ? "text-xl" : "text-sm",
        )}
        aria-hidden="true"
      >
        $
      </span>
      <input
        {...props}
        id={id}
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={texto}
        onChange={(e) => {
          const limpio = e.target.value.replace(/[^\d.,]/g, "");
          setTexto(limpio);
          onValor?.(parsearMontoCOP(limpio));
        }}
        onBlur={() => {
          const n = parsearMontoCOP(texto);
          setTexto(formatear(n));
        }}
        className={cn(
          "w-full min-w-0 rounded-lg border border-input bg-card pr-3 font-bold outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 aria-invalid:border-destructive",
          grande ? "h-14 pl-8 text-2xl" : "h-11 pl-7 text-base md:text-sm",
          className,
        )}
      />
    </div>
  );
}
