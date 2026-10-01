"use client";

import { Desplazable } from "@/components/ui/desplazable";
import { CopyIcon, LockIcon, SparklesIcon, StampIcon, Undo2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { guardarPresupuesto } from "@/actions/presupuesto";
import { Medidor, pct } from "@/components/analisis/piezas";
import { MontoInput } from "@/components/formularios/monto-input";
import { BotonGuardar, Linea, VistaPrevia } from "@/components/formularios/vista-previa";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAccion } from "@/hooks/use-accion";
import type { CategoriaGasto } from "@/lib/analisis";
import { estadoPresupuesto, type LineaPresupuesto, METAS_BOLSA, type Propuesta503020 } from "@/lib/domain/analisis";
import { aCentavos, formatearCOP } from "@/lib/domain/dinero";
import { nombrePeriodo } from "@/lib/domain/periodos";
import { cn } from "@/lib/utils";

type Montos = Record<string, number>;

const aMontos = (lineas: LineaPresupuesto[]): Montos =>
  Object.fromEntries(lineas.filter((l) => l.monto > 0).map((l) => [l.categoria_id, l.monto]));

const iguales = (a: Montos, b: Montos) => {
  const ka = Object.keys(a).filter((k) => a[k] > 0);
  const kb = Object.keys(b).filter((k) => b[k] > 0);
  return ka.length === kb.length && ka.every((k) => aCentavos(a[k]) === aCentavos(b[k] ?? 0));
};

const suma = (vs: number[]) => vs.reduce((a, v) => a + aCentavos(v), 0) / 100;

const TEXTO_ESTADO = {
  ok: "vas bien",
  atencion: "cerca del tope",
  tope: "justo en el tope",
  excedido: "te pasaste",
} as const;

