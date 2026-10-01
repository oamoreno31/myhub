"use client";

import { AlertTriangleIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { castigarPrestamo, guardarAbono, guardarDeuda, guardarPagoDeuda, guardarPrestamo } from "@/actions/deudas";
import { MontoInput } from "@/components/formularios/monto-input";
import { BotonGuardar, Linea, Segmentos, VistaPrevia } from "@/components/formularios/vista-previa";
import { ariaCampo, Campo, Casilla } from "@/components/ui/campo";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAccion } from "@/hooks/use-accion";
import { cuentaPorDefecto } from "@/lib/cuentas";
import { aCentavos, formatearCOP } from "@/lib/domain/dinero";
import {
  cuotaFija,
  desgloseSugerido,
  ETIQUETA_TIPO_DEUDA,
  efectoAbonoExtra,
  proximaCuota,
  proyectarDeuda,
  saldoTrasCuotas,
  type TipoDeuda,
} from "@/lib/domain/deudas";
import { tasaMensual } from "@/lib/domain/tarjetas";

export type CuentaSimple = { id: string; nombre: string; tipo: string; saldo: number };

const fechaCorta = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

const pct = (v: number, decimales = 2) =>
  `${(Math.round(v * 10 ** (decimales + 2)) / 10 ** decimales).toLocaleString("es-CO")} %`;

const aTexto = (v: number | null | undefined) =>
  v === null || v === undefined ? "" : String(Math.round(v * 10000) / 100).replace(".", ",");

// ── Deuda ────────────────────────────────────────────────────────────────

export type DeudaEditable = {
  id: string;
  nombre: string;
  acreedor: string | null;
  tipo: TipoDeuda;
  monto_original: number;
  fecha_desembolso: string;
  tasa_ea: number;
  plazo_meses: number;
  cuota: number;
  seguro_mensual: number;
  aporte_mensual: number;
  cuenta_aportes_id: string | null;
  dia_pago: number;
  cuenta_pago_default_id: string | null;
  saldo_inicial: number;
  fecha_saldo_inicial: string;
  cuenta_desembolso_id: string | null;
  obligacion_id: string | null;
  notas: string | null;
};

