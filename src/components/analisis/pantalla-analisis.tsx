"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { COLOR_OTRAS, COLORES_SERIE, MarcoGrafica } from "@/components/graficas/base";
import { Columnas } from "@/components/graficas/columnas";
import { Lineas } from "@/components/graficas/lineas";
import { Segmentos } from "@/components/formularios/vista-previa";
import type { ComercioMes, FilaCaja, ResumenMes } from "@/lib/analisis";
import {
  compararConPromedio,
  etiquetaEjeMes,
  type FilaConsumo,
  fijoVariable,
  filtrarConsumo,
  METAS_BOLSA,
  reparto503020,
  serieApilada,
  totalesPorCategoria,
  totalPorPeriodo,
  variacion,
} from "@/lib/domain/analisis";
import { formatearCOP } from "@/lib/domain/dinero";
import { nombrePeriodo, nombreCortoPeriodo } from "@/lib/domain/periodos";
import { cn } from "@/lib/utils";
import { BarrasRanking, Indicador, Medidor, pct, Variacion } from "./piezas";

export type Vista = "consumo" | "caja";

/** Las filas de caja se leen como "categorías" para reutilizar los mismos cálculos. */
function cajaComoConsumo(filas: FilaCaja[]): FilaConsumo[] {
  return filas.map((f) => ({
    periodo: f.periodo,
    categoria_id: f.categoria_id ?? f.concepto,
    categoria_nombre: f.concepto,
    padre_id: null,
    padre_nombre: null,
    bolsa: "no_aplica",
    es_fija: false,
    origen: f.tipo,
    reembolsable: f.reembolsable,
    total: f.total,
  }));
}

