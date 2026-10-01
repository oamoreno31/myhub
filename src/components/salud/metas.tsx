"use client";

import { ArchiveIcon, ArchiveRestoreIcon, PencilIcon, PlusIcon, TargetIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cambiarEstadoMeta, eliminarMeta, guardarMeta } from "@/actions/salud";
import { Medidor, pct } from "@/components/analisis/piezas";
import { BotonConfirmar } from "@/components/formularios/boton-confirmar";
import { HojaFormulario } from "@/components/formularios/hoja-formulario";
import { MontoInput } from "@/components/formularios/monto-input";
import { BotonGuardar, Linea, Segmentos, VistaPrevia } from "@/components/formularios/vista-previa";
import { Button } from "@/components/ui/button";
import { ariaCampo, Campo } from "@/components/ui/campo";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAccion } from "@/hooks/use-accion";
import type { EstadoAccion } from "@/lib/acciones";
import { formatearCOP } from "@/lib/domain/dinero";
import { avanceMeta, objetivoFondo, type TipoMeta, TIPOS_META } from "@/lib/domain/metas";
import { nombrePeriodo } from "@/lib/domain/periodos";
import type { MetaVista } from "@/lib/salud";

export type CuentaMeta = { id: string; nombre: string; saldo: number };
export type DeudaMeta = { id: string; nombre: string; saldo: number };

type Borrador = Partial<MetaVista> & { tipo: TipoMeta };

const fecha = (p: string | null) => (p ? nombrePeriodo(p).toLowerCase() : "");

