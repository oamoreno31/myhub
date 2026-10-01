"use client";

import { useState } from "react";
import { formatearCOP } from "@/lib/domain/dinero";
import { barraRedondeada, Leyenda, marcasEje, pesosCompactos, type Serie, TablaDatos, Tooltip, useAncho } from "./base";

/**
 * Columnas (apiladas si hay varias series). Una sola serie = sin leyenda (el título la nombra).
 * Hover/teclado por columna: tooltip con todas las series y el total.
 */
export function Columnas({
  etiquetas,
  titulos,
  series,
  alto = 240,
  resaltar,
  etiquetaAria,
  conTabla = true,
}: {
  /** Etiqueta corta de cada columna (eje X). */
  etiquetas: string[];
  /** Título largo de cada columna para el tooltip (por defecto, la etiqueta). */
  titulos?: string[];
  series: Serie[];
  alto?: number;
  /** Índice de la columna a destacar (p. ej. el mes seleccionado). */
  resaltar?: number;
  etiquetaAria: string;
  conTabla?: boolean;
}) {
  const { ref, ancho } = useAncho<HTMLDivElement>();
  const [activa, setActiva] = useState<number | null>(null);

  const totales = etiquetas.map((_, i) => series.reduce((a, s) => a + Math.max(s.valores[i] ?? 0, 0), 0));
  const marcas = marcasEje(0, Math.max(...totales, 1));
  const maxEje = marcas[marcas.length - 1];
  const izq = 52;
  const abajo = 24;
  const arriba = 8;
  const w = Math.max(ancho - izq, 10);
  const h = alto - abajo - arriba;
  const banda = w / Math.max(etiquetas.length, 1);
  const grosor = Math.min(24, banda * 0.62);
  const y = (v: number) => arriba + h - (v / maxEje) * h;
  // En pantallas angostas se muestran etiquetas alternas del eje X.
  const cadaCuanto = banda < 34 ? Math.ceil(34 / banda) : 1;

  return (
    <div className="flex flex-col gap-2">
      <Leyenda series={series} />
      <div ref={ref} className="relative w-full" onPointerLeave={() => setActiva(null)}>
        {ancho > 0 ? (
          <svg width={ancho} height={alto} role="img" aria-label={etiquetaAria} className="block overflow-visible">
            {marcas.map((m) => (
              <g key={m}>
                <line
                  x1={izq}
                  x2={ancho}
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
                  {pesosCompactos(m)}
                </text>
              </g>
            ))}
            {etiquetas.map((e, i) => {
              const cx = izq + banda * i + banda / 2;
              let base = 0;
              const atenuada = activa !== null && activa !== i;
              const segmentos = series.map((s) => ({ s, v: Math.max(s.valores[i] ?? 0, 0) })).filter((x) => x.v > 0);
              return (
                <g key={i} opacity={atenuada ? 0.45 : 1}>
                  {segmentos.map(({ s, v }, k) => {
                    const y0 = y(base);
                    const y1 = y(base + v);
                    base += v;
                    const esUltimo = k === segmentos.length - 1;
                    // 2 px de separación (color de la superficie) entre segmentos apilados.
                    const alturaSeg = Math.max(y0 - y1 - (k > 0 ? 2 : 0), 0);
                    const top = y1;
                    return esUltimo ? (
                      <path key={s.id} d={barraRedondeada(cx - grosor / 2, top, grosor, alturaSeg)} fill={s.color} />
                    ) : (
                      <rect key={s.id} x={cx - grosor / 2} y={top} width={grosor} height={alturaSeg} fill={s.color} />
                    );
                  })}
                  {i % cadaCuanto === 0 || i === resaltar ? (
                    <text
                      x={cx}
                      y={alto - 6}
                      textAnchor="middle"
                      className={
                        i === resaltar ? "fill-foreground text-[11px] font-bold" : "fill-muted-foreground text-[11px]"
                      }
                    >
                      {e}
                    </text>
                  ) : null}
                  {/* Zona de hover/foco más grande que la marca */}
                  <rect
                    x={izq + banda * i}
                    y={arriba}
                    width={banda}
                    height={h}
                    fill="transparent"
                    tabIndex={0}
                    role="button"
                    aria-label={`${titulos?.[i] ?? e}: ${formatearCOP(totales[i])}`}
                    onPointerEnter={() => setActiva(i)}
                    onPointerMove={() => setActiva(i)}
                    onFocus={() => setActiva(i)}
                    onBlur={() => setActiva(null)}
                    className="cursor-default outline-none focus-visible:stroke-ring focus-visible:stroke-2"
                  />
                </g>
              );
            })}
          </svg>
        ) : (
          <div style={{ height: alto }} />
        )}
        {activa !== null && ancho > 0 ? (
          <Tooltip
            x={izq + banda * activa + banda / 2}
            ancho={ancho}
            titulo={titulos?.[activa] ?? etiquetas[activa]}
            filas={[...series]
              .reverse()
              .map((s) => ({ nombre: s.nombre, color: s.color, valor: s.valores[activa] ?? 0 }))
              .filter((f) => series.length === 1 || f.valor !== 0)}
            total={series.length > 1 ? totales[activa] : undefined}
          />
        ) : null}
      </div>
      {conTabla ? <TablaDatos etiquetas={titulos ?? etiquetas} series={series} conTotal={series.length > 1} /> : null}
    </div>
  );
}
