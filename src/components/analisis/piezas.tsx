import type { ReactNode } from "react";
import { formatearCOP } from "@/lib/domain/dinero";
import { cn } from "@/lib/utils";

/** Porcentaje en es-CO: 12,5 %. */
export const pct = (v: number, decimales = 0) =>
  `${(Math.round(v * 10 ** (decimales + 2)) / 10 ** decimales).toLocaleString("es-CO")} %`;

/** Tarjeta de indicador: etiqueta · valor · detalle (delta con símbolo, nunca solo color). */
export function Indicador({
  etiqueta,
  valor,
  detalle,
  tono,
  children,
}: {
  etiqueta: string;
  valor: string;
  detalle?: ReactNode;
  tono?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border bg-card p-4">
      <span className="text-xs font-semibold text-muted-foreground">{etiqueta}</span>
      <span className={cn("text-xl font-bold sm:text-2xl", tono)}>{valor}</span>
      {detalle ? <span className="text-xs text-muted-foreground">{detalle}</span> : null}
      {children}
    </div>
  );
}

/**
 * Variación contra una referencia. En gastos subir es malo (▲ en rojo); en ingresos o ahorro,
 * subir es bueno. Siempre con símbolo y texto.
 */
export function Variacion({
  valor,
  subirEsBueno = false,
  sufijo,
}: {
  valor: number | null;
  subirEsBueno?: boolean;
  sufijo?: string;
}) {
  if (valor === null) return <span className="text-muted-foreground">sin promedio aún</span>;
  if (Math.abs(valor) < 0.005)
    return <span className="text-muted-foreground">= igual{sufijo ? ` ${sufijo}` : ""}</span>;
  const sube = valor > 0;
  const bueno = sube === subirEsBueno;
  return (
    <span className={cn("font-semibold", bueno ? "text-success" : "text-destructive")}>
      {sube ? "▲" : "▼"} {pct(Math.abs(valor))}
      {sufijo ? <span className="font-normal text-muted-foreground"> {sufijo}</span> : null}
    </span>
  );
}

/** Barras horizontales ordenadas (una sola serie, un solo color): magnitud comparable de un vistazo. */
export function BarrasRanking({
  filas,
  total,
  vacio,
}: {
  filas: { id: string; etiqueta: string; valor: number; detalle?: ReactNode }[];
  total: number;
  vacio: string;
}) {
  if (filas.length === 0) return <p className="text-sm text-muted-foreground">{vacio}</p>;
  const max = Math.max(...filas.map((f) => f.valor), 1);
  return (
    <ul className="flex flex-col gap-3">
      {filas.map((f) => (
        <li key={f.id} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-semibold">{f.etiqueta}</span>
            <span className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="text-xs text-muted-foreground tabular-nums">
                {total > 0 ? pct(f.valor / total) : ""}
              </span>
              <strong className="tabular-nums">{formatearCOP(f.valor)}</strong>
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
            <div
              className="h-full rounded-r-[4px] bg-chart-1"
              style={{ width: `${Math.max((f.valor / max) * 100, f.valor > 0 ? 1.5 : 0)}%` }}
            />
          </div>
          {f.detalle ? <span className="text-xs text-muted-foreground">{f.detalle}</span> : null}
        </li>
      ))}
    </ul>
  );
}

const ESTADOS = {
  ok: { clase: "bg-success", texto: "text-success", simbolo: "✓" },
  /** En curso, sin juicio (p. ej. avance de una meta). */
  progreso: { clase: "bg-chart-1", texto: "text-muted-foreground", simbolo: "●" },
  atencion: { clase: "bg-warning", texto: "text-warning", simbolo: "◐" },
  tope: { clase: "bg-success", texto: "text-success", simbolo: "✓" },
  riesgo: { clase: "bg-destructive", texto: "text-destructive", simbolo: "!" },
  excedido: { clase: "bg-destructive", texto: "text-destructive", simbolo: "!" },
} as const;

/** Medidor: la parte llena lleva el estado (✓ ◐ !) y la pista es un tono suave del mismo fondo. */
export function Medidor({
  etiqueta,
  valor,
  meta,
  estado,
  textoEstado,
  detalle,
}: {
  etiqueta: ReactNode;
  /** 0..n (1 = 100 %) */
  valor: number;
  /** Línea de referencia (0..1), p. ej. la meta del 50 %. */
  meta?: number;
  estado: keyof typeof ESTADOS;
  textoEstado: string;
  detalle?: ReactNode;
}) {
  const e = ESTADOS[estado];
  const ancho = Math.min(Math.max(valor, 0), 1) * 100;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-semibold">{etiqueta}</span>
        <span className={cn("text-xs font-semibold whitespace-nowrap", e.texto)}>
          {e.simbolo} {textoEstado}
        </span>
      </div>
      <div
        className="relative h-2.5 rounded-full bg-secondary"
        role="meter"
        aria-valuenow={Math.round(valor * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={typeof etiqueta === "string" ? etiqueta : undefined}
      >
        <div className={cn("h-full rounded-full", e.clase)} style={{ width: `${ancho}%` }} />
        {meta !== undefined ? (
          <span
            className="absolute -top-1 h-4.5 w-0.5 rounded-full bg-foreground/60"
            style={{ left: `calc(${Math.min(meta, 1) * 100}% - 1px)` }}
            aria-hidden="true"
          />
        ) : null}
      </div>
      {detalle ? <span className="text-xs text-muted-foreground">{detalle}</span> : null}
    </div>
  );
}