export function PantallaPresupuesto({
  periodo,
  periodoId,
  cerrado,
  categorias,
  lineas,
  origen,
  plantilla,
  mesAnterior,
  gastoPorCategoria,
  gastoTotal,
  ingresoMes,
  ingresoPromedio,
  propuesta,
}: {
  periodo: string;
  periodoId: string;
  cerrado: boolean;
  categorias: CategoriaGasto[];
  lineas: LineaPresupuesto[];
  origen: "mes" | "plantilla" | "ninguno";
  plantilla: LineaPresupuesto[];
  mesAnterior: LineaPresupuesto[];
  /** Consumo del mes por categoría hoja (sin reembolsables Devtopia). */
  gastoPorCategoria: Record<string, number>;
  gastoTotal: number;
  ingresoMes: number;
  ingresoPromedio: number;
  propuesta: Propuesta503020 | null;
}) {
  const guardado = useMemo(() => aMontos(lineas), [lineas]);
  const [montos, setMontos] = useState<Montos>(guardado);
  // Los MontoInput no son controlados: al cambiar todo de golpe se remontan con otra "versión".
  const [version, setVersion] = useState(0);
  const [comoPlantilla, setComoPlantilla] = useState(origen !== "mes");
  const [verPropuesta, setVerPropuesta] = useState(false);
  // Tras guardar, el servidor manda las líneas nuevas: se adoptan sin remontar el componente
  // (remontarlo perdería el estado de la acción y con él el aviso de "guardado").
  const firma = `${origen}|${JSON.stringify(guardado)}`;
  const [firmaVista, setFirmaVista] = useState(firma);
  if (firmaVista !== firma) {
    setFirmaVista(firma);
    setMontos(guardado);
    setVersion((v) => v + 1);
    setComoPlantilla(origen !== "mes");
  }
  const { onSubmit, pendiente } = useAccion(guardarPresupuesto);

  const reemplazar = (nuevos: Montos) => {
    setMontos(nuevos);
    setVersion((v) => v + 1);
  };

  const padres = categorias.filter((c) => c.padre_id === null);
  const hijos = (id: string) => categorias.filter((c) => c.padre_id === id);
  const porId = new Map(categorias.map((c) => [c.id, c]));
  // "Tarjetas de crédito" es la categoría del pago de la tarjeta (caja): lo que se consume con la
  // tarjeta ya cae en la categoría de cada compra, así que presupuestarla sería contar doble.
  const visibles = padres.filter(
    (c) => !(c.es_sistema && c.bolsa === "no_aplica" && c.grupo === "Financiero") && (c.activa || montos[c.id]),
  );

  /** Gasto que cuenta para la línea de una categoría: la propia + subcategorías sin línea propia. */
  const gastoDeLinea = (id: string) => {
    let total = aCentavos(gastoPorCategoria[id] ?? 0);
    for (const h of hijos(id)) if (!montos[h.id]) total += aCentavos(gastoPorCategoria[h.id] ?? 0);
    return total / 100;
  };

  const ids = Object.keys(montos).filter((k) => montos[k] > 0);
  const totalPresupuesto = suma(ids.map((k) => montos[k]));
  const gastadoCubierto = suma(
    ids.map((k) => (porId.get(k)?.padre_id ? (gastoPorCategoria[k] ?? 0) : gastoDeLinea(k))),
  );
  const sinPresupuesto = Math.max(gastoTotal - gastadoCubierto, 0);
  const bolsaDe = (id: string) => {
    const c = porId.get(id);
    if (!c) return "no_aplica";
    if (c.bolsa !== "no_aplica" || !c.padre_id) return c.bolsa;
    return porId.get(c.padre_id)?.bolsa ?? "no_aplica";
  };
  const porBolsa = (b: string) => suma(ids.filter((k) => bolsaDe(k) === b).map((k) => montos[k]));
  const ingresoRef = ingresoMes > 0 ? ingresoMes : ingresoPromedio;
  const sucio = !iguales(montos, guardado);
  const hayPlantilla = plantilla.length > 0;
  const excedidas = ids.filter((k) => estadoPresupuesto(gastoDeLinea(k), montos[k]).estado === "excedido").length;

  const fila = (c: CategoriaGasto, sub = false) => {
    const monto = montos[c.id] ?? 0;
    const gastado = sub ? (gastoPorCategoria[c.id] ?? 0) : gastoDeLinea(c.id);
    const est = monto > 0 ? estadoPresupuesto(gastado, monto) : null;
    return (
      <li key={c.id} className={cn("flex flex-col gap-2 py-3", sub && "pl-4")}>
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className={cn("truncate font-semibold", sub && "text-sm")}>
              {sub ? "↳ " : ""}
              {c.nombre}
            </span>
            <span className="text-xs text-muted-foreground">
              Gastado {formatearCOP(gastado)}
              {monto > 0 ? (
                <>
                  {" "}
                  ·{" "}
                  {gastado <= monto
                    ? `quedan ${formatearCOP(monto - gastado)}`
                    : `${formatearCOP(gastado - monto)} de más`}
                </>
              ) : null}
            </span>
          </div>
          {cerrado ? (
            <strong className="text-sm tabular-nums">{monto > 0 ? formatearCOP(monto) : "—"}</strong>
          ) : (
            <label className="w-36 shrink-0 sm:w-44">
              <span className="sr-only">Presupuesto para {c.nombre}</span>
              <MontoInput
                key={`${version}-${c.id}`}
                name={`monto-${c.id}`}
                defaultValue={monto || null}
                placeholder="0"
                className="text-right"
                onValor={(v) => setMontos((m) => ({ ...m, [c.id]: v ?? 0 }))}
              />
            </label>
          )}
        </div>
        {est ? (
          <Medidor
            etiqueta={<span className="sr-only">{c.nombre}</span>}
            valor={est.pct}
            estado={est.estado}
            textoEstado={`${pct(est.pct)} · ${TEXTO_ESTADO[est.estado]}`}
          />
        ) : null}
      </li>
    );
  };

  const grupos = new Map<string, CategoriaGasto[]>();
  for (const c of visibles) grupos.set(c.grupo, [...(grupos.get(c.grupo) ?? []), c]);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <input type="hidden" name="periodo_id" value={periodoId} />
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(ids.map((k) => ({ categoria_id: k, monto: montos[k] })))}
      />
      <input type="hidden" name="plantilla" value={comoPlantilla ? "true" : "false"} />

      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-semibold">Presupuesto</h1>
        <p className="text-sm text-muted-foreground">
          {nombrePeriodo(periodo)} ·{" "}
          {origen === "mes"
            ? "presupuesto propio de este mes."
            : origen === "plantilla"
              ? "usando tu plantilla (guárdalo para ajustarlo solo en este mes)."
              : "aún sin presupuesto."}{" "}
          Se compara con tu consumo del mes (compras con tarjeta incluidas, sin gastos reembolsables por Devtopia).
        </p>
      </div>

      {cerrado ? (
        <p className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm">
          <LockIcon className="size-4" aria-hidden="true" /> Mes cerrado: el presupuesto es de solo lectura.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={mesAnterior.length === 0}
            onClick={() => reemplazar(aMontos(mesAnterior))}
            title={mesAnterior.length === 0 ? "El mes anterior no tiene presupuesto propio" : undefined}
          >
            <CopyIcon /> Copiar mes anterior
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!hayPlantilla}
            onClick={() => reemplazar(aMontos(plantilla))}
          >
            <StampIcon /> Aplicar plantilla
          </Button>
          <Button type="button" variant="outline" disabled={!propuesta} onClick={() => setVerPropuesta(true)}>
            <SparklesIcon /> Proponer 50/30/20
          </Button>
          {sucio ? (
            <Button type="button" variant="ghost" onClick={() => reemplazar(guardado)}>
              <Undo2Icon /> Deshacer cambios
            </Button>
          ) : null}
        </div>
      )}

      {/* Resumen y vista previa del efecto (regla 10) */}
      <VistaPrevia tono={ingresoRef > 0 && totalPresupuesto > ingresoRef ? "alerta" : "normal"}>
        <Linea etiqueta="Presupuestado" valor={formatearCOP(totalPresupuesto)} fuerte />
        <Linea
          etiqueta={ingresoMes > 0 ? "Ingresos" : "Ingreso prom."}
          valor={
            <>
              {formatearCOP(ingresoRef)}
              {ingresoRef > 0 ? (
                <span className="text-muted-foreground"> · presupuestas el {pct(totalPresupuesto / ingresoRef)}</span>
              ) : null}
            </>
          }
        />
        <Linea
          etiqueta="Gastado"
          valor={`${formatearCOP(gastadoCubierto)}${excedidas ? ` · ! ${excedidas} ${excedidas === 1 ? "línea excedida" : "líneas excedidas"}` : ""}`}
        />
        <Linea etiqueta="Fuera del presupuesto" valor={formatearCOP(sinPresupuesto)} />
        {ingresoRef > 0 && totalPresupuesto > ingresoRef ? (
          <p className="text-sm font-semibold text-destructive">
            ! El presupuesto supera tus ingresos por {formatearCOP(totalPresupuesto - ingresoRef)}.
          </p>
        ) : null}
        {ingresoRef > 0 ? (
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(
              [
                ["necesidad", "Necesidades", "≤"],
                ["deseo", "Deseos", "≤"],
                ["ahorro_deuda", "Ahorro", "≥"],
              ] as const
            ).map(([b, nombre, signo]) => {
              const total = porBolsa(b);
              const p = total / ingresoRef;
              const meta = b === "ahorro_deuda" ? METAS_BOLSA.ahorro : METAS_BOLSA[b];
              const bien = b === "ahorro_deuda" ? p >= meta : p <= meta;
              return (
                <Medidor
                  key={b}
                  etiqueta={`${nombre} (${signo} ${pct(meta)})`}
                  valor={p}
                  meta={meta}
                  estado={bien ? "ok" : "atencion"}
                  textoEstado={pct(p)}
                  detalle={formatearCOP(total)}
                />
              );
            })}
          </div>
        ) : null}
      </VistaPrevia>

      <div className="flex flex-col gap-4">
        {[...grupos].map(([grupo, cats]) => (
          <section key={grupo} className="rounded-2xl border bg-card px-4">
            <h2 className="pt-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{grupo}</h2>
            <ul className="divide-y">
              {cats.flatMap((c) => [
                fila(c),
                ...hijos(c.id)
                  .filter((h) => h.activa || montos[h.id])
                  .map((h) => fila(h, true)),
              ])}
            </ul>
          </section>
        ))}
        {!cerrado ? (
          <p className="text-xs text-muted-foreground">
            Si una categoría tiene subcategorías, su presupuesto cubre las subcategorías que no tengan uno propio.
          </p>
        ) : null}
      </div>

      {!cerrado ? (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:bottom-0 lg:-mx-8 lg:px-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-[var(--primary)]"
                checked={comoPlantilla}
                onChange={(e) => setComoPlantilla(e.target.checked)}
              />
              Guardar también como plantilla para los próximos meses
            </label>
            <BotonGuardar
              pendiente={pendiente}
              disabled={!sucio && !(comoPlantilla && !iguales(montos, aMontos(plantilla)))}
            >
              Guardar presupuesto de {nombrePeriodo(periodo).split(" ")[0].toLowerCase()}
            </BotonGuardar>
          </div>
        </div>
      ) : null}

      {propuesta ? (
        <AlertDialog open={verPropuesta} onOpenChange={setVerPropuesta}>
          <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
            <AlertDialogTitle>Propuesta 50/30/20</AlertDialogTitle>
            <AlertDialogDescription>
              Parte de tu gasto promedio de los últimos 3 meses y de tu ingreso promedio de{" "}
              {formatearCOP(ingresoPromedio)}. Si una bolsa se pasa de su meta, se recorta en proporción; si no, se deja
              igual. Revisa y ajusta antes de guardar.
            </AlertDialogDescription>
            <Desplazable etiqueta="Tabla de la propuesta por bolsa">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-2 font-semibold">Bolsa</th>
                    <th className="py-2 pr-2 text-right font-semibold">Meta</th>
                    <th className="py-2 pr-2 text-right font-semibold">Promedio</th>
                    <th className="py-2 text-right font-semibold">Propuesto</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["necesidad", "Necesidades 50 %"],
                      ["deseo", "Deseos 30 %"],
                      ["ahorro", "Ahorro 20 %"],
                    ] as const
                  ).map(([b, nombre]) => {
                    const x = propuesta.bolsas[b];
                    return (
                      <tr key={b} className="border-t">
                        <td className="py-2 pr-2">{nombre}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{formatearCOP(x.meta)}</td>
                        <td className="py-2 pr-2 text-right text-muted-foreground tabular-nums">
                          {formatearCOP(x.promedio)}
                        </td>
                        <td className="py-2 text-right font-semibold tabular-nums">
                          {formatearCOP(x.propuesto)}
                          {x.promedio > x.meta && b !== "ahorro" ? (
                            <span className="block text-xs text-warning">◐ recortado</span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Desplazable>
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
              {propuesta.items.map((i) => (
                <li key={i.categoria_id} className="flex justify-between gap-2">
                  <span className="truncate">{porId.get(i.categoria_id)?.nombre ?? "Categoría"}</span>
                  <span className="tabular-nums">{formatearCOP(i.monto)}</span>
                </li>
              ))}
            </ul>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => reemplazar(aMontos(propuesta.items))}>
                Usar esta propuesta
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </form>
  );
}
