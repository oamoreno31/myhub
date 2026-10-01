"use client";

import { Loader2Icon } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ajustarObligacion, cerrarMes, crearObligacionPuntual, omitirObligacion, reabrirMes } from "@/actions/mes";
import { MontoInput } from "@/components/formularios/monto-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ariaCampo, Campo, Casilla } from "@/components/ui/campo";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAccion } from "@/hooks/use-accion";
import { type CategoriaBasica, opcionesCategorias } from "@/lib/categorias";
import type { ObligacionMesUI } from "@/lib/datos";
import { formatearCOP } from "@/lib/domain/dinero";
import { cn } from "@/lib/utils";

type CuentaOpcion = { id: string; nombre: string };

export function ObligacionPuntualForm({
  periodoId,
  periodoPrimerDia,
  categorias,
  cuentas,
  onGuardado,
}: {
  periodoId: string;
  periodoPrimerDia: string;
  categorias: CategoriaBasica[];
  cuentas: CuentaOpcion[];
  onGuardado: () => void;
}) {
  const [esIngreso, setEsIngreso] = useState(false);
  const grupos = useMemo(
    () => opcionesCategorias(categorias, esIngreso ? "ingreso" : "gasto"),
    [categorias, esIngreso],
  );
  const { onSubmit, pendiente, errores } = useAccion(crearObligacionPuntual, onGuardado);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="periodo_id" value={periodoId} />
      <p className="text-sm text-muted-foreground">
        Para algo que solo pasa este mes (una multa, un trámite, un regalo). Lo recurrente se configura como plantilla.
      </p>
      <Casilla name="es_ingreso" checked={esIngreso} onChange={(e) => setEsIngreso(e.target.checked)}>
        Es un ingreso que espero recibir
      </Casilla>
      <Campo id="op-nombre" etiqueta="Nombre" error={errores.nombre}>
        <Input
          {...ariaCampo("op-nombre", errores.nombre)}
          name="nombre"
          maxLength={80}
          required
          placeholder="Ej.: Revisión técnico-mecánica"
        />
      </Campo>
      <Campo id="op-categoria" etiqueta="Categoría" error={errores.categoria_id}>
        <Select
          {...ariaCampo("op-categoria", errores.categoria_id)}
          name="categoria_id"
          required
          defaultValue=""
          key={String(esIngreso)}
        >
          <option value="">Elige una categoría</option>
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
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo id="op-monto" etiqueta="Monto esperado" error={errores.monto_esperado}>
          <MontoInput {...ariaCampo("op-monto", errores.monto_esperado)} name="monto_esperado" required />
        </Campo>
        <Campo id="op-fecha" etiqueta={esIngreso ? "Fecha esperada" : "Vence"} error={errores.fecha_vencimiento}>
          <Input
            {...ariaCampo("op-fecha", errores.fecha_vencimiento)}
            type="date"
            name="fecha_vencimiento"
            defaultValue={periodoPrimerDia}
            required
          />
        </Campo>
      </div>
      <Campo id="op-cuenta" etiqueta="Cuenta habitual (opcional)">
        <Select id="op-cuenta" name="cuenta_default_id" defaultValue="">
          <option value="">Sin cuenta por defecto</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Select>
      </Campo>
      <Button type="submit" size="lg" disabled={pendiente}>
        {pendiente ? <Loader2Icon className="animate-spin" /> : null} Agregar al mes
      </Button>
    </form>
  );
}

