import { Badge } from "@/components/ui/badge";
import { type Banda, INDICADORES, type Indicador, LECTURAS, type LecturaScore } from "@/lib/domain/salud";
import { cn } from "@/lib/utils";

const numero = (v: number, dec = 0) =>
  v.toLocaleString("es-CO", { maximumFractionDigits: dec, minimumFractionDigits: 0 });

/** Valor de un indicador en su unidad: "37 %" o "4,2 meses". */
export function formatoIndicador(valor: number, formato: "pct" | "meses") {
  if (formato === "meses") return `${numero(valor, 1)} ${Math.abs(valor - 1) < 0.05 ? "mes" : "meses"}`;
  const p = valor * 100;
  return `${numero(p, Math.abs(p) < 10 && p % 1 !== 0 ? 1 : 0)} %`;
}

/** "Sano ≥ 20 % · riesgo < 10 %" según el sentido del indicador. */
export function textoUmbral(ind: Indicador) {
  if (ind.clave === "pago_tc") return "Sano: pagar el total de cada extracto";
  if (!ind.umbral) return "";
  const d = INDICADORES[ind.clave];
  const f = (v: number) => formatoIndicador(v, ind.formato);
  return d.mayorEsMejor
    ? `Sano ≥ ${f(ind.umbral.sano)} · riesgo < ${f(ind.umbral.riesgo)}`
    : `Sano ≤ ${f(ind.umbral.sano)} · riesgo > ${f(ind.umbral.riesgo)}`;
}

export const BANDAS: Record<Banda, { etiqueta: string; simbolo: string; variante: "success" | "warning" | "danger" }> =
  {
    sano: { etiqueta: "Sano", simbolo: "✓", variante: "success" },
    atencion: { etiqueta: "Atención", simbolo: "◐", variante: "warning" },
    riesgo: { etiqueta: "Riesgo", simbolo: "!", variante: "danger" },
  };

export function BadgeBanda({ banda }: { banda: Banda | null }) {
  if (!banda) return <Badge variant="neutral">— No aplica</Badge>;
  const b = BANDAS[banda];
  return (
    <Badge variant={b.variante}>
      {b.simbolo} {b.etiqueta}
    </Badge>
  );
}

export const TONOS_LECTURA: Record<LecturaScore, { texto: string; fondo: string; simbolo: string }> = {
  solida: { texto: "text-success", fondo: "bg-success", simbolo: "✓" },
  estable: { texto: "text-info", fondo: "bg-info", simbolo: "●" },
  fragil: { texto: "text-warning", fondo: "bg-warning", simbolo: "◐" },
  critica: { texto: "text-destructive", fondo: "bg-destructive", simbolo: "!" },
};

/** Barra 0–100 del score con las marcas de lectura (40 · 60 · 80). */
export function MedidorScore({ valor, lectura }: { valor: number; lectura: LecturaScore }) {
  const t = TONOS_LECTURA[lectura];
  return (
    <div className="flex flex-col gap-1">
      <div
        className="relative h-3 rounded-full bg-secondary"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={valor}
        aria-label={`Score de salud financiera: ${valor} de 100, ${LECTURAS[lectura].etiqueta}`}
      >
        <div className={cn("h-full rounded-full", t.fondo)} style={{ width: `${valor}%` }} />
        {[40, 60, 80].map((m) => (
          <span
            key={m}
            className="absolute -top-0.5 h-4 w-0.5 rounded-full bg-card"
            style={{ left: `calc(${m}% - 1px)` }}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="relative h-4 text-[11px] text-muted-foreground" aria-hidden="true">
        <span className="absolute left-0">Crítica</span>
        <span className="absolute left-[40%]">Frágil</span>
        <span className="absolute left-[60%]">Estable</span>
        <span className="absolute left-[80%]">Sólida</span>
      </div>
    </div>
  );
}
