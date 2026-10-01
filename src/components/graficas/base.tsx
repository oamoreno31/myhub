"use client";

import { Desplazable } from "@/components/ui/desplazable";
import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { formatearCOP } from "@/lib/domain/dinero";
import { cn } from "@/lib/utils";

/**
 * Piezas comunes de las gráficas (SVG propio, sin librerías):
 * - Colores por rol desde los tokens de globals.css (--chart-1..8, --chart-otras, grid y eje).
 * - Marcas delgadas, extremos redondeados de 4 px, separación de 2 px, líneas de 2 px.
 * - Tooltip al pasar el mouse o con el teclado; leyenda para 2+ series; tabla opcional.
 */

// Los colores viven en un módulo sin "use client" para poder usarlos desde Server Components.
export { COLOR_OTRAS, COLORES_SERIE } from "./colores";

/** Ancho real del contenedor (las gráficas se dibujan a su tamaño en píxeles). */
export function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.floor(e.contentRect.width)));
    ro.observe(el);
    setAncho(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return { ref, ancho };
}

const compacto = new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 });

/** "$ 1,5 M" para ejes. */
export function pesosCompactos(v: number) {
  if (v === 0) return "$ 0";
  return `${v < 0 ? "−" : ""}$ ${compacto.format(Math.abs(v))}`;
}

export type Unidad = "pesos" | "puntos";

/** Valor completo según la unidad: "$ 1.250.000" o "76". */
export function formatearValor(v: number, unidad: Unidad = "pesos") {
  return unidad === "pesos" ? formatearCOP(v) : Math.round(v).toLocaleString("es-CO");
}

/** Valor corto para ejes y etiquetas. */
export function valorCompacto(v: number, unidad: Unidad = "pesos") {
  return unidad === "pesos" ? pesosCompactos(v) : Math.round(v).toLocaleString("es-CO");
}

/** Marcas limpias del eje (0 / 500 k / 1 M …) que cubren [min, max]. */
export function marcasEje(min: number, max: number, cuantas = 4, desdeCero = true): number[] {
  let lo = desdeCero ? Math.min(0, min) : min;
  let hi = desdeCero ? Math.max(0, max) : max;
  if (!desdeCero && hi - lo < Math.abs(hi) * 0.02) {
    // Serie casi plana: un margen para que no quede pegada al borde.
    const margen = Math.max(Math.abs(hi) * 0.05, 1);
    lo -= margen;
    hi += margen;
  }
  if (hi === lo) return [0];
  const bruto = (hi - lo) / cuantas;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto) ?? 10 * mag;
  const inicio = Math.floor(lo / paso) * paso;
  const fin = Math.ceil(hi / paso) * paso;
  const marcas: number[] = [];
  for (let v = inicio; v <= fin + paso / 1000; v += paso) marcas.push(Math.round(v * 100) / 100);
  return marcas;
}

/** Rectángulo con las esquinas de arriba redondeadas (el extremo de datos); base recta. */
export function barraRedondeada(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0 || w <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

export type Serie = { id: string; nombre: string; color: string; valores: number[] };

export function Leyenda({
  series,
  forma = "barra",
}: {
  series: Pick<Serie, "id" | "nombre" | "color">[];
  forma?: "barra" | "linea";
}) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Leyenda">
      {series.map((s) => (
        <li key={s.id} className="flex items-center gap-1.5">
          {forma === "barra" ? (
            <span className="inline-block size-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden="true" />
          ) : (
            <span
              className="inline-block h-0.5 w-3.5 rounded-full"
              style={{ background: s.color }}
              aria-hidden="true"
            />
          )}
          {s.nombre}
        </li>
      ))}
    </ul>
  );
}

/**
 * Capa interactiva sobre el área de datos (fuera del SVG, que queda como imagen): un "slider"
 * accesible que recorre los meses con el puntero o con las flechas / Inicio / Fin. Un solo punto
 * de tabulación por gráfica, con el valor del mes activo leído por el lector de pantalla.
 */