export function DeudaForm({
  deuda,
  cuentas,
  hoy,
  onGuardado,
}: {
  deuda?: DeudaEditable;
  cuentas: CuentaSimple[];
  hoy: string;
  onGuardado?: (id?: string) => void;
}) {
  const { onSubmit, pendiente, errores } = useAccion(guardarDeuda, (e) => onGuardado?.(e.id));
  const [tipo, setTipo] = useState<TipoDeuda>(deuda?.tipo ?? "banco");
  const [monto, setMonto] = useState<number | null>(deuda?.monto_original ?? null);
  const [tasa, setTasa] = useState(aTexto(deuda?.tasa_ea));
  const [plazo, setPlazo] = useState(deuda?.plazo_meses ?? 12);
  const [cuota, setCuota] = useState<number | null>(deuda?.cuota ?? null);
  const [cuotaManual, setCuotaManual] = useState(Boolean(deuda));
  const [claveCuota, setClaveCuota] = useState(0);
  // Mientras la cuota es la calculada, el campo se re-monta con cada cálculo nuevo; al empezar a
  // escribirla se congela la clave para no perder el foco.
  const [claveFija, setClaveFija] = useState("inicial");
  const [seguro, setSeguro] = useState<number | null>(deuda?.seguro_mensual || null);
  const [aporte, setAporte] = useState<number | null>(deuda?.aporte_mensual || null);
  const [diaPago, setDiaPago] = useState(deuda?.dia_pago ?? 5);
  const [fechaDesembolso, setFechaDesembolso] = useState(deuda?.fecha_desembolso ?? hoy);
  const [nueva, setNueva] = useState(deuda ? deuda.saldo_inicial === deuda.monto_original : true);
  const [cuotasPagadas, setCuotasPagadas] = useState(0);
  const [saldo, setSaldo] = useState<number | null>(deuda?.saldo_inicial ?? null);
  const [claveSaldo, setClaveSaldo] = useState(0);
  const [desembolso, setDesembolso] = useState(Boolean(deuda?.cuenta_desembolso_id));

  const tasaEA = Number(tasa.replace(",", ".")) / 100 || 0;
  const cuotaSugerida = monto && monto > 0 ? cuotaFija(monto, tasaEA, plazo) : null;
  const cuotaEfectiva = cuotaManual ? cuota : cuotaSugerida;
  const saldoSugerido =
    monto && cuotaEfectiva ? (nueva ? monto : saldoTrasCuotas(monto, tasaEA, cuotaEfectiva, cuotasPagadas)) : null;
  const saldoEfectivo = nueva ? monto : saldo;

  const recalcularSaldo = (n: number) => {
    setCuotasPagadas(n);
    if (monto && cuotaEfectiva) {
      setSaldo(saldoTrasCuotas(monto, tasaEA, cuotaEfectiva, n));
      setClaveSaldo((k) => k + 1);
    }
  };

  let vista: ReactNode = null;
  if (saldoEfectivo && cuotaEfectiva && cuotaEfectiva > 0) {
    const p = proyectarDeuda({
      saldo: saldoEfectivo,
      tasaEA,
      cuota: cuotaEfectiva,
      primerPeriodo: proximaCuota(hoy, diaPago).slice(0, 7),
      diaPago,
    });
    const total = cuotaEfectiva + (seguro ?? 0) + (aporte ?? 0);
    vista = (
      <VistaPrevia tono={p.termina ? "normal" : "alerta"}>
        <Linea etiqueta="Tasa mensual equivalente" valor={pct(tasaMensual(tasaEA))} />
        <Linea etiqueta="Pagas cada mes (cuota + seguros + aportes)" valor={<strong>{formatearCOP(total)}</strong>} />
        {p.termina ? (
          <>
            <Linea etiqueta="Terminas de pagar" valor={`${fechaCorta(p.fechaFin!)} · ${p.meses} cuotas`} />
            <Linea etiqueta="Intereses que te faltan por pagar" valor={formatearCOP(p.interesesTotales)} />
          </>
        ) : (
          <p className="flex gap-2 font-semibold">
            <AlertTriangleIcon className="size-4 shrink-0 text-warning" aria-hidden="true" />
            La cuota no alcanza a cubrir los intereses: la deuda nunca bajaría. Revisa la cuota o la tasa.
          </p>
        )}
      </VistaPrevia>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {deuda ? <input type="hidden" name="id" value={deuda.id} /> : null}
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="cuota" value={cuotaEfectiva ? String(cuotaEfectiva).replace(".", ",") : ""} />
      {nueva ? (
        <>
          <input type="hidden" name="saldo_inicial" value={monto ? String(monto).replace(".", ",") : ""} />
          <input type="hidden" name="fecha_saldo_inicial" value={fechaDesembolso} />
        </>
      ) : null}

      <Segmentos
        etiqueta="Tipo de deuda"
        opciones={(["banco", "libranza", "cooperativa", "persona"] as const).map((t) => ({
          valor: t,
          etiqueta: ETIQUETA_TIPO_DEUDA[t],
        }))}
        valor={tipo === "otro" ? "banco" : tipo}
        onCambio={setTipo}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo id="deuda-nombre" etiqueta="Nombre" error={errores.nombre}>
          <Input
            {...ariaCampo("deuda-nombre", errores.nombre)}
            name="nombre"
            defaultValue={deuda?.nombre ?? ""}
            placeholder={tipo === "cooperativa" ? "Ej.: Crédito Coomeva" : "Ej.: Libre inversión"}
            maxLength={80}
            autoFocus={!deuda}
          />
        </Campo>
        <Campo
          id="deuda-acreedor"
          etiqueta={tipo === "persona" ? "¿Quién te prestó?" : "Entidad (opcional)"}
          error={errores.acreedor}
        >
          <Input
            {...ariaCampo("deuda-acreedor", errores.acreedor)}
            name="acreedor"
            defaultValue={deuda?.acreedor ?? ""}
            maxLength={80}
          />
        </Campo>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Campo id="deuda-monto" etiqueta="Monto prestado" error={errores.monto_original}>
          <MontoInput
            {...ariaCampo("deuda-monto", errores.monto_original)}
            name="monto_original"
            defaultValue={monto}
            onValor={setMonto}
          />
        </Campo>
        <Campo id="deuda-desembolso" etiqueta="Fecha del préstamo" error={errores.fecha_desembolso}>
          <Input
            {...ariaCampo("deuda-desembolso", errores.fecha_desembolso)}
            type="date"
            name="fecha_desembolso"
            value={fechaDesembolso}
            onChange={(e) => setFechaDesembolso(e.target.value)}
          />
        </Campo>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Campo id="deuda-tasa" etiqueta="Tasa E.A. %" error={errores.tasa_ea}>
          <Input
            {...ariaCampo("deuda-tasa", errores.tasa_ea)}
            name="tasa_ea"
            inputMode="decimal"
            value={tasa}
            onChange={(e) => setTasa(e.target.value.replace(/[^\d.,]/g, ""))}
            placeholder={tipo === "persona" ? "0" : "24,5"}
          />
        </Campo>
        <Campo id="deuda-plazo" etiqueta="Plazo (meses)" error={errores.plazo_meses}>
          <Input
            {...ariaCampo("deuda-plazo", errores.plazo_meses)}
            name="plazo_meses"
            type="number"
            min={1}
            max={480}
            value={plazo}
            onChange={(e) => setPlazo(Number(e.target.value) || 1)}
          />
        </Campo>
        <Campo id="deuda-dia" etiqueta="Día de pago" error={errores.dia_pago}>
          <Input
            {...ariaCampo("deuda-dia", errores.dia_pago)}
            name="dia_pago"
            type="number"
            min={1}
            max={31}
            value={diaPago}
            onChange={(e) => setDiaPago(Number(e.target.value) || 1)}
          />
        </Campo>
      </div>

      <Campo
        id="deuda-cuota"
        etiqueta="Cuota (capital + intereses)"
        error={errores.cuota}
        ayuda={
          cuotaSugerida
            ? cuotaManual
              ? `Calculada con la tasa: ${formatearCOP(cuotaSugerida)}. Usa la de tu extracto si es distinta.`
              : "Calculada con el sistema de cuota fija. Si tu banco cobra otra, escríbela."
            : "Se calcula con el monto, la tasa y el plazo."
        }
      >
        <MontoInput
          key={cuotaManual ? claveFija : `c${claveCuota}-${cuotaSugerida}`}
          {...ariaCampo("deuda-cuota", errores.cuota)}
          name="cuota_visible"
          defaultValue={cuotaEfectiva}
          onValor={(v) => {
            if (!cuotaManual) setClaveFija(`c${claveCuota}-${cuotaSugerida}`);
            setCuota(v);
            setCuotaManual(true);
          }}
        />
      </Campo>
      {cuotaManual && cuotaSugerida && cuota !== cuotaSugerida ? (
        <button
          type="button"
          className="-mt-2 self-start text-xs font-semibold text-primary hover:underline"
          onClick={() => {
            setCuotaManual(false);
            setClaveCuota((k) => k + 1);
          }}
        >
          Usar la cuota calculada ({formatearCOP(cuotaSugerida)})
        </button>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Campo id="deuda-seguro" etiqueta="Seguros y otros / mes" error={errores.seguro_mensual}>
          <MontoInput
            {...ariaCampo("deuda-seguro", errores.seguro_mensual)}
            name="seguro_mensual"
            defaultValue={seguro}
            onValor={setSeguro}
          />
        </Campo>
        {tipo === "cooperativa" ? (
          <Campo id="deuda-aporte" etiqueta="Aporte social / mes" error={errores.aporte_mensual}>
            <MontoInput
              {...ariaCampo("deuda-aporte", errores.aporte_mensual)}
              name="aporte_mensual"
              defaultValue={aporte}
              onValor={setAporte}
            />
          </Campo>
        ) : (
          <input type="hidden" name="aporte_mensual" value="" />
        )}
      </div>
      {tipo === "cooperativa" && (aporte ?? 0) > 0 ? (
        <Campo
          id="deuda-cuenta-aportes"
          etiqueta="Los aportes se acumulan en"
          error={errores.cuenta_aportes_id}
          ayuda="Una cuenta tipo cooperativa: su saldo es tu ahorro, no un gasto."
        >
          <Select
            {...ariaCampo("deuda-cuenta-aportes", errores.cuenta_aportes_id)}
            name="cuenta_aportes_id"
            defaultValue={deuda?.cuenta_aportes_id ?? cuentas.find((c) => c.tipo === "cooperativa")?.id ?? ""}
          >
            <option value="">Elige la cuenta</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </Campo>
      ) : null}

      <Campo id="deuda-cuenta-pago" etiqueta="Normalmente la pago desde" error={errores.cuenta_pago_default_id}>
        <Select
          {...ariaCampo("deuda-cuenta-pago", errores.cuenta_pago_default_id)}
          name="cuenta_pago_default_id"
          defaultValue={
            deuda?.cuenta_pago_default_id ?? cuentaPorDefecto(cuentas.filter((c) => c.tipo !== "cooperativa"))?.id ?? ""
          }
        >
          <option value="">Sin cuenta predeterminada</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Select>
      </Campo>

      <fieldset className="flex flex-col gap-3 rounded-xl border p-3">
        <legend className="px-1 text-xs font-bold text-muted-foreground">¿Desde cuándo la registras?</legend>
        <Segmentos
          etiqueta="Estado de la deuda"
          opciones={[
            { valor: "nueva", etiqueta: "Es nueva" },
            { valor: "curso", etiqueta: "Ya la venía pagando" },
          ]}
          valor={nueva ? "nueva" : "curso"}
          onCambio={(v) => {
            setNueva(v === "nueva");
            if (v === "curso" && saldo === null && saldoSugerido !== null) setSaldo(saldoSugerido);
          }}
        />
        {nueva ? null : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Campo id="deuda-pagadas" etiqueta="Cuotas ya pagadas" ayuda="Para estimar el saldo">
                <Input
                  id="deuda-pagadas"
                  type="number"
                  min={0}
                  max={480}
                  value={cuotasPagadas}
                  onChange={(e) => recalcularSaldo(Number(e.target.value) || 0)}
                />
              </Campo>
              <Campo id="deuda-fecha-saldo" etiqueta="Saldo a la fecha" error={errores.fecha_saldo_inicial}>
                <Input
                  {...ariaCampo("deuda-fecha-saldo", errores.fecha_saldo_inicial)}
                  type="date"
                  name="fecha_saldo_inicial"
                  defaultValue={deuda?.fecha_saldo_inicial ?? hoy}
                />
              </Campo>
            </div>
            <Campo
              id="deuda-saldo"
              etiqueta="Saldo de capital pendiente"
              error={errores.saldo_inicial}
              ayuda="Mejor si lo copias del extracto o la app del banco."
            >
              <MontoInput
                key={claveSaldo}
                {...ariaCampo("deuda-saldo", errores.saldo_inicial)}
                name="saldo_inicial"
                defaultValue={saldo}
                onValor={setSaldo}
              />
            </Campo>
          </>
        )}
        {nueva ? (
          <>
            <Casilla name="registrar_desembolso" checked={desembolso} onChange={(e) => setDesembolso(e.target.checked)}>
              El dinero entró a una de mis cuentas
            </Casilla>
            {desembolso ? (
              <Campo
                id="deuda-cuenta-desembolso"
                etiqueta="¿A qué cuenta llegó?"
                error={errores.cuenta_desembolso_id}
                ayuda="Suma al saldo de la cuenta; no cuenta como ingreso."
              >
                <Select
                  {...ariaCampo("deuda-cuenta-desembolso", errores.cuenta_desembolso_id)}
                  name="cuenta_desembolso_id"
                  defaultValue={deuda?.cuenta_desembolso_id ?? cuentaPorDefecto(cuentas)?.id ?? ""}
                >
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </Select>
              </Campo>
            ) : null}
          </>
        ) : null}
      </fieldset>

      <Casilla name="crear_obligacion" defaultChecked={deuda ? Boolean(deuda.obligacion_id) : true}>
        Poner la cuota en el checklist de cada mes
      </Casilla>

      <Campo id="deuda-notas" etiqueta="Notas (opcional)" error={errores.notas}>
        <Textarea
          {...ariaCampo("deuda-notas", errores.notas)}
          name="notas"
          defaultValue={deuda?.notas ?? ""}
          maxLength={300}
          rows={2}
        />
      </Campo>

      {vista}

      <BotonGuardar pendiente={pendiente}>{deuda ? "Guardar cambios" : "Registrar deuda"}</BotonGuardar>
    </form>
  );
}

// ── Pago de una cuota ────────────────────────────────────────────────────

export type DeudaParaPago = {
  id: string;
  nombre: string;
  tipo: TipoDeuda;
  tasa_ea: number;
  cuota: number;
  seguro_mensual: number;
  aporte_mensual: number;
  cuota_total: number;
  saldo_capital: number;
  dia_pago: number;
  cuenta_aportes_id: string | null;
  cuenta_pago_default_id: string | null;
};

export type CuotaPendiente = { id: string; nombre: string; fecha_vencimiento: string; pendiente: number };

export type PagoDeudaEditable = {
  id: string;
  fecha: string;
  monto: number;
  a_capital: number;
  a_intereses: number;
  a_seguros: number;
  a_aporte: number;
  cuenta_origen_id: string;
  obligacion_periodo_id: string | null;
  nota: string | null;
};

type Modo = "cuota" | "extra";
type Partes = { a_capital: number; a_intereses: number; a_seguros: number; a_aporte: number };

export function PagoDeudaForm({
  deuda,
  cuentas,
  hoy,
  pago,
  cuotasPendientes,
  obligacionInicial,
  modoInicial = "cuota",
  onGuardado,
}: {
  deuda: DeudaParaPago;
  cuentas: CuentaSimple[];
  hoy: string;
  pago?: PagoDeudaEditable;
  cuotasPendientes: CuotaPendiente[];
  obligacionInicial?: string | null;
  modoInicial?: Modo;
  onGuardado?: () => void;
}) {
  const { onSubmit, pendiente, errores } = useAccion(guardarPagoDeuda, () => onGuardado?.());
  const [modo, setModo] = useState<Modo>(
    pago ? (pago.a_intereses + pago.a_seguros + pago.a_aporte === 0 ? "extra" : "cuota") : modoInicial,
  );
  const saldoAntes = deuda.saldo_capital + (pago?.a_capital ?? 0);
  const [obligacion, setObligacion] = useState<string>(
    pago
      ? (pago.obligacion_periodo_id ?? "")
      : modo === "cuota"
        ? (obligacionInicial ?? cuotasPendientes[0]?.id ?? "")
        : "",
  );
  const cuotaDelMes = cuotasPendientes.find((c) => c.id === obligacion);
  const montoInicial = pago?.monto ?? (modoInicial === "cuota" ? cuotaDelMes?.pendiente || deuda.cuota_total : null);
  const [monto, setMonto] = useState<number | null>(montoInicial);
  const [manual, setManual] = useState<Partes | null>(
    pago
      ? { a_capital: pago.a_capital, a_intereses: pago.a_intereses, a_seguros: pago.a_seguros, a_aporte: pago.a_aporte }
      : null,
  );
  const [clave, setClave] = useState(0); // re-monta el campo de monto con un valor sugerido
  const [claveDesglose, setClaveDesglose] = useState(0); // re-monta el desglose con la sugerencia
  const [cuentaId, setCuentaId] = useState(
    pago?.cuenta_origen_id ?? deuda.cuenta_pago_default_id ?? cuentaPorDefecto(cuentas)?.id ?? "",
  );
  const cuenta = cuentas.find((c) => c.id === cuentaId);

  const sugerido: Partes =
    modo === "extra"
      ? { a_capital: monto ?? 0, a_intereses: 0, a_seguros: 0, a_aporte: 0 }
      : desgloseSugerido({
          monto: monto ?? 0,
          saldo: saldoAntes,
          tasaEA: deuda.tasa_ea,
          seguro: deuda.seguro_mensual,
          aporte: deuda.cuenta_aportes_id ? deuda.aporte_mensual : 0,
        });
  const partes = manual ?? sugerido;
  const suma = (["a_capital", "a_intereses", "a_seguros", "a_aporte"] as const).reduce(
    (a, k) => a + aCentavos(partes[k]),
    0,
  );
  const cuadra = monto !== null && suma === aCentavos(monto);

  const cambiarModo = (m: Modo) => {
    setModo(m);
    setManual(null);
    setClave((k) => k + 1);
    setClaveDesglose((k) => k + 1);
    if (m === "extra") {
      setObligacion("");
      setMonto(null);
    } else {
      const c = cuotasPendientes[0];
      setObligacion(c?.id ?? "");
      setMonto(c?.pendiente || deuda.cuota_total);
    }
  };

  const editarParte = (k: keyof Partes, v: number | null) => setManual({ ...partes, [k]: v ?? 0 });

  let vista: ReactNode = null;
  if (monto && monto > 0) {
    const saldoDespues = Math.max(saldoAntes - partes.a_capital, 0);
    const costo = partes.a_intereses + partes.a_seguros;
    const extra =
      modo === "extra" && deuda.cuota > 0
        ? efectoAbonoExtra({
            saldo: saldoAntes,
            tasaEA: deuda.tasa_ea,
            cuota: deuda.cuota,
            extra: monto,
            primerPeriodo: proximaCuota(hoy, deuda.dia_pago).slice(0, 7),
            diaPago: deuda.dia_pago,
          })
        : null;
    const saldoCuenta = cuenta
      ? cuenta.saldo + (pago && pago.cuenta_origen_id === cuenta.id ? pago.monto : 0) - monto
      : null;
    vista = (
      <VistaPrevia tono={cuadra ? "normal" : "alerta"}>
        <Linea etiqueta="A capital (baja la deuda)" valor={formatearCOP(partes.a_capital)} />
        {modo === "cuota" ? (
          <>
            <Linea etiqueta="Intereses y seguros (gasto)" valor={formatearCOP(costo)} />
            {partes.a_aporte > 0 ? <Linea etiqueta="Aporte (tu ahorro)" valor={formatearCOP(partes.a_aporte)} /> : null}
          </>
        ) : null}
        <Linea etiqueta="Saldo de capital después" valor={<strong>{formatearCOP(saldoDespues)}</strong>} />
        {costo > 0 && monto > 0 ? (
          <span className="text-xs">El {pct(costo / monto, 1)} de este pago se va en costos financieros.</span>
        ) : null}
        {extra && extra.mesesAhorrados > 0 ? (
          <span className="font-semibold text-success">
            ✓ Terminas {extra.mesesAhorrados} {extra.mesesAhorrados === 1 ? "mes" : "meses"} antes y te ahorras ≈{" "}
            {formatearCOP(extra.interesesAhorrados)} en intereses.
          </span>
        ) : null}
        {saldoDespues <= 0 ? (
          <span className="font-semibold text-success">🎉 Con este pago la deuda queda en cero.</span>
        ) : null}
        {saldoCuenta !== null ? (
          <Linea
            etiqueta={`Saldo de ${cuenta!.nombre} después`}
            valor={
              <span className={saldoCuenta < 0 ? "text-destructive" : undefined}>{formatearCOP(saldoCuenta)}</span>
            }
          />
        ) : null}
        {!cuadra ? (
          <p className="flex gap-2 font-semibold">
            <AlertTriangleIcon className="size-4 shrink-0 text-warning" aria-hidden="true" />
            El desglose suma {formatearCOP(suma / 100)} y pagaste {formatearCOP(monto)}.
          </p>
        ) : null}
      </VistaPrevia>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {pago ? <input type="hidden" name="id" value={pago.id} /> : null}
      <input type="hidden" name="deuda_id" value={deuda.id} />
      <input type="hidden" name="obligacion_periodo_id" value={obligacion} />
      {modo === "extra"
        ? (["a_capital", "a_intereses", "a_seguros", "a_aporte"] as const).map((k) => (
            <input key={k} type="hidden" name={k} value={String(partes[k]).replace(".", ",")} />
          ))
        : null}
      {modo === "cuota" && !deuda.cuenta_aportes_id ? <input type="hidden" name="a_aporte" value="0" /> : null}

      {!pago ? (
        <Segmentos
          etiqueta="Tipo de pago"
          opciones={[
            { valor: "cuota", etiqueta: "Cuota del mes", detalle: formatearCOP(deuda.cuota_total) },
            { valor: "extra", etiqueta: "Abono extra a capital" },
          ]}
          valor={modo}
          onCambio={cambiarModo}
        />
      ) : null}

      {modo === "cuota" && cuotasPendientes.length > 0 ? (
        <Campo id="pago-obligacion" etiqueta="Del checklist del mes">
          <Select
            id="pago-obligacion"
            value={obligacion}
            onChange={(e) => {
              setObligacion(e.target.value);
              const c = cuotasPendientes.find((x) => x.id === e.target.value);
              if (c && !pago) {
                setMonto(c.pendiente);
                setManual(null);
                setClave((k) => k + 1);
                setClaveDesglose((k) => k + 1);
              }
            }}
          >
            <option value="">No asociar a una cuota del checklist</option>
            {cuotasPendientes.map((c) => (
              <option key={c.id} value={c.id}>
                Cuota del {fechaCorta(c.fecha_vencimiento)} · faltan {formatearCOP(c.pendiente)}
              </option>
            ))}
          </Select>
        </Campo>
      ) : null}

      <Campo
        id="pago-deuda-monto"
        etiqueta={modo === "extra" ? "¿Cuánto abonas a capital?" : "Monto pagado"}
        error={errores.monto}
      >
        <MontoInput
          key={`m-${clave}`}
          {...ariaCampo("pago-deuda-monto", errores.monto)}
          name="monto"
          grande
          defaultValue={monto}
          onValor={(v) => {
            setMonto(v);
            if (modo === "cuota") {
              setManual(null);
              setClaveDesglose((k) => k + 1);
            }
          }}
          autoFocus={modo === "extra"}
        />
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo id="pago-deuda-fecha" etiqueta="Fecha" error={errores.fecha}>
          <Input
            {...ariaCampo("pago-deuda-fecha", errores.fecha)}
            type="date"
            name="fecha"
            defaultValue={pago?.fecha ?? hoy}
          />
        </Campo>
        <Campo id="pago-deuda-cuenta" etiqueta="Sale de" error={errores.cuenta_origen_id}>
          <Select
            {...ariaCampo("pago-deuda-cuenta", errores.cuenta_origen_id)}
            name="cuenta_origen_id"
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
          >
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </Campo>
      </div>

      {modo === "cuota" ? (
        <fieldset className="flex flex-col gap-3 rounded-xl border p-3">
          <legend className="px-1 text-xs font-bold text-muted-foreground">
            Desglose {manual ? "(editado)" : "sugerido"} · cópialo del recibo si lo tienes
          </legend>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["a_capital", "Capital"],
                ["a_intereses", "Intereses"],
                ["a_seguros", "Seguros y otros"],
                ...(deuda.cuenta_aportes_id ? ([["a_aporte", "Aporte"]] as const) : []),
              ] as const
            ).map(([k, etiqueta]) => (
              <Campo key={`${k}-${claveDesglose}`} id={`pago-${k}`} etiqueta={etiqueta} error={errores[k]}>
                <MontoInput
                  {...ariaCampo(`pago-${k}`, errores[k])}
                  name={k}
                  defaultValue={partes[k]}
                  onValor={(v) => editarParte(k, v)}
                />
              </Campo>
            ))}
          </div>
          {manual ? (
            <button
              type="button"
              className="self-start text-xs font-semibold text-primary hover:underline"
              onClick={() => {
                setManual(null);
                setClaveDesglose((k) => k + 1);
              }}
            >
              Volver al desglose sugerido
            </button>
          ) : null}
        </fieldset>
      ) : null}

      <Campo id="pago-deuda-nota" etiqueta="Nota (opcional)" error={errores.nota}>
        <Input
          {...ariaCampo("pago-deuda-nota", errores.nota)}
          name="nota"
          defaultValue={pago?.nota ?? ""}
          maxLength={200}
        />
      </Campo>

      {vista}

      <BotonGuardar pendiente={pendiente} disabled={!cuadra}>
        {pago ? "Guardar cambios" : modo === "extra" ? "Registrar abono" : "Registrar pago"}
      </BotonGuardar>
    </form>
  );
}

