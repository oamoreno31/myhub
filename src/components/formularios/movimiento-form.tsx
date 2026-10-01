"use client";

import { ArrowDownLeftIcon, ArrowLeftRightIcon, ArrowUpRightIcon, Loader2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { guardarMovimiento } from "@/actions/movimientos";
import { Button } from "@/components/ui/button";
import { ariaCampo, Campo, Casilla } from "@/components/ui/campo";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAccion } from "@/hooks/use-accion";
import { buscarOpcion, type CategoriaBasica, opcionesCategorias } from "@/lib/categorias";
import { cuentaPorDefecto } from "@/lib/cuentas";
import { formatearCOP } from "@/lib/domain/dinero";
import { vistaPreviaPago } from "@/lib/domain/obligaciones";
import { cn } from "@/lib/utils";
import { CampoComprobante } from "./campo-comprobante";
import { MontoInput } from "./monto-input";

export type TipoMovimiento = "gasto" | "ingreso" | "transferencia";

export type CuentaOpcion = { id: string; nombre: string; tipo: string; saldo: number };

export type ObligacionParaPago = {
  id: string;
  nombre: string;
  categoria_id: string;
  categoria_nombre: string;
  cuenta_default_id: string | null;
  es_ingreso: boolean;
  monto_esperado: number;
  pagado: number;
  pendiente: number;
};

export type MovimientoEditable = {
  id: string;
  tipo: TipoMovimiento;
  fecha: string;
  monto: number;
  cuenta_id: string;
  cuenta_destino_id: string | null;
  categoria_id: string | null;
  obligacion_periodo_id: string | null;
  descripcion: string | null;
  comercio: string | null;
  reembolsable: boolean;
  adjunto_path?: string | null;
};

const TIPOS: { valor: TipoMovimiento; etiqueta: string; icono: typeof ArrowUpRightIcon }[] = [
  { valor: "gasto", etiqueta: "Gasto", icono: ArrowUpRightIcon },
  { valor: "ingreso", etiqueta: "Ingreso", icono: ArrowDownLeftIcon },
  { valor: "transferencia", etiqueta: "Transferencia", icono: ArrowLeftRightIcon },
];

