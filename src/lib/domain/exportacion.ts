/**
 * Exportación de datos (HU-25): filas planas y CSV compatible con Excel en español
 * (separador ";", coma decimal, UTF-8 con BOM).
 */
import { compararPeriodos, esPeriodoValido, type PeriodoId } from "./periodos";

export type Celda = string | number | boolean | null;
export type Tabla = {
  nombre: string;
  columnas: { clave: string; titulo: string; tipo?: "texto" | "fecha" | "pesos" | "numero" }[];
  filas: Record<string, Celda>[];
};

export const ETIQUETA_TIPO_MOVIMIENTO: Record<string, string> = {
  ingreso: "Ingreso",
  gasto: "Gasto",
  transferencia: "Transferencia",
  pago_tc: "Pago de tarjeta",
  pago_deuda: "Cuota de préstamo",
  aporte: "Aporte",
  desembolso_deuda: "Desembolso de préstamo",
  prestamo_otorgado: "Préstamo hecho",
  recuperacion_prestamo: "Recuperación de préstamo",
  reembolso_devtopia: "Reembolso Devtopia",
};

/** Rango "desde–hasta" válido (máx. 36 meses); por defecto, el año del periodo actual hasta hoy. */
export function rangoExportacion(
  desde: unknown,
  hasta: unknown,
  actual: PeriodoId,
): { desde: PeriodoId; hasta: PeriodoId } {
  let h = esPeriodoValido(hasta) ? (hasta as PeriodoId) : actual;
  let d = esPeriodoValido(desde) ? (desde as PeriodoId) : `${h.slice(0, 4)}-01`;
  if (compararPeriodos(d, h) > 0) [d, h] = [h, d];
  const [yd, md] = d.split("-").map(Number);
  const [yh, mh] = h.split("-").map(Number);
  if ((yh - yd) * 12 + (mh - md) > 35) {
    const inicio = new Date(Date.UTC(yh, mh - 1 - 35, 1));
    d = `${inicio.getUTCFullYear()}-${String(inicio.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return { desde: d, hasta: h };
}

const numeroCSV = (v: number) => {
  const redondo = Math.round(v * 100) / 100;
  return String(redondo).replace(".", ",");
};

function celdaCSV(v: Celda): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number") return numeroCSV(v);
  // Evita inyección de fórmulas al abrir en Excel.
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function aCSV(tabla: Tabla): string {
  const lineas = [
    tabla.columnas.map((c) => celdaCSV(c.titulo)).join(";"),
    ...tabla.filas.map((f) => tabla.columnas.map((c) => celdaCSV(f[c.clave] ?? null)).join(";")),
  ];
  return `﻿${lineas.join("\r\n")}\r\n`;
}
