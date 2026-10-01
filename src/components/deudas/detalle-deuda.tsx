"use client";

import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowLeftIcon,
  EllipsisVerticalIcon,
  LockIcon,
  PencilIcon,
  PiggyBankIcon,
  Trash2Icon,
  WalletIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";
import { alternarDeuda, eliminarDeuda, eliminarPagoDeuda } from "@/actions/deudas";
import { BotonConfirmar } from "@/components/formularios/boton-confirmar";
import { HojaFormulario } from "@/components/formularios/hoja-formulario";
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
import type { EstadoAccion } from "@/lib/acciones";
import type { DetalleDeuda, PagoDeudaUI } from "@/lib/deudas";
import { formatearCOP } from "@/lib/domain/dinero";
import { ETIQUETA_TIPO_DEUDA, proximaCuota, proyectarDeuda } from "@/lib/domain/deudas";
import { etiquetaRelativa } from "@/lib/domain/obligaciones";
import { tasaMensual } from "@/lib/domain/tarjetas";
import { cn } from "@/lib/utils";
import { type CuentaSimple, DeudaForm, PagoDeudaForm } from "./formularios";

type Pestana = "resumen" | "proyeccion" | "pagos";
type Hoja = { tipo: "pago"; modo: "cuota" | "extra"; pago?: PagoDeudaUI } | { tipo: "editar" } | null;

const fechaMedia = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
const pct = (v: number) => `${(Math.round(v * 10000) / 100).toLocaleString("es-CO")} %`;

