import { CircleDotIcon, LockIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Indicador, pct, Variacion } from "@/components/analisis/piezas";
import { MarcoGrafica } from "@/components/graficas/base";
import { COLORES_SERIE } from "@/components/graficas/colores";
import { Columnas } from "@/components/graficas/columnas";
import { Lineas } from "@/components/graficas/lineas";
import { SelectorObligacion } from "@/components/historico/selector-obligacion";
import { fechaCorta } from "@/components/tarjetas/piezas";
import {
  obtenerHistorialObligacion,
  obtenerObligacionesPlantilla,
  obtenerPatrimonio,
  obtenerResumenes,
  type ResumenMes,
} from "@/lib/analisis";
import { etiquetaEjeMes, variacion, ventanaPeriodos } from "@/lib/domain/analisis";
import { formatearCOP } from "@/lib/domain/dinero";
import { desplazarPeriodo, nombreCortoPeriodo, nombrePeriodo } from "@/lib/domain/periodos";
import { obtenerPeriodoActual, obtenerPeriodoSeleccionado } from "@/lib/periodo-seleccionado";
import { calcularIndicadores, calcularScore, LECTURAS } from "@/lib/domain/salud";
import { obtenerFotosSalud, obtenerParametrosSalud } from "@/lib/salud";

export const metadata: Metadata = { title: "Histórico" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const balance = (r: ResumenMes) => r.ingresos - r.gastos;
const tasa = (r: ResumenMes) => (r.ingresos > 0 ? balance(r) / r.ingresos : null);

export default async function HistoricoPage({ searchParams }: PageProps<"/historico">) {
  const sp = await searchParams;
  const periodo = await obtenerPeriodoSeleccionado();
  const actual = obtenerPeriodoActual();
  const periodos = ventanaPeriodos(periodo, 12);
  const [resumenes, patrimonio, obligaciones, fotosSalud, paramsSalud] = await Promise.all([
    obtenerResumenes(desplazarPeriodo(periodo, -12), periodo),
    obtenerPatrimonio(),
    obtenerObligacionesPlantilla(),
    obtenerFotosSalud(desplazarPeriodo(periodo, -11), periodo),
    obtenerParametrosSalud(),
  ]);
  // Score de cada mes cerrado desde su foto (los meses cerrados antes de F5 no la tienen).
  const scorePorMes = new Map(
    fotosSalud
      .filter((f) => f.insumos)
      .map((f) => [f.periodo, calcularScore(calcularIndicadores(f.insumos!, paramsSalud.umbrales))]),
  );
  const porPeriodo = new Map(resumenes.map((r) => [r.periodo, r]));
  const meses = periodos
    .map((p) => porPeriodo.get(p))
    .filter((r): r is ResumenMes => Boolean(r))
    .reverse();

  // Evolución del patrimonio: fotos de los cierres + el valor de hoy si se mira el mes en curso.
  const puntos = periodos
    .map((p) => ({ periodo: p, valor: porPeriodo.get(p)?.patrimonio ?? null }))
    .filter((x): x is { periodo: string; valor: number } => x.valor !== null);
  if (periodo === actual) {
    const i = puntos.findIndex((x) => x.periodo === actual);
    if (i >= 0) puntos[i] = { periodo: actual, valor: patrimonio.patrimonio };
    else puntos.push({ periodo: actual, valor: patrimonio.patrimonio });
  }

  // Comparativo del mes seleccionado.
  const este = porPeriodo.get(periodo);
  const anterior = porPeriodo.get(desplazarPeriodo(periodo, -1));
  const haceUnAno = porPeriodo.get(desplazarPeriodo(periodo, -12));

  // Historial por obligación (HU-14).
  const pagables = obligaciones.filter((o) => !o.es_ingreso);
  const elegida =
    (typeof sp.obligacion === "string" && UUID_RE.test(sp.obligacion)
      ? obligaciones.find((o) => o.id === sp.obligacion)
      : undefined) ?? pagables[0];
  const historial = elegida ? await obtenerHistorialObligacion(elegida.id, periodos[0], periodo) : [];
  const porMes = new Map(historial.map((h) => [h.periodo, h]));
  // La gráfica arranca en el primer mes que tiene la obligación (mínimo 2 meses).
  const primerMes = periodos.findIndex((p) => porMes.has(p));
  const mesesObl = periodos.slice(
    Math.max(0, Math.min(primerMes < 0 ? periodos.length - 2 : primerMes, periodos.length - 2)),
  );
  const conPago = historial.filter((h) => h.pagado > 0);
  const promedioPagado = conPago.length ? conPago.reduce((a, h) => a + h.pagado, 0) / conPago.length : 0;

  const filasComparativo: {
    nombre: string;
    valor: (r: ResumenMes) => number | null;
    subirEsBueno: boolean;
    esPct?: boolean;
  }[] = [
    { nombre: "Ingresos", valor: (r) => r.ingresos, subirEsBueno: true },
    { nombre: "Gastos (consumo)", valor: (r) => r.gastos, subirEsBueno: false },
    { nombre: "Salidas de caja", valor: (r) => r.salidas_caja, subirEsBueno: false },
    { nombre: "Balance", valor: balance, subirEsBueno: true },
    { nombre: "Tasa de ahorro", valor: tasa, subirEsBueno: true, esPct: true },
  ];

  const celda = (r: ResumenMes | undefined, f: (typeof filasComparativo)[number]) => {
    const v = r ? f.valor(r) : null;
    if (v === null) return <span className="text-muted-foreground">—</span>;
    return f.esPct ? pct(v) : formatearCOP(v);
  };
  const cambio = (r: ResumenMes | undefined, f: (typeof filasComparativo)[number]) => {
    if (!este || !r) return null;
    const a = f.valor(este);
    const b = f.valor(r);
    if (a === null || b === null) return null;
    if (f.esPct) {
      const d = a - b;
      return (
        <span className={d === 0 ? "text-muted-foreground" : d > 0 ? "text-success" : "text-destructive"}>
          {d === 0 ? "=" : d > 0 ? "▲" : "▼"} {Math.abs(Math.round(d * 100))} pts
        </span>
      );
    }
    return <Variacion valor={variacion(a, b)} subirEsBueno={f.subirEsBueno} />;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-semibold">Histórico</h1>
        <p className="text-sm text-muted-foreground">Tus meses, tu patrimonio y cada obligación en el tiempo.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          etiqueta="Patrimonio neto hoy"
          valor={formatearCOP(patrimonio.patrimonio)}
          tono={patrimonio.patrimonio < 0 ? "text-destructive" : undefined}
          detalle="Lo que tienes + te deben − lo que debes"
        />
        <Indicador etiqueta="En cuentas" valor={formatearCOP(patrimonio.cuentas)} />
        <Indicador
          etiqueta="Te deben"
          valor={formatearCOP(patrimonio.por_cobrar + patrimonio.devtopia)}
          detalle={`Préstamos ${formatearCOP(patrimonio.por_cobrar)} · Devtopia ${formatearCOP(patrimonio.devtopia)}`}
        />
        <Indicador
          etiqueta="Debes"
          valor={formatearCOP(patrimonio.deuda_tarjetas + patrimonio.prestamos)}
          tono="text-destructive"
          detalle={`Tarjetas ${formatearCOP(patrimonio.deuda_tarjetas)} · Préstamos ${formatearCOP(patrimonio.prestamos)}`}
        />
      </div>

      <MarcoGrafica
        titulo="Evolución del patrimonio"
        descripcion="Se guarda una foto al cerrar cada mes; el último punto es el valor de hoy."
      >
        {puntos.length >= 2 ? (
          <Lineas
            etiquetas={puntos.map((x) => etiquetaEjeMes(x.periodo))}
            titulos={puntos.map((x) => nombreCortoPeriodo(x.periodo))}
            series={[
              {
                id: "patrimonio",
                nombre: "Patrimonio neto",
                color: COLORES_SERIE[0],
                valores: puntos.map((x) => x.valor),
              },
            ]}
            etiquetaAria="Patrimonio neto al cierre de cada mes"
            desdeCero={false}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            La gráfica aparece cuando tengas al menos un mes cerrado: cada cierre guarda una foto del patrimonio para
            ver cómo cambia.
          </p>
        )}
      </MarcoGrafica>

      <MarcoGrafica
        titulo={`Comparativo de ${nombrePeriodo(periodo).toLowerCase()}`}
        descripcion="Contra el mes anterior y el mismo mes del año pasado."
      >
        {!este ? (
          <p className="text-sm text-muted-foreground">Este mes no tiene datos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-2 font-semibold"></th>
                  <th className="py-2 pr-2 text-right font-semibold">{nombreCortoPeriodo(periodo)}</th>
                  <th className="py-2 pr-2 text-right font-semibold">
                    {nombreCortoPeriodo(desplazarPeriodo(periodo, -1))}
                  </th>
                  <th className="py-2 pr-2 text-right font-semibold">Cambio</th>
                  <th className="py-2 pr-2 text-right font-semibold">
                    {nombreCortoPeriodo(desplazarPeriodo(periodo, -12))}
                  </th>
                  <th className="py-2 text-right font-semibold">Cambio</th>
                </tr>
              </thead>
              <tbody>
                {filasComparativo.map((f) => (
                  <tr key={f.nombre} className="border-t">
                    <td className="py-2 pr-2 font-semibold">{f.nombre}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{celda(este, f)}</td>
                    <td className="py-2 pr-2 text-right text-muted-foreground tabular-nums">{celda(anterior, f)}</td>
                    <td className="py-2 pr-2 text-right text-xs whitespace-nowrap">{cambio(anterior, f) ?? "—"}</td>
                    <td className="py-2 pr-2 text-right text-muted-foreground tabular-nums">{celda(haceUnAno, f)}</td>
                    <td className="py-2 text-right text-xs whitespace-nowrap">{cambio(haceUnAno, f) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </MarcoGrafica>

      <MarcoGrafica titulo="Mes a mes" descripcion="Toca un mes para ver su detalle.">
        {meses.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay meses registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[50rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-2 font-semibold">Mes</th>
                  <th className="py-2 pr-2 font-semibold">Estado</th>
                  <th className="py-2 pr-2 text-right font-semibold">Ingresos</th>
                  <th className="py-2 pr-2 text-right font-semibold">Gastos</th>
                  <th className="py-2 pr-2 text-right font-semibold">Balance</th>
                  <th className="py-2 pr-2 text-right font-semibold">Ahorro</th>
                  <th className="py-2 pr-2 text-right font-semibold">Score</th>
                  <th className="py-2 pr-2 text-right font-semibold">Obligaciones</th>
                  <th className="py-2 text-right font-semibold">Patrimonio</th>
                </tr>
              </thead>
              <tbody>
                {meses.map((r) => {
                  const t = tasa(r);
                  return (
                    <tr key={r.periodo} className="border-t">
                      <td className="py-2 pr-2">
                        <Link
                          href={`/mes/${r.periodo}`}
                          className="font-semibold text-primary underline-offset-4 hover:underline"
                        >
                          {nombrePeriodo(r.periodo)}
                        </Link>
                      </td>
                      <td className="py-2 pr-2 whitespace-nowrap">
                        {r.estado === "cerrado" ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <LockIcon className="size-3.5" aria-hidden="true" /> Cerrado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <CircleDotIcon className="size-3.5" aria-hidden="true" /> Abierto
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">{formatearCOP(r.ingresos)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{formatearCOP(r.gastos)}</td>
                      <td
                        className={`py-2 pr-2 text-right font-semibold tabular-nums ${balance(r) < 0 ? "text-destructive" : ""}`}
                      >
                        {formatearCOP(balance(r))}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">{t === null ? "—" : pct(t)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {(() => {
                          const sc = scorePorMes.get(r.periodo);
                          return sc?.valor != null && sc.lectura ? (
                            <span title={LECTURAS[sc.lectura].etiqueta}>{sc.valor}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          );
                        })()}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {r.obligaciones_pagadas}/{r.obligaciones_total}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {r.patrimonio === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          formatearCOP(r.patrimonio)
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </MarcoGrafica>

      <section id="obligacion" className="scroll-mt-24">
        <MarcoGrafica
          titulo="Historial por obligación"
          descripcion={
            elegida
              ? conPago.length
                ? `Pagas en promedio ${formatearCOP(promedioPagado)} (${conPago.length} ${conPago.length === 1 ? "mes" : "meses"} con pago).`
                : "Aún no hay pagos registrados para esta obligación."
              : "Crea obligaciones en Configuración para ver su historial."
          }
          acciones={elegida ? <SelectorObligacion obligaciones={obligaciones} valor={elegida.id} /> : undefined}
        >
          {elegida ? (
            <>
              <Columnas
                etiquetas={mesesObl.map(etiquetaEjeMes)}
                titulos={mesesObl.map(nombreCortoPeriodo)}
                series={[
                  {
                    id: "pagado",
                    nombre: elegida.es_ingreso ? "Recibido" : "Pagado",
                    color: COLORES_SERIE[0],
                    valores: mesesObl.map((p) => porMes.get(p)?.pagado ?? 0),
                  },
                ]}
                resaltar={mesesObl.length - 1}
                etiquetaAria={`${elegida.nombre}: pagado cada mes`}
                conTabla={false}
              />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[30rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-2 font-semibold">Mes</th>
                      <th className="py-2 pr-2 text-right font-semibold">Esperado</th>
                      <th className="py-2 pr-2 text-right font-semibold">
                        {elegida.es_ingreso ? "Recibido" : "Pagado"}
                      </th>
                      <th className="py-2 font-semibold">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...historial].reverse().map((h) => (
                      <tr key={h.periodo} className="border-t">
                        <td className="py-2 pr-2">{nombreCortoPeriodo(h.periodo)}</td>
                        <td className="py-2 pr-2 text-right text-muted-foreground tabular-nums">
                          {formatearCOP(h.esperado)}
                        </td>
                        <td className="py-2 pr-2 text-right font-semibold tabular-nums">{formatearCOP(h.pagado)}</td>
                        <td className="py-2 text-xs">
                          {h.resolucion === "omitida"
                            ? "– Omitida"
                            : h.resolucion === "arrastrada"
                              ? "→ Pasó al mes siguiente"
                              : h.pagada
                                ? `✓ Pagada${h.ultimo_pago ? ` el ${fechaCorta(h.ultimo_pago)}` : ""}`
                                : h.pagado > 0
                                  ? `◐ Pago parcial (${h.n_pagos})`
                                  : "○ Sin pagar"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </MarcoGrafica>
      </section>
    </div>
  );
}
