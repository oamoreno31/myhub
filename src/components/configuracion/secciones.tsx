"use client";

import { ArchiveIcon, ArchiveRestoreIcon, PauseIcon, PencilIcon, PlayIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { alternarCategoria, alternarCuenta, alternarPlantilla } from "@/actions/configuracion";
import { HojaFormulario } from "@/components/formularios/hoja-formulario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { EstadoAccion } from "@/lib/acciones";
import type { CategoriaBasica } from "@/lib/categorias";
import { formatearCOP } from "@/lib/domain/dinero";
import { ETIQUETA_FRECUENCIA } from "@/lib/domain/obligaciones";
import { cn } from "@/lib/utils";
import {
  BOLSAS,
  CategoriaForm,
  type CategoriaEditable,
  CuentaForm,
  type CuentaEditable,
  PlantillaForm,
  type PlantillaEditable,
  TIPOS_CUENTA,
  TIPOS_OBLIGACION_UI,
} from "./formularios";

function useAlternar() {
  const [pendiente, startTransition] = useTransition();
  const ejecutar = (fn: () => Promise<EstadoAccion>) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.mensaje);
      else toast.error(r.error);
    });
  return { pendiente, ejecutar };
}

// ── Cuentas ────────────────────────────────────────────────────────────────

export type CuentaFila = CuentaEditable & { saldo: number; activa: boolean; n_movimientos: number };