export function DetalleDeudaPantalla({
  detalle,
  cuentas,
  hoy,
  inicial,
}: {
  detalle: DetalleDeuda;
  cuentas: CuentaSimple[];
  hoy: string;
  inicial: { pestana?: Pestana; pagar?: boolean; obligacion?: string };
}) {
  const { deuda: d, pagos, cuotasPendientes } = detalle;
  const router = useRouter();
  const [pestana, setPestana] = useState<Pestana>(inicial.pestana ?? "resumen");
  const [hoja, setHoja] = useState<Hoja>(inicial.pagar && d.activa ? { tipo: "pago", modo: "cuota" } : null);
  const [verTodo, setVerTodo] = useState(false);
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

  const proxima = proximaCuota(hoy, d.dia_pago);
  const proy =
    d.cuota > 0 && d.saldo_capital > 0
      ? proyectarDeuda({
          saldo: d.saldo_capital,
          tasaEA: d.tasa_ea,
          cuota: d.cuota,
          primerPeriodo: proxima.slice(0, 7),
          diaPago: d.dia_pago,
        })
      : null;
  const avance = Math.round(Math.min(Math.max(d.avance, 0), 1) * 100);
  const cuotaVencida = cuotasPendientes.find((c) => c.fecha_vencimiento < hoy);

  const paraPago = {
    id: d.id,
    nombre: d.nombre,
    tipo: d.tipo,
    tasa_ea: d.tasa_ea,
    cuota: d.cuota,
    seguro_mensual: d.seguro_mensual,
    aporte_mensual: d.aporte_mensual,
    cuota_total: d.cuota_total,
    saldo_capital: d.saldo_capital,
    dia_pago: d.dia_pago,
    cuenta_aportes_id: d.cuenta_aportes_id,
    cuenta_pago_default_id: d.cuenta_pago_default_id,
  };

  return (
    <div className={cn("flex flex-col gap-6", pendiente && "opacity-70")}>
      <div className="flex flex-col gap-3">
        <Link
          href="/deudas"
          className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:underline"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" /> Deudas
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="font-display text-3xl font-semibold">{d.nombre}</h1>
            <p className="text-sm text-muted-foreground">
              {[
                ETIQUETA_TIPO_DEUDA[d.tipo],
                d.acreedor,
                d.tasa_ea > 0 ? `${pct(d.tasa_ea)} E.A. (${pct(tasaMensual(d.tasa_ea))} mensual)` : "sin intereses",
                `paga el día ${d.dia_pago}`,
              ]
                .filter(Boolean)
                .join(" · ")}
              {!d.activa ? (d.saldo_capital <= 0 ? " · pagada" : " · archivada") : ""}
            </p>
          </div>
          <div className="flex gap-2 [&>button:not([aria-haspopup])]:max-sm:flex-1">
            {d.activa ? (
              <>
                <Button onClick={() => setHoja({ tipo: "pago", modo: "cuota" })}>
                  <WalletIcon /> Pagar cuota
                </Button>
                <Button variant="outline" onClick={() => setHoja({ tipo: "pago", modo: "extra" })}>
                  <PiggyBankIcon /> Abono extra
                </Button>
              </>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Más acciones de la deuda"
                className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-card outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                <EllipsisVerticalIcon className="size-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setHoja({ tipo: "editar" })}>
                  <PencilIcon /> Editar datos
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => ejecutar(() => alternarDeuda(d.id, !d.activa))}>
                  {d.activa ? <ArchiveIcon /> : <ArchiveRestoreIcon />} {d.activa ? "Archivar" : "Reactivar"}
                </DropdownMenuItem>
                {pagos.length === 0 ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={() =>
                        ejecutar(
                          () => eliminarDeuda(d.id),
                          () => router.push("/deudas"),
                        )
                      }
                    >
                      <Trash2Icon /> Eliminar
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {cuotaVencida && d.activa ? (
        <button
          type="button"
          onClick={() => setHoja({ tipo: "pago", modo: "cuota" })}
          className="flex items-center gap-2 rounded-xl bg-destructive-soft px-4 py-3 text-left text-sm font-semibold text-destructive hover:underline"
        >
          ! La cuota del {fechaMedia(cuotaVencida.fecha_vencimiento)} está vencida: faltan{" "}
          {formatearCOP(cuotaVencida.pendiente)}.<span className="ml-auto whitespace-nowrap">Pagar →</span>
        </button>
      ) : null}

      <div
        role="tablist"
        aria-label="Secciones de la deuda"
        className="flex gap-1 overflow-x-auto rounded-xl bg-secondary p-1"
      >
        {(
          [
            ["resumen", "Resumen"],
            ["proyeccion", "Proyección"],
            ["pagos", `Pagos${pagos.length ? ` ${pagos.length}` : ""}`],
          ] as const
        ).map(([clave, etiqueta]) => (
          <button
            key={clave}
            type="button"
            role="tab"
            id={`tab-${clave}`}
            aria-selected={pestana === clave}
            aria-controls={`panel-${clave}`}
            onClick={() => setPestana(clave)}
            className={cn(
              "h-9 min-w-fit flex-1 rounded-lg px-3 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring",
              pestana === clave ? "bg-card shadow-sm" : "text-muted-foreground",
            )}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${pestana}`} aria-labelledby={`tab-${pestana}`} className="flex flex-col gap-4">
        {pestana === "resumen" ? (
          <>
            <Card className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Dato
                etiqueta="Saldo de capital"
                valor={formatearCOP(d.saldo_capital)}
                detalle={`de ${formatearCOP(d.monto_original)} prestados`}
              />
              <Dato
                etiqueta="Pagas cada mes"
                valor={formatearCOP(d.cuota_total)}
                detalle={[
                  `cuota ${formatearCOP(d.cuota)}`,
                  d.seguro_mensual ? `seguros ${formatearCOP(d.seguro_mensual)}` : null,
                  d.aporte_mensual ? `aporte ${formatearCOP(d.aporte_mensual)}` : null,
                ]
                  .filter(Boolean)
                  .join(" + ")}
              />
              <Dato
                etiqueta="Intereses y seguros pagados"
                valor={formatearCOP(d.pagado_intereses + d.pagado_seguros)}
                tono={d.pagado_intereses > 0 ? "text-warning" : undefined}
                detalle={`${formatearCOP(d.intereses_anio)} en ${hoy.slice(0, 4)}`}
              />
              <Dato
                etiqueta={d.saldo_capital > 0 ? "Terminas" : "Estado"}
                valor={
                  d.saldo_capital <= 0 ? "✓ Pagada" : proy?.termina && proy.fechaFin ? fechaMedia(proy.fechaFin) : "—"
                }
                detalle={
                  d.saldo_capital <= 0
                    ? undefined
                    : proy?.termina
                      ? `${proy.meses} cuotas · ${formatearCOP(proy.interesesTotales)} de intereses por pagar`
                      : "La cuota no cubre los intereses"
                }
              />
              <div className="col-span-2 flex flex-col gap-1 lg:col-span-4">
                <div
                  className="h-2.5 overflow-hidden rounded-full bg-secondary"
                  role="progressbar"
                  aria-label="Avance de pago"
                  aria-valuenow={avance}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="h-full rounded-full bg-success" style={{ width: `${avance}%` }} />
                </div>
                <span className="text-xs font-semibold text-success">✓ {avance} % pagado</span>
              </div>
            </Card>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="gap-3">
                <h2 className="text-xs font-extrabold tracking-wider text-muted-foreground uppercase">Próxima cuota</h2>
                <Fila etiqueta="Fecha" valor={`${fechaMedia(proxima)} · ${etiquetaRelativa(proxima, hoy)}`} />
                {proy?.filas[0] ? (
                  <>
                    <Fila etiqueta="Intereses estimados" valor={formatearCOP(proy.filas[0].interes)} />
                    <Fila etiqueta="Abono a capital estimado" valor={formatearCOP(proy.filas[0].capital)} />
                  </>
                ) : null}
                {d.obligacion_id ? (
                  <p className="text-xs text-muted-foreground">✓ Aparece cada mes en el checklist de Mes.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No está en el checklist del mes (actívalo en Editar datos).
                  </p>
                )}
              </Card>
              <Card className="gap-3">
                <h2 className="text-xs font-extrabold tracking-wider text-muted-foreground uppercase">
                  Lo que has pagado
                </h2>
                <Fila etiqueta="A capital" valor={formatearCOP(d.pagado_capital)} />
                <Fila etiqueta="Intereses" valor={formatearCOP(d.pagado_intereses)} />
                <Fila etiqueta="Seguros y otros" valor={formatearCOP(d.pagado_seguros)} />
                {d.aporte_mensual > 0 || d.pagado_aportes > 0 ? (
                  <Fila
                    etiqueta={`Aportes (ahorro en ${d.cuenta_aportes_nombre ?? "cooperativa"})`}
                    valor={formatearCOP(d.pagado_aportes)}
                  />
                ) : null}
                {d.pagado_total > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    De cada $100 pagados, $
                    {Math.round(((d.pagado_intereses + d.pagado_seguros) / d.pagado_total) * 100)} fueron intereses y
                    seguros.
                  </p>
                ) : null}
                {d.saldo_inicial < d.monto_original ? (
                  <p className="text-xs text-muted-foreground">
                    Registrada desde el {fechaMedia(d.fecha_saldo_inicial)} con saldo de {formatearCOP(d.saldo_inicial)}
                    .
                  </p>
                ) : null}
              </Card>
            </div>
          </>
        ) : null}

        {pestana === "proyeccion" ? (
          proy && proy.filas.length > 0 ? (
            <Card className="gap-3">
              <p className="text-sm text-muted-foreground">
                Si pagas la cuota de {formatearCOP(d.cuota)} cada mes (sin seguros ni aportes). Los valores reales
                cambian un poco según los días de cada mes. Un <strong>abono extra</strong> a capital acorta el plazo.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[30rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-2 font-semibold">#</th>
                      <th className="py-2 pr-2 font-semibold">Fecha</th>
                      <th className="py-2 pr-2 text-right font-semibold">Intereses</th>
                      <th className="py-2 pr-2 text-right font-semibold">Capital</th>
                      <th className="py-2 text-right font-semibold">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(verTodo ? proy.filas : proy.filas.slice(0, 12)).map((f) => (
                      <tr key={f.numero} className="border-t">
                        <td className="py-2 pr-2 text-muted-foreground">{f.numero}</td>
                        <td className="py-2 pr-2">{fechaMedia(f.fecha)}</td>
                        <td className="py-2 pr-2 text-right">{formatearCOP(f.interes)}</td>
                        <td className="py-2 pr-2 text-right">{formatearCOP(f.capital)}</td>
                        <td className="py-2 text-right font-semibold">{formatearCOP(f.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {proy.filas.length > 12 ? (
                <Button variant="link" className="self-start px-0" onClick={() => setVerTodo((v) => !v)}>
                  {verTodo ? "Ver solo 12 meses" : `Ver las ${proy.filas.length} cuotas`}
                </Button>
              ) : null}
              <p className="text-sm">
                Total de intereses por pagar: <strong>{formatearCOP(proy.interesesTotales)}</strong>
                {proy.termina ? "" : " (la cuota no alcanza a cubrir los intereses)"}
              </p>
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-muted-foreground">
                {d.saldo_capital <= 0 ? "✓ Esta deuda ya está pagada." : "Registra la cuota para proyectar los pagos."}
              </p>
            </Card>
          )
        ) : null}

        {pestana === "pagos" ? (
          <Card className="gap-0 py-2">
            {pagos.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                Aún no hay pagos. Cada pago aparece también como salida de dinero en Movimientos.
              </p>
            ) : (
              <ul>
                {pagos.map((p) => {
                  const extra = p.a_intereses + p.a_seguros + p.a_aporte === 0;
                  const contenido = (
                    <>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-semibold">
                          {fechaMedia(p.fecha)} · desde {p.cuenta_origen_nombre}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {[
                            `${formatearCOP(p.a_capital)} a capital`,
                            p.a_intereses ? `${formatearCOP(p.a_intereses)} intereses` : null,
                            p.a_seguros ? `${formatearCOP(p.a_seguros)} seguros` : null,
                            p.a_aporte ? `${formatearCOP(p.a_aporte)} aporte` : null,
                            p.nota,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <span className="font-bold whitespace-nowrap">{formatearCOP(p.monto)}</span>
                        <span className="flex gap-1">
                          {extra ? <Badge variant="success">Abono extra</Badge> : null}
                          {p.obligacion_periodo_id ? <Badge variant="info">Del checklist</Badge> : null}
                          {p.cerrado ? (
                            <LockIcon className="size-3.5 text-muted-foreground" aria-label="Mes cerrado" />
                          ) : null}
                        </span>
                      </span>
                    </>
                  );
                  return (
                    <li key={p.id} className="border-t first:border-t-0">
                      {p.cerrado ? (
                        <div className="flex items-center gap-3 py-3">{contenido}</div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setHoja({ tipo: "pago", modo: extra ? "extra" : "cuota", pago: p })}
                          aria-label={`Editar pago del ${fechaMedia(p.fecha)}`}
                          className="flex w-full items-center gap-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {contenido}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        ) : null}
      </div>

      <HojaFormulario
        titulo={
          hoja?.tipo === "editar"
            ? "Editar deuda"
            : hoja?.tipo === "pago"
              ? hoja.pago
                ? "Editar pago"
                : hoja.modo === "extra"
                  ? `Abono extra a ${d.nombre}`
                  : `Pagar cuota de ${d.nombre}`
              : ""
        }
        open={hoja !== null}
        onOpenChange={(v) => !v && cerrarHoja()}
      >
        {() => (
          <>
            {hoja?.tipo === "pago" ? (
              <div className="flex flex-col gap-4">
                <PagoDeudaForm
                  deuda={paraPago}
                  cuentas={cuentas}
                  hoy={hoy}
                  pago={hoja.pago}
                  cuotasPendientes={cuotasPendientes}
                  obligacionInicial={inicial.obligacion}
                  modoInicial={hoja.modo}
                  onGuardado={cerrarHoja}
                />
                {hoja.pago ? (
                  <BotonConfirmar
                    etiqueta="Eliminar este pago"
                    titulo="¿Eliminar este pago?"
                    detalle="Se borran también sus movimientos de caja y el saldo de la deuda vuelve a subir."
                    onConfirmar={() => ejecutar(() => eliminarPagoDeuda(hoja.pago!.id), cerrarHoja)}
                  />
                ) : null}
              </div>
            ) : null}
            {hoja?.tipo === "editar" ? (
              <DeudaForm
                deuda={{ ...d, fecha_saldo_inicial: d.fecha_saldo_inicial }}
                cuentas={cuentas}
                hoy={hoy}
                onGuardado={cerrarHoja}
              />
            ) : null}
          </>
        )}
      </HojaFormulario>
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  detalle,
  tono,
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  tono?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs font-semibold text-muted-foreground">{etiqueta}</span>
      <span className={cn("text-lg font-bold sm:text-xl", tono)}>{valor}</span>
      {detalle ? <span className="text-xs text-muted-foreground">{detalle}</span> : null}
    </div>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{etiqueta}</span>
      <span className="text-right font-semibold">{valor}</span>
    </div>
  );
}
