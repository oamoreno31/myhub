"use client";

import { AlertTriangleIcon, CheckIcon } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { guardarCompra, guardarExtracto, guardarPago, guardarTarjeta } from "@/actions/tarjetas";
import { CampoComprobante } from "@/components/formularios/campo-comprobante";
import { MontoInput } from "@/components/formularios/monto-input";
import { BotonGuardar, Linea, Segmentos, VistaPrevia } from "@/components/formularios/vista-previa";
import { Button } from "@/components/ui/button";
import { ariaCampo, Campo, Casilla } from "@/components/ui/campo";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAccion } from "@/hooks/use-accion";
import { buscarOpcion, type CategoriaBasica, opcionesCategorias } from "@/lib/categorias";
import { cuentaPorDefecto } from "@/lib/cuentas";
import { formatearCOP } from "@/lib/domain/dinero";
import {
  type CompraTC,
  corteDeCompra,
  cuotasDeCompra,
  ETIQUETA_TIPO_PAGO,
  type ExtractoTC,
  fechaLimiteDeCorte,
  mejorDiaDeCompra,
  type PagoTC,
  simularExtracto,
  simularPago,
  type TipoCompra,
  ultimoCorte,
} from "@/lib/domain/tarjetas";

// ── Tipos compartidos ────────────────────────────────────────────────────

export type CuentaPago = { id: string; nombre: string; tipo: string; saldo: number };

export type TarjetaOpcion = {
  id: string;
  nombre: string;
  dia_corte: number;
  dia_limite_pago: number;
  cupo: number;
  cupo_disponible: number;
  cuenta_pago_default_id: string | null;
};

export type TarjetaEditable = TarjetaOpcion & {
  entidad: string | null;
  franquicia: string;
  ultimos4: string | null;
  tasa_ea_ref: number | null;
  cuota_manejo_ref: number | null;
};

export type Libro = { compras: CompraTC[]; extractos: ExtractoTC[]; pagos: PagoTC[] };

export type CompraEditable = {
  id: string;
  tarjeta_id: string;
  tipo: TipoCompra;
  fecha: string;
  monto: number;
  num_cuotas: number;
  categoria_id: string | null;
  cuenta_destino_id: string | null;
  descripcion: string | null;
  comercio: string | null;
  moneda: string;
  monto_origen: number | null;
  trm: number | null;
  reembolsable: boolean;
  adjunto_path?: string | null;
};

export type ExtractoEditable = ExtractoTC & { id: string };

export type PagoEditable = {
  id: string;
  fecha: string;
  monto: number;
  cuenta_origen_id: string;
  tipo_elegido: string;
  nota: string | null;
};

const fechaCorta = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" });

// ── Tarjeta ──────────────────────────────────────────────────────────────

