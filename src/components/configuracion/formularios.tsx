"use client";

import { Loader2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { guardarCategoria, guardarCuenta, guardarParametros, guardarPlantilla } from "@/actions/configuracion";
import { MontoInput } from "@/components/formularios/monto-input";
import { Button } from "@/components/ui/button";
import { ariaCampo, Campo, Casilla } from "@/components/ui/campo";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAccion } from "@/hooks/use-accion";
import { type CategoriaBasica, opcionesCategorias } from "@/lib/categorias";
import { cuentaPorDefecto } from "@/lib/cuentas";
import { ETIQUETA_FRECUENCIA, type Frecuencia, proximosMeses } from "@/lib/domain/obligaciones";
import { desplazarPeriodo, esPeriodoValido, nombreCortoPeriodo } from "@/lib/domain/periodos";

// ── Cuentas ────────────────────────────────────────────────────────────────

export const TIPOS_CUENTA: { valor: string; etiqueta: string }[] = [
  { valor: "ahorros", etiqueta: "Cuenta de ahorros" },
  { valor: "corriente", etiqueta: "Cuenta corriente" },
  { valor: "efectivo", etiqueta: "Efectivo" },
  { valor: "billetera", etiqueta: "Billetera digital (Nequi, Daviplata…)" },
  { valor: "cooperativa", etiqueta: "Cooperativa (aportes)" },
  { valor: "inversion", etiqueta: "Inversión / CDT" },
];

export type CuentaEditable = {
  id: string;
  nombre: string;
  tipo: string;
  entidad: string | null;
  saldo_inicial: number;
  fecha_saldo_inicial: string | null;
};

export function CuentaForm({
  cuenta,
  hoy,
  onGuardado,
}: {
  cuenta?: CuentaEditable;
  hoy: string;
  onGuardado: () => void;
}) {
  const { onSubmit, pendiente, errores } = useAccion(guardarCuenta, onGuardado);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {cuenta ? <input type="hidden" name="id" value={cuenta.id} /> : null}
      <Campo id="cu-nombre" etiqueta="Nombre" error={errores.nombre}>
        <Input
          {...ariaCampo("cu-nombre", errores.nombre)}
          name="nombre"
          defaultValue={cuenta?.nombre}
          maxLength={60}
          required
          placeholder="Ej.: Ahorros Bancolombia"
        />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo id="cu-tipo" etiqueta="Tipo" error={errores.tipo}>
          <Select {...ariaCampo("cu-tipo", errores.tipo)} name="tipo" defaultValue={cuenta?.tipo ?? "ahorros"}>
            {TIPOS_CUENTA.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo id="cu-entidad" etiqueta="Entidad (opcional)" error={errores.entidad}>
          <Input
            {...ariaCampo("cu-entidad", errores.entidad)}
            name="entidad"
            defaultValue={cuenta?.entidad ?? ""}
            maxLength={60}
          />
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo id="cu-saldo" etiqueta="Saldo inicial" error={errores.saldo_inicial}>
          <MontoInput
            {...ariaCampo("cu-saldo", errores.saldo_inicial)}
            name="saldo_inicial"
            defaultValue={cuenta?.saldo_inicial ?? 0}
          />
        </Campo>
        <Campo id="cu-fecha" etiqueta="A la fecha" error={errores.fecha_saldo_inicial}>
          <Input
            {...ariaCampo("cu-fecha", errores.fecha_saldo_inicial)}
            type="date"
            name="fecha_saldo_inicial"
            defaultValue={cuenta?.fecha_saldo_inicial ?? hoy}
          />
        </Campo>
      </div>
      <p className="text-xs text-muted-foreground">
        El saldo se calcula desde esa fecha sumando ingresos y restando gastos. Úsalo para cuadrar con tu banco.
      </p>
      <Button type="submit" size="lg" disabled={pendiente}>
        {pendiente ? <Loader2Icon className="animate-spin" /> : null} {cuenta ? "Guardar cambios" : "Crear cuenta"}
      </Button>
    </form>
  );
}

// ── Categorías ─────────────────────────────────────────────────────────────

export const BOLSAS = [
  { valor: "necesidad", etiqueta: "Necesidad (50 %)" },
  { valor: "deseo", etiqueta: "Deseo (30 %)" },
  { valor: "ahorro_deuda", etiqueta: "Ahorro y deuda extra (20 %)" },
  { valor: "no_aplica", etiqueta: "No aplica" },
];

export type CategoriaEditable = CategoriaBasica & { bolsa: string; es_fija: boolean };

