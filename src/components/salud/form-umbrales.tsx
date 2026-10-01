"use client";

import { guardarUmbrales } from "@/actions/salud";
import { BotonGuardar } from "@/components/formularios/vista-previa";
import { Input } from "@/components/ui/input";
import { useAccion } from "@/hooks/use-accion";
import { type ClaveUmbral, INDICADORES, UMBRALES_DEFECTO, type Umbrales } from "@/lib/domain/salud";

const aTexto = (v: number, meses: boolean) =>
  meses ? String(v).replace(".", ",") : String(Math.round(v * 10000) / 100).replace(".", ",");

const ORDEN: ClaveUmbral[] = [
  "tasa_ahorro",
  "carga_deuda",
  "utilizacion_tc",
  "fondo_emergencia",
  "costo_financiero",
  "puntualidad",
  "gastos_fijos",
];

/** Umbrales editables (docs/02 §4) y tasa de usura de referencia. */
export function FormUmbrales({
  umbrales,
  usuraEA,
  onGuardado,
}: {
  umbrales: Umbrales;
  usuraEA: number | null;
  onGuardado?: () => void;
}) {
  const { onSubmit, pendiente, errores } = useAccion(guardarUmbrales, () => onGuardado?.());
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-muted-foreground">
        Referencias de educación financiera; ajústalas a tu realidad. Porcentajes sobre tus ingresos, salvo el fondo de
        emergencia (en meses).
      </p>
      <div className="grid grid-cols-[1fr_5.5rem_5.5rem] items-center gap-x-3 gap-y-2 text-sm">
        <span />
        <span className="text-xs font-semibold text-success">✓ Sano</span>
        <span className="text-xs font-semibold text-destructive">! Riesgo</span>
        {ORDEN.map((k) => {
          const d = INDICADORES[k];
          const meses = d.formato === "meses";
          const signoSano = d.mayorEsMejor ? "≥" : "≤";
          const signoRiesgo = d.mayorEsMejor ? "<" : ">";
          const error = errores[`${k}.sano`] ?? errores[`${k}.riesgo`];
          return (
            <div key={k} className="contents">
              <div className="flex flex-col">
                <span className="font-semibold">{d.nombre}</span>
                <span className="text-xs text-muted-foreground">
                  {meses ? "meses" : "%"} · sano {signoSano}, riesgo {signoRiesgo}
                </span>
                {error ? <span className="text-xs font-semibold text-destructive">{error}</span> : null}
              </div>
              <label>
                <span className="sr-only">{d.nombre}: umbral sano</span>
                <Input
                  name={`${k}.sano`}
                  inputMode="decimal"
                  defaultValue={aTexto(umbrales[k].sano, meses)}
                  placeholder={aTexto(UMBRALES_DEFECTO[k].sano, meses)}
                  aria-invalid={error ? true : undefined}
                />
              </label>
              <label>
                <span className="sr-only">{d.nombre}: umbral de riesgo</span>
                <Input
                  name={`${k}.riesgo`}
                  inputMode="decimal"
                  defaultValue={aTexto(umbrales[k].riesgo, meses)}
                  placeholder={aTexto(UMBRALES_DEFECTO[k].riesgo, meses)}
                  aria-invalid={error ? true : undefined}
                />
              </label>
            </div>
          );
        })}
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-semibold">Tasa de usura vigente (% E.A., opcional)</span>
        <Input
          name="tasa_usura_ea"
          inputMode="decimal"
          defaultValue={usuraEA === null ? "" : aTexto(usuraEA, false)}
          placeholder="Ej.: 25,5"
          aria-invalid={errores.tasa_usura_ea ? true : undefined}
        />
        <span className="text-xs text-muted-foreground">
          {errores.tasa_usura_ea ??
            "La certifica la Superintendencia Financiera cada mes. Si la anotas, te avisamos cuando una deuda o tarjeta la supere."}
        </span>
      </label>
      <BotonGuardar pendiente={pendiente}>Guardar umbrales</BotonGuardar>
    </form>
  );
}