function MetaForm({
  meta,
  cuentas,
  deudas,
  gastoEsencial,
  hoy,
  onGuardado,
}: {
  meta: Borrador;
  cuentas: CuentaMeta[];
  deudas: DeudaMeta[];
  gastoEsencial: number;
  hoy: string;
  onGuardado: () => void;
}) {
  const { onSubmit, pendiente, errores } = useAccion(guardarMeta, onGuardado);
  const [tipo, setTipo] = useState<TipoMeta>(meta.tipo);
  const [objetivo, setObjetivo] = useState<number | null>(meta.monto_objetivo ?? null);
  const [cuentaId, setCuentaId] = useState(meta.cuenta_id ?? cuentas[0]?.id ?? "");
  const [deudaId, setDeudaId] = useState(meta.deuda_id ?? deudas[0]?.id ?? "");
  const [aporte, setAporte] = useState<number | null>(meta.aporte_mensual ?? null);
  const [fechaObj, setFechaObj] = useState(meta.fecha_objetivo ?? "");
  const [version, setVersion] = useState(0);
  const deuda = deudas.find((d) => d.id === deudaId);
  const cuenta = cuentas.find((c) => c.id === cuentaId);

  const sugerido =
    tipo === "fondo_emergencia" && gastoEsencial > 0
      ? objetivoFondo(gastoEsencial)
      : tipo === "pagar_deuda" && deuda
        ? deuda.saldo
        : null;
  const usarSugerido = () => {
    if (sugerido === null) return;
    setObjetivo(sugerido);
    setVersion((v) => v + 1);
  };

  // Avance si se guarda así: para pagar una deuda, lo que ya se pagó frente al objetivo.
  const actual =
    tipo === "pagar_deuda"
      ? Math.max((objetivo ?? 0) - (deuda?.saldo ?? 0), 0)
      : Math.max(meta.id && meta.cuenta_id === cuentaId ? (meta.actual ?? 0) : (cuenta?.saldo ?? 0), 0);
  const av =
    objetivo && objetivo > 0
      ? avanceMeta({ objetivo, actual, aporteMensual: aporte, fechaObjetivo: fechaObj || null, hoy })
      : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {meta.id ? <input type="hidden" name="id" value={meta.id} /> : null}
      <input type="hidden" name="tipo" value={tipo} />
      <Segmentos
        etiqueta="Tipo de meta"
        opciones={(Object.keys(TIPOS_META) as TipoMeta[]).map((t) => ({ valor: t, etiqueta: TIPOS_META[t].etiqueta }))}
        valor={tipo}
        onCambio={(t) => setTipo(t)}
      />
      <Campo id="meta-nombre" etiqueta="Nombre" error={errores.nombre}>
        <Input
          {...ariaCampo("meta-nombre", errores.nombre)}
          name="nombre"
          maxLength={80}
          defaultValue={meta.nombre ?? (tipo === "fondo_emergencia" ? "Fondo de emergencia" : "")}
          placeholder={
            tipo === "compra"
              ? "Ej.: Computador nuevo"
              : tipo === "pagar_deuda"
                ? "Ej.: Salir de la libre inversión"
                : "Ej.: Viaje de diciembre"
          }
        />
      </Campo>
      {tipo === "pagar_deuda" ? (
        <Campo id="meta-deuda" etiqueta="Deuda" error={errores.deuda_id}>
          {deudas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tienes préstamos activos. Regístralos en Deudas.</p>
          ) : (
            <Select
              {...ariaCampo("meta-deuda", errores.deuda_id)}
              name="deuda_id"
              value={deudaId}
              onChange={(e) => setDeudaId(e.target.value)}
            >
              {deudas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre} · saldo {formatearCOP(d.saldo)}
                </option>
              ))}
            </Select>
          )}
        </Campo>
      ) : (
        <Campo
          id="meta-cuenta"
          etiqueta="¿Dónde guardas esta plata?"
          error={errores.cuenta_id}
          ayuda="El avance es el saldo de esa cuenta. Idealmente una cuenta o bolsillo solo para la meta."
        >
          <Select
            {...ariaCampo("meta-cuenta", errores.cuenta_id)}
            name="cuenta_id"
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
          >
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} · {formatearCOP(c.saldo)}
              </option>
            ))}
          </Select>
        </Campo>
      )}
      <Campo
        id="meta-objetivo"
        etiqueta="Objetivo"
        error={errores.monto_objetivo}
        ayuda={
          sugerido !== null ? (
            <button
              type="button"
              className="font-semibold text-primary underline-offset-4 hover:underline"
              onClick={usarSugerido}
            >
              Usar {formatearCOP(sugerido)}
              {tipo === "fondo_emergencia" ? " (6 meses de gasto esencial)" : " (saldo actual de la deuda)"}
            </button>
          ) : undefined
        }
      >
        <MontoInput
          key={`obj-${version}`}
          {...ariaCampo("meta-objetivo", errores.monto_objetivo)}
          name="monto_objetivo"
          grande
          defaultValue={objetivo}
          onValor={setObjetivo}
        />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo id="meta-aporte" etiqueta="Aporte al mes (opcional)" error={errores.aporte_mensual}>
          <MontoInput
            {...ariaCampo("meta-aporte", errores.aporte_mensual)}
            name="aporte_mensual"
            defaultValue={aporte}
            onValor={setAporte}
          />
        </Campo>
        <Campo id="meta-fecha" etiqueta="Para cuándo (opcional)" error={errores.fecha_objetivo}>
          <Input
            {...ariaCampo("meta-fecha", errores.fecha_objetivo)}
            type="date"
            name="fecha_objetivo"
            value={fechaObj}
            onChange={(e) => setFechaObj(e.target.value)}
          />
        </Campo>
      </div>
      <Campo id="meta-notas" etiqueta="Notas (opcional)" error={errores.notas}>
        <Textarea
          {...ariaCampo("meta-notas", errores.notas)}
          name="notas"
          rows={2}
          maxLength={300}
          defaultValue={meta.notas ?? ""}
        />
      </Campo>

      {av ? (
        <VistaPrevia tono={av.atrasada ? "alerta" : "normal"}>
          <Linea
            etiqueta={tipo === "pagar_deuda" ? "Ya pagado" : "Ya tienes"}
            valor={`${formatearCOP(actual)} · ${pct(av.pct)}`}
          />
          <Linea etiqueta="Te faltan" valor={formatearCOP(av.restante)} fuerte />
          {av.completa ? (
            <p className="font-semibold text-success">✓ Ya la cumpliste.</p>
          ) : (
            <>
              {av.fechaEstimada ? (
                <Linea etiqueta={`Con ${formatearCOP(aporte ?? 0)} al mes llegas en`} valor={fecha(av.fechaEstimada)} />
              ) : null}
              {av.aporteParaFecha !== null ? (
                <Linea
                  etiqueta={`Para ${fecha(fechaObj.slice(0, 7))} necesitas al mes`}
                  valor={formatearCOP(av.aporteParaFecha)}
                />
              ) : null}
              {av.atrasada ? (
                <p className="font-semibold text-warning">
                  ◐ Con ese aporte no llegas a la fecha: súbelo o corre la fecha.
                </p>
              ) : null}
            </>
          )}
        </VistaPrevia>
      ) : null}
      <BotonGuardar pendiente={pendiente} disabled={tipo === "pagar_deuda" && deudas.length === 0}>
        {meta.id ? "Guardar cambios" : "Crear meta"}
      </BotonGuardar>
    </form>
  );
}