export function PantallaAnalisis({
  periodo,
  periodos,
  consumo,
  caja,
  resumenes,
  comercios,
  inicial,
}: {
  periodo: string;
  /** Ventana de 12 meses que termina en `periodo`. */
  periodos: string[];
  consumo: FilaConsumo[];
  caja: FilaCaja[];
  resumenes: ResumenMes[];
  comercios: ComercioMes[];
  inicial: { vista: Vista; sinReembolsables: boolean };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [vista, setVista] = useState<Vista>(inicial.vista);
  const [sinReembolsables, setSinReembolsables] = useState(inicial.sinReembolsables);

  const actualizarUrl = (v: Vista, sin: boolean) => {
    const p = new URLSearchParams();
    if (v === "caja") p.set("vista", "caja");
    if (sin) p.set("reembolsables", "excluir");
    router.replace(`${pathname}${p.size ? `?${p}` : ""}`, { scroll: false });
  };

  const filas = useMemo(
    () =>
      filtrarConsumo(vista === "consumo" ? consumo : cajaComoConsumo(caja), { excluirReembolsables: sinReembolsables }),
    [vista, consumo, caja, sinReembolsables],
  );
  const resumenPorPeriodo = new Map(resumenes.map((r) => [r.periodo, r]));
  const ingresos = periodos.map((p) => resumenPorPeriodo.get(p)?.ingresos ?? 0);
  const gastosSerie = totalPorPeriodo(filas, periodos);
  const i = periodos.length - 1;
  const gastoMes = gastosSerie[i];
  const previos = gastosSerie.slice(Math.max(i - 3, 0), i);
  const promedio = previos.length ? previos.reduce((a, v) => a + v, 0) / 3 : 0;
  const ingresoMes = ingresos[i];
  const ahorroMes = ingresoMes - gastoMes;
  const fv = fijoVariable(filas, periodo);
  const categorias = totalesPorCategoria(filas, periodo);
  const comparacion = compararConPromedio(filas, periodo);
  const porId = new Map(comparacion.map((c) => [c.id, c]));
  const apiladas = serieApilada(filas, periodos, 5).map((s, k) => ({
    ...s,
    color: s.id === "otras" ? COLOR_OTRAS : COLORES_SERIE[k],
  }));
  const reparto = reparto503020(filas, periodo, ingresoMes);
  const tops = comercios
    .filter((c) => !(sinReembolsables && c.reembolsable))
    .reduce<Map<string, ComercioMes>>((m, c) => {
      const prev = m.get(c.clave);
      m.set(c.clave, prev ? { ...prev, total: prev.total + c.total, n: prev.n + c.n } : { ...c });
      return m;
    }, new Map());
  const topComercios = [...tops.values()].sort((a, b) => b.total - a.total).slice(0, 10);
  const nombreGasto = vista === "consumo" ? "Gasto" : "Salidas de caja";
  const hayDatos = gastosSerie.some((v) => v !== 0) || ingresos.some((v) => v !== 0);
  // Las gráficas empiezan en el primer mes con datos (sin una rampa falsa desde cero), con 2 meses mínimo.
  const primero = periodos.findIndex((_, k) => gastosSerie[k] !== 0 || ingresos[k] !== 0);
  const desde = Math.max(0, Math.min(primero < 0 ? i : primero, i - 1));
  const recorte = <T,>(xs: T[]) => xs.slice(desde);
  const etiquetas = recorte(periodos.map(etiquetaEjeMes));
  const titulos = recorte(periodos.map(nombreCortoPeriodo));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-semibold">Análisis</h1>
        <p className="text-sm text-muted-foreground">
          {nombrePeriodo(periodo)} y los 11 meses anteriores.{" "}
          {vista === "consumo"
            ? "Consumo: lo que gastaste, incluidas las compras con tarjeta e intereses, en el mes en que ocurrió."
            : "Caja: la plata que salió de tus cuentas (pagos de tarjeta completos, cuotas de préstamos, aportes)."}
        </p>
      </div>

      {/* Filtros: una sola fila, afectan todo lo de abajo */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:w-72">
          <Segmentos
            etiqueta="Vista"
            opciones={[
              { valor: "consumo", etiqueta: "Consumo" },
              { valor: "caja", etiqueta: "Caja" },
            ]}
            valor={vista}
            onCambio={(v) => {
              setVista(v);
              actualizarUrl(v, sinReembolsables);
            }}
          />
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-5 accent-[var(--primary)]"
            checked={!sinReembolsables}
            onChange={(e) => {
              setSinReembolsables(!e.target.checked);
              actualizarUrl(vista, !e.target.checked);
            }}
          />
          Incluir gastos reembolsables por Devtopia
        </label>
      </div>

      {!hayDatos ? (
        <section className="flex flex-col items-center gap-2 rounded-2xl border bg-card px-5 py-10 text-center">
          <span className="font-bold">Aún no hay datos para analizar</span>
          <span className="max-w-md text-sm text-muted-foreground">
            Registra tus gastos, ingresos y compras con tarjeta; con uno o dos meses de datos aquí verás en qué se va la
            plata y cómo cambia mes a mes.
          </span>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador
              etiqueta={`${nombreGasto} del mes`}
              valor={formatearCOP(gastoMes)}
              detalle={<Variacion valor={variacion(gastoMes, promedio)} sufijo="vs promedio de 3 meses" />}
            />
            <Indicador
              etiqueta="Ingresos del mes"
              valor={formatearCOP(ingresoMes)}
              tono="text-success"
              detalle="Sin recuperaciones ni reembolsos"
            />
            <Indicador
              etiqueta={vista === "consumo" ? "Ahorro del mes" : "Te quedó en caja"}
              valor={formatearCOP(ahorroMes)}
              tono={ahorroMes < 0 ? "text-destructive" : undefined}
              detalle={ingresoMes > 0 ? `${pct(ahorroMes / ingresoMes)} del ingreso` : "Sin ingresos este mes"}
            />
            <Indicador
              etiqueta="Fijo · variable"
              valor={gastoMes > 0 ? pct(fv.fijo / gastoMes) : "—"}
              detalle={`${formatearCOP(fv.fijo)} fijo · ${formatearCOP(fv.variable)} variable`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MarcoGrafica
              titulo={vista === "consumo" ? "¿En qué se va la plata?" : "¿A dónde salió la plata?"}
              descripcion={`${nombrePeriodo(periodo)} · ${formatearCOP(gastoMes)}`}
            >
              <BarrasRanking
                total={gastoMes}
                vacio="Sin gastos este mes."
                filas={categorias.slice(0, 10).map((c) => {
                  const cmp = porId.get(c.id);
                  return {
                    id: c.id,
                    etiqueta: c.etiqueta,
                    valor: c.total,
                    detalle:
                      cmp && cmp.promedio > 0 ? (
                        <>
                          <Variacion valor={cmp.variacion} /> · promedio {formatearCOP(cmp.promedio)}
                        </>
                      ) : undefined,
                  };
                })}
              />
              {categorias.length > 10 ? (
                <p className="text-xs text-muted-foreground">
                  + {categorias.length - 10} categorías más por{" "}
                  {formatearCOP(categorias.slice(10).reduce((a, c) => a + c.total, 0))}
                </p>
              ) : null}
            </MarcoGrafica>

            <MarcoGrafica
              titulo="Mes a mes"
              descripcion={`${nombreGasto} por categoría (las 5 más grandes del año y el resto en "Otras")`}
            >
              <Columnas
                etiquetas={etiquetas}
                titulos={titulos}
                series={apiladas.map((x) => ({ ...x, valores: recorte(x.valores) }))}
                resaltar={i - desde}
                etiquetaAria={`${nombreGasto} por categoría en los últimos 12 meses`}
              />
            </MarcoGrafica>
          </div>

          <MarcoGrafica
            titulo={`Ingresos vs ${nombreGasto.toLowerCase()}`}
            descripcion="Mismo eje en pesos. La distancia entre las líneas es lo que ahorras (o te falta) cada mes."
          >
            <Lineas
              etiquetas={etiquetas}
              titulos={titulos}
              series={[
                { id: "ingresos", nombre: "Ingresos", color: COLORES_SERIE[0], valores: recorte(ingresos) },
                { id: "gastos", nombre: nombreGasto, color: COLORES_SERIE[1], valores: recorte(gastosSerie) },
              ]}
              etiquetaAria={`Ingresos y ${nombreGasto.toLowerCase()} de los últimos 12 meses`}
            />
          </MarcoGrafica>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MarcoGrafica
              titulo="Este mes vs tu promedio"
              descripcion="Contra el promedio de los 3 meses anteriores. Ordenado por la diferencia más grande."
            >
              {comparacion.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin datos para comparar.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[22rem] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-2 font-semibold">Categoría</th>
                        <th className="py-2 pr-2 text-right font-semibold">Este mes</th>
                        <th className="py-2 pr-2 text-right font-semibold">Promedio</th>
                        <th className="py-2 text-right font-semibold">Cambio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparacion.slice(0, 10).map((c) => (
                        <tr key={c.id} className="border-t">
                          <td className="max-w-[12rem] truncate py-2 pr-2">{c.nombre}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{formatearCOP(c.actual)}</td>
                          <td className="py-2 pr-2 text-right text-muted-foreground tabular-nums">
                            {formatearCOP(c.promedio)}
                          </td>
                          <td className="py-2 text-right text-xs whitespace-nowrap">
                            {c.variacion === null ? (
                              <span className="text-muted-foreground">nuevo</span>
                            ) : (
                              <Variacion valor={c.variacion} />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </MarcoGrafica>

            {vista === "consumo" ? (
              <MarcoGrafica
                titulo="Regla 50/30/20"
                descripcion={
                  ingresoMes > 0
                    ? `Sobre tus ingresos de ${formatearCOP(ingresoMes)}. La marca vertical es la meta.`
                    : "Registra tus ingresos del mes para ver el reparto."
                }
              >
                <div className="flex flex-col gap-4">
                  <Medidor
                    etiqueta="Necesidades (meta ≤ 50 %)"
                    valor={reparto.necesidad.pct ?? 0}
                    meta={METAS_BOLSA.necesidad}
                    estado={reparto.necesidad.estado}
                    textoEstado={reparto.necesidad.pct === null ? "—" : pct(reparto.necesidad.pct)}
                    detalle={`${formatearCOP(reparto.necesidad.total)} · arriendo, servicios, mercado, transporte, salud, intereses…`}
                  />
                  <Medidor
                    etiqueta="Deseos (meta ≤ 30 %)"
                    valor={reparto.deseo.pct ?? 0}
                    meta={METAS_BOLSA.deseo}
                    estado={reparto.deseo.estado}
                    textoEstado={reparto.deseo.pct === null ? "—" : pct(reparto.deseo.pct)}
                    detalle={`${formatearCOP(reparto.deseo.total)} · restaurantes, ocio, ropa, viajes, regalos…`}
                  />
                  <Medidor
                    etiqueta="Ahorro (meta ≥ 20 %)"
                    valor={Math.max(reparto.ahorro.pct ?? 0, 0)}
                    meta={METAS_BOLSA.ahorro}
                    estado={reparto.ahorro.estado}
                    textoEstado={reparto.ahorro.pct === null ? "—" : pct(reparto.ahorro.pct)}
                    detalle={`${formatearCOP(reparto.ahorro.total)} te quedan después del consumo`}
                  />
                  {reparto.sinClasificar > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {formatearCOP(reparto.sinClasificar)} en categorías sin bolsa (p. ej. Devtopia u “Otro”). Puedes
                      clasificarlas en Configuración → Categorías.
                    </p>
                  ) : null}
                </div>
              </MarcoGrafica>
            ) : null}

            <MarcoGrafica
              titulo="Dónde más compras"
              descripcion={`Top 10 comercios de ${nombrePeriodo(periodo)} (según el campo "Comercio" de tus gastos y compras con tarjeta)`}
              className={cn(vista === "caja" && "lg:col-span-1")}
            >
              <BarrasRanking
                total={gastoMes}
                vacio="Aún no hay comercios anotados este mes. Escribe el comercio al registrar un gasto."
                filas={topComercios.map((c) => ({
                  id: c.clave,
                  etiqueta: c.comercio,
                  valor: c.total,
                  detalle: `${c.n} ${c.n === 1 ? "compra" : "compras"}`,
                }))}
              />
            </MarcoGrafica>
          </div>
        </>
      )}
    </div>
  );
}
