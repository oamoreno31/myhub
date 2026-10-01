"use client";

import { ArrowRightIcon, SlidersHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useState } from "react";
import { MarcoGrafica } from "@/components/graficas/base";
import { COLORES_SERIE } from "@/components/graficas/colores";
import { Lineas } from "@/components/graficas/lineas";
import { HojaFormulario } from "@/components/formularios/hoja-formulario";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { etiquetaEjeMes } from "@/lib/domain/analisis";
import type { ParamsPila } from "@/lib/domain/pila";
import { nombreCortoPeriodo, nombrePeriodo } from "@/lib/domain/periodos";
import { type Accion, type Indicador, LECTURAS, type Score, type Umbrales } from "@/lib/domain/salud";
import type { DeudaPlan, MetaVista } from "@/lib/salud";
import { cn } from "@/lib/utils";
import type { CuentaMeta, DeudaMeta } from "./metas";
import { BadgeBanda, formatoIndicador, MedidorScore, textoUmbral, TONOS_LECTURA } from "./piezas-salud";

// Las pestañas distintas al resumen (y el formulario de umbrales) se descargan al abrirlas.
function Cargando() {
  return <div className="h-64 animate-pulse rounded-2xl bg-muted" aria-label="Cargando" role="status" />;
}
const PanelMetas = dynamic(() => import("./metas").then((m) => m.PanelMetas), { loading: Cargando });
const PanelDeudas = dynamic(() => import("./plan-deudas").then((m) => m.PanelDeudas), { loading: Cargando });
const PanelSeguridadSocial = dynamic(() => import("./seguridad-social").then((m) => m.PanelSeguridadSocial), {
  loading: Cargando,
});
const FormUmbrales = dynamic(() => import("./form-umbrales").then((m) => m.FormUmbrales), { loading: Cargando });

export type PestanaSalud = "resumen" | "metas" | "deudas" | "seguridad-social";

const PESTANAS: { clave: PestanaSalud; etiqueta: string }[] = [
  { clave: "resumen", etiqueta: "Resumen" },
  { clave: "metas", etiqueta: "Metas" },
  { clave: "deudas", etiqueta: "Plan de deudas" },
  { clave: "seguridad-social", etiqueta: "Seguridad social" },
];

