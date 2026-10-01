"use client";

import {
  ArchiveIcon,
  BuildingIcon,
  HandCoinsIcon,
  LandmarkIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  UserXIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  eliminarAbono,
  eliminarPrestamo,
  eliminarReembolso,
  quitarCastigo,
  registrarReembolso,
} from "@/actions/deudas";
import { BotonConfirmar } from "@/components/formularios/boton-confirmar";
import { HojaFormulario } from "@/components/formularios/hoja-formulario";
import { MontoInput } from "@/components/formularios/monto-input";
import { BotonGuardar, Linea, VistaPrevia } from "@/components/formularios/vista-previa";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ariaCampo, Campo } from "@/components/ui/campo";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAccion } from "@/hooks/use-accion";
import type { EstadoAccion } from "@/lib/acciones";
import { cuentaPorDefecto } from "@/lib/cuentas";
import type { DeudaResumen, PrestamoUI, ReembolsoPendiente } from "@/lib/deudas";
import { aCentavos, formatearCOP } from "@/lib/domain/dinero";
import {
  ESTADOS_PRESTAMO,
  ETIQUETA_TIPO_DEUDA,
  estadoPrestamo,
  proximaCuota,
  proyectarDeuda,
} from "@/lib/domain/deudas";
import { etiquetaRelativa } from "@/lib/domain/obligaciones";
import { cn } from "@/lib/utils";
import { AbonoForm, type AbonoEditable, CastigoForm, type CuentaSimple, DeudaForm, PrestamoForm } from "./formularios";

export type Pestana = "debo" | "me-deben" | "devtopia";

type Reembolsos = {
  pendientes: ReembolsoPendiente[];
  recibidos: {
    id: string;
    fecha: string;
    monto: number;
    descripcion: string | null;
    cuenta_nombre: string;
    n_items: number;
    total_items: number;
    cerrado: boolean;
  }[];
};

type Hoja =
  | { tipo: "deuda" }
  | { tipo: "prestamo"; editar?: PrestamoUI }
  | { tipo: "detalle-prestamo"; id: string }
  | { tipo: "abono"; prestamoId: string; abono?: AbonoEditable }
  | { tipo: "castigo"; prestamoId: string }
  | null;