export function AjusteObligacionForm({
  obligacion,
  onGuardado,
}: {
  obligacion: ObligacionMesUI;
  onGuardado: () => void;
}) {
  const { onSubmit, pendiente, errores } = useAccion(ajustarObligacion, onGuardado);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={obligacion.id} />
      <p className="text-sm text-muted-foreground">
        Úsalo cuando llega la factura real (p. ej. la luz) o cambia la fecha. Solo afecta este mes.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Campo id="aj-monto" etiqueta="Monto de este mes" error={errores.monto_esperado}>
          <MontoInput
            {...ariaCampo("aj-monto", errores.monto_esperado)}
            name="monto_esperado"
            defaultValue={obligacion.monto_esperado}
            required
            autoFocus
          />
        </Campo>
        <Campo id="aj-fecha" etiqueta="Vence" error={errores.fecha_vencimiento}>
          <Input
            {...ariaCampo("aj-fecha", errores.fecha_vencimiento)}
            type="date"
            name="fecha_vencimiento"
            defaultValue={obligacion.fecha_vencimiento}
            required
          />
        </Campo>
      </div>
      <Campo id="aj-nota" etiqueta="Nota (opcional)" error={errores.nota}>
        <Input
          {...ariaCampo("aj-nota", errores.nota)}
          name="nota"
          defaultValue={obligacion.nota ?? ""}
          maxLength={200}
          placeholder="Ej.: factura con consumo alto por visita"
        />
      </Campo>
      <Button type="submit" size="lg" disabled={pendiente}>
        {pendiente ? <Loader2Icon className="animate-spin" /> : null} Guardar ajuste
      </Button>
    </form>
  );
}

export function OmitirObligacionForm({
  obligacion,
  onGuardado,
}: {
  obligacion: ObligacionMesUI;
  onGuardado: () => void;
}) {
  const { onSubmit, pendiente, errores } = useAccion(omitirObligacion, onGuardado);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={obligacion.id} />
      <p className="text-sm text-muted-foreground">
        &quot;{obligacion.nombre}&quot; no contará como pendiente este mes. Puedes restaurarla mientras el mes esté
        abierto.
      </p>
      <Campo id="om-motivo" etiqueta="Motivo" error={errores.motivo}>
        <Input
          {...ariaCampo("om-motivo", errores.motivo)}
          name="motivo"
          maxLength={200}
          required
          autoFocus
          placeholder="Ej.: la factura llega el próximo mes"
        />
      </Campo>
      <Button type="submit" size="lg" variant="secondary" disabled={pendiente}>
        {pendiente ? <Loader2Icon className="animate-spin" /> : null} Omitir este mes
      </Button>
    </form>
  );
}

export function ReabrirMesForm({ periodoId, onGuardado }: { periodoId: string; onGuardado: () => void }) {
  const { onSubmit, pendiente, errores } = useAccion(reabrirMes, onGuardado);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="periodo_id" value={periodoId} />
      <p className="text-sm text-muted-foreground">
        El mes vuelve a quedar editable. Lo que se pasó al mes siguiente se mantiene allá. Queda registro en la
        bitácora.
      </p>
      <Campo id="re-motivo" etiqueta="Motivo" error={errores.motivo}>
        <Input
          {...ariaCampo("re-motivo", errores.motivo)}
          name="motivo"
          maxLength={200}
          required
          autoFocus
          placeholder="Ej.: faltó registrar un gasto"
        />
      </Campo>
      <Button type="submit" size="lg" disabled={pendiente}>
        {pendiente ? <Loader2Icon className="animate-spin" /> : null} Reabrir mes
      </Button>
    </form>
  );
}

type Decision = { accion: "arrastrar" | "omitir"; motivo: string };