export function CategoriaForm({
  categoria,
  tipoNueva,
  categorias,
  onGuardado,
}: {
  categoria?: CategoriaEditable;
  tipoNueva?: "ingreso" | "gasto";
  categorias: CategoriaBasica[];
  onGuardado: () => void;
}) {
  const tipo = categoria?.tipo ?? tipoNueva ?? "gasto";
  const { onSubmit, pendiente, errores } = useAccion(guardarCategoria, onGuardado);
  const padres = categorias.filter((c) => c.tipo === tipo && !c.padre_id && c.id !== categoria?.id && c.activa);
  const tieneHijas = categoria ? categorias.some((c) => c.padre_id === categoria.id) : false;
  const sistema = Boolean(categoria?.es_sistema);
  const [padreId, setPadreId] = useState(categoria?.padre_id ?? "");
  const grupoPadre = padres.find((p) => p.id === padreId)?.grupo;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {categoria ? <input type="hidden" name="id" value={categoria.id} /> : null}
      <input type="hidden" name="tipo" value={tipo} />
      {sistema ? (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          Categoría del sistema: solo puedes ajustar su clasificación 50/30/20 y si exige descripción.
        </p>
      ) : null}
      <Campo id="ca-nombre" etiqueta="Nombre" error={errores.nombre}>
        <Input
          {...ariaCampo("ca-nombre", errores.nombre)}
          name="nombre"
          defaultValue={categoria?.nombre}
          maxLength={60}
          required
          readOnly={sistema}
        />
      </Campo>
      {!tieneHijas ? (
        <Campo id="ca-padre" etiqueta="Subcategoría de (opcional)" error={errores.padre_id}>
          <Select
            {...ariaCampo("ca-padre", errores.padre_id)}
            name="padre_id"
            value={padreId}
            onChange={(e) => setPadreId(e.target.value)}
            disabled={sistema}
          >
            <option value="">Ninguna (categoría principal)</option>
            {padres.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </Campo>
      ) : (
        <input type="hidden" name="padre_id" value="" />
      )}
      <Campo
        id="ca-grupo"
        etiqueta="Grupo"
        error={errores.grupo}
        ayuda="Agrupa categorías en listas y reportes (p. ej. Servicios públicos)."
      >
        <Input
          {...ariaCampo("ca-grupo", errores.grupo)}
          name="grupo"
          key={grupoPadre ?? "libre"}
          defaultValue={grupoPadre ?? categoria?.grupo ?? "Otros"}
          maxLength={40}
          required
          readOnly={sistema || Boolean(grupoPadre)}
        />
      </Campo>
      {tipo === "gasto" ? (
        <Campo id="ca-bolsa" etiqueta="Clasificación 50/30/20" error={errores.bolsa}>
          <Select {...ariaCampo("ca-bolsa", errores.bolsa)} name="bolsa" defaultValue={categoria?.bolsa ?? "necesidad"}>
            {BOLSAS.map((b) => (
              <option key={b.valor} value={b.valor}>
                {b.etiqueta}
              </option>
            ))}
          </Select>
        </Campo>
      ) : (
        <input type="hidden" name="bolsa" value="no_aplica" />
      )}
      <Casilla name="requiere_descripcion" defaultChecked={categoria?.requiere_descripcion}>
        Exigir descripción al registrar
      </Casilla>
      {tipo === "gasto" ? (
        <Casilla name="es_fija" defaultChecked={categoria?.es_fija}>
          Es un gasto fijo (para el análisis fijo vs. variable)
        </Casilla>
      ) : null}
      <Button type="submit" size="lg" disabled={pendiente}>
        {pendiente ? <Loader2Icon className="animate-spin" /> : null}{" "}
        {categoria ? "Guardar cambios" : "Crear categoría"}
      </Button>
    </form>
  );
}

// ── Obligaciones recurrentes ──────────────────────────────────────────────

export const TIPOS_OBLIGACION_UI: { valor: string; etiqueta: string }[] = [
  { valor: "arriendo", etiqueta: "Arriendo / vivienda" },
  { valor: "servicio", etiqueta: "Servicio público" },
  { valor: "telecom", etiqueta: "Internet / celular" },
  { valor: "seguridad_social", etiqueta: "Seguridad social" },
  { valor: "cooperativa", etiqueta: "Cooperativa" },
  { valor: "deuda", etiqueta: "Préstamo" },
  { valor: "ahorro", etiqueta: "Ahorro programado" },
  { valor: "otro", etiqueta: "Otro gasto recurrente" },
  { valor: "ingreso_esperado", etiqueta: "Ingreso esperado (sueldo, honorarios…)" },
];

export type PlantillaEditable = {
  id: string;
  nombre: string;
  tipo: string;
  categoria_id: string;
  monto_estimado: number;
  es_variable: boolean;
  estimar_con_promedio: boolean;
  dia_vencimiento: number;
  frecuencia: Frecuencia;
  fecha_inicio: string;
  mes_ancla: string | null;
  fecha_fin: string | null;
  cuenta_default_id: string | null;
  referencia_pago: string | null;
  notas: string | null;
};

