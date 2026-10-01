"use client";

import { type PointerEvent, useState } from "react";
import {
  formatearValor,
  Leyenda,
  marcasEje,
  type Serie,
  TablaDatos,
  Tooltip,
  type Unidad,
  useAncho,
  valorCompacto,
} from "./base";

/**
 * Líneas sobre un mismo eje (misma unidad; nunca doble eje). La línea vertical sigue al puntero
 * y se ajusta al mes más cercano; el tooltip muestra todas las series de ese mes.
 * Valor al final de cada línea (se omite si choca con otro).
 */
export function Lineas({
  etiquetas,
  titulos,
  series,
  alto = 240,
  etiquetaAria,
  conTabla = true,
  area = false,
  desdeCero = true,
  unidad = "pesos",
  maximo,
}: {
  etiquetas: string[];
  titulos?: string[];
  series: Serie[];
  alto?: number;
  etiquetaAria: string;
  conTabla?: boolean;
  /** Relleno suave bajo la línea (solo con una serie). */
  area?: boolean;
  /**
   * Eje desde cero (por defecto). En una sola línea de un saldo grande (p. ej. el patrimonio) se
   * puede ajustar al rango de los datos para ver el cambio; es una línea, no barras, así que no engaña.
   */
  desdeCero?: boolean;
  unidad?: Unidad;
  /** Tope fijo del eje (p. ej. 100 para un score). */
  maximo?: number;
}) {
  const { ref, ancho } = useAncho<HTMLDivElement>();
  const [activo, setActivo] = useState<number | null>(null);
  const valores = series.flatMap((s) => s.valores);
  const marcas = desdeCero
    ? marcasEje(Math.min(...valores, 0), maximo ?? Math.max(...valores, 1))
    : marcasEje(Math.min(...valores), Math.max(...valores), 4, false);
  const minEje = marcas[0];
  const maxEje = marcas[marcas.length - 1];
  const izq = 52;
  const der = 64;
  const abajo = 24;
  const arriba = 12;
  const w = Math.max(ancho - izq - der, 10);
  const h = alto - abajo - arriba;
  const n = etiquetas.length;
  const x = (i: number) => izq + (n <= 1 ? w / 2 : (w * i) / (n - 1));
  const y = (v: number) => arriba + h - ((v - minEje) / (maxEje - minEje || 1)) * h;
  const cadaCuanto = n > 1 && w / (n - 1) < 34 ? Math.ceil(34 / (w / (n - 1))) : 1;

  const mover = (e: PointerEvent<SVGRectElement>) => {
    const caja = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - caja.left;
    const i = n <= 1 ? 0 : Math.round((px / caja.width) * (n - 1));
    setActivo(Math.min(Math.max(i, 0), n - 1));
  };

  // Etiquetas al final: se ordenan por altura y se descarta la que queda a < 14 px de otra.
  const finales = series
    .map((s) => ({ s, v: s.valores[n - 1] ?? 0 }))
    .map((f) => ({ ...f, py: y(f.v) }))
    .sort((a, b) => a.py - b.py)
    .filter((f, i, arr) => i === 0 || f.py - arr[i - 1].py >= 14);

  return (
    <div className="flex flex-col gap-2">
      <Leyenda series={series} forma="linea" />
      <div ref={ref} className="relative w-full" onPointerLeave={() => setActivo(null)}>
        {ancho > 0 ? (
          <svg width={ancho} height={alto} role="img" aria-label={etiquetaAria} className="block overflow-visible">
            {marcas.map((m) => (
              <g key={m}>
                <line
                  x1={izq}
                  x2={izq + w}
                  y1={y(m)}
                  y2={y(m)}
                  stroke={m === 0 ? "var(--chart-eje)" : "var(--chart-grid)"}
                  strokeWidth={1}
                />
                <text
                  x={izq - 8}
                  y={y(m)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-muted-foreground text-[11px] tabular-nums"
                >
                  {valorCompacto(m, unidad)}
                </text>
              </g>
            ))}
            {etiquetas.map((e, i) =>
              // La última etiqueta siempre va; la regular anterior se omite si quedaría encima.
              (i % cadaCuanto === 0 && (i === n - 1 || n - 1 - i >= cadaCuanto)) || i === n - 1 ? (
                <text key={i} x={x(i)} y={alto - 6} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                  {e}
                </text>
              ) : null,
            )}
            {area && series.length === 1 && n > 1 ? (
              <path
                d={`M${x(0)},${y(Math.max(minEje, 0))} ${series[0].valores.map((v, i) => `L${x(i)},${y(v)}`).join(" ")} L${x(n - 1)},${y(Math.max(minEje, 0))} Z`}
                fill={series[0].color}
                opacity={0.1}
              />
            ) : null}
            {series.map((s) => (
              <path
                key={s.id}
                d={s.valores.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {n === 1
              ? series.map((s) => (
                  <circle
                    key={s.id}
                    cx={x(0)}
                    cy={y(s.valores[0] ?? 0)}
                    r={4}
                    fill={s.color}
                    stroke="var(--card)"
                    strokeWidth={2}
                  />
                ))
              : null}
            {finales.map((f) => (
              <g key={f.s.id}>
                <circle cx={x(n - 1)} cy={f.py} r={4} fill={f.s.color} stroke="var(--card)" strokeWidth={2} />
                <text
                  x={x(n - 1) + 8}
                  y={f.py}
                  dy="0.32em"
                  className="fill-foreground text-[11px] font-semibold tabular-nums"
                >
                  {valorCompacto(f.v, unidad)}
                </text>
              </g>
            ))}
            {activo !== null ? (
              <g>
                <line
                  x1={x(activo)}
                  x2={x(activo)}
                  y1={arriba}
                  y2={arriba + h}
                  stroke="var(--chart-eje)"
                  strokeWidth={1}
                />
                {series.map((s) => (
                  <circle
                    key={s.id}
                    cx={x(activo)}
                    cy={y(s.valores[activo] ?? 0)}
                    r={4}
                    fill={s.color}
                    stroke="var(--card)"
                    strokeWidth={2}
                  />
                ))}
              </g>
            ) : null}
            <rect
              x={izq}
              y={arriba}
              width={w}
              height={h}
              fill="transparent"
              tabIndex={0}
              aria-label={`${etiquetaAria}. Usa las flechas para recorrer los meses.`}
              onPointerMove={mover}
              onPointerDown={mover}
              onFocus={() => setActivo((a) => a ?? n - 1)}
              onBlur={() => setActivo(null)}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") setActivo((a) => Math.max((a ?? n - 1) - 1, 0));
                if (e.key === "ArrowRight") setActivo((a) => Math.min((a ?? 0) + 1, n - 1));
              }}
              className="cursor-crosshair outline-none focus-visible:stroke-ring focus-visible:stroke-2"
            />
          </svg>
        ) : (
          <div style={{ height: alto }} />
        )}
        {activo !== null && ancho > 0 ? (
          <Tooltip
            x={x(activo)}
            ancho={ancho}
            titulo={titulos?.[activo] ?? etiquetas[activo]}
            filas={series.map((s) => ({ nombre: s.nombre, color: s.color, valor: s.valores[activo] ?? 0 }))}
            unidad={unidad}
          />
        ) : null}
      </div>
      {conTabla ? <TablaDatos etiquetas={titulos ?? etiquetas} series={series} unidad={unidad} /> : null}
      <span className="sr-only">
        {series.map((s) => `${s.nombre}: último valor ${formatearValor(s.valores[n - 1] ?? 0, unidad)}`).join(". ")}
      </span>
    </div>
  );
}
