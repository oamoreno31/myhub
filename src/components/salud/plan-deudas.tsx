"use client";

import { Desplazable } from "@/components/ui/desplazable";
import { LandmarkIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { pct } from "@/components/analisis/piezas";
import { MarcoGrafica } from "@/components/graficas/base";
import { COLORES_SERIE } from "@/components/graficas/colores";
import { Lineas } from "@/components/graficas/lineas";
import { MontoInput } from "@/components/formularios/monto-input";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatearCOP } from "@/lib/domain/dinero";
import { etiquetaEjeMes } from "@/lib/domain/analisis";
import { desplazarPeriodo, nombreCortoPeriodo, nombrePeriodo } from "@/lib/domain/periodos";
import { type Metodo, type ResultadoSim, simular } from "@/lib/domain/simulador";
import type { DeudaPlan } from "@/lib/salud";
import { cn } from "@/lib/utils";

const NOMBRES: Record<Metodo, { titulo: string; detalle: string }> = {
  minimos: { titulo: "Solo mínimos", detalle: "Si no cambias nada" },
  avalancha: { titulo: "Avalancha", detalle: "La tasa más alta primero" },
  bola_nieve: { titulo: "Bola de nieve", detalle: "El saldo más pequeño primero" },
};

const duracion = (meses: number) => {
  const a = Math.floor(meses / 12);
  const m = meses % 12;
  return (
    [a ? `${a} ${a === 1 ? "año" : "años"}` : "", m ? `${m} ${m === 1 ? "mes" : "meses"}` : ""]
      .filter(Boolean)
      .join(" y ") || "0 meses"
  );
};

const aTasa = (v: number | null) => (v === null ? "" : String(Math.round(v * 10000) / 100).replace(".", ","));
const deTasa = (t: string) => {
  const n = Number(t.replace(",", "."));
  return t.trim() === "" || !Number.isFinite(n) || n < 0 ? null : n / 100;
};