// ── Préstamo que haces ───────────────────────────────────────────────────

export type PrestamoEditable = {
  id: string;
  deudor: string;
  monto: number;
  fecha: string;
  fecha_esperada: string | null;
  cuenta_origen_id: string;
  notas: string | null;
};

export function PrestamoForm({
  prestamo,
  cuentas,
  hoy,
  onGuardado,
}: {
  prestamo?: PrestamoEditable;
  cuentas: CuentaSimple[];
  hoy: string;
  onGuardado?: () => void;
}) {
  const { onSubmit, pendiente, errores } = useAccion(guardarPrestamo, () => onGuardado?.());
  const [monto, setMonto] = useState<number | null>(prestamo?.monto ?? null);
  const [cuentaId, setCuentaId] = useState(prestamo?.cuenta_origen_id ?? cuentaPorDefecto(cuentas)?.id ?? "");
  const cuenta = cuentas.find((c) => c.id === cuentaId);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {prestamo ? <input type="hidden" name="id" value={prestamo.id} /> : null}
      <Campo id="prestamo-deudor" etiqueta="¿A quién le prestaste?" error={errores.deudor}>
        <Input
          {...ariaCampo("prestamo-deudor", errores.deudor)}
          name="deudor"
          defaultValue={prestamo?.deudor ?? ""}
          maxLength={80}
          autoFocus={!prestamo}
        />
      </Campo>
      <Campo id="prestamo-monto" etiqueta="Monto" error={errores.monto}>
        <MontoInput
          {...ariaCampo("prestamo-monto", errores.monto)}
          name="monto"
          grande
          defaultValue={monto}
          onValor={setMonto}
        />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo id="prestamo-fecha" etiqueta="Fecha" error={errores.fecha}>
          <Input
            {...ariaCampo("prestamo-fecha", errores.fecha)}
            type="date"
            name="fecha"
            defaultValue={prestamo?.fecha ?? hoy}
          />
        </Campo>
        <Campo id="prestamo-esperada" etiqueta="Quedó de pagar el (opcional)" error={errores.fecha_esperada}>
          <Input
            {...ariaCampo("prestamo-esperada", errores.fecha_esperada)}
            type="date"
            name="fecha_esperada"
            defaultValue={prestamo?.fecha_esperada ?? ""}
          />
        </Campo>
      </div>
      <Campo id="prestamo-cuenta" etiqueta="Sale de" error={errores.cuenta_origen_id}>
        <Select
          {...ariaCampo("prestamo-cuenta", errores.cuenta_origen_id)}
          name="cuenta_origen_id"
          value={cuentaId}
          onChange={(e) => setCuentaId(e.target.value)}
        >
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo id="prestamo-notas" etiqueta="Notas (opcional)" error={errores.notas}>
        <Textarea
          {...ariaCampo("prestamo-notas", errores.notas)}
          name="notas"
          defaultValue={prestamo?.notas ?? ""}
          maxLength={300}
          rows={2}
        />
      </Campo>
      {monto && cuenta && !prestamo ? (
        <VistaPrevia>
          <Linea etiqueta={`Saldo de ${cuenta.nombre} después`} valor={formatearCOP(cuenta.saldo - monto)} />
          <span className="text-xs">No cuenta como gasto: queda como plata por cobrar hasta que te la devuelvan.</span>
        </VistaPrevia>
      ) : null}
      <BotonGuardar pendiente={pendiente} disabled={cuentas.length === 0}>
        {prestamo ? "Guardar cambios" : "Registrar préstamo"}
      </BotonGuardar>
    </form>
  );
}

