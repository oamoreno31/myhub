"use client";

import {
  AlertTriangleIcon,
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowLeftIcon,
  EllipsisVerticalIcon,
  FileTextIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  ShoppingBagIcon,
  Trash2Icon,
  WalletIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";
import { alternarTarjeta, eliminarCompra, eliminarExtracto, eliminarPago, eliminarTarjeta } from "@/actions/tarjetas";
import { HojaFormulario } from "@/components/formularios/hoja-formulario";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CategoriaBasica } from "@/lib/categorias";
import type { EstadoAccion } from "@/lib/acciones";
import { formatearCOP } from "@/lib/domain/dinero";
import { etiquetaRelativa } from "@/lib/domain/obligaciones";
import {
  ETIQUETA_TIPO_COMPRA,
  extractoPendiente,
  mejorDiaDeCompra,
  proximoCorte,
  ultimoCorte,
} from "@/lib/domain/tarjetas";
import type { CompraUI, DetalleTarjeta, ExtractoUI, PagoUI } from "@/lib/tarjetas";
import { cn } from "@/lib/utils";
import {
  CompraForm,
  type CuentaPago,
  ExtractoForm,
  type Libro,
  PagoForm,
  TarjetaForm,
  type TarjetaOpcion,
} from "./formularios";
import { BarraUtilizacion, Dato, EstadoExtractoBadge, fechaCorta, fechaMedia, mesLargo, TipoPagoBadge } from "./piezas";

type Pestana = "resumen" | "compras" | "cuotas" | "extractos" | "pagos";
const PESTANAS: { clave: Pestana; etiqueta: string }[] = [
  { clave: "resumen", etiqueta: "Resumen" },
  { clave: "compras", etiqueta: "Compras" },
  { clave: "cuotas", etiqueta: "Cuotas" },
  { clave: "extractos", etiqueta: "Extractos" },
  { clave: "pagos", etiqueta: "Pagos" },
];

type Hoja =
  | { tipo: "compra"; compra?: CompraUI }
  | { tipo: "extracto"; extracto?: ExtractoUI }
  | { tipo: "pago"; pago?: PagoUI }
  | { tipo: "tarjeta" }
  | null;