export const fechaCorta = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" });
const fechaMedia = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export function PantallaDeudas({
  deudas,
  prestamos,
  reembolsos,
  cuentas,
  hoy,
  inicial,
}: {
  deudas: DeudaResumen[];
  prestamos: PrestamoUI[];
  reembolsos: Reembolsos;
  cuentas: CuentaSimple[];
  hoy: string;
  inicial: { pestana?: Pestana; prestamo?: string; hoja?: "deuda" | "prestamo" | "abono" };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pestana, setPestana] = useState<Pestana>(inicial.pestana ?? "debo");
  const [hoja, setHoja] = useState<Hoja>(() => {
    if (inicial.prestamo && prestamos.some((p) => p.id === inicial.prestamo))
      return { tipo: "detalle-prestamo", id: inicial.prestamo };
    if (inicial.hoja === "deuda") return { tipo: "deuda" };
    if (inicial.hoja === "prestamo") return { tipo: "prestamo" };
    return null;
  });
  const [pendiente, startTransition] = useTransition();
  const cerrarHoja = () => setHoja(null);
  const ejecutar = (fn: () => Promise<EstadoAccion>, despues?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.mensaje);
        despues?.();
      } else toast.error(r.error);
    });

  const cambiarPestana = (p: Pestana) => {
    setPestana(p);
    router.replace(`${pathname}?tab=${p}`, { scroll: false });
  };

  const activas = deudas.filter((d) => d.activa);
  const archivadas = deudas.filter((d) => !d.activa);
  const totalDeuda = activas.reduce((a, d) => a + d.saldo_capital, 0);
  const cuotaMensual = activas.reduce((a, d) => a + d.cuota_total, 0);
  const interesesAnio = deudas.reduce((a, d) => a + d.intereses_anio, 0);

  const conEstado = prestamos.map((p) => ({ ...p, estado: estadoPrestamo(p, hoy) }));
  const porCobrar = conEstado.filter((p) => p.estado === "vigente" || p.estado === "vencido");
  const totalPorCobrar = porCobrar.reduce((a, p) => a + p.saldo, 0);
  const vencidos = conEstado.filter((p) => p.estado === "vencido").length;
  const totalDevtopia = reembolsos.pendientes.reduce((a, p) => a + p.monto, 0);

  const prestamoActual =
    hoja && "id" in hoja
      ? conEstado.find((p) => p.id === hoja.id)
      : hoja && "prestamoId" in hoja
        ? conEstado.find((p) => p.id === hoja.prestamoId)
        : undefined;
  const paraAbono = (p: PrestamoUI) => ({ id: p.id, deudor: p.deudor, saldo: p.saldo });

  const tituloHoja =
    hoja?.tipo === "deuda"
      ? "Nueva deuda"
      : hoja?.tipo === "prestamo"
        ? hoja.editar
          ? "Editar préstamo"
          : "Prestar plata"
        : hoja?.tipo === "detalle-prestamo"
          ? `Préstamo a ${prestamoActual?.deudor ?? ""}`
          : hoja?.tipo === "abono"
            ? hoja.abono
              ? "Editar abono"
              : `Abono de ${prestamoActual?.deudor ?? ""}`
            : hoja?.tipo === "castigo"
              ? "Castigar préstamo"
              : "";

  const PESTANAS: { clave: Pestana; etiqueta: string; conteo?: number }[] = [
    { clave: "debo", etiqueta: "Lo que debo", conteo: activas.length },
    { clave: "me-deben", etiqueta: "Me deben", conteo: porCobrar.length },
    { clave: "devtopia", etiqueta: "Devtopia", conteo: reembolsos.pendientes.length },
  ];

  return (
    <div className={cn("flex flex-col gap-6", pendiente && "opacity-70")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-semibold">Deudas y préstamos</h1>
          <p className="text-sm text-muted-foreground">
            Lo que debes, lo que te deben y lo que Devtopia te tiene que reembolsar.
          </p>
        </div>
        {pestana === "debo" ? (
          <Button onClick={() => setHoja({ tipo: "deuda" })}>
            <PlusIcon /> Nueva deuda
          </Button>
        ) : pestana === "me-deben" ? (
          <Button onClick={() => setHoja({ tipo: "prestamo" })}>
            <PlusIcon /> Prestar
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Resumen
          etiqueta="Debes (capital)"
          valor={formatearCOP(totalDeuda)}
          detalle={`${formatearCOP(cuotaMensual)} al mes`}
        />
        <Resumen
          etiqueta="Te deben"
          valor={formatearCOP(totalPorCobrar)}
          tono={vencidos > 0 ? "text-destructive" : "text-success"}
          detalle={vencidos > 0 ? `! ${vencidos} vencido${vencidos > 1 ? "s" : ""}` : `${porCobrar.length} préstamo(s)`}
        />
        <Resumen
          etiqueta="Devtopia te debe"
          valor={formatearCOP(totalDevtopia)}
          tono={totalDevtopia > 0 ? "text-warning" : undefined}
          detalle={`${reembolsos.pendientes.length} gasto(s) por cobrar`}
        />
      </div>

      <div
        role="tablist"
        aria-label="Secciones de deudas"
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
            onClick={() => cambiarPestana(p.clave)}
            className={cn(
              "h-9 min-w-fit flex-1 rounded-lg px-3 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring",
              pestana === p.clave ? "bg-card shadow-sm" : "text-muted-foreground",
            )}
          >
            {p.etiqueta}
            {p.conteo ? <span className="ml-1 text-xs opacity-70">{p.conteo}</span> : null}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${pestana}`} aria-labelledby={`tab-${pestana}`} className="flex flex-col gap-4">
        {pestana === "debo" ? (
          <>
            {activas.length === 0 ? (
              <Card className="items-center gap-3 py-10 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                  <LandmarkIcon className="size-6" aria-hidden="true" />
                </span>
                <span className="font-bold">No tienes deudas registradas</span>
                <span className="max-w-md text-sm text-muted-foreground">
                  Registra tus préstamos (banco, libranza, cooperativa o de una persona) para ver cuánto debes, cuánto
                  pagas en intereses y cuándo terminas. Las tarjetas de crédito van en su propio módulo.
                </span>
                <Button onClick={() => setHoja({ tipo: "deuda" })}>
                  <PlusIcon /> Registrar una deuda
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {activas.map((d) => (
                  <FichaDeuda key={d.id} d={d} hoy={hoy} />
                ))}
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Intereses y seguros pagados en {hoy.slice(0, 4)}: <strong>{formatearCOP(interesesAnio)}</strong>. Las
              tarjetas de crédito están en{" "}
              <Link href="/tarjetas" className="font-semibold text-primary hover:underline">
                Tarjetas
              </Link>
              .
            </p>
            {archivadas.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h2 className="text-xs font-extrabold tracking-wider text-muted-foreground uppercase">
                  Pagadas o archivadas
                </h2>
                <ul className="flex flex-col gap-2">
                  {archivadas.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/deudas/${d.id}`}
                        className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm outline-none hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        <ArchiveIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                        <span className="flex-1 font-semibold">{d.nombre}</span>
                        {d.saldo_capital <= 0 ? (
                          <Badge variant="success">✓ Pagada</Badge>
                        ) : (
                          <span>{formatearCOP(d.saldo_capital)}</span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}

        {pestana === "me-deben" ? (
          conEstado.length === 0 ? (
            <Card className="items-center gap-3 py-10 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                <HandCoinsIcon className="size-6" aria-hidden="true" />
              </span>
              <span className="font-bold">Nadie te debe plata</span>
              <span className="max-w-md text-sm text-muted-foreground">
                Cuando le prestes a alguien, regístralo aquí: sale de tu cuenta sin contar como gasto, y cada abono
                entra como recuperación.
              </span>
              <Button onClick={() => setHoja({ tipo: "prestamo" })}>
                <PlusIcon /> Registrar un préstamo
              </Button>
            </Card>
          ) : (
            <Card className="gap-0 py-2">
              <ul>
                {conEstado.map((p) => {
                  const e = ESTADOS_PRESTAMO[p.estado];
                  return (
                    <li key={p.id} className="border-t first:border-t-0">
                      <button
                        type="button"
                        onClick={() => setHoja({ tipo: "detalle-prestamo", id: p.id })}
                        aria-label={`Ver préstamo a ${p.deudor}`}
                        className="flex w-full items-center gap-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-semibold">{p.deudor}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {fechaMedia(p.fecha)} · prestaste {formatearCOP(p.monto)}
                            {p.fecha_esperada && p.estado !== "pagado"
                              ? ` · quedó para el ${fechaCorta(p.fecha_esperada)}`
                              : ""}
                          </span>
                        </span>
                        <span className="flex flex-col items-end gap-1">
                          <span className="font-bold whitespace-nowrap">{formatearCOP(p.saldo)}</span>
                          <Badge variant={e.variante}>
                            {e.simbolo} {e.etiqueta}
                          </Badge>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )
        ) : null}

        {pestana === "devtopia" ? (
          <PanelDevtopia reembolsos={reembolsos} cuentas={cuentas} hoy={hoy} ejecutar={ejecutar} />
        ) : null}
      </div>

      <HojaFormulario titulo={tituloHoja} open={hoja !== null} onOpenChange={(v) => !v && cerrarHoja()}>
        {() => (
          <>
            {hoja?.tipo === "deuda" ? (
              <DeudaForm
                cuentas={cuentas}
                hoy={hoy}
                onGuardado={(id) => {
                  cerrarHoja();
                  if (id) router.push(`/deudas/${id}`);
                }}
              />
            ) : null}
            {hoja?.tipo === "prestamo" ? (
              <PrestamoForm prestamo={hoja.editar} cuentas={cuentas} hoy={hoy} onGuardado={cerrarHoja} />
            ) : null}
            {hoja?.tipo === "detalle-prestamo" && prestamoActual ? (
              <DetallePrestamo
                p={prestamoActual}
                onAbonar={() => setHoja({ tipo: "abono", prestamoId: prestamoActual.id })}
                onEditarAbono={(a) => setHoja({ tipo: "abono", prestamoId: prestamoActual.id, abono: a })}
                onEditar={() => setHoja({ tipo: "prestamo", editar: prestamoActual })}
                onCastigar={() => setHoja({ tipo: "castigo", prestamoId: prestamoActual.id })}
                onQuitarCastigo={() => ejecutar(() => quitarCastigo(prestamoActual.id))}
                onEliminar={() => ejecutar(() => eliminarPrestamo(prestamoActual.id), cerrarHoja)}
                onEliminarAbono={(id) => ejecutar(() => eliminarAbono(id))}
              />
            ) : null}
            {hoja?.tipo === "abono" && prestamoActual ? (
              <AbonoForm
                prestamos={[paraAbono(prestamoActual)]}
                prestamoId={prestamoActual.id}
                abono={hoja.abono}
                cuentas={cuentas}
                hoy={hoy}
                onGuardado={() => setHoja({ tipo: "detalle-prestamo", id: prestamoActual.id })}
              />
            ) : null}
            {hoja?.tipo === "castigo" && prestamoActual ? (
              <CastigoForm prestamo={paraAbono(prestamoActual)} onGuardado={cerrarHoja} />
            ) : null}
          </>
        )}
      </HojaFormulario>
    </div>
  );
}

function Resumen({
  etiqueta,
  valor,
  detalle,
  tono,
}: {
  etiqueta: string;
  valor: string;
  detalle?: ReactNode;
  tono?: string;
}) {
  return (
    <Card className="gap-1 p-4">
      <span className="text-xs font-semibold text-muted-foreground">{etiqueta}</span>
      <span className={cn("text-xl font-bold", tono)}>{valor}</span>
      {detalle ? <span className="text-xs text-muted-foreground">{detalle}</span> : null}
    </Card>
  );
}

function FichaDeuda({ d, hoy }: { d: DeudaResumen; hoy: string }) {
  const proxima = proximaCuota(hoy, d.dia_pago);
  const p =
    d.cuota > 0
      ? proyectarDeuda({
          saldo: d.saldo_capital,
          tasaEA: d.tasa_ea,
          cuota: d.cuota,
          primerPeriodo: proxima.slice(0, 7),
          diaPago: d.dia_pago,
        })
      : null;
  const avance = Math.round(Math.min(Math.max(d.avance, 0), 1) * 100);
  return (
    <Link
      href={`/deudas/${d.id}`}
      className="flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-5 outline-none hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          {d.tipo === "cooperativa" ? (
            <BuildingIcon className="size-5" aria-hidden="true" />
          ) : (
            <LandmarkIcon className="size-5" aria-hidden="true" />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-bold">{d.nombre}</span>
          <span className="truncate text-xs text-muted-foreground">
            {[
              ETIQUETA_TIPO_DEUDA[d.tipo],
              d.acreedor,
              d.tasa_ea > 0
                ? `${(Math.round(d.tasa_ea * 10000) / 100).toLocaleString("es-CO")} % E.A.`
                : "sin intereses",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-lg font-bold">{formatearCOP(d.saldo_capital)}</span>
          <span className="text-xs text-muted-foreground">saldo</span>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <div
          className="h-2 overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-label="Avance de pago"
          aria-valuenow={avance}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-success" style={{ width: `${avance}%` }} />
        </div>
        <span className="text-xs font-semibold text-success">
          ✓ {avance} % pagado de {formatearCOP(d.monto_original)}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
        <span className="text-muted-foreground">
          {formatearCOP(d.cuota_total)}/mes · próxima {etiquetaRelativa(proxima, hoy)}
        </span>
        {p?.termina && p.fechaFin ? (
          <span className="text-xs text-muted-foreground">termina {fechaMedia(p.fechaFin)}</span>
        ) : p && !p.termina ? (
          <Badge variant="danger">! La cuota no cubre intereses</Badge>
        ) : null}
      </div>
    </Link>
  );
}

function DetallePrestamo({
  p,
  onAbonar,
  onEditarAbono,
  onEditar,
  onCastigar,
  onQuitarCastigo,
  onEliminar,
  onEliminarAbono,
}: {
  p: PrestamoUI & { estado: ReturnType<typeof estadoPrestamo> };
  onAbonar: () => void;
  onEditarAbono: (a: AbonoEditable) => void;
  onEditar: () => void;
  onCastigar: () => void;
  onQuitarCastigo: () => void;
  onEliminar: () => void;
  onEliminarAbono: (id: string) => void;
}) {
  const e = ESTADOS_PRESTAMO[p.estado];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-xl bg-muted/70 px-4 py-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold">{formatearCOP(p.saldo)} por cobrar</span>
          <Badge variant={e.variante}>
            {e.simbolo} {e.etiqueta}
          </Badge>
        </div>
        <Linea etiqueta="Le prestaste" valor={`${formatearCOP(p.monto)} el ${fechaMedia(p.fecha)}`} />
        <Linea etiqueta="Salió de" valor={p.cuenta_origen_nombre} />
        <Linea etiqueta="Te ha abonado" valor={formatearCOP(p.abonado)} />
        {p.fecha_esperada ? <Linea etiqueta="Quedó de pagar" valor={fechaMedia(p.fecha_esperada)} /> : null}
        {p.castigado_en ? (
          <Linea etiqueta="Castigado" valor={`${fechaMedia(p.castigado_en)} · ${p.motivo_castigo}`} />
        ) : null}
        {p.notas ? <span className="text-muted-foreground">{p.notas}</span> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {p.saldo > 0 ? (
          <Button onClick={onAbonar}>
            <HandCoinsIcon /> Registrar abono
          </Button>
        ) : null}
        {!p.cerrado ? (
          <Button variant="outline" onClick={onEditar}>
            <PencilIcon /> Editar
          </Button>
        ) : null}
        {p.saldo > 0 && !p.castigado_en ? (
          <Button variant="outline" onClick={onCastigar}>
            <UserXIcon /> Castigar
          </Button>
        ) : null}
        {p.castigado_en ? (
          <Button variant="outline" onClick={onQuitarCastigo}>
            <RotateCcwIcon /> Quitar castigo
          </Button>
        ) : null}
      </div>

      <section className="flex flex-col gap-1">
        <h3 className="text-xs font-extrabold tracking-wider text-muted-foreground uppercase">
          Abonos ({p.abonos.length})
        </h3>
        {p.abonos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no te ha abonado.</p>
        ) : (
          <ul>
            {p.abonos.map((a) => (
              <li key={a.id} className="flex items-center gap-2 border-t py-2 text-sm">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{fechaMedia(a.fecha)}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    a {a.cuenta_nombre}
                    {a.descripcion ? ` · ${a.descripcion}` : ""}
                  </span>
                </span>
                <strong className="text-success">+ {formatearCOP(a.monto)}</strong>
                {a.cerrado ? (
                  <LockIcon className="size-3.5 text-muted-foreground" aria-label="Mes cerrado" />
                ) : (
                  <>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Editar abono"
                      onClick={() =>
                        onEditarAbono({
                          id: a.id,
                          fecha: a.fecha,
                          monto: a.monto,
                          cuenta_id: a.cuenta_id,
                          descripcion: a.descripcion,
                        })
                      }
                    >
                      <PencilIcon />
                    </Button>
                    <BotonConfirmar
                      etiqueta={<span className="sr-only">Eliminar abono</span>}
                      titulo="¿Eliminar este abono?"
                      detalle="El saldo por cobrar vuelve a subir y se borra la entrada de dinero."
                      onConfirmar={() => onEliminarAbono(a.id)}
                    />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {p.n_abonos === 0 && !p.cerrado ? (
        <BotonConfirmar
          etiqueta="Eliminar préstamo"
          titulo={`¿Eliminar el préstamo a ${p.deudor}?`}
          detalle="Se borra también la salida de dinero de tu cuenta."
          onConfirmar={onEliminar}
        />
      ) : null}
    </div>
  );
}

function PanelDevtopia({
  reembolsos,
  cuentas,
  hoy,
  ejecutar,
}: {
  reembolsos: Reembolsos;
  cuentas: CuentaSimple[];
  hoy: string;
  ejecutar: (fn: () => Promise<EstadoAccion>) => void;
}) {
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set(reembolsos.pendientes.map((p) => p.id)));
  const [monto, setMonto] = useState<number | null>(null);
  const { onSubmit, pendiente, errores } = useAccion(registrarReembolso, () => {
    setSeleccion(new Set());
    setMonto(null);
  });
  const elegidos = reembolsos.pendientes.filter((p) => seleccion.has(p.id));
  const total = elegidos.reduce((a, p) => a + aCentavos(p.monto), 0) / 100;
  const recibido = monto ?? total;
  const diferencia = recibido - total;
  const clave = useMemo(() => [...seleccion].sort().join(","), [seleccion]);

  const alternar = (id: string) =>
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="flex flex-col gap-4">
      {reembolsos.pendientes.length === 0 ? (
        <Card className="items-center gap-2 py-8 text-center">
          <span className="font-bold">✓ Devtopia no te debe nada</span>
          <span className="max-w-md text-sm text-muted-foreground">
            Cuando pagues algo de Devtopia con tu plata, marca el gasto (o la compra con tarjeta) como
            &quot;Reembolsable por Devtopia&quot; y aparecerá aquí hasta que te lo devuelvan.
          </span>
        </Card>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <input
            type="hidden"
            name="movimientos"
            value={elegidos
              .filter((e) => e.origen === "movimiento")
              .map((e) => e.id)
              .join(",")}
          />
          <input
            type="hidden"
            name="compras"
            value={elegidos
              .filter((e) => e.origen === "compra_tc")
              .map((e) => e.id)
              .join(",")}
          />
          <Card className="gap-0 py-2">
            <div className="flex items-center justify-between gap-2 pb-2">
              <h2 className="text-xs font-extrabold tracking-wider text-muted-foreground uppercase">Por cobrar</h2>
              <button
                type="button"
                className="text-xs font-semibold text-primary hover:underline"
                onClick={() =>
                  setSeleccion(
                    seleccion.size === reembolsos.pendientes.length
                      ? new Set()
                      : new Set(reembolsos.pendientes.map((p) => p.id)),
                  )
                }
              >
                {seleccion.size === reembolsos.pendientes.length ? "Quitar todos" : "Elegir todos"}
              </button>
            </div>
            <ul>
              {reembolsos.pendientes.map((p) => (
                <li key={p.id} className="border-t">
                  <label className="flex cursor-pointer items-center gap-3 py-3">
                    <input
                      type="checkbox"
                      className="size-5 shrink-0 accent-[var(--primary)]"
                      checked={seleccion.has(p.id)}
                      onChange={() => alternar(p.id)}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-semibold">{p.descripcion}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {fechaMedia(p.fecha)} · {p.origen === "compra_tc" ? `con ${p.medio}` : `de ${p.medio}`}
                        {p.categoria_nombre ? ` · ${p.categoria_nombre}` : ""}
                      </span>
                    </span>
                    <strong className="whitespace-nowrap">{formatearCOP(p.monto)}</strong>
                  </label>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="gap-4">
            <h2 className="font-bold">Registrar el reembolso</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Campo id="reembolso-monto" etiqueta="Monto recibido" error={errores.monto}>
                <MontoInput
                  key={clave}
                  {...ariaCampo("reembolso-monto", errores.monto)}
                  name="monto"
                  defaultValue={total || null}
                  onValor={setMonto}
                />
              </Campo>
              <Campo id="reembolso-fecha" etiqueta="Fecha" error={errores.fecha}>
                <Input {...ariaCampo("reembolso-fecha", errores.fecha)} type="date" name="fecha" defaultValue={hoy} />
              </Campo>
              <Campo id="reembolso-cuenta" etiqueta="Entró a" error={errores.cuenta_id}>
                <Select
                  {...ariaCampo("reembolso-cuenta", errores.cuenta_id)}
                  name="cuenta_id"
                  defaultValue={cuentaPorDefecto(cuentas)?.id ?? ""}
                >
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </Select>
              </Campo>
            </div>
            <Campo id="reembolso-descripcion" etiqueta="Descripción (opcional)" error={errores.descripcion}>
              <Input
                {...ariaCampo("reembolso-descripcion", errores.descripcion)}
                name="descripcion"
                placeholder="Reembolso Devtopia"
                maxLength={200}
              />
            </Campo>
            {elegidos.length > 0 ? (
              <VistaPrevia tono={Math.abs(diferencia) >= 1 ? "alerta" : "normal"}>
                <Linea etiqueta={`${elegidos.length} gasto(s) elegidos`} valor={formatearCOP(total)} />
                {Math.abs(diferencia) >= 1 ? (
                  <span className="font-semibold">
                    Recibes {formatearCOP(Math.abs(diferencia))} {diferencia > 0 ? "más" : "menos"} de lo que suman los
                    gastos. Igual quedarán marcados como cobrados.
                  </span>
                ) : (
                  <span>✓ El monto coincide. No cuenta como ingreso: compensa esos gastos.</span>
                )}
              </VistaPrevia>
            ) : null}
            <BotonGuardar pendiente={pendiente} disabled={elegidos.length === 0}>
              Registrar reembolso
            </BotonGuardar>
          </Card>
        </form>
      )}

      {reembolsos.recibidos.length > 0 ? (
        <Card className="gap-0 py-2">
          <h2 className="pb-2 text-xs font-extrabold tracking-wider text-muted-foreground uppercase">
            Reembolsos recibidos
          </h2>
          <ul>
            {reembolsos.recibidos.map((r) => (
              <li key={r.id} className="flex items-center gap-2 border-t py-2 text-sm">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{r.descripcion ?? "Reembolso Devtopia"}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {fechaMedia(r.fecha)} · a {r.cuenta_nombre} · cubre {r.n_items} gasto(s) por{" "}
                    {formatearCOP(r.total_items)}
                  </span>
                </span>
                <strong className="text-success">+ {formatearCOP(r.monto)}</strong>
                {r.cerrado ? (
                  <LockIcon className="size-3.5 text-muted-foreground" aria-label="Mes cerrado" />
                ) : (
                  <BotonConfirmar
                    etiqueta={<span className="sr-only">Deshacer reembolso</span>}
                    icono={<RotateCcwIcon />}
                    titulo="¿Deshacer este reembolso?"
                    detalle="Se borra la entrada de dinero y sus gastos vuelven a quedar por cobrar."
                    confirmar="Deshacer"
                    onConfirmar={() => ejecutar(() => eliminarReembolso(r.id))}
                  />
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
