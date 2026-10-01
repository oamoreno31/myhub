import { Badge } from "@/components/ui/badge";
import { formatearCOP } from "@/lib/domain/dinero";
import {
  ETIQUETA_ESTADO_EXTRACTO,
  ETIQUETA_TIPO_PAGO,
  type EstadoExtracto,
  nivelUtilizacion,
  type TipoPago,
} from "@/lib/domain/tarjetas";
import { cn } from "@/lib/utils";

const NIVEL = {
  sano: { barra: "bg-success", texto: "text-success", simbolo: "✓", etiqueta: "Uso sano" },
  atencion: { barra: "bg-warning", texto: "text-warning", simbolo: "◐", etiqueta: "Uso medio" },
  alto: { barra: "bg-destructive", texto: "text-destructive", simbolo: "!", etiqueta: "Uso alto" },
} as const;

/** Barra de utilización del cupo con porcentaje y texto (nunca solo color). */
export function BarraUtilizacion({
  utilizacion,
  cupo,
  compacta,
}: {
  utilizacion: number;
  cupo: number;
  compacta?: boolean;
}) {
  if (cupo <= 0) return <span className="text-xs text-muted-foreground">Sin cupo registrado</span>;
  const n = NIVEL[nivelUtilizacion(utilizacion)];
  const pct = Math.round(utilizacion * 100);
  return (
    <div className="flex flex-col gap-1">
      <div
        className="h-2 overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-label="Uso del cupo"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={cn("h-full rounded-full", n.barra)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={cn("text-xs font-semibold", n.texto)}>
        {n.simbolo} {pct} % del cupo{compacta ? "" : ` · ${n.etiqueta}`}
      </span>
    </div>
  );
}

const VARIANTE_EXTRACTO: Record<EstadoExtracto, "neutral" | "success" | "warning" | "danger" | "info"> = {
  pendiente: "neutral",
  parcial: "warning",
  minimo_cubierto: "info",
  pagado_total: "success",
};
const SIMBOLO_EXTRACTO: Record<EstadoExtracto, string> = {
  pendiente: "○",
  parcial: "◐",
  minimo_cubierto: "◑",
  pagado_total: "✓",
};

export function EstadoExtractoBadge({ estado, vencido }: { estado: EstadoExtracto; vencido?: boolean }) {
  if (vencido && (estado === "pendiente" || estado === "parcial")) {
    return <Badge variant="danger">! {estado === "parcial" ? "Bajo el mínimo" : "Vencido"}</Badge>;
  }
  return (
    <Badge variant={VARIANTE_EXTRACTO[estado]}>
      {SIMBOLO_EXTRACTO[estado]} {ETIQUETA_ESTADO_EXTRACTO[estado]}
    </Badge>
  );
}

const VARIANTE_PAGO: Record<TipoPago, "neutral" | "success" | "warning" | "danger" | "info"> = {
  total: "success",
  minimo: "info",
  otro: "neutral",
  inferior_minimo: "danger",
};

export function TipoPagoBadge({ tipo }: { tipo: TipoPago | null }) {
  if (!tipo) return null;
  return (
    <Badge variant={VARIANTE_PAGO[tipo]}>
      {tipo === "inferior_minimo" ? "! " : tipo === "total" ? "✓ " : ""}
      {ETIQUETA_TIPO_PAGO[tipo]}
    </Badge>
  );
}

export function Dato({
  etiqueta,
  valor,
  tono,
  detalle,
}: {
  etiqueta: string;
  valor: number;
  tono?: string;
  detalle?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs font-semibold text-muted-foreground">{etiqueta}</span>
      <span className={cn("text-lg font-bold sm:text-xl", tono)}>{formatearCOP(valor)}</span>
      {detalle ? <span className="text-xs text-muted-foreground">{detalle}</span> : null}
    </div>
  );
}

export const fechaCorta = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" });

export const fechaMedia = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export const mesLargo = (iso: string) => {
  const t = new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CO", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