export function DetalleTarjetaPantalla({
  detalle,
  cuentas,
  categorias,
  hoy,
  inicial,
}: {
  detalle: DetalleTarjeta;
  cuentas: CuentaPago[];
  categorias: CategoriaBasica[];
  hoy: string;
  inicial: { pestana?: Pestana; hoja?: "pago" | "extracto" | "compra" };
}) {
  const { tarjeta: t, compras, extractos, pagos, cuotas } = detalle;
  const router = useRouter();
  const [pestana, setPestana] = useState<Pestana>(inicial.pestana ?? "resumen");
  const [hoja, setHoja] = useState<Hoja>(inicial.hoja && t.activa ? { tipo: inicial.hoja } : null);
  const [pendiente, startTransition] = useTransition();

  const opcion: TarjetaOpcion = {
    id: t.id,
    nombre: t.nombre,
    dia_corte: t.dia_corte,
    dia_limite_pago: t.dia_limite_pago,
    cupo: t.cupo,
    cupo_disponible: t.cupo_disponible,
    cuenta_pago_default_id: t.cuenta_pago_default_id,
  };
  const libro: Libro = { compras, extractos, pagos };
  const cerrarHoja = () => setHoja(null);
  const ejecutar = (fn: () => Promise<EstadoAccion>, despues?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.mensaje);
        despues?.();
      } else toast.error(r.error);
    });

  const u = t.ultimo_extracto;
  const faltaExtracto = extractoPendiente(hoy, t.dia_corte, extractos, t.primera_actividad);
  const corteSiguiente = proximoCorte(hoy, t.dia_corte);
  const facturaSiguiente = cuotas
    .filter((q) => q.corte.slice(0, 7) === corteSiguiente.slice(0, 7))
    .reduce((a, q) => a + q.valor, 0);
  const vencido = Boolean(u && u.fecha_limite_pago < hoy && u.pagado < u.pago_minimo - 1000);

  const tituloHoja =
    hoja?.tipo === "compra"
      ? hoja.compra
        ? `Editar ${ETIQUETA_TIPO_COMPRA[hoja.compra.tipo].toLowerCase()}`
        : "Registrar en la tarjeta"
      : hoja?.tipo === "extracto"
        ? hoja.extracto
          ? "Editar extracto"
          : "Registrar extracto"
        : hoja?.tipo === "pago"
          ? hoja.pago
            ? "Editar pago"
            : `Pagar ${t.nombre}`
          : hoja?.tipo === "tarjeta"
            ? "Editar tarjeta"
            : "";

  return (
    <div className={cn("flex flex-col gap-6", pendiente && "opacity-70")}>
      <div className="flex flex-col gap-3">
        <Link
          href="/tarjetas"
          className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:underline"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" /> Tarjetas
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="font-display text-3xl font-semibold">{t.nombre}</h1>
            <p className="text-sm text-muted-foreground">
              {[
                t.entidad,
                t.ultimos4 ? `···· ${t.ultimos4}` : null,
                `corte día ${t.dia_corte}`,
                `pago día ${t.dia_limite_pago}`,
              ]
                .filter(Boolean)
                .join(" · ")}
              {!t.activa ? " · archivada" : ""}
            </p>
          </div>
          <div className="flex gap-2 [&>button:not([aria-haspopup])]:max-sm:flex-1 [&>button:not([aria-haspopup])]:max-sm:px-2">
            {t.activa ? (
              <>
                <Button onClick={() => setHoja({ tipo: "pago" })}>
                  <WalletIcon /> Pagar
                </Button>
                <Button variant="outline" onClick={() => setHoja({ tipo: "compra" })}>
                  <ShoppingBagIcon /> Compra
                </Button>
                <Button variant="outline" onClick={() => setHoja({ tipo: "extracto" })}>
                  <FileTextIcon /> Extracto
                </Button>
              </>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Más acciones de la tarjeta"
                className="flex size-11 items-center justify-center rounded-lg border bg-card outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                <EllipsisVerticalIcon className="size-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setHoja({ tipo: "tarjeta" })}>
                  <PencilIcon /> Editar datos
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => ejecutar(() => alternarTarjeta(t.id, !t.activa))}>
                  {t.activa ? <ArchiveIcon /> : <ArchiveRestoreIcon />} {t.activa ? "Archivar" : "Reactivar"}
                </DropdownMenuItem>
                {compras.length + extractos.length + pagos.length === 0 ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={() =>
                        ejecutar(
                          () => eliminarTarjeta(t.id),
                          () => router.push("/tarjetas"),
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

      {faltaExtracto && t.activa ? (
        <button
          type="button"
          onClick={() => setHoja({ tipo: "extracto" })}
          className="flex items-center gap-2 rounded-xl bg-warning-soft px-4 py-3 text-left text-sm font-semibold text-warning hover:underline"
        >
          <AlertTriangleIcon className="size-4 shrink-0" aria-hidden="true" />
          Ya pasó el corte del {fechaCorta(faltaExtracto)}: registra el extracto para saber cuánto pagar y qué te
          cobraron.
          <span className="ml-auto whitespace-nowrap">Registrar →</span>
        </button>
      ) : null}

      <div
        role="tablist"
        aria-label="Secciones de la tarjeta"
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
            onClick={() => setPestana(p.clave)}
            className={cn(
              "h-9 min-w-fit flex-1 rounded-lg px-3 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring",
              pestana === p.clave ? "bg-card shadow-sm" : "text-muted-foreground",
            )}
          >
            {p.etiqueta}
            {p.clave === "compras" && compras.length > 0 ? (
              <span className="ml-1 text-xs opacity-70">{compras.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${pestana}`} aria-labelledby={`tab-${pestana}`} className="flex flex-col gap-4">
        {pestana === "resumen" ? (
          <>
            <Card className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Dato
                etiqueta="Deuda total"
                valor={t.deuda_total}
                tono={t.deuda_total < 0 ? "text-success" : undefined}
                detalle={t.deuda_total < 0 ? "Saldo a tu favor" : undefined}
              />
              <Dato etiqueta="Capital" valor={t.capital} detalle="Compras − abonos a capital" />
              <Dato
                etiqueta="Otros cargos pendientes"
                valor={t.otros_pendientes}
                tono={t.otros_pendientes > 0 ? "text-warning" : undefined}
                detalle="Intereses, manejo, seguros"
              />
              <Dato etiqueta="Cupo disponible" valor={t.cupo_disponible} detalle={`de ${formatearCOP(t.cupo)}`} />
              <div className="col-span-2 lg:col-span-4">
                <BarraUtilizacion utilizacion={t.utilizacion} cupo={t.cupo} />
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="gap-3">
                <h2 className="text-xs font-extrabold tracking-wider text-muted-foreground uppercase">
                  Último extracto
                </h2>
                {u ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold">Corte {fechaMedia(u.fecha_corte)}</span>
                      <EstadoExtractoBadge estado={u.estado} vencido={vencido} />
                    </div>
                    <Fila etiqueta="Pago total" valor={formatearCOP(u.pago_total)} />
                    <Fila etiqueta="Pago mínimo" valor={formatearCOP(u.pago_minimo)} />
                    <Fila etiqueta="Ya pagado" valor={formatearCOP(u.pagado)} />
                    <Fila
                      etiqueta="Fecha límite"
                      valor={`${fechaCorta(u.fecha_limite_pago)} · ${etiquetaRelativa(u.fecha_limite_pago, hoy)}`}
                    />
                    {u.alerta ? (
                      <p className="flex gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm font-semibold text-warning">
                        <AlertTriangleIcon className="size-4 shrink-0" aria-hidden="true" />
                        {u.alerta === "conciliacion_negativa"
                          ? "El banco cobró menos de lo registrado: revisa compras y devoluciones."
                          : "El desglose no explica todos los otros cargos."}
                      </p>
                    ) : null}
                    {t.activa && u.estado !== "pagado_total" ? (
                      <Button onClick={() => setHoja({ tipo: "pago" })} className="self-start">
                        <WalletIcon /> Registrar pago
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Cuando llegue el extracto, registra el pago total y el mínimo: la app deduce los otros cargos.
                  </p>
                )}
              </Card>

              <Card className="gap-3">
                <h2 className="text-xs font-extrabold tracking-wider text-muted-foreground uppercase">Próximo corte</h2>
                <Fila
                  etiqueta="Fecha"
                  valor={`${fechaMedia(corteSiguiente)} · ${etiquetaRelativa(corteSiguiente, hoy)}`}
                />
                <Fila etiqueta="Capital que se facturará (cuotas)" valor={formatearCOP(facturaSiguiente)} />
                <Fila etiqueta="Último corte" valor={fechaMedia(ultimoCorte(hoy, t.dia_corte))} />
                <Fila etiqueta="Mejor día para comprar" valor={`día ${mejorDiaDeCompra(t.dia_corte)}`} />
                <div className="border-t pt-3">
                  <Fila
                    etiqueta={`Costo financiero ${hoy.slice(0, 4)}`}
                    valor={
                      <span className={t.costo_financiero_anio > 0 ? "font-bold text-warning" : undefined}>
                        {formatearCOP(t.costo_financiero_anio)}
                      </span>
                    }
                  />
                  <Fila etiqueta={`Pagado en ${hoy.slice(0, 4)}`} valor={formatearCOP(t.pagado_anio)} />
                  {t.pagado_anio > 0 ? (
                    <p className="pt-1 text-xs text-muted-foreground">
                      De cada $100 pagados este año, ${Math.round((t.costo_financiero_anio / t.pagado_anio) * 100)}{" "}
                      fueron costos financieros.
                    </p>
                  ) : null}
                </div>
              </Card>
            </div>
          </>
        ) : null}

        {pestana === "compras" ? (
          <Lista
            vacio="Aún no hay compras. Registra cada compra por su valor (solo capital); los intereses los revela el extracto."
            accion={t.activa ? { etiqueta: "Registrar compra", onClick: () => setHoja({ tipo: "compra" }) } : undefined}
          >
            {compras.map((c) => {
              const cerrado = c.estado_periodo === "cerrado";
              const signo = c.tipo === "devolucion" || (c.tipo === "ajuste" && c.monto < 0) ? "−" : "+";
              return (
                <FilaLista
                  key={c.id}
                  onClick={cerrado || !t.activa ? undefined : () => setHoja({ tipo: "compra", compra: c })}
                  titulo={c.descripcion ?? c.comercio ?? c.categoria_nombre ?? ETIQUETA_TIPO_COMPRA[c.tipo]}
                  sub={[
                    fechaCorta(c.fecha),
                    c.tipo === "compra" ? c.categoria_nombre : ETIQUETA_TIPO_COMPRA[c.tipo],
                    c.tipo === "avance" && c.cuenta_destino_nombre ? `→ ${c.cuenta_destino_nombre}` : null,
                    c.moneda === "USD" && c.monto_origen ? `US$ ${c.monto_origen}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  valor={`${signo} ${formatearCOP(Math.abs(Number(c.monto)))}`}
                  tonoValor={signo === "−" ? "text-success" : undefined}
                  chips={
                    <>
                      {c.num_cuotas > 1 ? <Badge variant="info">{c.num_cuotas} cuotas</Badge> : null}
                      {c.tipo === "avance" ? <Badge variant="warning">Avance</Badge> : null}
                      {c.reembolsable ? (
                        c.reembolsado ? (
                          <Badge variant="success">✓ Reembolsado</Badge>
                        ) : (
                          <Badge variant="warning">Reembolsable</Badge>
                        )
                      ) : null}
                      {cerrado ? (
                        <LockIcon className="size-3.5 text-muted-foreground" aria-label="Mes cerrado" />
                      ) : null}
                    </>
                  }
                />
              );
            })}
          </Lista>
        ) : null}

        {pestana === "cuotas" ? <PanelCuotas cuotas={detalle.cuotas} hoy={hoy} diaCorte={t.dia_corte} /> : null}

        {pestana === "extractos" ? (
          <Lista
            vacio="Aún no hay extractos. Registra el pago total y el mínimo que trae cada extracto."
            accion={
              t.activa ? { etiqueta: "Registrar extracto", onClick: () => setHoja({ tipo: "extracto" }) } : undefined
            }
          >
            {extractos.map((e) => {
              const cerrado = e.estado_periodo === "cerrado";
              const vence = e.fecha_limite_pago < hoy && e.pagado < Number(e.pago_minimo_banco) - 1000;
              return (
                <FilaLista
                  key={e.id}
                  onClick={cerrado || !t.activa ? undefined : () => setHoja({ tipo: "extracto", extracto: e })}
                  titulo={`Corte ${fechaMedia(e.fecha_corte)}`}
                  sub={`Total ${formatearCOP(e.pago_total_banco)} · mínimo ${formatearCOP(e.pago_minimo_banco)} · pagar antes del ${fechaCorta(e.fecha_limite_pago)}`}
                  valor={
                    <span className="flex flex-col items-end">
                      <span className={e.otros_generados > 0 ? "text-warning" : undefined}>
                        {formatearCOP(e.otros_generados)}
                      </span>
                      <span className="text-[11px] font-semibold text-muted-foreground">otros cargos</span>
                    </span>
                  }
                  chips={
                    <>
                      <EstadoExtractoBadge estado={e.estado} vencido={vence} />
                      {e.alerta ? <Badge variant="warning">! Revisar</Badge> : null}
                      {cerrado ? (
                        <LockIcon className="size-3.5 text-muted-foreground" aria-label="Mes cerrado" />
                      ) : null}
                    </>
                  }
                />
              );
            })}
          </Lista>
        ) : null}

        {pestana === "pagos" ? (
          <Lista
            vacio="Aún no hay pagos. Cada pago también aparece como salida de dinero en Movimientos."
            accion={t.activa ? { etiqueta: "Registrar pago", onClick: () => setHoja({ tipo: "pago" }) } : undefined}
          >
            {pagos.map((p) => {
              const cerrado = p.estado_periodo === "cerrado";
              return (
                <FilaLista
                  key={p.id}
                  onClick={cerrado || !t.activa ? undefined : () => setHoja({ tipo: "pago", pago: p })}
                  titulo={`${fechaMedia(p.fecha)} · desde ${p.cuenta_origen_nombre}`}
                  sub={[
                    `${formatearCOP(p.imputado_otros)} a otros cargos`,
                    `${formatearCOP(p.imputado_capital)} a capital`,
                    p.saldo_a_favor > 0 ? `${formatearCOP(p.saldo_a_favor)} a favor` : null,
                    p.nota,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  valor={formatearCOP(p.monto)}
                  chips={
                    <>
                      <TipoPagoBadge tipo={p.tipo_calculado} />
                      {cerrado ? (
                        <LockIcon className="size-3.5 text-muted-foreground" aria-label="Mes cerrado" />
                      ) : null}
                    </>
                  }
                />
              );
            })}
          </Lista>
        ) : null}
      </div>

      <HojaFormulario titulo={tituloHoja} open={hoja !== null} onOpenChange={(v) => !v && cerrarHoja()}>
        {() => (
          <>
            {hoja?.tipo === "compra" ? (
              <div className="flex flex-col gap-4">
                <CompraForm
                  tarjetas={[opcion]}
                  tarjetaId={t.id}
                  compra={hoja.compra}
                  categorias={categorias}
                  cuentas={cuentas}
                  hoy={hoy}
                  onGuardado={cerrarHoja}
                />
                {hoja.compra ? (
                  <BotonEliminar
                    que="esta compra"
                    detalle="La deuda y los extractos se recalculan."
                    onConfirmar={() => ejecutar(() => eliminarCompra(hoja.compra!.id), cerrarHoja)}
                  />
                ) : null}
              </div>
            ) : null}
            {hoja?.tipo === "extracto" ? (
              <div className="flex flex-col gap-4">
                <ExtractoForm
                  tarjeta={opcion}
                  libro={libro}
                  extracto={hoja.extracto}
                  hoy={hoy}
                  onGuardado={cerrarHoja}
                />
                {hoja.extracto ? (
                  <BotonEliminar
                    que="este extracto"
                    detalle="También se elimina el pago de la tarjeta del checklist del mes (los pagos registrados se conservan)."
                    onConfirmar={() => ejecutar(() => eliminarExtracto(hoja.extracto!.id), cerrarHoja)}
                  />
                ) : null}
              </div>
            ) : null}
            {hoja?.tipo === "pago" ? (
              <div className="flex flex-col gap-4">
                <PagoForm
                  tarjeta={opcion}
                  libro={libro}
                  pago={hoja.pago ? { ...hoja.pago, monto: Number(hoja.pago.monto) } : undefined}
                  cuentas={cuentas}
                  hoy={hoy}
                  onGuardado={cerrarHoja}
                />
                {hoja.pago ? (
                  <BotonEliminar
                    que="este pago"
                    detalle="También se borra su movimiento de caja y la obligación del mes vuelve a quedar pendiente."
                    onConfirmar={() => ejecutar(() => eliminarPago(hoja.pago!.id), cerrarHoja)}
                  />
                ) : null}
              </div>
            ) : null}
            {hoja?.tipo === "tarjeta" ? (
              <TarjetaForm tarjeta={{ ...opcion, ...t }} cuentas={cuentas} onGuardado={cerrarHoja} />
            ) : null}
          </>
        )}
      </HojaFormulario>
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

function Lista({
  children,
  vacio,
  accion,
}: {
  children: ReactNode[];
  vacio: string;
  accion?: { etiqueta: string; onClick: () => void };
}) {
  return (
    <Card className="gap-0 py-2">
      {children.length === 0 ? (
        <div className="flex flex-col items-start gap-3 py-4">
          <p className="text-sm text-muted-foreground">{vacio}</p>
          {accion ? (
            <Button variant="outline" onClick={accion.onClick}>
              <PlusIcon /> {accion.etiqueta}
            </Button>
          ) : null}
        </div>
      ) : (
        <ul>{children}</ul>
      )}
    </Card>
  );
}

function FilaLista({
  titulo,
  sub,
  valor,
  tonoValor,
  chips,
  onClick,
}: {
  titulo: string;
  sub: string;
  valor: ReactNode;
  tonoValor?: string;
  chips?: ReactNode;
  onClick?: () => void;
}) {
  const contenido = (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">{titulo}</span>
        <span className="truncate text-xs text-muted-foreground">{sub}</span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <span className={cn("font-bold whitespace-nowrap", tonoValor)}>{valor}</span>
        <span className="flex flex-wrap justify-end gap-1">{chips}</span>
      </span>
    </>
  );
  return (
    <li className="border-t first:border-t-0">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={`Editar ${titulo}`}
          className="flex w-full items-center gap-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {contenido}
        </button>
      ) : (
        <div className="flex items-center gap-3 py-3">{contenido}</div>
      )}
    </li>
  );
}

function PanelCuotas({ cuotas, hoy, diaCorte }: { cuotas: DetalleTarjeta["cuotas"]; hoy: string; diaCorte: number }) {
  const desde = proximoCorte(hoy, diaCorte);
  const futuras = cuotas.filter((q) => q.corte >= desde && q.valor > 0);
  const porCorte = new Map<string, typeof futuras>();
  for (const q of futuras) porCorte.set(q.corte, [...(porCorte.get(q.corte) ?? []), q]);
  const total = futuras.reduce((a, q) => a + q.valor, 0);

  if (futuras.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          No tienes cuotas de capital pendientes para los próximos cortes. Las compras a varias cuotas aparecerán aquí.
        </p>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-1">
        <span className="text-xs font-semibold text-muted-foreground">Capital comprometido en cuotas futuras</span>
        <span className="text-xl font-bold">{formatearCOP(total)}</span>
        <span className="text-xs text-muted-foreground">
          Solo capital: los intereses de cada cuota llegan como otros cargos en el extracto.
        </span>
      </Card>
      {[...porCorte.entries()].slice(0, 12).map(([corte, lista]) => (
        <Card key={corte} className="gap-0 py-3">
          <div className="flex items-center justify-between pb-2">
            <h3 className="text-sm font-bold">
              {mesLargo(corte)} <span className="font-normal text-muted-foreground">· corte {fechaCorta(corte)}</span>
            </h3>
            <span className="text-sm font-bold">{formatearCOP(lista.reduce((a, q) => a + q.valor, 0))}</span>
          </div>
          <ul>
            {lista.map((q) => (
              <li
                key={`${q.compra_id}-${q.numero}`}
                className="flex items-center justify-between gap-3 border-t py-2 text-sm"
              >
                <span className="min-w-0 truncate">{q.descripcion}</span>
                <span className="whitespace-nowrap text-muted-foreground">
                  {q.numero}/{q.num_cuotas} · <strong className="text-foreground">{formatearCOP(q.valor)}</strong>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {porCorte.size > 12 ? (
        <p className="text-center text-xs text-muted-foreground">Se muestran los próximos 12 cortes.</p>
      ) : null}
    </div>
  );
}

function BotonEliminar({ que, detalle, onConfirmar }: { que: string; detalle: string; onConfirmar: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="text-destructive">
          <Trash2Icon /> Eliminar {que}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>¿Eliminar {que}?</AlertDialogTitle>
        <AlertDialogDescription>{detalle}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction destructivo onClick={onConfirmar}>
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