export function MovimientoForm({
  cuentas,
  categorias,
  hoy,
  tipoInicial = "gasto",
  permitirCambiarTipo = true,
  movimiento,
  obligacion,
  onGuardado,
}: {
  cuentas: CuentaOpcion[];
  categorias: CategoriaBasica[];
  hoy: string;
  tipoInicial?: TipoMovimiento;
  permitirCambiarTipo?: boolean;
  movimiento?: MovimientoEditable;
  obligacion?: ObligacionParaPago;
  onGuardado?: () => void;
}) {
  const tipoBase: TipoMovimiento =
    movimiento?.tipo ?? (obligacion ? (obligacion.es_ingreso ? "ingreso" : "gasto") : tipoInicial);
  const [tipo, setTipo] = useState<TipoMovimiento>(tipoBase);
  const [monto, setMonto] = useState<number | null>(
    movimiento?.monto ?? (obligacion && obligacion.pendiente > 0 ? obligacion.pendiente : null),
  );
  const [cuentaId, setCuentaId] = useState(
    movimiento?.cuenta_id ?? obligacion?.cuenta_default_id ?? cuentaPorDefecto(cuentas)?.id ?? "",
  );
  const [destinoId, setDestinoId] = useState(movimiento?.cuenta_destino_id ?? "");
  const [categoriaId, setCategoriaId] = useState(movimiento?.categoria_id ?? obligacion?.categoria_id ?? "");
  const { onSubmit, pendiente, errores } = useAccion(guardarMovimiento, () => onGuardado?.());

  const grupos = useMemo(
    () => (tipo === "transferencia" ? [] : opcionesCategorias(categorias, tipo === "ingreso" ? "ingreso" : "gasto")),
    [categorias, tipo],
  );
  const opcion = buscarOpcion(grupos, categoriaId);
  const cuenta = cuentas.find((c) => c.id === cuentaId);
  const destino = cuentas.find((c) => c.id === destinoId);
  const pagoDeObligacion = Boolean(obligacion);

  const cambiarTipo = (t: TipoMovimiento) => {
    setTipo(t);
    setCategoriaId("");
  };

  // Vista previa del efecto (regla 10 del proyecto).
  let vistaPrevia: React.ReactNode = null;
  if (monto && monto > 0) {
    if (obligacion) {
      const pagadoPrevio = movimiento ? obligacion.pagado - movimiento.monto : obligacion.pagado;
      const v = vistaPreviaPago(obligacion.monto_esperado, pagadoPrevio, monto);
      vistaPrevia =
        v.estado === "pagada" ? (
          <span>
            <strong className="text-success">✓ Quedará {obligacion.es_ingreso ? "recibida" : "pagada"}</strong>
            {v.excedente > 0 ? ` · ${formatearCOP(v.excedente)} por encima de lo esperado` : ""}
          </span>
        ) : (
          <span>
            <strong className="text-warning">◐ Quedará parcial</strong> · faltarán {formatearCOP(v.faltante)}
          </span>
        );
    } else if (tipo === "transferencia" && cuenta && destino) {
      vistaPrevia = (
        <span>
          {cuenta.nombre}: {formatearCOP(cuenta.saldo - monto)} · {destino.nombre}:{" "}
          {formatearCOP(destino.saldo + monto)}
        </span>
      );
    } else if (cuenta && !movimiento) {
      const nuevo = tipo === "ingreso" ? cuenta.saldo + monto : cuenta.saldo - monto;
      vistaPrevia = (
        <span>
          Saldo de {cuenta.nombre} después:{" "}
          <strong className={nuevo < 0 ? "text-destructive" : undefined}>{formatearCOP(nuevo)}</strong>
        </span>
      );
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {movimiento ? <input type="hidden" name="id" value={movimiento.id} /> : null}
      <input type="hidden" name="tipo" value={tipo} />
      {obligacion ? <input type="hidden" name="obligacion_periodo_id" value={obligacion.id} /> : null}
      {movimiento?.obligacion_periodo_id && !obligacion ? (
        <input type="hidden" name="obligacion_periodo_id" value={movimiento.obligacion_periodo_id} />
      ) : null}

      {permitirCambiarTipo && !pagoDeObligacion ? (
        <div
          role="radiogroup"
          aria-label="Tipo de movimiento"
          className="grid grid-cols-3 gap-1 rounded-xl bg-secondary p-1"
        >
          {TIPOS.map((t) => {
            const Icono = t.icono;
            const activo = tipo === t.valor;
            return (
              <button
                key={t.valor}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => cambiarTipo(t.valor)}
                className={cn(
                  "flex h-10 min-w-0 items-center justify-center gap-1 rounded-lg px-1 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-1.5 sm:text-sm",
                  activo ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                <Icono className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{t.etiqueta}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {obligacion ? (
        <div className="flex flex-col gap-0.5 rounded-xl bg-muted/70 px-4 py-3 text-sm">
          <span className="font-bold">{obligacion.nombre}</span>
          <span className="text-muted-foreground">
            {obligacion.categoria_nombre} · esperado {formatearCOP(obligacion.monto_esperado)}
            {obligacion.pagado > 0
              ? ` · ya ${obligacion.es_ingreso ? "recibido" : "pagado"} ${formatearCOP(obligacion.pagado)}`
              : ""}
          </span>
        </div>
      ) : null}

      <Campo id="mov-monto" etiqueta="Monto" error={errores.monto}>
        <MontoInput
          {...ariaCampo("mov-monto", errores.monto)}
          name="monto"
          grande
          defaultValue={monto}
          onValor={setMonto}
          autoFocus={!movimiento}
          required
        />
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo id="mov-fecha" etiqueta="Fecha" error={errores.fecha}>
          <Input
            {...ariaCampo("mov-fecha", errores.fecha)}
            type="date"
            name="fecha"
            defaultValue={movimiento?.fecha ?? hoy}
            max="2100-12-31"
            required
          />
        </Campo>
        <Campo
          id="mov-cuenta"
          etiqueta={tipo === "ingreso" ? "Entra a" : tipo === "transferencia" ? "Desde" : "Sale de"}
          error={errores.cuenta_id}
        >
          <Select
            {...ariaCampo("mov-cuenta", errores.cuenta_id)}
            name="cuenta_id"
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
            required
          >
            {cuentas.length === 0 ? <option value="">Crea una cuenta primero</option> : null}
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </Campo>
      </div>

      {tipo === "transferencia" ? (
        <Campo id="mov-destino" etiqueta="Hacia" error={errores.cuenta_destino_id}>
          <Select
            {...ariaCampo("mov-destino", errores.cuenta_destino_id)}
            name="cuenta_destino_id"
            value={destinoId}
            onChange={(e) => setDestinoId(e.target.value)}
            required
          >
            <option value="">Elige la cuenta destino</option>
            {cuentas
              .filter((c) => c.id !== cuentaId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
          </Select>
        </Campo>
      ) : pagoDeObligacion ? (
        <input type="hidden" name="categoria_id" value={categoriaId} />
      ) : (
        <Campo id="mov-categoria" etiqueta="Categoría" error={errores.categoria_id}>
          <Select
            {...ariaCampo("mov-categoria", errores.categoria_id)}
            name="categoria_id"
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            required
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
      )}

      <Campo
        id="mov-descripcion"
        etiqueta={opcion?.requiereDescripcion ? "Descripción (obligatoria)" : "Descripción"}
        error={errores.descripcion}
        ayuda={opcion?.requiereDescripcion ? "Esta categoría exige especificar qué fue." : undefined}
      >
        <Input
          {...ariaCampo("mov-descripcion", errores.descripcion)}
          name="descripcion"
          defaultValue={movimiento?.descripcion ?? ""}
          maxLength={200}
          placeholder={tipo === "transferencia" ? "Ej.: retiro en cajero" : "Ej.: mercado de la semana"}
          required={opcion?.requiereDescripcion}
        />
      </Campo>

      {tipo === "gasto" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
          <Campo id="mov-comercio" etiqueta="Comercio (opcional)" error={errores.comercio}>
            <Input
              {...ariaCampo("mov-comercio", errores.comercio)}
              name="comercio"
              defaultValue={movimiento?.comercio ?? ""}
              maxLength={80}
            />
          </Campo>
          <Casilla name="reembolsable" defaultChecked={movimiento?.reembolsable}>
            Reembolsable por Devtopia
          </Casilla>
        </div>
      ) : null}

      <CampoComprobante inicial={movimiento?.adjunto_path ?? null} />

      {vistaPrevia ? (
        <p className="rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground" aria-live="polite">
          {vistaPrevia}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pendiente || cuentas.length === 0}>
        {pendiente ? <Loader2Icon className="animate-spin" /> : null}
        {movimiento
          ? "Guardar cambios"
          : obligacion
            ? obligacion.es_ingreso
              ? "Registrar ingreso"
              : "Registrar pago"
            : "Guardar"}
      </Button>
    </form>
  );
}