export function TarjetaForm({
  tarjeta,
  cuentas,
  onGuardado,
}: {
  tarjeta?: TarjetaEditable;
  cuentas: CuentaPago[];
  onGuardado?: (id?: string) => void;
}) {
  const { onSubmit, pendiente, errores } = useAccion(guardarTarjeta, (e) => onGuardado?.(e.id));
  const [diaCorte, setDiaCorte] = useState(tarjeta?.dia_corte ?? 15);
  const [diaPago, setDiaPago] = useState(tarjeta?.dia_limite_pago ?? 30);
  const [tasa, setTasa] = useState(
    tarjeta?.tasa_ea_ref ? String(Math.round(tarjeta.tasa_ea_ref * 10000) / 100).replace(".", ",") : "",
  );
  const tasaNum = Number(tasa.replace(",", "."));
  const mensual = tasa && Number.isFinite(tasaNum) && tasaNum > 0 ? ((1 + tasaNum / 100) ** (1 / 12) - 1) * 100 : null;
  const diasParaPagar = (() => {
    const corte = `2026-10-${String(Math.min(diaCorte, 28)).padStart(2, "0")}`;
    const limite = fechaLimiteDeCorte(corte, diaPago);
    return Math.round((Date.parse(limite) - Date.parse(corte)) / 86_400_000);
  })();

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {tarjeta ? <input type="hidden" name="id" value={tarjeta.id} /> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo id="tc-nombre" etiqueta="Nombre" error={errores.nombre}>
          <Input
            {...ariaCampo("tc-nombre", errores.nombre)}
            name="nombre"
            defaultValue={tarjeta?.nombre ?? ""}
            placeholder="Ej.: Visa Bancolombia"
            maxLength={60}
            autoFocus={!tarjeta}
            required
          />
        </Campo>
        <Campo id="tc-entidad" etiqueta="Banco (opcional)" error={errores.entidad}>
          <Input
            {...ariaCampo("tc-entidad", errores.entidad)}
            name="entidad"
            defaultValue={tarjeta?.entidad ?? ""}
            maxLength={60}
          />
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo id="tc-franquicia" etiqueta="Franquicia" error={errores.franquicia}>
          <Select
            {...ariaCampo("tc-franquicia", errores.franquicia)}
            name="franquicia"
            defaultValue={tarjeta?.franquicia ?? "visa"}
          >
            <option value="visa">Visa</option>
            <option value="mastercard">Mastercard</option>
            <option value="amex">American Express</option>
            <option value="diners">Diners</option>
            <option value="otra">Otra</option>
          </Select>
        </Campo>
        <Campo id="tc-ultimos4" etiqueta="Últimos 4 (opcional)" error={errores.ultimos4}>
          <Input
            {...ariaCampo("tc-ultimos4", errores.ultimos4)}
            name="ultimos4"
            defaultValue={tarjeta?.ultimos4 ?? ""}
            inputMode="numeric"
            maxLength={4}
            pattern="\d{4}"
          />
        </Campo>
      </div>
      <Campo id="tc-cupo" etiqueta="Cupo total" error={errores.cupo}>
        <MontoInput {...ariaCampo("tc-cupo", errores.cupo)} name="cupo" defaultValue={tarjeta?.cupo ?? null} required />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo id="tc-corte" etiqueta="Día de corte" error={errores.dia_corte}>
          <Input
            {...ariaCampo("tc-corte", errores.dia_corte)}
            name="dia_corte"
            type="number"
            min={1}
            max={31}
            value={diaCorte}
            onChange={(e) => setDiaCorte(Number(e.target.value) || 1)}
            required
          />
        </Campo>
        <Campo id="tc-pago" etiqueta="Día límite de pago" error={errores.dia_limite_pago}>
          <Input
            {...ariaCampo("tc-pago", errores.dia_limite_pago)}
            name="dia_limite_pago"
            type="number"
            min={1}
            max={31}
            value={diaPago}
            onChange={(e) => setDiaPago(Number(e.target.value) || 1)}
            required
          />
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo
          id="tc-tasa"
          etiqueta="Tasa E.A. % (ref.)"
          error={errores.tasa_ea_ref}
          ayuda={mensual !== null ? `≈ ${mensual.toFixed(2).replace(".", ",")} % mensual` : "Opcional, del extracto"}
        >
          <Input
            {...ariaCampo("tc-tasa", errores.tasa_ea_ref)}
            name="tasa_ea_ref"
            inputMode="decimal"
            value={tasa}
            onChange={(e) => setTasa(e.target.value.replace(/[^\d.,]/g, ""))}
            placeholder="26,82"
          />
        </Campo>
        <Campo id="tc-manejo" etiqueta="Cuota de manejo (ref.)" error={errores.cuota_manejo_ref}>
          <MontoInput
            {...ariaCampo("tc-manejo", errores.cuota_manejo_ref)}
            name="cuota_manejo_ref"
            defaultValue={tarjeta?.cuota_manejo_ref ?? null}
          />
        </Campo>
      </div>
      <Campo id="tc-cuenta" etiqueta="Normalmente la pago desde" error={errores.cuenta_pago_default_id}>
        <Select
          {...ariaCampo("tc-cuenta", errores.cuenta_pago_default_id)}
          name="cuenta_pago_default_id"
          defaultValue={tarjeta?.cuenta_pago_default_id ?? cuentaPorDefecto(cuentas)?.id ?? ""}
        >
          <option value="">Sin cuenta predeterminada</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Select>
      </Campo>
      <VistaPrevia>
        <span>
          Las compras hasta el día <strong>{diaCorte}</strong> entran en ese corte; tienes unos{" "}
          <strong>{diasParaPagar} días</strong> para pagar. Mejor día para comprar: el{" "}
          <strong>{mejorDiaDeCompra(diaCorte)}</strong>.
        </span>
      </VistaPrevia>
      <BotonGuardar pendiente={pendiente}>{tarjeta ? "Guardar cambios" : "Crear tarjeta"}</BotonGuardar>
    </form>
  );
}

