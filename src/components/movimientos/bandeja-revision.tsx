"use client";

import {
  CheckCheckIcon,
  CheckIcon,
  CreditCardIcon,
  InboxIcon,
  LockIcon,
  PencilIcon,
  SmartphoneIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { confirmarRevision, type ItemConfirmacion } from "@/actions/atajos";
import { MovimientoFormDiferido as MovimientoForm } from "@/components/formularios/diferidos";
import { HojaFormulario } from "@/components/formularios/hoja-formulario";
import type { CuentaOpcion } from "@/components/formularios/movimiento-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import type { ItemRevision } from "@/lib/atajos-datos";
import { type CategoriaBasica, opcionesCategorias } from "@/lib/categorias";
import { fuenteDeRegistro } from "@/lib/domain/atajos";
import { formatearCOP } from "@/lib/domain/dinero";

const fechaCorta = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
};

/**
 * Bandeja "Por revisar": lo que llegó del iPhone sin una categoría confiable (o marcado para revisar).
 * Cada registro se confirma con un toque (eligiendo categoría si hace falta) o se abre para editarlo.
 */
export function BandejaRevision({
  items,
  categorias,
  cuentas,
  hoy,
}: {
  items: ItemRevision[];
  categorias: CategoriaBasica[];
  cuentas: CuentaOpcion[];
  hoy: string;
}) {
  // Categoría elegida por registro (id) — por defecto la que ya trae, salvo "Por clasificar".
  const [elegidas, setElegidas] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState<ItemRevision | null>(null);
  const [pendiente, startTransition] = useTransition();

  const gruposPorTipo = useMemo(() => {
    const sinPorClasificar = categorias.filter((c) => !(c.es_sistema && c.nombre === "Por clasificar"));
    return {
      gasto: opcionesCategorias(sinPorClasificar, "gasto"),
      ingreso: opcionesCategorias(sinPorClasificar, "ingreso"),
    };
  }, [categorias]);

  const categoriaDe = (i: ItemRevision) => elegidas[i.id] ?? (i.por_clasificar ? "" : (i.categoria_id ?? ""));
  const listo = (i: ItemRevision) => !i.cerrado && (i.tipo === "transferencia" || categoriaDe(i) !== "");
  const listos = items.filter(listo);

  const confirmar = (lista: ItemRevision[]) =>
    startTransition(async () => {
      const r = await confirmarRevision(
        lista.map<ItemConfirmacion>((i) => ({
          registro: i.registro,
          id: i.id,
          categoria_id: i.tipo === "transferencia" ? null : categoriaDe(i) || null,
        })),
      );
      if (r.ok) toast.success(r.mensaje);
      else toast.error(r.error);
    });

  if (items.length === 0) {
    return (
      <Card className="items-center gap-2 py-10 text-center">
        <CheckCheckIcon className="size-6 text-success" aria-hidden="true" />
        <span className="font-bold">Nada por revisar</span>
        <span className="text-sm text-muted-foreground">
          Todo lo que llegó desde el iPhone ya tiene categoría confirmada.
        </span>
        <Button asChild variant="link">
          <Link href="/movimientos">Ver movimientos →</Link>
        </Button>
      </Card>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex-1 text-sm text-muted-foreground">
            Elige la categoría y confirma. Al confirmar, el atajo aprende: la próxima vez el mismo comercio se clasifica
            solo.
          </p>
          {listos.length > 1 ? (
            <Button onClick={() => confirmar(listos)} disabled={pendiente}>
              <CheckCheckIcon /> Confirmar {listos.length} listos
            </Button>
          ) : null}
        </div>

        <Card className="gap-0 py-1">
          <ul>
            {items.map((i, n) => {
              const fuente = fuenteDeRegistro(i.origen_registro);
              const titulo =
                i.descripcion ??
                i.comercio ??
                (i.tipo === "transferencia" ? `${i.origen} → ${i.destino}` : "Sin descripción");
              const origen = `${i.origen}${i.ultimos4 ? ` ·${i.ultimos4}` : ""}`;
              const grupos = i.tipo === "ingreso" ? gruposPorTipo.ingreso : gruposPorTipo.gasto;
              return (
                <li key={i.id} className={n > 0 ? "border-t" : undefined}>
                  <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
                        {i.registro === "compra_tc" ? (
                          <CreditCardIcon className="size-4" aria-hidden="true" />
                        ) : (
                          <InboxIcon className="size-4" aria-hidden="true" />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-semibold">{titulo}</span>
                          <span className="font-bold whitespace-nowrap">
                            {i.tipo === "ingreso" ? "+ " : i.tipo === "transferencia" ? "" : "− "}
                            {formatearCOP(i.monto)}
                          </span>
                        </span>
                        <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                          <span>{fechaCorta(i.fecha)}</span>
                          <span>· {i.tipo === "transferencia" ? `${origen} → ${i.destino}` : origen}</span>
                          {i.num_cuotas && i.num_cuotas > 1 ? <span>· {i.num_cuotas} cuotas</span> : null}
                          {fuente ? (
                            <span className="inline-flex items-center gap-0.5">
                              · <SmartphoneIcon className="size-3" aria-hidden="true" /> {fuente}
                            </span>
                          ) : null}
                          {i.por_clasificar ? <Badge variant="warning">Sin categoría</Badge> : null}
                        </span>
                      </span>
                    </div>

                    {i.cerrado ? (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground sm:max-w-56">
                        <LockIcon className="size-3.5 shrink-0" aria-hidden="true" /> Mes cerrado: reábrelo para
                        revisarlo.
                      </span>
                    ) : (
                      <div className="flex items-center gap-1 sm:w-auto">
                        {i.tipo !== "transferencia" ? (
                          <Select
                            aria-label={`Categoría de ${titulo}`}
                            value={categoriaDe(i)}
                            onChange={(e) => setElegidas((x) => ({ ...x, [i.id]: e.target.value }))}
                            className="min-w-0 flex-1 sm:w-56"
                            disabled={pendiente}
                          >
                            <option value="">Elige categoría…</option>
                            {grupos.map((g) => (
                              <optgroup key={g.grupo} label={g.grupo}>
                                {g.opciones.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.etiqueta}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </Select>
                        ) : null}
                        <Button
                          size="icon"
                          aria-label={`Confirmar ${titulo}`}
                          title="Confirmar"
                          disabled={!listo(i) || pendiente}
                          onClick={() => confirmar([i])}
                        >
                          <CheckIcon />
                        </Button>
                        {i.registro === "compra_tc" ? (
                          <Button asChild size="icon" variant="outline" aria-label={`Editar ${titulo} en la tarjeta`}>
                            <Link href={`/tarjetas/${i.tarjeta_id}?tab=compras`} title="Editar en la tarjeta">
                              <PencilIcon />
                            </Link>
                          </Button>
                        ) : (
                          <Button
                            size="icon"
                            variant="outline"
                            aria-label={`Editar ${titulo}`}
                            title="Editar"
                            onClick={() => setEditando(i)}
                          >
                            <PencilIcon />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <HojaFormulario titulo="Editar movimiento" open={editando !== null} onOpenChange={(v) => !v && setEditando(null)}>
        {(cerrar) =>
          editando && editando.registro === "movimiento" ? (
            <MovimientoForm
              cuentas={
                cuentas.some((c) => c.id === editando.cuenta_id)
                  ? cuentas
                  : [...cuentas, { id: editando.cuenta_id, nombre: editando.origen, tipo: "", saldo: 0 }]
              }
              categorias={categorias}
              hoy={hoy}
              permitirCambiarTipo={false}
              movimiento={{
                id: editando.id,
                tipo: editando.tipo,
                fecha: editando.fecha,
                monto: editando.monto,
                cuenta_id: editando.cuenta_id,
                cuenta_destino_id: editando.cuenta_destino_id,
                categoria_id: editando.por_clasificar ? null : editando.categoria_id,
                obligacion_periodo_id: editando.obligacion_periodo_id,
                descripcion: editando.descripcion,
                comercio: editando.comercio,
                reembolsable: editando.reembolsable,
                adjunto_path: editando.adjunto_path,
              }}
              onGuardado={cerrar}
            />
          ) : null
        }
      </HojaFormulario>
    </>
  );
}
