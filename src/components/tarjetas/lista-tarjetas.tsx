"use client";

import { AlertTriangleIcon, ArchiveIcon, CreditCardIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { HojaFormulario } from "@/components/formularios/hoja-formulario";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatearCOP } from "@/lib/domain/dinero";
import { etiquetaRelativa } from "@/lib/domain/obligaciones";
import { extractoPendiente } from "@/lib/domain/tarjetas";
import type { TarjetaResumen } from "@/lib/tarjetas";
import { cn } from "@/lib/utils";
import { type CuentaPago, TarjetaForm } from "./formularios";
import { BarraUtilizacion, Dato, EstadoExtractoBadge, fechaCorta } from "./piezas";

export function ListaTarjetas({
  tarjetas,
  cuentas,
  hoy,
}: {
  tarjetas: TarjetaResumen[];
  cuentas: CuentaPago[];
  hoy: string;
}) {
  const router = useRouter();
  const [nueva, setNueva] = useState(false);
  const activas = tarjetas.filter((t) => t.activa);
  const archivadas = tarjetas.filter((t) => !t.activa);
  const deuda = activas.reduce((a, t) => a + Math.max(t.deuda_total, 0), 0);
  const cupo = activas.reduce((a, t) => a + t.cupo, 0);
  const costo = tarjetas.reduce((a, t) => a + t.costo_financiero_anio, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-semibold">Tarjetas de crédito</h1>
          <p className="text-sm text-muted-foreground">
            La app lleva el capital; cada extracto revela los intereses y otros cargos.
          </p>
        </div>
        <Button onClick={() => setNueva(true)}>
          <PlusIcon /> Nueva tarjeta
        </Button>
      </div>

      {activas.length > 0 ? (
        <Card className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Dato etiqueta="Deuda total en tarjetas" valor={deuda} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <Dato etiqueta="Cupo disponible" valor={cupo - deuda} detalle={`de ${formatearCOP(cupo)}`} />
            <BarraUtilizacion utilizacion={cupo > 0 ? deuda / cupo : 0} cupo={cupo} compacta />
          </div>
          <Dato
            etiqueta={`Costo financiero ${hoy.slice(0, 4)}`}
            valor={costo}
            tono={costo > 0 ? "text-warning" : undefined}
            detalle="Intereses, cuotas de manejo, seguros…"
          />
        </Card>
      ) : (
        <Card className="items-center gap-3 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <CreditCardIcon className="size-6" aria-hidden="true" />
          </span>
          <span className="font-bold">Aún no tienes tarjetas registradas</span>
          <span className="max-w-md text-sm text-muted-foreground">
            Crea tu tarjeta con su cupo, día de corte y día de pago. Luego registra las compras (solo capital) y, cuando
            llegue el extracto, el pago total y mínimo: la app calcula los otros cargos.
          </span>
          <Button onClick={() => setNueva(true)}>
            <PlusIcon /> Crear mi primera tarjeta
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {activas.map((t) => (
          <FichaTarjeta key={t.id} t={t} hoy={hoy} />
        ))}
      </div>

      {archivadas.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-extrabold tracking-wider text-muted-foreground uppercase">Archivadas</h2>
          <ul className="flex flex-col gap-2">
            {archivadas.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tarjetas/${t.id}`}
                  className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm outline-none hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <ArchiveIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1 font-semibold">{t.nombre}</span>
                  <span className="text-muted-foreground">{formatearCOP(t.deuda_total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <HojaFormulario titulo="Nueva tarjeta de crédito" open={nueva} onOpenChange={setNueva}>
        {(cerrar) => (
          <TarjetaForm
            cuentas={cuentas}
            onGuardado={(id) => {
              cerrar();
              if (id) router.push(`/tarjetas/${id}`);
            }}
          />
        )}
      </HojaFormulario>
    </div>
  );
}

function FichaTarjeta({ t, hoy }: { t: TarjetaResumen; hoy: string }) {
  const u = t.ultimo_extracto;
  const faltaExtracto = extractoPendiente(
    hoy,
    t.dia_corte,
    u ? [{ fecha_corte: u.fecha_corte }] : [],
    t.primera_actividad,
  );
  const porPagar = u ? Math.max(u.pago_minimo - u.pagado, 0) : 0;
  const vencido = Boolean(u && u.fecha_limite_pago < hoy && u.pagado < u.pago_minimo - 1000);

  return (
    <Link
      href={`/tarjetas/${t.id}`}
      className="flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-5 outline-none hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <CreditCardIcon className="size-5" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-bold">{t.nombre}</span>
          <span className="text-xs text-muted-foreground">
            {[t.entidad, t.ultimos4 ? `···· ${t.ultimos4}` : null, `corte día ${t.dia_corte}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-lg font-bold">{formatearCOP(t.deuda_total)}</span>
          <span className="text-xs text-muted-foreground">deuda</span>
        </div>
      </div>
      <BarraUtilizacion utilizacion={t.utilizacion} cupo={t.cupo} />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
        {faltaExtracto ? (
          <span className="flex items-center gap-1.5 font-semibold text-warning">
            <AlertTriangleIcon className="size-4" aria-hidden="true" /> Registra el extracto del{" "}
            {fechaCorta(faltaExtracto)}
          </span>
        ) : u ? (
          <>
            <span className={cn("text-muted-foreground", vencido && "font-semibold text-destructive")}>
              {u.estado === "pagado_total" || u.estado === "minimo_cubierto"
                ? `Extracto del ${fechaCorta(u.fecha_corte)}`
                : `Mínimo ${formatearCOP(porPagar)} · vence ${etiquetaRelativa(u.fecha_limite_pago, hoy)}`}
            </span>
            <EstadoExtractoBadge estado={u.estado} vencido={vencido} />
          </>
        ) : (
          <span className="text-muted-foreground">Sin extractos todavía</span>
        )}
      </div>
    </Link>
  );
}