export function SeccionCuentas({ cuentas, hoy }: { cuentas: CuentaFila[]; hoy: string }) {
  const [hoja, setHoja] = useState<{ cuenta?: CuentaEditable } | null>(null);
  const { pendiente, ejecutar } = useAlternar();
  const tarjetas = cuentas.filter((c) => c.tipo === "tarjeta_credito");
  const lista = cuentas.filter((c) => c.tipo !== "tarjeta_credito");
  const etiquetaTipo = (t: string) => TIPOS_CUENTA.find((x) => x.valor === t)?.etiqueta ?? t;

  return (
    <div className={cn("flex flex-col gap-4", pendiente && "opacity-70")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Dónde está o por dónde sale la plata.</p>
        <Button onClick={() => setHoja({})}>
          <PlusIcon /> Nueva cuenta
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {lista.map((c) => (
          <Card key={c.id} className={cn("gap-2 p-4", !c.activa && "opacity-60")}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col">
                <span className="font-bold">{c.nombre}</span>
                <span className="text-xs text-muted-foreground">
                  {etiquetaTipo(c.tipo)}
                  {c.entidad ? ` · ${c.entidad}` : ""}
                </span>
              </div>
              {!c.activa ? <Badge>Archivada</Badge> : null}
            </div>
            <span className={cn("text-xl font-bold", c.saldo < 0 && "text-destructive")}>{formatearCOP(c.saldo)}</span>
            <span className="text-xs text-muted-foreground">
              Inicial {formatearCOP(c.saldo_inicial)}
              {c.fecha_saldo_inicial
                ? ` al ${c.fecha_saldo_inicial.slice(8)}/${c.fecha_saldo_inicial.slice(5, 7)}/${c.fecha_saldo_inicial.slice(0, 4)}`
                : ""}{" "}
              ·{" "}
              <Link href={`/movimientos?cuenta=${c.id}`} className="font-semibold text-primary hover:underline">
                {c.n_movimientos} movimientos
              </Link>
            </span>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => setHoja({ cuenta: c })}>
                <PencilIcon /> Editar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => ejecutar(() => alternarCuenta(c.id, !c.activa))}>
                {c.activa ? <ArchiveIcon /> : <ArchiveRestoreIcon />} {c.activa ? "Archivar" : "Activar"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {tarjetas.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {tarjetas.length} tarjeta(s) de crédito: se gestionan en{" "}
          <Link href="/tarjetas" className="font-semibold text-primary hover:underline">
            Tarjetas
          </Link>
          .
        </p>
      ) : null}
      <HojaFormulario
        titulo={hoja?.cuenta ? "Editar cuenta" : "Nueva cuenta"}
        open={hoja !== null}
        onOpenChange={(v) => !v && setHoja(null)}
      >
        {(cerrar) => <CuentaForm cuenta={hoja?.cuenta} hoy={hoy} onGuardado={cerrar} />}
      </HojaFormulario>
    </div>
  );
}

// ── Categorías ─────────────────────────────────────────────────────────────

export function SeccionCategorias({ categorias }: { categorias: CategoriaEditable[] }) {
  const [hoja, setHoja] = useState<{ categoria?: CategoriaEditable; tipo?: "ingreso" | "gasto" } | null>(null);
  const { pendiente, ejecutar } = useAlternar();
  const bolsa = (b: string) => BOLSAS.find((x) => x.valor === b)?.etiqueta.split(" (")[0];

  return (
    <div className={cn("grid grid-cols-1 gap-4 lg:grid-cols-2", pendiente && "opacity-70")}>
      {(["gasto", "ingreso"] as const).map((tipo) => {
        const padres = categorias.filter((c) => c.tipo === tipo && !c.padre_id).sort((a, b) => a.orden - b.orden);
        return (
          <Card key={tipo} className="gap-0">
            <div className="flex items-center justify-between pb-3">
              <h2 className="font-bold">Categorías de {tipo}</h2>
              <Button size="sm" variant="outline" onClick={() => setHoja({ tipo })}>
                <PlusIcon /> Nueva
              </Button>
            </div>
            <ul>
              {padres.map((p) => {
                const hijas = categorias.filter((c) => c.padre_id === p.id).sort((a, b) => a.orden - b.orden);
                return (
                  <li key={p.id} className="border-t py-2">
                    <FilaCategoria
                      c={p}
                      bolsa={bolsa(p.bolsa)}
                      onEditar={() => setHoja({ categoria: p })}
                      onAlternar={() => ejecutar(() => alternarCategoria(p.id, !p.activa))}
                    />
                    {hijas.length > 0 ? (
                      <ul className="ml-4 border-l pl-3">
                        {hijas.map((h) => (
                          <li key={h.id}>
                            <FilaCategoria
                              c={h}
                              bolsa={bolsa(h.bolsa)}
                              onEditar={() => setHoja({ categoria: h })}
                              onAlternar={() => ejecutar(() => alternarCategoria(h.id, !h.activa))}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
      <HojaFormulario
        titulo={hoja?.categoria ? "Editar categoría" : `Nueva categoría de ${hoja?.tipo ?? "gasto"}`}
        open={hoja !== null}
        onOpenChange={(v) => !v && setHoja(null)}
      >
        {(cerrar) => (
          <CategoriaForm
            categoria={hoja?.categoria}
            tipoNueva={hoja?.tipo}
            categorias={categorias}
            onGuardado={cerrar}
          />
        )}
      </HojaFormulario>
    </div>
  );
}

function FilaCategoria({
  c,
  bolsa,
  onEditar,
  onAlternar,
}: {
  c: CategoriaEditable;
  bolsa?: string;
  onEditar: () => void;
  onAlternar: () => void;
}) {
  return (
    <div className={cn("flex items-center gap-2 py-1", !c.activa && "opacity-50")}>
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: c.color ?? "var(--muted-foreground)" }}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
        {c.nombre}
        <span className="ml-2 text-xs font-normal text-muted-foreground">{c.grupo}</span>
      </span>
      {c.tipo === "gasto" && c.bolsa !== "no_aplica" ? (
        <Badge variant="info" className="hidden sm:inline-flex">
          {bolsa}
        </Badge>
      ) : null}
      {c.requiere_descripcion ? <Badge className="hidden sm:inline-flex">Desc. obligatoria</Badge> : null}
      {c.es_sistema ? <Badge>Sistema</Badge> : null}
      {!c.activa ? <Badge>Inactiva</Badge> : null}
      <Button size="icon-sm" variant="ghost" aria-label={`Editar ${c.nombre}`} onClick={onEditar}>
        <PencilIcon />
      </Button>
      {!c.es_sistema ? (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={c.activa ? `Desactivar ${c.nombre}` : `Activar ${c.nombre}`}
          onClick={onAlternar}
        >
          {c.activa ? <ArchiveIcon /> : <ArchiveRestoreIcon />}
        </Button>
      ) : (
        <span className="size-9" aria-hidden="true" />
      )}
    </div>
  );
}

// ── Obligaciones recurrentes ──────────────────────────────────────────────

export type PlantillaFila = PlantillaEditable & {
  activa: boolean;
  categoria_nombre: string;
  cuenta_nombre: string | null;
  es_ingreso: boolean;
};

export function SeccionObligaciones({
  plantillas,
  categorias,
  cuentas,
  periodoActual,
}: {
  plantillas: PlantillaFila[];
  categorias: CategoriaBasica[];
  cuentas: { id: string; nombre: string; tipo?: string }[];
  periodoActual: string;
}) {
  const [hoja, setHoja] = useState<{ plantilla?: PlantillaEditable } | null>(null);
  const { pendiente, ejecutar } = useAlternar();
  const etiquetaTipo = (t: string) => TIPOS_OBLIGACION_UI.find((x) => x.valor === t)?.etiqueta ?? t;
  const grupos = [
    { titulo: "Pagos recurrentes", items: plantillas.filter((p) => !p.es_ingreso) },
    { titulo: "Ingresos esperados", items: plantillas.filter((p) => p.es_ingreso) },
  ];

  return (
    <div className={cn("flex flex-col gap-4", pendiente && "opacity-70")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Plantillas: cada mes se crean solas en tu checklist según su frecuencia.
        </p>
        <Button onClick={() => setHoja({})}>
          <PlusIcon /> Nueva
        </Button>
      </div>
      {grupos.map((g) => (
        <Card key={g.titulo} className="gap-0">
          <h2 className="pb-3 font-bold">
            {g.titulo} ({g.items.length})
          </h2>
          {g.items.length === 0 ? (
            <p className="border-t py-3 text-sm text-muted-foreground">Nada configurado todavía.</p>
          ) : (
            <ul>
              {g.items.map((p) => (
                <li key={p.id} className={cn("flex items-center gap-3 border-t py-3", !p.activa && "opacity-55")}>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-bold">{p.nombre}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {etiquetaTipo(p.tipo)} · {p.categoria_nombre} · {ETIQUETA_FRECUENCIA[p.frecuencia]} · día{" "}
                      {p.dia_vencimiento}
                      {p.cuenta_nombre ? ` · ${p.cuenta_nombre}` : ""}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-bold whitespace-nowrap">{formatearCOP(p.monto_estimado)}</span>
                    <span className="flex gap-1">
                      {p.es_variable ? (
                        <Badge variant="warning">{p.estimar_con_promedio ? "Promedio" : "Variable"}</Badge>
                      ) : null}
                      {!p.activa ? <Badge>Pausada</Badge> : null}
                    </span>
                  </div>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Editar ${p.nombre}`}
                    onClick={() => setHoja({ plantilla: p })}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={p.activa ? `Pausar ${p.nombre}` : `Activar ${p.nombre}`}
                    onClick={() => ejecutar(() => alternarPlantilla(p.id, !p.activa))}
                  >
                    {p.activa ? <PauseIcon /> : <PlayIcon />}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
      <p className="text-xs text-muted-foreground">
        El pago de cada tarjeta de crédito aparece solo en el mes cuando registras su extracto (no se configura aquí).
        Las cuotas de préstamos y cooperativas se crean desde{" "}
        <Link href="/deudas" className="font-semibold text-primary hover:underline">
          Deudas
        </Link>{" "}
        (con su desglose de capital, intereses y aportes).
      </p>
      <HojaFormulario
        titulo={hoja?.plantilla ? "Editar obligación recurrente" : "Nueva obligación recurrente"}
        open={hoja !== null}
        onOpenChange={(v) => !v && setHoja(null)}
      >
        {(cerrar) => (
          <PlantillaForm
            plantilla={hoja?.plantilla}
            categorias={categorias}
            cuentas={cuentas}
            periodoActual={periodoActual}
            onGuardado={cerrar}
          />
        )}
      </HojaFormulario>
    </div>
  );
}