// ── Abono de un deudor ───────────────────────────────────────────────────

export type PrestamoParaAbono = { id: string; deudor: string; saldo: number };
export type AbonoEditable = { id: string; fecha: string; monto: number; cuenta_id: string; descripcion: string | null };

export function AbonoForm({
  prestamos,
  prestamoId,
  abono,
  cuentas,
  hoy,
  onGuardado,
}: {
  prestamos: PrestamoParaAbono[];
  prestamoId?: string;
  abono?: AbonoEditable;
  cuentas: CuentaSimple[];
  hoy: string;
  onGuardado?: () => void;
}) {
  const { onSubmit, pendiente, errores } = useAccion(guardarAbono, () => onGuardado?.());
  const [idPrestamo, setIdPrestamo] = useState(prestamoId ?? prestamos[0]?.id ?? "");
  const prestamo = prestamos.find((p) => p.id === idPrestamo);
  const saldoAntes = (prestamo?.saldo ?? 0) + (abono?.monto ?? 0);
  const [monto, setMonto] = useState<number | null>(abono?.monto ?? null);

  if (prestamos.length === 0) {
    return (
      <p className="rounded-xl bg-muted/70 px-4 py-4 text-sm">
        No tienes préstamos por cobrar. Regístralos en Deudas → Me deben.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {abono ? <input type="hidden" name="id" value={abono.id} /> : null}
      {prestamoId ? (
        <input type="hidden" name="prestamo_otorgado_id" value={idPrestamo} />
      ) : (
        <Campo id="abono-prestamo" etiqueta="¿Quién te pagó?" error={errores.prestamo_otorgado_id}>
          <Select
            {...ariaCampo("abono-prestamo", errores.prestamo_otorgado_id)}
            name="prestamo_otorgado_id"
            value={idPrestamo}
            onChange={(e) => setIdPrestamo(e.target.value)}
          >
            {prestamos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.deudor} · debe {formatearCOP(p.saldo)}
              </option>
            ))}
          </Select>
        </Campo>
      )}
      <Campo id="abono-monto" etiqueta="Monto recibido" error={errores.monto}>
        <MontoInput
          {...ariaCampo("abono-monto", errores.monto)}
          name="monto"
          grande
          defaultValue={monto}
          onValor={setMonto}
          autoFocus={!abono}
        />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo id="abono-fecha" etiqueta="Fecha" error={errores.fecha}>
          <Input
            {...ariaCampo("abono-fecha", errores.fecha)}
            type="date"
            name="fecha"
            defaultValue={abono?.fecha ?? hoy}
          />
        </Campo>
        <Campo id="abono-cuenta" etiqueta="Entra a" error={errores.cuenta_id}>
          <Select
            {...ariaCampo("abono-cuenta", errores.cuenta_id)}
            name="cuenta_id"
            defaultValue={abono?.cuenta_id ?? cuentaPorDefecto(cuentas)?.id ?? ""}
          >
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </Campo>
      </div>
      <Campo id="abono-descripcion" etiqueta="Nota (opcional)" error={errores.descripcion}>
        <Input
          {...ariaCampo("abono-descripcion", errores.descripcion)}
          name="descripcion"
          defaultValue={abono?.descripcion ?? ""}
          maxLength={200}
        />
      </Campo>
      {monto && prestamo ? (
        <VistaPrevia>
          <Linea
            etiqueta={`${prestamo.deudor} te quedará debiendo`}
            valor={<strong>{formatearCOP(Math.max(saldoAntes - monto, 0))}</strong>}
          />
          {monto > saldoAntes ? (
            <span className="text-xs font-semibold text-warning">
              Recibes más de lo que te debe ({formatearCOP(monto - saldoAntes)} de más).
            </span>
          ) : null}
          <span className="text-xs">Es una recuperación, no un ingreso: no infla tus ingresos del mes.</span>
        </VistaPrevia>
      ) : null}
      <BotonGuardar pendiente={pendiente}>{abono ? "Guardar cambios" : "Registrar abono"}</BotonGuardar>
    </form>
  );
}

// ── Castigar un préstamo ─────────────────────────────────────────────────

export function CastigoForm({ prestamo, onGuardado }: { prestamo: PrestamoParaAbono; onGuardado?: () => void }) {
  const { onSubmit, pendiente, errores } = useAccion(castigarPrestamo, () => onGuardado?.());
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={prestamo.id} />
      <p className="text-sm text-muted-foreground">
        {prestamo.deudor} te debe {formatearCOP(prestamo.saldo)}. Castigarlo significa que ya no esperas recibir esa
        plata: deja de sumar en &quot;por cobrar&quot;. Si luego te paga, puedes quitar el castigo.
      </p>
      <Campo id="castigo-motivo" etiqueta="Motivo" error={errores.motivo_castigo}>
        <Input
          {...ariaCampo("castigo-motivo", errores.motivo_castigo)}
          name="motivo_castigo"
          maxLength={200}
          autoFocus
        />
      </Campo>
      <BotonGuardar pendiente={pendiente}>Marcar como castigado</BotonGuardar>
    </form>
  );
}