// ── Compra / avance / devolución / ajuste ────────────────────────────────

const TIPOS_COMPRA: { valor: TipoCompra; etiqueta: string }[] = [
  { valor: "compra", etiqueta: "Compra" },
  { valor: "avance", etiqueta: "Avance" },
  { valor: "devolucion", etiqueta: "Devolución" },
  { valor: "ajuste", etiqueta: "Ajuste" },
];

export function CompraForm({
  tarjetas,
  tarjetaId,
  compra,
  categorias,
  cuentas,
  hoy,
  onGuardado,
}: {
  tarjetas: TarjetaOpcion[];
  tarjetaId?: string;
  compra?: CompraEditable;
  categorias: CategoriaBasica[];
  cuentas: CuentaPago[];
  hoy: string;
  onGuardado?: () => void;
}) {
  const { onSubmit, pendiente, errores } = useAccion(guardarCompra, () => onGuardado?.());
  const [idTarjeta, setIdTarjeta] = useState(compra?.tarjeta_id ?? tarjetaId ?? tarjetas[0]?.id ?? "");
  const [tipo, setTipo] = useState<TipoCompra>(compra?.tipo ?? "compra");
  const [monto, setMonto] = useState<number | null>(compra ? Math.abs(compra.monto) : null);
  const [signo, setSigno] = useState<"+" | "-">(compra && compra.monto < 0 ? "-" : "+");
  const [cuotas, setCuotas] = useState(compra?.num_cuotas ?? 1);
  const [fecha, setFecha] = useState(compra?.fecha ?? hoy);
  const [categoriaId, setCategoriaId] = useState(compra?.categoria_id ?? "");
  const [moneda, setMoneda] = useState(compra?.moneda ?? "COP");
  const [montoUsd, setMontoUsd] = useState<number | null>(compra?.monto_origen ?? null);
  const [trm, setTrm] = useState<number | null>(compra?.trm ?? null);
  const grupos = useMemo(() => opcionesCategorias(categorias, "gasto"), [categorias]);
  const opcion = buscarOpcion(grupos, categoriaId);
  const tarjeta = tarjetas.find((t) => t.id === idTarjeta);
  const conCuotas = tipo === "compra" || tipo === "avance";
  const conCategoria = tipo === "compra" || tipo === "devolucion";

  const montoEfectivo = moneda === "USD" && montoUsd && trm ? Math.round(montoUsd * trm * 100) / 100 : monto;

  let vista: ReactNode = null;
  if (tarjeta && montoEfectivo && montoEfectivo > 0 && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    if (tipo === "ajuste") {
      vista = (
        <span>
          El capital de {tarjeta.nombre} {signo === "+" ? "sube" : "baja"} {formatearCOP(montoEfectivo)}. No se factura
          en ningún corte; úsalo solo para cuadrar diferencias.
        </span>
      );
    } else {
      const n = conCuotas ? cuotas : 1;
      const q = cuotasDeCompra({ id: "x", fecha, tipo, monto: montoEfectivo, num_cuotas: n }, tarjeta.dia_corte);
      const previo = compra ? Math.abs(compra.monto) * (compra.tipo === "devolucion" ? -1 : 1) : 0;
      const efecto = tipo === "devolucion" ? -montoEfectivo : montoEfectivo;
      const disponible = tarjeta.cupo_disponible + previo - efecto;
      vista = (
        <>
          <Linea
            etiqueta={tipo === "devolucion" ? "Se descuenta en el corte del" : "Primer corte"}
            valor={<strong>{fechaCorta(corteDeCompra(fecha, tarjeta.dia_corte))}</strong>}
          />
          {n > 1 ? (
            <Linea
              etiqueta={`${n} cuotas de capital`}
              valor={
                <strong>
                  {formatearCOP(q[0].valor)} <span className="font-normal">hasta {fechaCorta(q[n - 1].corte)}</span>
                </strong>
              }
            />
          ) : null}
          <Linea
            etiqueta="Cupo disponible después"
            valor={
              <strong className={disponible < 0 ? "text-destructive" : undefined}>{formatearCOP(disponible)}</strong>
            }
          />
          {tipo === "avance" ? (
            <span className="text-xs">
              Los avances suelen cobrar intereses desde el primer día y comisión: aparecerán como otros cargos.
            </span>
          ) : n > 1 ? (
            <span className="text-xs">
              Diferir genera intereses que verás como &quot;otros cargos&quot; en cada extracto.
            </span>
          ) : null}
        </>
      );
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {compra ? <input type="hidden" name="id" value={compra.id} /> : null}
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="moneda" value={moneda} />
      {tipo === "ajuste" ? <input type="hidden" name="signo" value={signo} /> : null}
      {!conCuotas ? <input type="hidden" name="num_cuotas" value="1" /> : null}

      {!compra ? <Segmentos etiqueta="Tipo" opciones={TIPOS_COMPRA} valor={tipo} onCambio={setTipo} /> : null}

      {tarjetas.length > 1 || !tarjetaId ? (
        <Campo id="compra-tarjeta" etiqueta="Tarjeta" error={errores.tarjeta_id}>
          <Select
            {...ariaCampo("compra-tarjeta", errores.tarjeta_id)}
            name="tarjeta_id"
            value={idTarjeta}
            onChange={(e) => setIdTarjeta(e.target.value)}
            disabled={Boolean(compra)}
          >
            {tarjetas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre} · disponible {formatearCOP(t.cupo_disponible)}
              </option>
            ))}
          </Select>
          {compra ? <input type="hidden" name="tarjeta_id" value={idTarjeta} /> : null}
        </Campo>
      ) : (
        <input type="hidden" name="tarjeta_id" value={idTarjeta} />
      )}

      {moneda === "COP" ? (
        <Campo id="compra-monto" etiqueta={tipo === "ajuste" ? "Valor del ajuste" : "Monto"} error={errores.monto}>
          <MontoInput
            {...ariaCampo("compra-monto", errores.monto)}
            name="monto"
            grande
            defaultValue={monto}
            onValor={setMonto}
            autoFocus={!compra}
            required
          />
        </Campo>
      ) : (
        <>
          <input type="hidden" name="monto" value={montoEfectivo ? String(montoEfectivo).replace(".", ",") : ""} />
          <div className="grid grid-cols-2 gap-3">
            <Campo id="compra-usd" etiqueta="Valor en USD" error={errores.monto_origen ?? errores.monto}>
              <MontoInput
                {...ariaCampo("compra-usd", errores.monto_origen)}
                name="monto_origen"
                defaultValue={montoUsd}
                onValor={setMontoUsd}
              />
            </Campo>
            <Campo id="compra-trm" etiqueta="TRM" error={errores.trm}>
              <MontoInput {...ariaCampo("compra-trm", errores.trm)} name="trm" defaultValue={trm} onValor={setTrm} />
            </Campo>
          </div>
          {montoEfectivo ? <p className="text-sm font-semibold">≈ {formatearCOP(montoEfectivo)} en pesos</p> : null}
        </>
      )}

      {tipo === "ajuste" ? (
        <Segmentos
          etiqueta="Dirección del ajuste"
          opciones={[
            { valor: "+", etiqueta: "Aumenta la deuda" },
            { valor: "-", etiqueta: "Reduce la deuda" },
          ]}
          valor={signo}
          onCambio={setSigno}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Campo id="compra-fecha" etiqueta="Fecha" error={errores.fecha}>
          <Input
            {...ariaCampo("compra-fecha", errores.fecha)}
            type="date"
            name="fecha"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
          />
        </Campo>
        {conCuotas ? (
          <Campo id="compra-cuotas" etiqueta="Cuotas" error={errores.num_cuotas}>
            <Select
              {...ariaCampo("compra-cuotas", errores.num_cuotas)}
              name="num_cuotas"
              value={cuotas}
              onChange={(e) => setCuotas(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6, 9, 12, 18, 24, 36, 48].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "1 (contado)" : n}
                </option>
              ))}
            </Select>
          </Campo>
        ) : (
          <div />
        )}
      </div>

      {conCategoria ? (
        <Campo id="compra-categoria" etiqueta="Categoría" error={errores.categoria_id}>
          <Select
            {...ariaCampo("compra-categoria", errores.categoria_id)}
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
      ) : null}

      {tipo === "avance" ? (
        <Campo
          id="compra-destino"
          etiqueta="¿A qué cuenta llegó el dinero?"
          error={errores.cuenta_destino_id}
          ayuda="Si fue en efectivo, elige Efectivo."
        >
          <Select
            {...ariaCampo("compra-destino", errores.cuenta_destino_id)}
            name="cuenta_destino_id"
            defaultValue={compra?.cuenta_destino_id ?? cuentas.find((c) => c.tipo === "efectivo")?.id ?? ""}
          >
            <option value="">No registrar la entrada</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </Campo>
      ) : null}

      <Campo
        id="compra-descripcion"
        etiqueta={tipo === "ajuste" || opcion?.requiereDescripcion ? "Descripción (obligatoria)" : "Descripción"}
        error={errores.descripcion}
      >
        <Input
          {...ariaCampo("compra-descripcion", errores.descripcion)}
          name="descripcion"
          defaultValue={compra?.descripcion ?? ""}
          maxLength={200}
          placeholder={tipo === "ajuste" ? "Ej.: diferencia con el extracto de octubre" : "Ej.: nevera"}
        />
      </Campo>

      {tipo === "compra" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
          <Campo id="compra-comercio" etiqueta="Comercio (opcional)" error={errores.comercio}>
            <Input
              {...ariaCampo("compra-comercio", errores.comercio)}
              name="comercio"
              defaultValue={compra?.comercio ?? ""}
              maxLength={80}
            />
          </Campo>
          <div className="flex flex-col">
            <Casilla name="reembolsable" defaultChecked={compra?.reembolsable}>
              Reembolsable por Devtopia
            </Casilla>
            <Casilla checked={moneda === "USD"} onChange={(e) => setMoneda(e.target.checked ? "USD" : "COP")}>
              Compra en dólares
            </Casilla>
          </div>
        </div>
      ) : null}

      <CampoComprobante inicial={compra?.adjunto_path ?? null} />

      {vista ? <VistaPrevia>{vista}</VistaPrevia> : null}

      <BotonGuardar pendiente={pendiente} disabled={tarjetas.length === 0}>
        {compra ? "Guardar cambios" : "Registrar"}
      </BotonGuardar>
    </form>
  );
}