export function ZonaInteractiva({
  izq,
  arriba,
  ancho,
  alto,
  n,
  activo,
  setActivo,
  indiceEn,
  etiqueta,
  textoValor,
}: {
  izq: number;
  arriba: number;
  ancho: number;
  alto: number;
  n: number;
  activo: number | null;
  setActivo: (i: number | null) => void;
  /** Índice bajo el puntero, dada la posición x dentro de la zona y su ancho. */
  indiceEn: (x: number, ancho: number) => number;
  etiqueta: string;
  textoValor: (i: number) => string;
}) {
  const actual = activo ?? n - 1;
  const ir = (i: number) => setActivo(Math.min(Math.max(i, 0), n - 1));
  const mover = (e: PointerEvent<HTMLDivElement>) => {
    const caja = e.currentTarget.getBoundingClientRect();
    ir(indiceEn(e.clientX - caja.left, caja.width));
  };
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={`${etiqueta}. Usa las flechas para recorrer los meses.`}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={Math.max(n - 1, 0)}
      aria-valuenow={actual}
      aria-valuetext={n > 0 ? textoValor(actual) : ""}
      className="absolute cursor-crosshair rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ left: izq, top: arriba, width: ancho, height: alto }}
      onPointerMove={mover}
      onPointerDown={mover}
      onFocus={() => setActivo(actual)}
      onBlur={() => setActivo(null)}
      onKeyDown={(e) => {
        const teclas: Record<string, number> = {
          ArrowLeft: actual - 1,
          ArrowDown: actual - 1,
          ArrowRight: actual + 1,
          ArrowUp: actual + 1,
          Home: 0,
          End: n - 1,
        };
        if (e.key in teclas) {
          e.preventDefault();
          ir(teclas[e.key]);
        }
      }}
    />
  );
}

/** Tooltip: el valor es lo fuerte; la serie va con una línea corta de su color. */
export function Tooltip({
  x,
  ancho,
  titulo,
  filas,
  total,
  unidad = "pesos",
}: {
  x: number;
  ancho: number;
  titulo: string;
  filas: { nombre: string; color: string; valor: number }[];
  total?: number;
  unidad?: Unidad;
}) {
  const w = 208;
  const izquierda = Math.min(Math.max(x - w / 2, 0), Math.max(ancho - w, 0));
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-0 z-10 rounded-xl border bg-popover px-3 py-2 text-xs shadow-lg"
      style={{ left: izquierda, width: w }}
    >
      <div className="pb-1 font-bold">{titulo}</div>
      <ul className="flex flex-col gap-0.5">
        {filas.map((f) => (
          <li key={f.nombre} className="flex items-center gap-2">
            <span
              className="inline-block h-0.5 w-3 shrink-0 rounded-full"
              style={{ background: f.color }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{f.nombre}</span>
            <strong className="tabular-nums">{formatearValor(f.valor, unidad)}</strong>
          </li>
        ))}
      </ul>
      {total !== undefined ? (
        <div className="mt-1 flex justify-between border-t pt-1">
          <span className="text-muted-foreground">Total</span>
          <strong className="tabular-nums">{formatearValor(total, unidad)}</strong>
        </div>
      ) : null}
    </div>
  );
}

/** Tabla con los mismos datos de la gráfica (los valores nunca dependen solo del hover). */
export function TablaDatos({
  etiquetas,
  series,
  conTotal,
  unidad = "pesos",
}: {
  etiquetas: string[];
  series: Pick<Serie, "id" | "nombre" | "valores">[];
  conTotal?: boolean;
  unidad?: Unidad;
}) {
  return (
    <details className="group text-sm">
      <summary className="cursor-pointer text-xs font-semibold text-primary hover:underline">Ver tabla</summary>
      <Desplazable etiqueta="Datos de la gráfica" className="mt-2">
        <table className="w-full min-w-[28rem] text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-2 font-semibold">Mes</th>
              {series.map((s) => (
                <th key={s.id} className="py-1 pr-2 text-right font-semibold">
                  {s.nombre}
                </th>
              ))}
              {conTotal ? <th className="py-1 text-right font-semibold">Total</th> : null}
            </tr>
          </thead>
          <tbody>
            {etiquetas.map((e, i) => (
              <tr key={i} className="border-t">
                <td className="py-1 pr-2">{e}</td>
                {series.map((s) => (
                  <td key={s.id} className="py-1 pr-2 text-right tabular-nums">
                    {formatearValor(s.valores[i] ?? 0, unidad)}
                  </td>
                ))}
                {conTotal ? (
                  <td className="py-1 text-right font-semibold tabular-nums">
                    {formatearValor(
                      series.reduce((a, s) => a + (s.valores[i] ?? 0), 0),
                      unidad,
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </Desplazable>
    </details>
  );
}

export function MarcoGrafica({
  titulo,
  descripcion,
  acciones,
  children,
  className,
}: {
  titulo: string;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="font-bold">{titulo}</h2>
          {descripcion ? <p className="text-xs text-muted-foreground">{descripcion}</p> : null}
        </div>
        {acciones}
      </div>
      {children}
    </section>
  );
}
