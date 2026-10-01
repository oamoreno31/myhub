"use client";

import { useState } from "react";
import { guardarParametrosPila } from "@/actions/salud";
import { pct } from "@/components/analisis/piezas";
import { MontoInput } from "@/components/formularios/monto-input";
import { BotonGuardar, Linea, VistaPrevia } from "@/components/formularios/vista-previa";
import { ariaCampo, Campo } from "@/components/ui/campo";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAccion } from "@/hooks/use-accion";
import { formatearCOP } from "@/lib/domain/dinero";
import { calcularPila, type ParamsPila, TARIFAS_ARL } from "@/lib/domain/pila";

const aTexto = (v: number) => String(Math.round(v * 10000) / 100).replace(".", ",");
const deTexto = (t: string, d: number) => {
  const n = Number(t.replace(",", "."));
  return t.trim() === "" || !Number.isFinite(n) ? d : n / 100;
};
const ROMANOS = ["I", "II", "III", "IV", "V"];

export function PanelSeguridadSocial({
  params,
  ingresoPromedio,
  pagadoMes,
  mes,
}: {
  params: ParamsPila;
  ingresoPromedio: number;
  /** Lo registrado este mes en la categoría Seguridad social (PILA). */
  pagadoMes: number;
  mes: string;
}) {
  const { onSubmit, pendiente, errores } = useAccion(guardarParametrosPila);
  const [ingreso, setIngreso] = useState<number>(ingresoPromedio);
  const [ibc, setIbc] = useState(aTexto(params.ibc_pct));
  const [salud, setSalud] = useState(aTexto(params.salud_pct));
  const [pension, setPension] = useState(aTexto(params.pension_pct));
  const [clase, setClase] = useState<ParamsPila["arl_clase"]>(params.arl_clase);
  const [smmlv, setSmmlv] = useState<number | null>(params.smmlv);

  const actuales: ParamsPila = {
    ibc_pct: deTexto(ibc, params.ibc_pct),
    salud_pct: deTexto(salud, params.salud_pct),
    pension_pct: deTexto(pension, params.pension_pct),
    arl_clase: clase,
    smmlv,
  };
  const r = calcularPila(ingreso, actuales);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-bold">Aportes como independiente</h2>
          <p className="text-sm text-muted-foreground">
            Estimado de la planilla PILA a partir de tu ingreso. Los porcentajes y el salario mínimo cambian cada año:
            verifícalos con tu operador de planilla.
          </p>
        </div>
        <Campo
          id="pila-ingreso"
          etiqueta="Ingreso mensual"
          ayuda="Por defecto, tu ingreso promedio de los últimos 3 meses."
        >
          <MontoInput
            id="pila-ingreso"
            name="ingreso"
            grande
            defaultValue={ingreso}
            onValor={(v) => setIngreso(v ?? 0)}
          />
        </Campo>

        <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
          <div className="grid grid-cols-3 gap-3">
            <Campo id="pila-ibc" etiqueta="IBC %" error={errores.ibc_pct}>
              <Input
                {...ariaCampo("pila-ibc", errores.ibc_pct)}
                name="ibc_pct"
                inputMode="decimal"
                value={ibc}
                onChange={(e) => setIbc(e.target.value)}
              />
            </Campo>
            <Campo id="pila-salud" etiqueta="Salud %" error={errores.salud_pct}>
              <Input
                {...ariaCampo("pila-salud", errores.salud_pct)}
                name="salud_pct"
                inputMode="decimal"
                value={salud}
                onChange={(e) => setSalud(e.target.value)}
              />
            </Campo>
            <Campo id="pila-pension" etiqueta="Pensión %" error={errores.pension_pct}>
              <Input
                {...ariaCampo("pila-pension", errores.pension_pct)}
                name="pension_pct"
                inputMode="decimal"
                value={pension}
                onChange={(e) => setPension(e.target.value)}
              />
            </Campo>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo id="pila-arl" etiqueta="Riesgo ARL" error={errores.arl_clase}>
              <Select
                {...ariaCampo("pila-arl", errores.arl_clase)}
                name="arl_clase"
                value={clase}
                onChange={(e) => setClase(Number(e.target.value) as ParamsPila["arl_clase"])}
              >
                {([1, 2, 3, 4, 5] as const).map((c) => (
                  <option key={c} value={c}>
                    Clase {ROMANOS[c - 1]} · {pct(TARIFAS_ARL[c], 3)}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo id="pila-smmlv" etiqueta="Salario mínimo del año" error={errores.smmlv}>
              <MontoInput
                {...ariaCampo("pila-smmlv", errores.smmlv)}
                name="smmlv"
                defaultValue={smmlv}
                onValor={setSmmlv}
              />
            </Campo>
          </div>
          <BotonGuardar pendiente={pendiente}>Guardar parámetros</BotonGuardar>
        </form>
      </Card>

      <div className="flex flex-col gap-3">
        {!r ? (
          <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm font-semibold text-warning">
            ◐ Escribe el salario mínimo (SMMLV) del año para calcular: el IBC no puede ser menor a 1 SMMLV ni mayor a
            25.
          </p>
        ) : (
          <VistaPrevia>
            <Linea
              etiqueta={`Ingreso base de cotización (IBC) · ${pct(actuales.ibc_pct)}`}
              valor={formatearCOP(r.ibc)}
              fuerte
            />
            {r.ajuste ? (
              <p className="text-xs text-muted-foreground">
                {r.ajuste === "minimo"
                  ? "Ajustado al mínimo: 1 salario mínimo."
                  : "Ajustado al tope: 25 salarios mínimos."}
              </p>
            ) : null}
            <Linea etiqueta={`Salud · ${pct(actuales.salud_pct, 1)}`} valor={formatearCOP(r.salud)} />
            <Linea etiqueta={`Pensión · ${pct(actuales.pension_pct)}`} valor={formatearCOP(r.pension)} />
            {r.fsp > 0 ? (
              <Linea etiqueta={`Fondo de Solidaridad Pensional · ${pct(r.fspPct, 1)}`} valor={formatearCOP(r.fsp)} />
            ) : null}
            <Linea
              etiqueta={`ARL clase ${ROMANOS[actuales.arl_clase - 1]} · ${pct(r.arlPct, 3)}`}
              valor={formatearCOP(r.arl)}
            />
            <div className="my-1 border-t border-current/20" />
            <Linea etiqueta="Total estimado de la planilla" valor={formatearCOP(r.total)} fuerte />
            <Linea etiqueta="Sobre tu ingreso" valor={ingreso > 0 ? pct(r.total / ingreso, 1) : "—"} />
          </VistaPrevia>
        )}
        <Card className="gap-1 text-sm">
          <span className="font-semibold">En {mes.toLowerCase()} registraste</span>
          <span className="text-xl font-bold">{formatearCOP(pagadoMes)}</span>
          <span className="text-muted-foreground">
            en la categoría Seguridad social (PILA).
            {r && pagadoMes > 0 && Math.abs(pagadoMes - r.total) > 1000
              ? ` Diferencia con el estimado: ${formatearCOP(pagadoMes - r.total, { signo: true })}.`
              : ""}
          </span>
        </Card>
        <p className="text-xs text-muted-foreground">
          Referencia: IBC del 40 % del ingreso para independientes, salud 12,5 %, pensión 16 %, Fondo de Solidaridad
          Pensional desde 4 salarios mínimos y aportes aproximados al múltiplo de 100 superior. No es asesoría
          tributaria ni laboral.
        </p>
      </div>
    </div>
  );
}
