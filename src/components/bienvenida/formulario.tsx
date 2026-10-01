"use client";

import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import { completarBienvenida } from "@/actions/bienvenida";
import { MontoInput } from "@/components/formularios/monto-input";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAccion } from "@/hooks/use-accion";
import { CUENTAS_SUGERIDAS, OBLIGACIONES_SUGERIDAS } from "@/lib/bienvenida";
import { cn } from "@/lib/utils";

function Paso({
  n,
  titulo,
  descripcion,
  children,
}: {
  n: number;
  titulo: string;
  descripcion: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary font-display font-semibold text-primary-foreground">
          {n}
        </span>
        <div className="flex flex-col">
          <h2 className="font-bold">{titulo}</h2>
          <p className="text-sm text-muted-foreground">{descripcion}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

export function FormularioBienvenida({ cuentasExistentes }: { cuentasExistentes: string[] }) {
  const { onSubmit, pendiente, estado } = useAccion(completarBienvenida);
  const [cuentas, setCuentas] = useState<Record<string, boolean>>({ ahorros: true });
  const [obligaciones, setObligaciones] = useState<Record<string, boolean>>({
    arriendo: true,
    energia: true,
    agua: true,
    gas: true,
    internet: true,
    celular: true,
  });

  const nombresCuentas = [
    ...new Set([...cuentasExistentes, ...CUENTAS_SUGERIDAS.filter((c) => cuentas[c.clave]).map((c) => c.nombre)]),
  ];

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Paso
        n={1}
        titulo="Tus cuentas"
        descripcion="Dónde tienes la plata. Escribe el saldo de hoy para que los saldos cuadren con tu banco."
      >
        <ul className="flex flex-col">
          {CUENTAS_SUGERIDAS.map((c) => (
            <li key={c.clave} className="grid grid-cols-[1fr_minmax(0,11rem)] items-center gap-3 border-t py-2">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
                <input
                  type="checkbox"
                  name={`cuenta_${c.clave}`}
                  checked={Boolean(cuentas[c.clave])}
                  onChange={(e) => setCuentas((p) => ({ ...p, [c.clave]: e.target.checked }))}
                  className="size-5 accent-[var(--primary)]"
                />
                {c.nombre}
                {cuentasExistentes.includes(c.nombre) ? (
                  <span className="text-xs font-normal text-muted-foreground">(ya existe)</span>
                ) : null}
              </label>
              <MontoInput
                name={`saldo_${c.clave}`}
                aria-label={`Saldo actual de ${c.nombre}`}
                placeholder="Saldo hoy"
                disabled={!cuentas[c.clave]}
              />
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">La cuenta &quot;Efectivo&quot; ya viene creada.</p>
      </Paso>

      <Paso
        n={2}
        titulo="Pagos de cada mes"
        descripcion="Marca los que tienes. En los variables pon un valor aproximado: después se ajusta con el promedio real."
      >
        <ul className="flex flex-col">
          {OBLIGACIONES_SUGERIDAS.map((o) => {
            const activo = Boolean(obligaciones[o.clave]);
            return (
              <li
                key={o.clave}
                className="grid grid-cols-[1fr_minmax(0,9rem)_4.5rem] items-center gap-2 border-t py-2 sm:gap-3"
              >
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    name={`ob_${o.clave}`}
                    checked={activo}
                    onChange={(e) => setObligaciones((p) => ({ ...p, [o.clave]: e.target.checked }))}
                    className="size-5 shrink-0 accent-[var(--primary)]"
                  />
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">{o.nombre}</span>
                    <span className="text-xs text-muted-foreground">{o.ayuda}</span>
                  </span>
                </label>
                <MontoInput
                  name={`monto_${o.clave}`}
                  aria-label={`Monto de ${o.nombre}`}
                  placeholder="Monto"
                  disabled={!activo}
                />
                <Input
                  type="number"
                  inputMode="numeric"
                  name={`dia_${o.clave}`}
                  aria-label={`Día de pago de ${o.nombre}`}
                  defaultValue={o.dia}
                  min={1}
                  max={31}
                  disabled={!activo}
                  className={cn(!activo && "opacity-50")}
                />
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">
          Monto · día de pago. Tarjetas de crédito y préstamos se configuran en sus módulos (fases 2 y 3).
        </p>
        <Campo id="bv-cuenta-pago" etiqueta="¿Desde qué cuenta pagas normalmente?">
          <Select
            id="bv-cuenta-pago"
            name="cuenta_pago"
            defaultValue={nombresCuentas.includes("Ahorros") ? "Ahorros" : nombresCuentas[0]}
          >
            {nombresCuentas.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Campo>
      </Paso>

      <Paso n={3} titulo="Tu ingreso mensual" descripcion="Se agrega como ingreso esperado para saber si ya llegó.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_minmax(0,11rem)_5rem]">
          <Campo id="bv-sueldo-nombre" etiqueta="Nombre">
            <Input id="bv-sueldo-nombre" name="sueldo_nombre" defaultValue="Sueldo / honorarios" maxLength={80} />
          </Campo>
          <Campo id="bv-sueldo-monto" etiqueta="Monto">
            <MontoInput id="bv-sueldo-monto" name="sueldo_monto" placeholder="0" />
          </Campo>
          <Campo id="bv-sueldo-dia" etiqueta="Día">
            <Input
              id="bv-sueldo-dia"
              type="number"
              inputMode="numeric"
              name="sueldo_dia"
              defaultValue={1}
              min={1}
              max={31}
            />
          </Campo>
        </div>
      </Paso>

      {estado.error ? (
        <p role="alert" className="rounded-xl bg-destructive-soft px-4 py-3 text-sm font-semibold text-destructive">
          {estado.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pendiente} className="sm:self-end">
        {pendiente ? <Loader2Icon className="animate-spin" /> : null} Crear mi mes
      </Button>
    </form>
  );
}