// ── Extracto ─────────────────────────────────────────────────────────────

export function ExtractoForm({
  tarjeta,
  libro,
  extracto,
  hoy,
  onGuardado,
}: {
  tarjeta: TarjetaOpcion;
  libro: Libro;
  extracto?: ExtractoEditable;
  hoy: string;
  onGuardado?: () => void;
}) {
  const { onSubmit, pendiente, errores } = useAccion(guardarExtracto, () => onGuardado?.());
  const corteSugerido = ultimoCorte(hoy, tarjeta.dia_corte);
  const [corte, setCorte] = useState(extracto?.fecha_corte ?? corteSugerido);
  const [limite, setLimite] = useState(
    extracto?.fecha_limite_pago ?? fechaLimiteDeCorte(corteSugerido, tarjeta.dia_limite_pago),
  );
  const [total, setTotal] = useState<number | null>(extracto ? Number(extracto.pago_total_banco) : null);
  const [minimo, setMinimo] = useState<number | null>(extracto ? Number(extracto.pago_minimo_banco) : null);
  const [desglose, setDesglose] = useState<Record<string, number | null>>({
    intereses: extracto?.intereses != null ? Number(extracto.intereses) : null,
    cuota_manejo: extracto?.cuota_manejo != null ? Number(extracto.cuota_manejo) : null,
    seguros: extracto?.seguros != null ? Number(extracto.seguros) : null,
    otros_declarados: extracto?.otros_declarados != null ? Number(extracto.otros_declarados) : null,
  });
  const [verDesglose, setVerDesglose] = useState(Object.values(desglose).some((v) => v !== null));

  const cambiarCorte = (v: string) => {
    setCorte(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) setLimite(fechaLimiteDeCorte(v, tarjeta.dia_limite_pago));
  };

  let vista: ReactNode = null;
  if (total !== null && minimo !== null && /^\d{4}-\d{2}-\d{2}$/.test(corte)) {
    const s = simularExtracto(
      libro.compras,
      libro.extractos,
      libro.pagos,
      {
        fecha_corte: corte,
        fecha_limite_pago: limite,
        pago_total_banco: total,
        pago_minimo_banco: minimo,
        ...desglose,
      },
      { diaCorte: tarjeta.dia_corte, excluirId: extracto?.id },
    );
    const alerta = s.alerta;
    vista = (
      <VistaPrevia tono={alerta ? "alerta" : "normal"}>
        <Linea etiqueta="Deuda registrada en la app al corte" valor={formatearCOP(s.saldo_sistema_al_corte)} />
        <Linea etiqueta="Pago total del banco" valor={formatearCOP(total)} />
        <Linea
          etiqueta={<strong>= Otros cargos del periodo</strong>}
          valor={
            <strong className={s.otros_generados < 0 ? "text-destructive" : undefined}>
              {formatearCOP(s.otros_generados)}
            </strong>
          }
        />
        <Linea etiqueta="Capital facturado (cuotas de este corte)" valor={formatearCOP(s.capital_facturado)} />
        <Linea
          etiqueta="Mínimo estimado por la app"
          valor={
            <>
              {formatearCOP(s.minimo_estimado)}{" "}
              {Math.abs(s.minimo_estimado - minimo) <= 1000 ? (
                <CheckIcon className="inline size-3.5 text-success" aria-label="coincide" />
              ) : (
                <span className="text-xs">(banco {formatearCOP(minimo)})</span>
              )}
            </>
          }
        />
        {s.diferencia_no_explicada !== null ? (
          <Linea etiqueta="Diferencia sin explicar por el desglose" valor={formatearCOP(s.diferencia_no_explicada)} />
        ) : null}
        {alerta === "conciliacion_negativa" ? (
          <p className="flex gap-2 font-semibold">
            <AlertTriangleIcon className="size-4 shrink-0 text-warning" aria-hidden="true" />
            El banco cobra menos de lo que tienes registrado: puede faltar una devolución o sobrar una compra. Revisa
            antes de seguir (o registra un ajuste).
          </p>
        ) : alerta === "diferencia_no_explicada" ? (
          <p className="flex gap-2 font-semibold">
            <AlertTriangleIcon className="size-4 shrink-0 text-warning" aria-hidden="true" />
            El desglose no explica todos los otros cargos: ¿falta alguna compra o un cargo sin anotar?
          </p>
        ) : null}
      </VistaPrevia>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {extracto ? <input type="hidden" name="id" value={extracto.id} /> : null}
      <input type="hidden" name="tarjeta_id" value={tarjeta.id} />
      <div className="grid grid-cols-2 gap-3">
        <Campo id="ext-corte" etiqueta="Fecha de corte" error={errores.fecha_corte}>
          <Input
            {...ariaCampo("ext-corte", errores.fecha_corte)}
            type="date"
            name="fecha_corte"
            value={corte}
            onChange={(e) => cambiarCorte(e.target.value)}
            required
          />
        </Campo>
        <Campo id="ext-limite" etiqueta="Pagar antes de" error={errores.fecha_limite_pago}>
          <Input
            {...ariaCampo("ext-limite", errores.fecha_limite_pago)}
            type="date"
            name="fecha_limite_pago"
            value={limite}
            onChange={(e) => setLimite(e.target.value)}
            required
          />
        </Campo>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo id="ext-total" etiqueta="Pago total (para quedar en cero)" error={errores.pago_total_banco}>
          <MontoInput
            {...ariaCampo("ext-total", errores.pago_total_banco)}
            name="pago_total_banco"
            defaultValue={total}
            onValor={setTotal}
            autoFocus={!extracto}
            required
          />
        </Campo>
        <Campo id="ext-minimo" etiqueta="Pago mínimo" error={errores.pago_minimo_banco}>
          <MontoInput
            {...ariaCampo("ext-minimo", errores.pago_minimo_banco)}
            name="pago_minimo_banco"
            defaultValue={minimo}
            onValor={setMinimo}
            required
          />
        </Campo>
      </div>

      {verDesglose ? (
        <fieldset className="flex flex-col gap-3 rounded-xl border p-3">
          <legend className="px-1 text-xs font-bold text-muted-foreground">Desglose de otros cargos (opcional)</legend>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["intereses", "Intereses"],
                ["cuota_manejo", "Cuota de manejo"],
                ["seguros", "Seguros"],
                ["otros_declarados", "Otros"],
              ] as const
            ).map(([campo, etiqueta]) => (
              <Campo key={campo} id={`ext-${campo}`} etiqueta={etiqueta} error={errores[campo]}>
                <MontoInput
                  {...ariaCampo(`ext-${campo}`, errores[campo])}
                  name={campo}
                  defaultValue={desglose[campo]}
                  onValor={(v) => setDesglose((d) => ({ ...d, [campo]: v }))}
                />
              </Campo>
            ))}
          </div>
        </fieldset>
      ) : (
        <Button type="button" variant="link" className="self-start px-0" onClick={() => setVerDesglose(true)}>
          + Agregar desglose (intereses, cuota de manejo…)
        </Button>
      )}

      {vista}

      <BotonGuardar pendiente={pendiente}>{extracto ? "Guardar cambios" : "Registrar extracto"}</BotonGuardar>
    </form>
  );
}

