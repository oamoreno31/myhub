"use client";

import {
  ArrowDownLeftIcon,
  ArrowLeftRightIcon,
  ArrowUpRightIcon,
  BuildingIcon,
  CreditCardIcon,
  HandCoinsIcon,
  LandmarkIcon,
  LockIcon,
  PiggyBankIcon,
  Trash2Icon,
  WalletIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { eliminarMovimiento } from "@/actions/movimientos";
import { HojaFormulario } from "@/components/formularios/hoja-formulario";
import { type CuentaOpcion, MovimientoForm } from "@/components/formularios/movimiento-form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CategoriaBasica } from "@/lib/categorias";
import { formatearCOP } from "@/lib/domain/dinero";
import { cn } from "@/lib/utils";

export type MovimientoUI = {
  id: string;
  /** Solo ingreso, gasto y transferencia se editan aquí; el resto, en su módulo (tarjetas o deudas). */
  tipo:
    | "ingreso"
    | "gasto"
    | "transferencia"
    | "pago_tc"
    | "compra_tc"
    | "pago_deuda"
    | "aporte"
    | "desembolso_deuda"
    | "prestamo_otorgado"
    | "recuperacion_prestamo"
    | "reembolso_devtopia";
  fecha: string;
  monto: number;
  cuenta_id: string;
  cuenta_nombre: string;
  cuenta_destino_id: string | null;
  cuenta_destino_nombre: string | null;
  categoria_id: string | null;
  categoria_nombre: string | null;
  categoria_padre_nombre: string | null;
  obligacion_periodo_id: string | null;
  obligacion_nombre: string | null;
  descripcion: string | null;
  comercio: string | null;
  reembolsable: boolean;
  es_recuperacion: boolean;
  cerrado: boolean;
  tarjeta_id?: string | null;
  deuda_id?: string | null;
  prestamo_id?: string | null;
  reembolsado?: boolean;
  num_cuotas?: number;
  created_at: string;
};

/** Entra dinero (y se muestra con "+"). */
const ENTRADAS = new Set<MovimientoUI["tipo"]>([
  "ingreso",
  "recuperacion_prestamo",
  "desembolso_deuda",
  "reembolso_devtopia",
]);
/** Consumo del mes (se muestra con "−"). */
const CONSUMO = new Set<MovimientoUI["tipo"]>(["gasto", "compra_tc"]);

/** Dónde se edita un movimiento creado por un módulo. */
function destino(m: MovimientoUI): string | null {
  switch (m.tipo) {
    case "pago_tc":
    case "compra_tc":
      return m.tarjeta_id ? `/tarjetas/${m.tarjeta_id}?tab=${m.tipo === "pago_tc" ? "pagos" : "compras"}` : null;
    case "pago_deuda":
    case "aporte":
    case "desembolso_deuda":
      return m.deuda_id ? `/deudas/${m.deuda_id}?tab=pagos` : "/deudas";
    case "prestamo_otorgado":
    case "recuperacion_prestamo":
      return m.prestamo_id ? `/deudas?prestamo=${m.prestamo_id}` : "/deudas?tab=me-deben";
    case "reembolso_devtopia":
      return "/deudas?tab=devtopia";
    default:
      return null;
  }
}

const ETIQUETA_MODULO: Partial<Record<MovimientoUI["tipo"], string>> = {
  pago_tc: "Pago tarjeta",
  pago_deuda: "Cuota préstamo",
  aporte: "Aporte",
  desembolso_deuda: "Desembolso",
  prestamo_otorgado: "Préstamo hecho",
  reembolso_devtopia: "Reembolso Devtopia",
};

type MovimientoEditableUI = MovimientoUI & { tipo: "ingreso" | "gasto" | "transferencia" };
const esEditable = (m: MovimientoUI): m is MovimientoEditableUI =>
  m.tipo === "ingreso" || m.tipo === "gasto" || m.tipo === "transferencia";

const ICONOS = {
  ingreso: ArrowDownLeftIcon,
  gasto: ArrowUpRightIcon,
  transferencia: ArrowLeftRightIcon,
  pago_tc: WalletIcon,
  compra_tc: CreditCardIcon,
  pago_deuda: LandmarkIcon,
  aporte: PiggyBankIcon,
  desembolso_deuda: ArrowDownLeftIcon,
  prestamo_otorgado: HandCoinsIcon,
  recuperacion_prestamo: HandCoinsIcon,
  reembolso_devtopia: BuildingIcon,
};

function fechaLarga(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  const texto = new Date(a, m - 1, d).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function ListaMovimientos({
  movimientos,
  cuentas,
  categorias,
  hoy,
  truncado,
}: {
  movimientos: MovimientoUI[];
  cuentas: CuentaOpcion[];
  categorias: CategoriaBasica[];
  hoy: string;
  truncado: boolean;
}) {
  const [editando, setEditando] = useState<MovimientoEditableUI | null>(null);
  const router = useRouter();
  const abrir = (m: MovimientoUI) => {
    if (m.cerrado) return;
    if (esEditable(m)) setEditando(m);
    else {
      const ruta = destino(m);
      if (ruta) router.push(ruta);
    }
  };

  if (movimientos.length === 0) {
    return (
      <Card className="items-center py-10 text-center">
        <span className="font-bold">No hay movimientos con estos filtros</span>
        <span className="text-sm text-muted-foreground">
          Usa el botón &quot;Registrar&quot; para anotar tu primer gasto o ingreso.
        </span>
      </Card>
    );
  }

  const porDia = new Map<string, MovimientoUI[]>();
  for (const m of movimientos) porDia.set(m.fecha, [...(porDia.get(m.fecha) ?? []), m]);

  // Las cuentas archivadas siguen apareciendo al editar movimientos antiguos.
  const cuentasEdicion = (m: MovimientoUI) => {
    const lista = [...cuentas];
    if (!lista.some((c) => c.id === m.cuenta_id))
      lista.push({ id: m.cuenta_id, nombre: m.cuenta_nombre, tipo: "", saldo: 0 });
    if (m.cuenta_destino_id && !lista.some((c) => c.id === m.cuenta_destino_id))
      lista.push({ id: m.cuenta_destino_id, nombre: m.cuenta_destino_nombre ?? "", tipo: "", saldo: 0 });
    return lista;
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        {[...porDia.entries()].map(([fecha, lista]) => {
          const totalDia = lista.reduce(
            (a, m) =>
              a +
              (m.tipo === "ingreso" || m.tipo === "recuperacion_prestamo" || m.tipo === "reembolso_devtopia"
                ? m.monto
                : CONSUMO.has(m.tipo)
                  ? -m.monto
                  : 0),
            0,
          );
          return (
            <Card key={fecha} className="gap-0 py-3">
              <div className="flex items-center justify-between pb-2">
                <h2 className="text-sm font-bold">{fechaLarga(fecha)}</h2>
                <span className="text-xs font-semibold text-muted-foreground">
                  {formatearCOP(totalDia, { signo: true })}
                </span>
              </div>
              <ul>
                {lista.map((m) => {
                  const Icono = ICONOS[m.tipo];
                  const titulo =
                    m.descripcion ??
                    (m.tipo === "transferencia"
                      ? `${m.cuenta_nombre} → ${m.cuenta_destino_nombre}`
                      : (m.obligacion_nombre ?? m.categoria_nombre ?? "Movimiento"));
                  const sub = [
                    m.tipo === "pago_tc" || m.tipo === "aporte"
                      ? `${m.cuenta_nombre} → ${m.cuenta_destino_nombre}`
                      : m.tipo === "transferencia"
                        ? m.descripcion
                          ? `${m.cuenta_nombre} → ${m.cuenta_destino_nombre}`
                          : "Transferencia"
                        : m.categoria_padre_nombre
                          ? `${m.categoria_padre_nombre} › ${m.categoria_nombre}`
                          : m.categoria_nombre,
                    m.tipo !== "transferencia" && m.tipo !== "pago_tc" && m.tipo !== "aporte" ? m.cuenta_nombre : null,
                    m.comercio,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li key={m.id} className="border-t">
                      <button
                        type="button"
                        onClick={() => abrir(m)}
                        disabled={m.cerrado}
                        aria-label={
                          m.cerrado
                            ? `${titulo} (mes cerrado)`
                            : esEditable(m)
                              ? `Editar ${titulo}`
                              : `Ver ${titulo} en la tarjeta`
                        }
                        className="flex w-full items-center gap-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                      >
                        <span
                          className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-lg",
                            ENTRADAS.has(m.tipo)
                              ? "bg-success-soft text-success"
                              : CONSUMO.has(m.tipo)
                                ? "bg-muted text-foreground"
                                : "bg-info-soft text-info",
                          )}
                        >
                          <Icono className="size-4" aria-hidden="true" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-semibold">{titulo}</span>
                          <span className="truncate text-xs text-muted-foreground">{sub}</span>
                        </span>
                        <span className="flex flex-col items-end gap-1">
                          <span className={cn("font-bold whitespace-nowrap", ENTRADAS.has(m.tipo) && "text-success")}>
                            {ENTRADAS.has(m.tipo) || m.monto < 0 ? "+ " : CONSUMO.has(m.tipo) ? "− " : ""}
                            {formatearCOP(Math.abs(m.monto))}
                          </span>
                          <span className="flex gap-1">
                            {m.tipo === "compra_tc" ? (
                              <Badge variant="info">
                                Tarjeta{m.num_cuotas && m.num_cuotas > 1 ? ` · ${m.num_cuotas} cuotas` : ""}
                              </Badge>
                            ) : null}
                            {ETIQUETA_MODULO[m.tipo] ? <Badge variant="info">{ETIQUETA_MODULO[m.tipo]}</Badge> : null}
                            {m.obligacion_periodo_id && m.tipo !== "pago_tc" ? (
                              <Badge variant="success">Obligación</Badge>
                            ) : null}
                            {m.es_recuperacion ? <Badge variant="info">Recuperación</Badge> : null}
                            {m.reembolsable ? (
                              m.reembolsado ? (
                                <Badge variant="success">✓ Reembolsado</Badge>
                              ) : (
                                <Badge variant="warning">Reembolsable</Badge>
                              )
                            ) : null}
                            {m.cerrado ? (
                              <LockIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                            ) : null}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
        {truncado ? (
          <p className="text-center text-xs text-muted-foreground">
            Se muestran los 500 más recientes. Usa los filtros para acotar.
          </p>
        ) : null}
      </div>

      <HojaFormulario titulo="Editar movimiento" open={editando !== null} onOpenChange={(v) => !v && setEditando(null)}>
        {(cerrar) =>
          editando ? (
            <div className="flex flex-col gap-4">
              <MovimientoForm
                cuentas={cuentasEdicion(editando)}
                categorias={categorias}
                hoy={hoy}
                permitirCambiarTipo={false}
                movimiento={{ ...editando }}
                onGuardado={cerrar}
              />
              <BotonEliminar id={editando.id} onEliminado={cerrar} />
            </div>
          ) : null
        }
      </HojaFormulario>
    </>
  );
}

function BotonEliminar({ id, onEliminado }: { id: string; onEliminado: () => void }) {
  const [pendiente, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="text-destructive" disabled={pendiente}>
          <Trash2Icon /> Eliminar movimiento
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>¿Eliminar este movimiento?</AlertDialogTitle>
        <AlertDialogDescription>
          Se borra de forma permanente. Si era el pago de una obligación, ésta vuelve a quedar pendiente.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            destructivo
            onClick={() =>
              startTransition(async () => {
                const r = await eliminarMovimiento(id);
                if (r.ok) {
                  toast.success(r.mensaje);
                  onEliminado();
                } else toast.error(r.error);
              })
            }
          >
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
