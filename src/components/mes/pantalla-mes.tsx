"use client";

import {
  CalendarPlusIcon,
  CreditCardIcon,
  LandmarkIcon,
  EllipsisVerticalIcon,
  ListIcon,
  LockIcon,
  PencilIcon,
  RotateCcwIcon,
  SkipForwardIcon,
  Trash2Icon,
  UnlockIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { eliminarObligacionPuntual, restaurarObligacion } from "@/actions/mes";
import { HojaFormulario } from "@/components/formularios/hoja-formulario";
import { MovimientoFormDiferido as MovimientoForm } from "@/components/formularios/diferidos";
import type { CuentaOpcion } from "@/components/formularios/movimiento-form";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CategoriaBasica } from "@/lib/categorias";
import type { ObligacionMesUI } from "@/lib/datos";
import { formatearCOP } from "@/lib/domain/dinero";
import {
  agruparObligaciones,
  ESTADOS,
  ESTADOS_INGRESO,
  estadoObligacion,
  estaPagada,
  etiquetaRelativa,
  resumirObligaciones,
} from "@/lib/domain/obligaciones";
import { cn } from "@/lib/utils";
import {
  AjusteObligacionForm,
  CierreMes,
  ObligacionPuntualForm,
  OmitirObligacionForm,
  ReabrirMesForm,
} from "./formularios-mes";

type Hoja =
  | { tipo: "pagar"; ob: ObligacionMesUI }
  | { tipo: "ajustar"; ob: ObligacionMesUI }
  | { tipo: "omitir"; ob: ObligacionMesUI }
  | { tipo: "puntual" }
  | { tipo: "cerrar" }
  | { tipo: "reabrir" }
  | null;