// ── Pago ─────────────────────────────────────────────────────────────────

type OpcionPago = "total" | "minimo" | "otro";

export function PagoForm({
  tarjeta,
  libro,
  pago,
  cuentas,
  hoy,
  onGuardado,
}: {
  tarjeta: TarjetaOpcion;
  libro: Libro;
  pago?: PagoEditable;
  cuentas: CuentaPago[];
  hoy: string;
  onGuardado?: () => void;
}) {
  const { onSubmit, pendiente, errores } = useAccion(guardarPago, () => onGuardado?.());
  const [fecha, setFecha] = useState(pago?.fecha ?? hoy);
  const opcionesLibro = { diaCorte: tarjeta.dia_corte };
  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fecha);
  // Situación antes de este pago: extracto vigente y lo que falta de total y mínimo.
  const base = fechaValida
    ? simularPago(libro.compras, libro.extractos, libro.pagos, { fecha, monto: 0, excluirId: pago?.id }, opcionesLibro)
    : null;
  const ext = base?.extracto ?? null;
  const deudaActual = base ? base.capital_restante + Math.max(base.otros_restantes, 0) : 0;
  const valorTotal = ext ? ext.pendiente_total : Math.max(deudaActual, 0);
  const valorMinimo = ext ? ext.pendiente_minimo : 0;

  const [opcion, setOpcion] = useState<OpcionPago>(
    pago
      ? ((pago.tipo_elegido === "total" || pago.tipo_elegido === "minimo" ? pago.tipo_elegido : "otro") as OpcionPago)
      : ext && valorMinimo > 0
        ? "minimo"
        : "otro",
  );
  const [monto, setMonto] = useState<number | null>(
    pago?.monto ?? (opcion === "minimo" ? valorMinimo : opcion === "total" ? valorTotal : null),
  );
  const [claveMonto, setClaveMonto] = useState(0);
  const [cuentaId, setCuentaId] = useState(
    pago?.cuenta_origen_id ?? tarjeta.cuenta_pago_default_id ?? cuentaPorDefecto(cuentas)?.id ?? "",
  );
  const cuenta = cuentas.find((c) => c.id === cuentaId);

  const elegir = (o: OpcionPago) => {
    setOpcion(o);
    const v = o === "total" ? valorTotal : o === "minimo" ? valorMinimo : null;
    setMonto(v);
    setClaveMonto((k) => k + 1); // re-monta el input con el valor sugerido
  };

  let vista: ReactNode = null;
  if (monto && monto > 0 && fechaValida) {
    const s = simularPago(
      libro.compras,
      libro.extractos,
      libro.pagos,
      { fecha, monto, excluirId: pago?.id },
      opcionesLibro,
    );
    const inferior = s.tipo_calculado === "inferior_minimo";
    const saldoCuenta = cuenta
      ? cuenta.saldo + (pago && pago.cuenta_origen_id === cuenta.id ? pago.monto : 0) - monto
      : null;
    vista = (
      <VistaPrevia tono={inferior ? "alerta" : "normal"}>
        <Linea
          etiqueta="Se registra como"
          valor={
            <strong className={inferior ? "text-destructive" : "text-success"}>
              {inferior ? "! " : "✓ "}
              {ETIQUETA_TIPO_PAGO[s.tipo_calculado]}
            </strong>
          }
        />
        <Linea etiqueta="A otros cargos (intereses, manejo…)" valor={formatearCOP(s.imputado_otros)} />
        <Linea etiqueta="A capital" valor={formatearCOP(s.imputado_capital)} />
        {s.saldo_a_favor > 0 ? <Linea etiqueta="Queda a tu favor" valor={formatearCOP(s.saldo_a_favor)} /> : null}
        <Linea etiqueta="Deuda de capital después" valor={<strong>{formatearCOP(s.capital_restante)}</strong>} />
        {s.pct_otros > 0 ? (
          <span className="text-xs">
            El {(Math.round(s.pct_otros * 1000) / 10).toLocaleString("es-CO")} % de este pago se va en costos
            financieros, no en bajar la deuda.
          </span>
        ) : null}
        {inferior ? (
          <p className="flex gap-2 font-semibold">
            <AlertTriangleIcon className="size-4 shrink-0 text-warning" aria-hidden="true" />
            Queda por debajo del mínimo: el banco cobrará intereses de mora y puede reportarte.
          </p>
        ) : null}
        {saldoCuenta !== null ? (
          <Linea
            etiqueta={`Saldo de ${cuenta!.nombre} después`}
            valor={
              <span className={saldoCuenta < 0 ? "text-destructive" : undefined}>{formatearCOP(saldoCuenta)}</span>
            }
          />
        ) : null}
      </VistaPrevia>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {pago ? <input type="hidden" name="id" value={pago.id} /> : null}
      <input type="hidden" name="tarjeta_id" value={tarjeta.id} />
      <input type="hidden" name="tipo_elegido" value={opcion} />

      {ext ? (
        <p className="rounded-xl bg-muted/70 px-4 py-3 text-sm">
          Extracto del <strong>{fechaCorta(libro.extractos.find((e) => e.id === ext.id)?.fecha_corte ?? fecha)}</strong>
          : total {formatearCOP(ext.total)} · mínimo {formatearCOP(ext.minimo)}
          {ext.pagado_antes > 0 ? ` · ya pagaste ${formatearCOP(ext.pagado_antes)}` : ""}
        </p>
      ) : (
        <p className="rounded-xl bg-muted/70 px-4 py-3 text-sm text-muted-foreground">
          Aún no hay extracto registrado antes de esta fecha: el pago se aplica a la deuda como &quot;otro valor&quot;.
        </p>
      )}

      <Segmentos
        etiqueta="¿Cuánto pagas?"
        opciones={[
          { valor: "total", etiqueta: "Total", detalle: formatearCOP(valorTotal) },
          { valor: "minimo", etiqueta: "Mínimo", detalle: ext ? formatearCOP(valorMinimo) : "—" },
          { valor: "otro", etiqueta: "Otro valor" },
        ]}
        valor={opcion}
        onCambio={elegir}
      />

      <Campo id="pago-monto" etiqueta="Monto" error={errores.monto}>
        <MontoInput
          key={claveMonto}
          {...ariaCampo("pago-monto", errores.monto)}
          name="monto"
          grande
          defaultValue={monto}
          onValor={(v) => {
            setMonto(v);
            if (opcion !== "otro" && v !== (opcion === "total" ? valorTotal : valorMinimo)) setOpcion("otro");
          }}
          required
        />
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo id="pago-fecha" etiqueta="Fecha" error={errores.fecha}>
          <Input
            {...ariaCampo("pago-fecha", errores.fecha)}
            type="date"
            name="fecha"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
          />
        </Campo>
        <Campo id="pago-cuenta" etiqueta="Sale de" error={errores.cuenta_origen_id}>
          <Select
            {...ariaCampo("pago-cuenta", errores.cuenta_origen_id)}
            name="cuenta_origen_id"
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

      <Campo id="pago-nota" etiqueta="Nota (opcional)" error={errores.nota}>
        <Input {...ariaCampo("pago-nota", errores.nota)} name="nota" defaultValue={pago?.nota ?? ""} maxLength={200} />
      </Campo>

      {vista}

      <BotonGuardar pendiente={pendiente} disabled={cuentas.length === 0}>
        {pago ? "Guardar cambios" : "Registrar pago"}
      </BotonGuardar>
    </form>
  );
}