/** Asistente de cierre: una decisión por cada pendiente, resumen y confirmación. */
export function CierreMes({
  periodoId,
  nombreMes,
  nombreSiguiente,
  pendientes,
  resumen,
  mesTerminado,
  onCerrado,
}: {
  periodoId: string;
  nombreMes: string;
  nombreSiguiente: string;
  pendientes: ObligacionMesUI[];
  resumen: { ingresos: number; gastos: number; pagadas: number; total: number };
  mesTerminado: boolean;
  onCerrado: () => void;
}) {
  const [decisiones, setDecisiones] = useState<Record<string, Decision>>(() =>
    Object.fromEntries(
      pendientes.map((o) => [
        o.id,
        { accion: o.es_ingreso ? "omitir" : "arrastrar", motivo: o.es_ingreso ? "No se recibió este mes" : "" },
      ]),
    ),
  );
  const [cerrando, startTransition] = useTransition();

  const faltanMotivos = pendientes.some(
    (o) => decisiones[o.id]?.accion === "omitir" && decisiones[o.id].motivo.trim().length < 3,
  );
  const balance = resumen.ingresos - resumen.gastos;

  const cerrar = () => {
    startTransition(async () => {
      const r = await cerrarMes(
        periodoId,
        pendientes.map((o) => ({ id: o.id, ...decisiones[o.id] })),
      );
      if (r.ok) {
        toast.success(r.mensaje);
        onCerrado();
      } else {
        toast.error(r.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {!mesTerminado ? (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm font-semibold text-warning">
          ! {nombreMes} aún no termina. Puedes cerrarlo igual, pero lo normal es hacerlo el primer día del mes
          siguiente.
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-muted/70 p-3">
          <div className="text-xs text-muted-foreground">Ingresos</div>
          <div className="font-bold text-success">{formatearCOP(resumen.ingresos)}</div>
        </div>
        <div className="rounded-xl bg-muted/70 p-3">
          <div className="text-xs text-muted-foreground">Gastos</div>
          <div className="font-bold">{formatearCOP(resumen.gastos)}</div>
        </div>
        <div className="rounded-xl bg-muted/70 p-3">
          <div className="text-xs text-muted-foreground">Balance</div>
          <div className={cn("font-bold", balance < 0 && "text-destructive")}>
            {formatearCOP(balance, { signo: true })}
          </div>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {resumen.pagadas} de {resumen.total} obligaciones pagadas.{" "}
        {pendientes.length === 0
          ? "No quedan pendientes."
          : `Decide qué hacer con ${pendientes.length === 1 ? "la pendiente" : `las ${pendientes.length} pendientes`}:`}
      </p>

      {pendientes.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {pendientes.map((o) => {
            const d = decisiones[o.id];
            const set = (cambio: Partial<Decision>) =>
              setDecisiones((prev) => ({ ...prev, [o.id]: { ...prev[o.id], ...cambio } }));
            return (
              <li key={o.id} className="flex flex-col gap-2 rounded-xl border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="font-bold">{o.nombre}</span>
                    <span className="text-xs text-muted-foreground">
                      {o.es_ingreso ? "Por recibir" : "Pendiente"} {formatearCOP(o.pendiente || o.monto_esperado)}
                    </span>
                  </div>
                  {o.es_ingreso ? <Badge variant="info">Ingreso</Badge> : null}
                </div>
                <div
                  role="radiogroup"
                  aria-label={`Qué hacer con ${o.nombre}`}
                  className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1"
                >
                  {(["arrastrar", "omitir"] as const).map((accion) => (
                    <button
                      key={accion}
                      type="button"
                      role="radio"
                      aria-checked={d.accion === accion}
                      onClick={() => set({ accion })}
                      className={cn(
                        "h-9 rounded-md text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        d.accion === accion ? "bg-card shadow-sm" : "text-muted-foreground",
                      )}
                    >
                      {accion === "arrastrar" ? `» Pasar a ${nombreSiguiente}` : "— Omitir"}
                    </button>
                  ))}
                </div>
                {d.accion === "omitir" ? (
                  <Input
                    aria-label={`Motivo para omitir ${o.nombre}`}
                    value={d.motivo}
                    onChange={(e) => set({ motivo: e.target.value })}
                    placeholder="Motivo (obligatorio)"
                    maxLength={200}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
        Se guardará la foto del mes (ingresos, gastos, obligaciones) y quedará en solo lectura. Podrás reabrirlo si hace
        falta.
      </p>
      <Button size="lg" onClick={cerrar} disabled={cerrando || faltanMotivos}>
        {cerrando ? <Loader2Icon className="animate-spin" /> : null} Cerrar {nombreMes}
      </Button>
      {faltanMotivos ? (
        <p className="text-center text-xs text-destructive">Escribe el motivo de cada omisión.</p>
      ) : null}
    </div>
  );
}