export function PantallaMes({
  periodo,
  obligaciones,
  cuentas,
  categorias,
  hoy,
  resumenMovimientos,
  bienvenida,
}: {
  periodo: {
    id: string;
    clave: string;
    nombre: string;
    nombreSiguiente: string;
    primerDia: string;
    estado: "abierto" | "cerrado";
    cerradoEn: string | null;
    terminado: boolean;
  };
  obligaciones: ObligacionMesUI[];
  cuentas: CuentaOpcion[];
  categorias: CategoriaBasica[];
  hoy: string;
  resumenMovimientos: { ingresos: number; gastos: number };
  bienvenida: boolean;
}) {
  const [hoja, setHoja] = useState<Hoja>(null);
  const cerrado = periodo.estado === "cerrado";
  const egresos = obligaciones.filter((o) => !o.es_ingreso);
  const ingresos = obligaciones.filter((o) => o.es_ingreso);
  const grupos = agruparObligaciones(egresos, hoy);
  const resumen = resumirObligaciones(obligaciones, hoy);
  const pendientesCierre = obligaciones.filter((o) => !o.resolucion && !estaPagada(o));
  const totalActivas = resumen.total - grupos.cerradas.filter((o) => o.resolucion === "omitida").length;
  const cerrarHoja = () => setHoja(null);

  const secciones = [
    { clave: "vencidas", titulo: "Vencidas", color: "text-destructive", items: grupos.vencidas },
    { clave: "proximas", titulo: "Próximos 7 días", color: "text-warning", items: grupos.proximas },
    { clave: "resto", titulo: "Resto del mes", color: "text-muted-foreground", items: grupos.resto },
    { clave: "pagadas", titulo: "Pagadas", color: "text-success", items: grupos.pagadas },
    {
      clave: "cerradas",
      titulo: "Omitidas o pasadas al mes siguiente",
      color: "text-muted-foreground",
      items: grupos.cerradas,
    },
  ].filter((s) => s.items.length > 0);

  const tituloHoja =
    hoja?.tipo === "pagar"
      ? hoja.ob.es_ingreso
        ? `Recibir: ${hoja.ob.nombre}`
        : `Pagar: ${hoja.ob.nombre}`
      : hoja?.tipo === "ajustar"
        ? `Ajustar: ${hoja.ob.nombre}`
        : hoja?.tipo === "omitir"
          ? `Omitir: ${hoja.ob.nombre}`
          : hoja?.tipo === "puntual"
            ? "Obligación puntual"
            : hoja?.tipo === "cerrar"
              ? `Cerrar ${periodo.nombre}`
              : hoja?.tipo === "reabrir"
                ? `Reabrir ${periodo.nombre}`
                : "";

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        titulo={`Mes · ${periodo.nombre}`}
        descripcion="Qué falta por pagar y qué ya se pagó."
        acciones={
          cerrado ? (
            <Button variant="outline" onClick={() => setHoja({ tipo: "reabrir" })}>
              <UnlockIcon /> Reabrir
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setHoja({ tipo: "puntual" })}>
                <CalendarPlusIcon /> <span className="hidden sm:inline">Obligación</span> puntual
              </Button>
              <Button variant="secondary" onClick={() => setHoja({ tipo: "cerrar" })}>
                <LockIcon /> Cerrar mes
              </Button>
            </>
          )
        }
      />

      {bienvenida ? (
        <p role="status" className="rounded-2xl bg-success-soft px-5 py-4 text-sm font-semibold text-success">
          ✓ ¡Listo! Estas son tus obligaciones de {periodo.nombre}. Toca &quot;Pagar&quot; en cada una a medida que
          pagues. Las que ya vencieron aparecen como vencidas: si ya las pagaste, regístralas igual para que tus saldos
          cuadren.
        </p>
      ) : null}

      {cerrado ? (
        <p className="flex items-center gap-2 rounded-2xl bg-info-soft px-5 py-4 text-sm font-semibold text-info">
          <LockIcon className="size-4 shrink-0" aria-hidden="true" />
          Mes cerrado
          {periodo.cerradoEn
            ? ` el ${new Date(periodo.cerradoEn).toLocaleDateString("es-CO", { day: "numeric", month: "long" })}`
            : ""}
          . Solo lectura.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-lg font-bold">
                  {resumen.pagadas} de {totalActivas} obligaciones pagadas
                </span>
                <span className="text-sm text-muted-foreground">
                  Pagado {formatearCOP(resumen.montoPagado)} · Pendiente {formatearCOP(resumen.montoPendiente)}
                </span>
              </div>
              {resumen.vencidas > 0 ? (
                <Badge variant="danger">
                  ! {resumen.vencidas} vencida{resumen.vencidas > 1 ? "s" : ""}
                </Badge>
              ) : null}
            </div>
            <div
              className="h-2.5 overflow-hidden rounded-full bg-secondary"
              role="progressbar"
              aria-label="Avance de pagos del mes"
              aria-valuenow={Math.round(resumen.avance * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.round(resumen.avance * 100)}%` }}
              />
            </div>
          </Card>

          {egresos.length === 0 ? (
            <Card className="items-start">
              <span className="font-bold">Aún no hay obligaciones este mes</span>
              <span className="text-sm text-muted-foreground">
                Configura tus pagos recurrentes (arriendo, servicios, internet…) y aparecerán aquí cada mes.
              </span>
              <Button asChild>
                <Link href="/configuracion?seccion=obligaciones">Configurar obligaciones</Link>
              </Button>
            </Card>
          ) : null}

          {secciones.map((s) => (
            <Card key={s.clave} className="gap-0 py-3">
              <h2 className={cn("pb-2 text-xs font-extrabold tracking-wider uppercase", s.color)}>
                {s.titulo} ({s.items.length})
              </h2>
              <ul>
                {s.items.map((o) => (
                  <FilaObligacion key={o.id} o={o} hoy={hoy} cerrado={cerrado} onAccion={setHoja} />
                ))}
              </ul>
            </Card>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          <Card className="gap-0 py-3">
            <h2 className="pb-2 text-xs font-extrabold tracking-wider text-muted-foreground uppercase">
              Ingresos esperados
            </h2>
            {ingresos.length === 0 ? (
              <p className="border-t py-3 text-sm text-muted-foreground">
                Agrega tu sueldo u honorarios como obligación de tipo &quot;Ingreso esperado&quot;.
              </p>
            ) : (
              <ul>
                {ingresos.map((o) => (
                  <FilaObligacion key={o.id} o={o} hoy={hoy} cerrado={cerrado} onAccion={setHoja} compacta />
                ))}
              </ul>
            )}
          </Card>
          <Card className="gap-2">
            <h2 className="text-xs font-extrabold tracking-wider text-muted-foreground uppercase">
              Movimientos del mes
            </h2>
            <div className="flex justify-between text-sm">
              <span>Ingresos</span>
              <strong className="text-success">{formatearCOP(resumenMovimientos.ingresos)}</strong>
            </div>
            <div className="flex justify-between text-sm">
              <span>Gastos</span>
              <strong>{formatearCOP(resumenMovimientos.gastos)}</strong>
            </div>
            <Button asChild variant="link" className="self-start px-0">
              <Link href="/movimientos">Ver movimientos →</Link>
            </Button>
          </Card>
        </div>
      </div>

      <HojaFormulario titulo={tituloHoja} open={hoja !== null} onOpenChange={(v) => !v && cerrarHoja()}>
        {() => (
          <>
            {hoja?.tipo === "pagar" ? (
              <MovimientoForm
                cuentas={cuentas}
                categorias={categorias}
                hoy={hoy < periodo.primerDia ? periodo.primerDia : hoy}
                obligacion={hoja.ob}
                onGuardado={cerrarHoja}
              />
            ) : null}
            {hoja?.tipo === "ajustar" ? <AjusteObligacionForm obligacion={hoja.ob} onGuardado={cerrarHoja} /> : null}
            {hoja?.tipo === "omitir" ? <OmitirObligacionForm obligacion={hoja.ob} onGuardado={cerrarHoja} /> : null}
            {hoja?.tipo === "puntual" ? (
              <ObligacionPuntualForm
                periodoId={periodo.id}
                periodoPrimerDia={hoy.slice(0, 7) === periodo.clave ? hoy : periodo.primerDia}
                categorias={categorias}
                cuentas={cuentas}
                onGuardado={cerrarHoja}
              />
            ) : null}
            {hoja?.tipo === "cerrar" ? (
              <CierreMes
                periodoId={periodo.id}
                nombreMes={periodo.nombre}
                nombreSiguiente={periodo.nombreSiguiente}
                pendientes={pendientesCierre}
                resumen={{ ...resumenMovimientos, pagadas: resumen.pagadas, total: totalActivas }}
                mesTerminado={periodo.terminado}
                onCerrado={cerrarHoja}
              />
            ) : null}
            {hoja?.tipo === "reabrir" ? <ReabrirMesForm periodoId={periodo.id} onGuardado={cerrarHoja} /> : null}
          </>
        )}
      </HojaFormulario>
    </div>
  );
}

function FilaObligacion({
  o,
  hoy,
  cerrado,
  compacta,
  onAccion,
}: {
  o: ObligacionMesUI;
  hoy: string;
  cerrado: boolean;
  compacta?: boolean;
  onAccion: (h: Hoja) => void;
}) {
  const [pendiente, startTransition] = useTransition();
  const estado = estadoObligacion(o, hoy);
  const info = ESTADOS[estado];
  const etiquetaBase = o.es_ingreso ? (ESTADOS_INGRESO[estado] ?? info.etiqueta) : info.etiqueta;
  // En tarjetas, "pagada" = mínimo cubierto; se distingue cuando se pagó el total del extracto.
  const etiquetaEstado =
    o.tarjeta_id && estaPagada(o)
      ? o.pago_total_tc !== null && o.pagado >= o.pago_total_tc - 1000
        ? "Pago total"
        : "Mínimo cubierto"
      : etiquetaBase;
  const pagada = estaPagada(o);
  const puedePagar = !cerrado && !o.resolucion && !pagada;
  const esTarjeta = Boolean(o.tarjeta_id);
  const esDeuda = Boolean(o.deuda_id);
  const esPuntual = !o.obligacion_id && !o.arrastrada_de_id;

  const ejecutar = (fn: () => Promise<{ ok?: boolean; mensaje?: string; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.mensaje);
      else toast.error(r.error);
    });

  const detalle = [
    o.resolucion === "omitida" && o.motivo ? `Omitida: ${o.motivo}` : null,
    o.resolucion === "arrastrada" ? "Pasó al mes siguiente" : null,
    o.arrastrada_de_id ? o.nota : null,
    esTarjeta && o.pago_total_tc !== null && !o.resolucion
      ? `Mínimo · total ${formatearCOP(o.pago_total_tc)}`
      : !o.resolucion && !o.arrastrada_de_id
        ? o.categoria_nombre
        : null,
    !o.resolucion && o.cuenta_default_nombre ? o.cuenta_default_nombre : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      className={cn("flex items-center gap-3 border-t py-3", pendiente && "opacity-60", o.resolucion && "opacity-75")}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("truncate font-bold", o.resolucion === "omitida" && "line-through")}>{o.nombre}</span>
        <span className="truncate text-xs text-muted-foreground">{detalle}</span>
        {!compacta ? (
          <span className="text-xs text-muted-foreground sm:hidden">
            {o.fecha_vencimiento.slice(8)}/{o.fecha_vencimiento.slice(5, 7)} ·{" "}
            {etiquetaRelativa(o.fecha_vencimiento, hoy)}
          </span>
        ) : null}
      </div>
      {!compacta ? (
        <div className="hidden w-28 flex-col text-xs text-muted-foreground sm:flex">
          <span className="font-semibold text-foreground">
            {o.fecha_vencimiento.slice(8)}/{o.fecha_vencimiento.slice(5, 7)}
          </span>
          <span>
            {pagada
              ? o.ultimo_pago
                ? `pagada el ${o.ultimo_pago.slice(8)}/${o.ultimo_pago.slice(5, 7)}`
                : ""
              : etiquetaRelativa(o.fecha_vencimiento, hoy)}
          </span>
        </div>
      ) : null}
      <div className="flex flex-col items-end gap-1">
        <span className="font-bold whitespace-nowrap">{formatearCOP(o.monto_esperado)}</span>
        {estado === "parcial" ? (
          <span className="text-xs whitespace-nowrap text-muted-foreground">faltan {formatearCOP(o.pendiente)}</span>
        ) : (
          <Badge variant={info.variante} className="hidden sm:inline-flex">
            {info.simbolo} {etiquetaEstado}
          </Badge>
        )}
        <Badge variant={info.variante} className={cn("sm:hidden", estado === "parcial" && "hidden")}>
          {info.simbolo} {etiquetaEstado}
        </Badge>
      </div>
      <div className="flex items-center gap-1">
        {puedePagar && esTarjeta ? (
          <Button size="sm" asChild className="min-w-18">
            <Link href={`/tarjetas/${o.tarjeta_id}?pagar=1`}>Pagar</Link>
          </Button>
        ) : puedePagar && esDeuda ? (
          <Button size="sm" asChild className="min-w-18">
            <Link href={`/deudas/${o.deuda_id}?pagar=1&ob=${o.id}`}>Pagar</Link>
          </Button>
        ) : puedePagar ? (
          <Button size="sm" onClick={() => onAccion({ tipo: "pagar", ob: o })} className="min-w-18">
            {o.es_ingreso ? "Recibir" : "Pagar"}
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Más acciones para ${o.nombre}`}
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <EllipsisVerticalIcon className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {esTarjeta ? (
              <DropdownMenuItem asChild>
                <Link href={`/tarjetas/${o.tarjeta_id}?tab=extractos`}>
                  <CreditCardIcon /> Ver tarjeta y extracto
                </Link>
              </DropdownMenuItem>
            ) : null}
            {esDeuda ? (
              <DropdownMenuItem asChild>
                <Link href={`/deudas/${o.deuda_id}`}>
                  <LandmarkIcon /> Ver deuda
                </Link>
              </DropdownMenuItem>
            ) : null}
            {!cerrado && !o.resolucion && !esTarjeta ? (
              <DropdownMenuItem onSelect={() => onAccion({ tipo: "ajustar", ob: o })}>
                <PencilIcon /> Ajustar monto o fecha
              </DropdownMenuItem>
            ) : null}
            {!cerrado && !o.resolucion && !pagada ? (
              <DropdownMenuItem onSelect={() => onAccion({ tipo: "omitir", ob: o })}>
                <SkipForwardIcon /> Omitir este mes
              </DropdownMenuItem>
            ) : null}
            {!cerrado && o.resolucion === "omitida" ? (
              <DropdownMenuItem onSelect={() => ejecutar(() => restaurarObligacion(o.id))}>
                <RotateCcwIcon /> Restaurar
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem asChild>
              <Link href={`/movimientos?obligacion=${o.id}`}>
                <ListIcon /> Ver pagos ({o.n_pagos})
              </Link>
            </DropdownMenuItem>
            {!cerrado && esPuntual && o.n_pagos === 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onSelect={() => ejecutar(() => eliminarObligacionPuntual(o.id))}
                >
                  <Trash2Icon /> Eliminar
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