export function PlantillaForm({
  plantilla,
  categorias,
  cuentas,
  periodoActual,
  onGuardado,
}: {
  plantilla?: PlantillaEditable;
  categorias: CategoriaBasica[];
  cuentas: { id: string; nombre: string; tipo?: string }[];
  periodoActual: string;
  onGuardado: () => void;
}) {
  const { onSubmit, pendiente, errores } = useAccion(guardarPlantilla, onGuardado);
  const [tipo, setTipo] = useState(plantilla?.tipo ?? "servicio");
  const [variable, setVariable] = useState(plantilla?.es_variable ?? false);
  const [frecuencia, setFrecuencia] = useState<Frecuencia>(plantilla?.frecuencia ?? "mensual");
  const [inicio, setInicio] = useState(plantilla?.fecha_inicio.slice(0, 7) ?? periodoActual);
  const [ancla, setAncla] = useState(
    plantilla?.mes_ancla?.slice(0, 7) ?? plantilla?.fecha_inicio.slice(0, 7) ?? periodoActual,
  );
  const [fin, setFin] = useState(plantilla?.fecha_fin?.slice(0, 7) ?? "");
  const esIngreso = tipo === "ingreso_esperado";
  const grupos = useMemo(
    () => opcionesCategorias(categorias, esIngreso ? "ingreso" : "gasto"),
    [categorias, esIngreso],
  );

  const meses = useMemo(() => {
    if (!esPeriodoValido(inicio) || !esPeriodoValido(ancla) || (fin && !esPeriodoValido(fin))) return [];
    return proximosMeses({ frecuencia, ancla, inicio, fin: fin || null }, periodoActual, 4);
  }, [frecuencia, ancla, inicio, fin, periodoActual]);
  const opcionesMes = useMemo(
    () => Array.from({ length: 18 }, (_, i) => desplazarPeriodo(periodoActual, i - 6)),
    [periodoActual],
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {plantilla ? <input type="hidden" name="id" value={plantilla.id} /> : null}
      <Campo id="pl-nombre" etiqueta="Nombre" error={errores.nombre}>
        <Input
          {...ariaCampo("pl-nombre", errores.nombre)}
          name="nombre"
          defaultValue={plantilla?.nombre}
          maxLength={80}
          required
          placeholder="Ej.: Energía (Enel)"
        />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo id="pl-tipo" etiqueta="Tipo" error={errores.tipo}>
          <Select
            {...ariaCampo("pl-tipo", errores.tipo)}
            name="tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
          >
            {TIPOS_OBLIGACION_UI.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo id="pl-categoria" etiqueta="Categoría" error={errores.categoria_id}>
          <Select
            {...ariaCampo("pl-categoria", errores.categoria_id)}
            name="categoria_id"
            defaultValue={plantilla?.categoria_id ?? ""}
            key={esIngreso ? "i" : "g"}
            required
          >
            <option value="">Elige</option>
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
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo id="pl-monto" etiqueta={variable ? "Monto estimado" : "Monto"} error={errores.monto_estimado}>
          <MontoInput
            {...ariaCampo("pl-monto", errores.monto_estimado)}
            name="monto_estimado"
            defaultValue={plantilla?.monto_estimado ?? ""}
          />
        </Campo>
        <Campo id="pl-dia" etiqueta={esIngreso ? "Día en que llega" : "Día de pago"} error={errores.dia_vencimiento}>
          <Input
            {...ariaCampo("pl-dia", errores.dia_vencimiento)}
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            name="dia_vencimiento"
            defaultValue={plantilla?.dia_vencimiento ?? 5}
            required
          />
        </Campo>
      </div>
      {!esIngreso ? (
        <div className="flex flex-col gap-1 rounded-xl border p-3">
          <Casilla name="es_variable" checked={variable} onChange={(e) => setVariable(e.target.checked)}>
            El monto cambia cada mes
          </Casilla>
          {variable ? (
            <Casilla name="estimar_con_promedio" defaultChecked={plantilla?.estimar_con_promedio ?? true}>
              Estimar con el promedio de los últimos 3 pagos
            </Casilla>
          ) : null}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Campo id="pl-frecuencia" etiqueta="Frecuencia" error={errores.frecuencia}>
          <Select
            {...ariaCampo("pl-frecuencia", errores.frecuencia)}
            name="frecuencia"
            value={frecuencia}
            onChange={(e) => setFrecuencia(e.target.value as Frecuencia)}
          >
            {Object.entries(ETIQUETA_FRECUENCIA).map(([v, e]) => (
              <option key={v} value={v}>
                {e}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo id="pl-cuenta" etiqueta={esIngreso ? "Entra a" : "Se paga desde"}>
          <Select
            id="pl-cuenta"
            name="cuenta_default_id"
            defaultValue={plantilla?.cuenta_default_id ?? cuentaPorDefecto(cuentas)?.id ?? ""}
          >
            <option value="">Sin cuenta por defecto</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo id="pl-inicio" etiqueta="Desde" error={errores.fecha_inicio}>
          <Select
            {...ariaCampo("pl-inicio", errores.fecha_inicio)}
            name="fecha_inicio"
            value={inicio}
            onChange={(e) => {
              setInicio(e.target.value);
              if (frecuencia === "mensual") setAncla(e.target.value);
            }}
          >
            {opcionesMes.map((m) => (
              <option key={m} value={m}>
                {nombreCortoPeriodo(m)}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo id="pl-fin" etiqueta="Hasta (opcional)" error={errores.fecha_fin}>
          <Select
            {...ariaCampo("pl-fin", errores.fecha_fin)}
            name="fecha_fin"
            value={fin}
            onChange={(e) => setFin(e.target.value)}
          >
            <option value="">Sin fecha fin</option>
            {Array.from({ length: 36 }, (_, i) => desplazarPeriodo(periodoActual, i)).map((m) => (
              <option key={m} value={m}>
                {nombreCortoPeriodo(m)}
              </option>
            ))}
          </Select>
        </Campo>
      </div>
      {frecuencia !== "mensual" ? (
        <Campo
          id="pl-ancla"
          etiqueta="Un mes en que sí toca pagar"
          error={errores.mes_ancla}
          ayuda="Con esto se calculan los meses que le corresponden."
        >
          <Select
            {...ariaCampo("pl-ancla", errores.mes_ancla)}
            name="mes_ancla"
            value={ancla}
            onChange={(e) => setAncla(e.target.value)}
          >
            {opcionesMes.map((m) => (
              <option key={m} value={m}>
                {nombreCortoPeriodo(m)}
              </option>
            ))}
          </Select>
        </Campo>
      ) : (
        <input type="hidden" name="mes_ancla" value={inicio} />
      )}
      <p className="rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground" aria-live="polite">
        {meses.length > 0
          ? `Aparecerá en: ${meses.map(nombreCortoPeriodo).join(", ")}…`
          : "Con estas fechas no aparecerá en los próximos meses."}
      </p>
      <Campo
        id="pl-ref"
        etiqueta="Referencia de pago (opcional)"
        error={errores.referencia_pago}
        ayuda="N.º de contrato o convenio para pagar en línea."
      >
        <Input
          {...ariaCampo("pl-ref", errores.referencia_pago)}
          name="referencia_pago"
          defaultValue={plantilla?.referencia_pago ?? ""}
          maxLength={80}
        />
      </Campo>
      <Campo id="pl-notas" etiqueta="Notas (opcional)" error={errores.notas}>
        <Textarea
          {...ariaCampo("pl-notas", errores.notas)}
          name="notas"
          defaultValue={plantilla?.notas ?? ""}
          maxLength={300}
          rows={2}
        />
      </Campo>
      {plantilla ? (
        <Casilla name="aplicar_mes_actual" defaultChecked>
          Aplicar también al mes actual (si aún no tiene pagos)
        </Casilla>
      ) : null}
      <Button type="submit" size="lg" disabled={pendiente}>
        {pendiente ? <Loader2Icon className="animate-spin" /> : null}{" "}
        {plantilla ? "Guardar cambios" : "Crear obligación"}
      </Button>
    </form>
  );
}

// ── Preferencias ──────────────────────────────────────────────────────────

export function PreferenciasForm({ metaAhorro, recordatorios }: { metaAhorro: number; recordatorios: boolean }) {
  const { onSubmit, pendiente, errores } = useAccion(guardarParametros);
  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4" noValidate>
      <Campo
        id="pa-meta"
        etiqueta="Meta de ahorro mensual (% del ingreso)"
        error={errores.meta_ahorro_pct}
        ayuda="Se usa en Salud financiera (Fase 5). Referencia: 20 %."
      >
        <Input
          {...ariaCampo("pa-meta", errores.meta_ahorro_pct)}
          type="number"
          name="meta_ahorro_pct"
          min={0}
          max={100}
          step={1}
          defaultValue={Math.round(metaAhorro * 100)}
        />
      </Campo>
      <Casilla name="recordatorios_email" defaultChecked={recordatorios}>
        Enviarme recordatorios de vencimiento por correo (se activa en la Fase 6)
      </Casilla>
      <Button type="submit" disabled={pendiente} className="self-start">
        {pendiente ? <Loader2Icon className="animate-spin" /> : null} Guardar preferencias
      </Button>
    </form>
  );
}
