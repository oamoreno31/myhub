"use client";

import {
  ArrowDownLeftIcon,
  ArrowLeftIcon,
  ArrowLeftRightIcon,
  ArrowUpRightIcon,
  CalendarCheckIcon,
  CreditCardIcon,
  HandCoinsIcon,
  PlusIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  type CuentaOpcion,
  MovimientoForm,
  type ObligacionParaPago,
  type TipoMovimiento,
} from "@/components/formularios/movimiento-form";
import { AbonoForm, type PrestamoParaAbono } from "@/components/deudas/formularios";
import { CompraForm, type TarjetaOpcion } from "@/components/tarjetas/formularios";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { CategoriaBasica } from "@/lib/categorias";
import { formatearCOP } from "@/lib/domain/dinero";
import { ESTADOS, estadoObligacion, etiquetaRelativa } from "@/lib/domain/obligaciones";

export type PendienteRapido = ObligacionParaPago & {
  fecha_vencimiento: string;
  tarjeta_id?: string | null;
  deuda_id?: string | null;
};

type Modo =
  | { tipo: "menu" }
  | { tipo: "form"; mov: TipoMovimiento }
  | { tipo: "lista-pagos" }
  | { tipo: "compra-tc" }
  | { tipo: "abono" }
  | { tipo: "pago"; ob: PendienteRapido };

const OPCIONES = [
  { clave: "gasto", etiqueta: "Gasto", detalle: "Pagado desde una cuenta", icono: ArrowUpRightIcon },
  { clave: "ingreso", etiqueta: "Ingreso", detalle: "Sueldo, recuperación u otro", icono: ArrowDownLeftIcon },
  { clave: "pago", etiqueta: "Pago de obligación", detalle: "Del checklist del mes", icono: CalendarCheckIcon },
  { clave: "transferencia", etiqueta: "Transferencia", detalle: "Entre tus cuentas", icono: ArrowLeftRightIcon },
  {
    clave: "compra-tc",
    etiqueta: "Compra con tarjeta",
    detalle: "Suma a la deuda de la tarjeta",
    icono: CreditCardIcon,
  },
  { clave: "abono", etiqueta: "Me pagaron", detalle: "Abono de un préstamo que hice", icono: HandCoinsIcon },
] as const;

