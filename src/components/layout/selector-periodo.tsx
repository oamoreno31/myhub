"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { cambiarPeriodo } from "@/actions/periodo";
import { desplazarPeriodo, nombreCortoPeriodo, nombrePeriodo, type PeriodoId } from "@/lib/domain/periodos";
import { cn } from "@/lib/utils";

export function SelectorPeriodo({ periodo, actual }: { periodo: PeriodoId; actual: PeriodoId }) {
  const [pendiente, startTransition] = useTransition();
  const [optimista, setOptimista] = useOptimistic(periodo);

  const mover = (meses: number) => {
    const destino = desplazarPeriodo(optimista, meses);
    startTransition(async () => {
      setOptimista(destino);
      await cambiarPeriodo(destino);
    });
  };

  const irAlActual = () => {
    startTransition(async () => {
      setOptimista(actual);
      await cambiarPeriodo(actual);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn("flex items-center rounded-xl border bg-card p-1 transition-opacity", pendiente && "opacity-70")}
        aria-busy={pendiente}
      >
        <button
          type="button"
          onClick={() => mover(-1)}
          aria-label="Mes anterior"
          className="flex size-9 items-center justify-center rounded-lg outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeftIcon className="size-5" />
        </button>
        <span className="min-w-24 px-1 text-center text-sm font-bold sm:min-w-36" aria-live="polite">
          <span className="sm:hidden">{nombreCortoPeriodo(optimista)}</span>
          <span className="hidden sm:inline">{nombrePeriodo(optimista)}</span>
        </span>
        <button
          type="button"
          onClick={() => mover(1)}
          aria-label="Mes siguiente"
          className="flex size-9 items-center justify-center rounded-lg outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRightIcon className="size-5" />
        </button>
      </div>
      {optimista !== actual ? (
        <button
          type="button"
          onClick={irAlActual}
          className="hidden h-9 rounded-lg px-2 text-xs font-bold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring sm:block"
        >
          Ir a hoy
        </button>
      ) : null}
    </div>
  );
}