export function PanelMetas({
  metas,
  cuentas,
  deudas,
  gastoEsencial,
  hoy,
}: {
  metas: MetaVista[];
  cuentas: CuentaMeta[];
  deudas: DeudaMeta[];
  gastoEsencial: number;
  /** Periodo actual "YYYY-MM". */
  hoy: string;
}) {
  const [hoja, setHoja] = useState<Borrador | null>(null);
  const [, startTransition] = useTransition();
  const activas = metas.filter((m) => m.activa);
  const archivadas = metas.filter((m) => !m.activa);
  const tieneFondo = activas.some((m) => m.tipo === "fondo_emergencia");

  const ejecutar = (fn: () => Promise<EstadoAccion>, despues?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.mensaje);
        despues?.();
      } else toast.error(r.error);
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-xl text-sm text-muted-foreground">
          Págate primero: aparta el aporte apenas te paguen. Para aportar, registra una transferencia a la cuenta de la
          meta con el botón +; el avance se actualiza solo.
        </p>
        <Button onClick={() => setHoja({ tipo: tieneFondo ? "ahorro" : "fondo_emergencia" })}>
          <PlusIcon /> Nueva meta
        </Button>
      </div>

      {!tieneFondo && gastoEsencial > 0 ? (
        <Card className="flex-col items-start gap-2 border-dashed sm:flex-row sm:items-center">
          <TargetIcon className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="flex flex-1 flex-col text-sm">
            <span className="font-bold">Aún no tienes fondo de emergencia</span>
            <span className="text-muted-foreground">
              Con tu gasto esencial de {formatearCOP(gastoEsencial)} al mes, 6 meses son{" "}
              {formatearCOP(objetivoFondo(gastoEsencial))}.
            </span>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              setHoja({
                tipo: "fondo_emergencia",
                nombre: "Fondo de emergencia",
                monto_objetivo: objetivoFondo(gastoEsencial),
              })
            }
          >
            Crear fondo
          </Button>
        </Card>
      ) : null}

      {activas.length === 0 ? (
        <Card className="items-center gap-2 py-10 text-center">
          <TargetIcon className="size-8 text-muted-foreground" aria-hidden="true" />
          <span className="font-bold">Sin metas activas</span>
          <span className="max-w-sm text-sm text-muted-foreground">
            Una meta con fecha te dice cuánto apartar cada mes; una con aporte te dice cuándo llegas.
          </span>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {activas.map((m) => {
            const av = avanceMeta({
              objetivo: m.monto_objetivo,
              actual: m.actual,
              aporteMensual: m.aporte_mensual,
              fechaObjetivo: m.fecha_objetivo,
              hoy,
            });
            return (
              <Card key={m.id} className="gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-bold">{m.nombre}</span>
                    <span className="text-xs text-muted-foreground">
                      {TIPOS_META[m.tipo].etiqueta} ·{" "}
                      {m.tipo === "pagar_deuda"
                        ? `${m.deuda_nombre ?? "Deuda"}: saldo ${formatearCOP(m.deuda_saldo ?? 0)}`
                        : `en ${m.cuenta_nombre ?? "cuenta eliminada"}`}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar ${m.nombre}`}
                    onClick={() => setHoja({ ...m })}
                  >
                    <PencilIcon />
                  </Button>
                </div>
                <Medidor
                  etiqueta={`${formatearCOP(m.actual)} de ${formatearCOP(m.monto_objetivo)}`}
                  valor={av.pct}
                  estado={av.completa ? "ok" : av.atrasada ? "atencion" : "progreso"}
                  textoEstado={av.completa ? "cumplida" : `${pct(av.pct)}${av.atrasada ? " · atrasada" : ""}`}
                />
                <ul className="flex flex-col gap-0.5 text-sm">
                  {av.completa ? (
                    <li className="font-semibold text-success">✓ ¡Meta cumplida! Archívala o sube el objetivo.</li>
                  ) : (
                    <>
                      <li>
                        Te faltan <strong>{formatearCOP(av.restante)}</strong>
                      </li>
                      {av.fechaEstimada ? (
                        <li className="text-muted-foreground">
                          Con {formatearCOP(m.aporte_mensual ?? 0)} al mes llegas en {fecha(av.fechaEstimada)}
                        </li>
                      ) : null}
                      {av.aporteParaFecha !== null ? (
                        <li className={av.atrasada ? "font-semibold text-warning" : "text-muted-foreground"}>
                          {av.atrasada ? "◐ " : ""}Para {fecha(m.fecha_objetivo!.slice(0, 7))} necesitas{" "}
                          {formatearCOP(av.aporteParaFecha)} al mes
                        </li>
                      ) : null}
                      {!av.fechaEstimada && av.aporteParaFecha === null ? (
                        <li className="text-muted-foreground">
                          Ponle un aporte o una fecha para estimar cuándo llegas.
                        </li>
                      ) : null}
                    </>
                  )}
                </ul>
                <div className="flex flex-wrap gap-1">
                  <Button variant="ghost" size="sm" onClick={() => ejecutar(() => cambiarEstadoMeta(m.id, false))}>
                    <ArchiveIcon /> Archivar
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {archivadas.length > 0 ? (
        <details className="rounded-2xl border bg-card px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold">Metas archivadas ({archivadas.length})</summary>
          <ul className="mt-2 flex flex-col divide-y">
            {archivadas.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {m.nombre} · {formatearCOP(m.actual)} de {formatearCOP(m.monto_objetivo)}
                </span>
                <span className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => ejecutar(() => cambiarEstadoMeta(m.id, true))}>
                    <ArchiveRestoreIcon /> Reactivar
                  </Button>
                  <BotonConfirmar
                    etiqueta="Eliminar"
                    titulo={`¿Eliminar "${m.nombre}"?`}
                    detalle="Se borra la meta; tus cuentas y movimientos no cambian."
                    onConfirmar={() => ejecutar(() => eliminarMeta(m.id))}
                  />
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <HojaFormulario
        titulo={hoja?.id ? "Editar meta" : "Nueva meta"}
        open={hoja !== null}
        onOpenChange={(v) => !v && setHoja(null)}
      >
        {() =>
          hoja ? (
            <MetaForm
              meta={hoja}
              cuentas={cuentas}
              deudas={deudas}
              gastoEsencial={gastoEsencial}
              hoy={hoy}
              onGuardado={() => setHoja(null)}
            />
          ) : null
        }
      </HojaFormulario>
    </div>
  );
}