export function PantallaSalud({
  inicial,
  periodo,
  periodoActual,
  origen,
  score,
  indicadores,
  acciones,
  historial,
  umbrales,
  usuraEA,
  metas,
  cuentas,
  deudasMeta,
  gastoEsencial,
  deudasPlan,
  pila,
  ingresoPromedio,
  pilaPagadaMes,
}: {
  inicial: PestanaSalud;
  periodo: string;
  periodoActual: string;
  origen: "foto" | "vivo";
  score: Score;
  indicadores: Indicador[];
  acciones: Accion[];
  historial: { periodo: string; score: number }[];
  umbrales: Umbrales;
  usuraEA: number | null;
  metas: MetaVista[];
  cuentas: CuentaMeta[];
  deudasMeta: DeudaMeta[];
  gastoEsencial: number;
  deudasPlan: DeudaPlan[];
  pila: ParamsPila;
  ingresoPromedio: number;
  pilaPagadaMes: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pestana, setPestana] = useState<PestanaSalud>(inicial);
  const [umbralesAbiertos, setUmbralesAbiertos] = useState(false);
  const cambiar = (p: PestanaSalud) => {
    setPestana(p);
    router.replace(p === "resumen" ? pathname : `${pathname}?tab=${p}`, { scroll: false });
  };
  const conScore = indicadores.filter((x) => x.peso > 0);
  const extra = indicadores.filter((x) => x.peso === 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-semibold">Salud financiera</h1>
        <p className="text-sm text-muted-foreground">
          Cómo vas, qué mejorar primero y tus planes: metas, salida de deudas y seguridad social.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Secciones de salud financiera"
        className="flex gap-1 overflow-x-auto rounded-xl bg-secondary p-1"
      >
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            type="button"
            role="tab"
            id={`tab-${p.clave}`}
            aria-selected={pestana === p.clave}
            aria-controls={`panel-${p.clave}`}
            onClick={() => cambiar(p.clave)}
            className={cn(
              "h-9 min-w-fit flex-1 rounded-lg px-3 text-sm font-bold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring",
              pestana === p.clave ? "bg-card shadow-sm" : "text-muted-foreground",
            )}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${pestana}`} aria-labelledby={`tab-${pestana}`} className="flex flex-col gap-4">
        {pestana === "resumen" ? (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <Card className="gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-muted-foreground">
                      Score de {nombrePeriodo(periodo).toLowerCase()}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {origen === "foto"
                        ? "Foto del cierre del mes"
                        : periodo === periodoActual
                          ? "Al día de hoy"
                          : "Calculado hoy (mes sin cerrar)"}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setUmbralesAbiertos(true)}>
                    <SlidersHorizontalIcon /> Umbrales
                  </Button>
                </div>
                {score.valor === null || score.lectura === null ? (
                  <p className="text-sm text-muted-foreground">
                    Registra tus ingresos del mes para calcular el score: casi todos los indicadores se miden contra
                    ellos.
                  </p>
                ) : (
                  <>
                    <div className="flex items-baseline gap-3">
                      <span className="text-6xl font-bold tabular-nums">{score.valor}</span>
                      <span className="text-muted-foreground">/ 100</span>
                      <span className={cn("ml-auto text-lg font-bold", TONOS_LECTURA[score.lectura].texto)}>
                        {TONOS_LECTURA[score.lectura].simbolo} {LECTURAS[score.lectura].etiqueta}
                      </span>
                    </div>
                    <MedidorScore valor={score.valor} lectura={score.lectura} />
                    {score.cobertura < 100 ? (
                      <p className="text-xs text-muted-foreground">
                        Calculado con los indicadores que aplican ({score.cobertura} % del peso total).
                      </p>
                    ) : null}
                  </>
                )}
              </Card>

              <Card className="gap-3">
                <h2 className="font-bold">Lo que más te sube el score</h2>
                {acciones.length === 0 ? (
                  <p className="rounded-xl bg-success-soft px-4 py-3 text-sm font-semibold text-success">
                    ✓ Todo en zona sana. Sigue así y cierra el mes para guardar la foto.
                  </p>
                ) : (
                  <ol className="flex flex-col gap-2">
                    {acciones.map((a, k) => (
                      <li key={a.id}>
                        <Link
                          href={a.href}
                          className="group flex items-start gap-3 rounded-xl border p-3 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                            {k + 1}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="font-semibold">{a.titulo}</span>
                            <span className="text-sm text-muted-foreground">{a.detalle}</span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            <span className="text-xs font-semibold whitespace-nowrap text-primary">
                              +{Math.max(1, Math.round(a.impacto))} pts
                            </span>
                            <ArrowRightIcon
                              className="size-4 text-muted-foreground group-hover:text-foreground"
                              aria-hidden="true"
                            />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {conScore.map((x) => (
                <TarjetaIndicador key={x.clave} x={x} />
              ))}
              {extra.map((x) => (
                <TarjetaIndicador key={x.clave} x={x} nota="Informativo (no suma al score)" />
              ))}
            </div>

            <MarcoGrafica
              titulo="Tu score mes a mes"
              descripcion="Cada cierre de mes guarda la foto del score; el último punto es el de hoy."
            >
              {historial.length >= 2 ? (
                <Lineas
                  etiquetas={historial.map((h) => etiquetaEjeMes(h.periodo))}
                  titulos={historial.map((h) => nombreCortoPeriodo(h.periodo))}
                  series={[
                    { id: "score", nombre: "Score", color: COLORES_SERIE[0], valores: historial.map((h) => h.score) },
                  ]}
                  etiquetaAria="Score de salud financiera por mes"
                  unidad="puntos"
                  maximo={100}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aparece cuando cierres tu primer mes (desde esta versión, el cierre guarda el score).
                </p>
              )}
            </MarcoGrafica>
          </>
        ) : pestana === "metas" ? (
          <PanelMetas
            metas={metas}
            cuentas={cuentas}
            deudas={deudasMeta}
            gastoEsencial={gastoEsencial}
            hoy={periodoActual}
          />
        ) : pestana === "deudas" ? (
          <PanelDeudas deudas={deudasPlan} usuraEA={usuraEA} hoy={periodoActual} />
        ) : (
          <PanelSeguridadSocial
            params={pila}
            ingresoPromedio={ingresoPromedio}
            pagadoMes={pilaPagadaMes}
            mes={nombrePeriodo(periodoActual)}
          />
        )}
      </div>

      <HojaFormulario titulo="Umbrales de los indicadores" open={umbralesAbiertos} onOpenChange={setUmbralesAbiertos}>
        {(cerrar) => <FormUmbrales umbrales={umbrales} usuraEA={usuraEA} onGuardado={cerrar} />}
      </HojaFormulario>
    </div>
  );
}

function TarjetaIndicador({ x, nota }: { x: Indicador; nota?: string }) {
  return (
    <Card className="gap-1.5 p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold">{x.nombre}</span>
        <BadgeBanda banda={x.banda} />
      </div>
      <span className="text-2xl font-bold tabular-nums">
        {x.valor === null ? "—" : formatoIndicador(x.valor, x.formato)}
      </span>
      <span className="text-xs text-muted-foreground">{x.valor === null ? x.motivo : textoUmbral(x)}</span>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Cómo se calcula</summary>
        <p className="mt-1">{x.formula}.</p>
        {x.peso > 0 ? (
          <p>
            Pesa {x.peso} % en el score{x.puntaje !== null ? ` · puntaje ${Math.round(x.puntaje)}/100` : ""}.
          </p>
        ) : null}
        {nota ? <p>{nota}.</p> : null}
      </details>
    </Card>
  );
}