/** Botón "+" de registro rápido: gasto, ingreso, pago, transferencia, compra con tarjeta o abono recibido. */
export function RegistroRapido({
  variante,
  cuentas,
  categorias,
  pendientes,
  tarjetas,
  prestamos,
  hoy,
}: {
  variante: "encabezado" | "flotante";
  cuentas: CuentaOpcion[];
  categorias: CategoriaBasica[];
  pendientes: PendienteRapido[];
  tarjetas: TarjetaOpcion[];
  prestamos: PrestamoParaAbono[];
  hoy: string;
}) {
  const [abierta, setAbierta] = useState(false);
  const [modo, setModo] = useState<Modo>({ tipo: "menu" });

  const cambiarAbierta = (v: boolean) => {
    setAbierta(v);
    if (!v) setModo({ tipo: "menu" });
  };
  const cerrar = () => cambiarAbierta(false);

  const titulo =
    modo.tipo === "menu"
      ? "Registrar"
      : modo.tipo === "lista-pagos"
        ? "¿Qué pagaste?"
        : modo.tipo === "compra-tc"
          ? "Compra con tarjeta"
          : modo.tipo === "abono"
            ? "Abono de un préstamo"
            : modo.tipo === "pago"
              ? modo.ob.es_ingreso
                ? "Registrar ingreso"
                : "Registrar pago"
              : modo.mov === "gasto"
                ? "Nuevo gasto"
                : modo.mov === "ingreso"
                  ? "Nuevo ingreso"
                  : "Transferencia";

  return (
    <Sheet open={abierta} onOpenChange={cambiarAbierta}>
      <SheetTrigger asChild>
        {variante === "encabezado" ? (
          <Button className="hidden lg:inline-flex">
            <PlusIcon /> Registrar
          </Button>
        ) : (
          <button
            type="button"
            aria-label="Registrar"
            className="-mt-7 flex size-15 items-center justify-center justify-self-center rounded-2xl bg-primary text-primary-foreground shadow-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <PlusIcon className="size-7" />
          </button>
        )}
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <div className="flex items-center gap-2">
            {modo.tipo !== "menu" ? (
              <button
                type="button"
                aria-label="Volver"
                onClick={() => setModo(modo.tipo === "pago" ? { tipo: "lista-pagos" } : { tipo: "menu" })}
                className="flex size-9 items-center justify-center rounded-lg outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowLeftIcon className="size-5" />
              </button>
            ) : null}
            <SheetTitle>{titulo}</SheetTitle>
          </div>
          <SheetDescription className={modo.tipo === "menu" ? undefined : "sr-only"}>
            {modo.tipo === "menu" ? "¿Qué quieres anotar?" : titulo}
          </SheetDescription>
        </SheetHeader>

        {modo.tipo === "menu" ? (
          <div className="grid grid-cols-2 gap-3">
            {OPCIONES.map((op) => {
              const Icono = op.icono;
              return (
                <button
                  key={op.clave}
                  type="button"
                  onClick={() =>
                    setModo(
                      op.clave === "pago"
                        ? { tipo: "lista-pagos" }
                        : op.clave === "compra-tc"
                          ? { tipo: "compra-tc" }
                          : op.clave === "abono"
                            ? { tipo: "abono" }
                            : { tipo: "form", mov: op.clave },
                    )
                  }
                  className={`flex min-h-28 flex-col items-start gap-2 rounded-2xl border bg-card p-4 text-left outline-none hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50`}
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Icono className="size-5" aria-hidden="true" />
                  </span>
                  <span className="font-bold">{op.etiqueta}</span>
                  <span className="text-xs text-muted-foreground">{op.detalle}</span>
                  {op.clave === "pago" && pendientes.length > 0 ? (
                    <Badge variant="warning">{pendientes.length} pendientes</Badge>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {modo.tipo === "form" ? (
          <MovimientoForm
            cuentas={cuentas}
            categorias={categorias}
            hoy={hoy}
            tipoInicial={modo.mov}
            onGuardado={cerrar}
          />
        ) : null}

        {modo.tipo === "compra-tc" ? (
          tarjetas.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-xl bg-muted/70 px-4 py-4 text-sm">
              <span>Primero crea tu tarjeta con su cupo y días de corte y pago.</span>
              <Button asChild onClick={cerrar}>
                <Link href="/tarjetas">Ir a Tarjetas</Link>
              </Button>
            </div>
          ) : (
            <CompraForm tarjetas={tarjetas} categorias={categorias} cuentas={cuentas} hoy={hoy} onGuardado={cerrar} />
          )
        ) : null}

        {modo.tipo === "abono" ? (
          <AbonoForm prestamos={prestamos} cuentas={cuentas} hoy={hoy} onGuardado={cerrar} />
        ) : null}

        {modo.tipo === "lista-pagos" ? (
          pendientes.length === 0 ? (
            <p className="rounded-xl bg-success-soft px-4 py-6 text-center text-sm font-semibold text-success">
              ✓ No tienes obligaciones pendientes este mes.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pendientes.map((o) => {
                const estado = ESTADOS[estadoObligacion({ ...o, resolucion: null }, hoy)];
                return (
                  <li key={o.id}>
                    <FilaPendiente
                      href={
                        o.tarjeta_id
                          ? `/tarjetas/${o.tarjeta_id}?pagar=1`
                          : o.deuda_id
                            ? `/deudas/${o.deuda_id}?pagar=1&ob=${o.id}`
                            : undefined
                      }
                      onClick={o.tarjeta_id || o.deuda_id ? cerrar : () => setModo({ tipo: "pago", ob: o })}
                    >
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-bold">{o.nombre}</span>
                        <span className="text-xs text-muted-foreground">
                          {o.es_ingreso ? "Llega" : "Vence"} {etiquetaRelativa(o.fecha_vencimiento, hoy)}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-bold">{formatearCOP(o.pendiente || o.monto_esperado)}</span>
                        <Badge variant={estado.variante}>
                          {estado.simbolo} {estado.etiqueta}
                        </Badge>
                      </div>
                    </FilaPendiente>
                  </li>
                );
              })}
            </ul>
          )
        ) : null}

        {modo.tipo === "pago" ? (
          <MovimientoForm
            cuentas={cuentas}
            categorias={categorias}
            hoy={hoy}
            obligacion={modo.ob}
            onGuardado={cerrar}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

const CLASE_FILA =
  "flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left outline-none hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Pendiente del checklist: los pagos de tarjeta llevan a su pantalla (necesitan el extracto). */
function FilaPendiente({ href, onClick, children }: { href?: string; onClick: () => void; children: React.ReactNode }) {
  return href ? (
    <Link href={href} onClick={onClick} className={CLASE_FILA}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={CLASE_FILA}>
      {children}
    </button>
  );
}