export function PanelDeudas({
  deudas,
  usuraEA,
  hoy,
}: {
  deudas: DeudaPlan[];
  usuraEA: number | null;
  /** Periodo actual "YYYY-MM". */
  hoy: string;
}) {
  const [tasas, setTasas] = useState<Record<string, string>>(() =>
    Object.fromEntries(deudas.map((d) => [d.id, aTasa(d.tasaEA)])),
  );
  const [minimos, setMinimos] = useState<Record<string, number>>(() =>
    Object.fromEntries(deudas.map((d) => [d.id, d.minimo])),
  );
  const [extra, setExtra] = useState<number>(100_000);

  const entrada = deudas.map((d) => ({
    id: d.id,
    nombre: d.nombre,
    saldo: d.saldo,
    tasaEA: deTasa(tasas[d.id] ?? ""),
    minimo: minimos[d.id] ?? 0,
  }));
  const faltan = entrada.filter((d) => d.tasaEA === null);
  const listas = faltan.length === 0 && entrada.every((d) => d.minimo > 0);

  // Simular es barato (≤ 600 meses × pocas deudas), así que se recalcula en cada cambio.
  const resultados = listas
    ? (["minimos", "avalancha", "bola_nieve"] as Metodo[]).map((m) =>
        simular(
          entrada.map((d) => ({ ...d, tasaEA: d.tasaEA as number })),
          extra,
          m,
        ),
      )
    : null;

  if (deudas.length === 0)
    return (
      <Card className="items-center gap-2 py-10 text-center">
        <LandmarkIcon className="size-8 text-muted-foreground" aria-hidden="true" />
        <span className="font-bold">No tienes deudas con saldo</span>
        <span className="max-w-sm text-sm text-muted-foreground">
          Cuando tengas tarjetas con saldo o préstamos, aquí comparas cómo salir de ellos más rápido.
        </span>
      </Card>
    );

  const total = entrada.reduce((a, d) => a + d.saldo, 0);
  const sumaMinimos = entrada.reduce((a, d) => a + d.minimo, 0);
  const [minimosR, avalancha, bola] = resultados ?? [];
  const mejor = avalancha && bola ? (avalancha.intereses <= bola.intereses ? avalancha : bola) : null;
  const primeraVictoria = (r: ResultadoSim) => Math.min(...Object.values(r.saldadas));
  const nombre = (id: string) => deudas.find((d) => d.id === id)?.nombre ?? "";

  // Gráfica: saldo total mes a mes (solo mínimos se recorta al horizonte de los otros dos × 2).
  const horizonte = resultados
    ? Math.min(
        Math.max(...resultados.map((r) => r.meses ?? 0)) || 120,
        Math.max(avalancha?.meses ?? 0, bola?.meses ?? 0) * 2 || 120,
        240,
      )
    : 0;
  const serie = (r: ResultadoSim) =>
    Array.from({ length: horizonte + 1 }, (_, i) => r.serie[i] ?? (r.meses === null ? (r.serie.at(-1) ?? 0) : 0));
  const periodos = Array.from({ length: horizonte + 1 }, (_, i) => desplazarPeriodo(hoy, i));

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Pagas el mínimo de todas y lo extra va a una sola deuda; cuando la terminas, su mínimo se suma al extra (por eso
        crece como bola de nieve). Supone mínimos fijos y que no haces compras nuevas.
      </p>

      <Card className="gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <h2 className="font-bold">Tus deudas</h2>
          <span className="text-sm text-muted-foreground">
            {formatearCOP(total)} · mínimos {formatearCOP(sumaMinimos)}/mes
          </span>
        </div>
        <ul className="flex flex-col divide-y">
          {deudas.map((d) => {
            const tasa = deTasa(tasas[d.id] ?? "");
            const usura = usuraEA !== null && tasa !== null && tasa > usuraEA;
            return (
              <li
                key={d.id}
                className="grid grid-cols-2 gap-x-3 gap-y-2 py-3 sm:grid-cols-[minmax(0,1fr)_8rem_7rem_10rem] sm:items-start"
              >
                <div className="flex min-w-0 flex-col">
                  <Link href={d.href} className="truncate font-semibold hover:underline">
                    {d.nombre}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {d.clase === "tarjeta" ? "Tarjeta" : "Préstamo"}
                  </span>
                </div>
                <div className="flex flex-col items-end sm:pt-0.5">
                  <span className="text-xs text-muted-foreground sm:hidden">Saldo</span>
                  <span className="font-semibold tabular-nums">{formatearCOP(d.saldo)}</span>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-muted-foreground">Tasa % E.A.</span>
                  <Input
                    inputMode="decimal"
                    value={tasas[d.id] ?? ""}
                    placeholder="Ej.: 28"
                    aria-invalid={tasa === null ? true : undefined}
                    onChange={(e) => setTasas((t) => ({ ...t, [d.id]: e.target.value }))}
                  />
                  {tasa === null ? (
                    <span className="text-xs font-semibold text-destructive">Falta (está en el extracto)</span>
                  ) : usura ? (
                    <span className="text-xs font-semibold text-destructive">
                      ! Supera la usura ({pct(usuraEA!, 1)})
                    </span>
                  ) : null}
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {d.clase === "tarjeta" ? "Pago mínimo" : "Cuota"}
                  </span>
                  <MontoInput
                    name={`minimo-${d.id}`}
                    defaultValue={d.minimo}
                    onValor={(v) => setMinimos((m) => ({ ...m, [d.id]: v ?? 0 }))}
                  />
                </label>
              </li>
            );
          })}
        </ul>
        <label className="flex flex-col gap-1.5 sm:max-w-xs">
          <span className="text-sm font-semibold">Extra al mes, además de los mínimos</span>
          <MontoInput name="extra" grande defaultValue={extra} onValor={(v) => setExtra(v ?? 0)} />
        </label>
      </Card>

      {!resultados ? (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm font-semibold text-warning">
          ◐ Completa la tasa{faltan.length > 1 ? "s" : ""} de {faltan.map((d) => d.nombre).join(", ") || "cada deuda"} y
          los mínimos para simular.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {resultados.map((r) => {
              const ahorro = minimosR.intereses - r.intereses;
              const esMejor = mejor?.metodo === r.metodo;
              return (
                <Card key={r.metodo} className={cn("gap-2", esMejor && "border-primary")}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-bold">{NOMBRES[r.metodo].titulo}</span>
                    {esMejor ? <span className="text-xs font-semibold text-primary">✓ Menos intereses</span> : null}
                  </div>
                  <span className="text-xs text-muted-foreground">{NOMBRES[r.metodo].detalle}</span>
                  {r.meses === null ? (
                    <p className="text-sm font-semibold text-destructive">
                      ! Con estos pagos no terminas en 50 años
                      {r.noAlcanza.length
                        ? `: el mínimo de ${r.noAlcanza.map(nombre).join(", ")} no cubre ni los intereses`
                        : ""}
                      .
                    </p>
                  ) : (
                    <>
                      <span className="text-2xl font-bold">{duracion(r.meses)}</span>
                      <span className="text-sm">
                        Libre en <strong>{nombrePeriodo(desplazarPeriodo(hoy, r.meses - 1)).toLowerCase()}</strong>
                      </span>
                      <span className="text-sm">
                        Intereses: <strong>{formatearCOP(r.intereses)}</strong>
                      </span>
                      {r.metodo !== "minimos" && minimosR.meses !== null && ahorro > 0 ? (
                        <span className="text-sm text-success">
                          ▼ {formatearCOP(ahorro)} menos y {duracion(minimosR.meses - r.meses)} antes que solo mínimos
                        </span>
                      ) : null}
                      {r.metodo === "bola_nieve" && Object.keys(r.saldadas).length > 0 ? (
                        <span className="text-xs text-muted-foreground">
                          Primera deuda saldada en el mes {primeraVictoria(r)}
                        </span>
                      ) : null}
                    </>
                  )}
                </Card>
              );
            })}
          </div>

          <MarcoGrafica titulo="Cuánto debes mes a mes" descripcion="Saldo total de tus deudas con cada método.">
            <Lineas
              etiquetas={periodos.map(etiquetaEjeMes)}
              titulos={periodos.map(nombreCortoPeriodo)}
              series={resultados.map((r, k) => ({
                id: r.metodo,
                nombre: NOMBRES[r.metodo].titulo,
                color: COLORES_SERIE[k],
                valores: serie(r),
              }))}
              etiquetaAria="Saldo total de deudas por método"
              conTabla={false}
            />
          </MarcoGrafica>

          <Card className="gap-2">
            <h2 className="font-bold">Orden y mes en que sales de cada una</h2>
            <Desplazable etiqueta="Mes en que sales de cada deuda por método">
              <table className="w-full min-w-[28rem] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-2 font-semibold">Deuda</th>
                    {resultados.map((r) => (
                      <th key={r.metodo} className="py-2 pr-2 text-right font-semibold">
                        {NOMBRES[r.metodo].titulo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deudas.map((d) => (
                    <tr key={d.id} className="border-t">
                      <td className="py-2 pr-2">{d.nombre}</td>
                      {resultados.map((r) => {
                        const mes = r.saldadas[d.id];
                        return (
                          <td key={r.metodo} className="py-2 pr-2 text-right tabular-nums">
                            {mes ? (
                              <>
                                {r.metodo !== "minimos" ? (
                                  <span className="text-xs text-muted-foreground">
                                    {r.orden.indexOf(d.id) + 1}.º ·{" "}
                                  </span>
                                ) : null}
                                {nombreCortoPeriodo(desplazarPeriodo(hoy, mes - 1))}
                              </>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Desplazable>
          </Card>
        </>
      )}
    </div>
  );
}
