/**
 * Correo diario de recordatorios (HU-24): lo vencido y lo que vence en ≤ 3 días.
 * Solo arma asunto y cuerpo (HTML + texto); el envío vive en lib/correo.ts.
 */
import { formatearCOP } from "./dinero";
import { diasHasta, etiquetaRelativa } from "./obligaciones";

export type ObligacionRecordatorio = {
  nombre: string;
  /** "YYYY-MM-DD" */
  vence: string;
  pendiente: number;
  esperado: number;
  tarjeta: boolean;
};

export type Correo = { asunto: string; html: string; texto: string };

const escapar = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Monto a mostrar: lo pendiente; si la obligación es variable sin monto, "por definir". */
const monto = (o: ObligacionRecordatorio) =>
  o.pendiente > 0 ? formatearCOP(o.pendiente) : o.esperado > 0 ? formatearCOP(o.esperado) : "monto por definir";

export function armarCorreoRecordatorio(p: {
  obligaciones: ObligacionRecordatorio[];
  hoy: string;
  urlApp: string | null;
}): Correo | null {
  if (p.obligaciones.length === 0) return null;
  const vencidas = p.obligaciones.filter((o) => diasHasta(o.vence, p.hoy) < 0);
  const proximas = p.obligaciones.filter((o) => diasHasta(o.vence, p.hoy) >= 0);
  const total = p.obligaciones.reduce((a, o) => a + Math.max(o.pendiente, 0), 0);

  const partes: string[] = [];
  if (vencidas.length) partes.push(`${vencidas.length} vencida${vencidas.length > 1 ? "s" : ""}`);
  const hoyN = proximas.filter((o) => o.vence === p.hoy).length;
  if (hoyN) partes.push(`${hoyN} vence${hoyN > 1 ? "n" : ""} hoy`);
  const luego = proximas.length - hoyN;
  if (luego) partes.push(`${luego} en los próximos días`);
  const asunto = `Plata Clara: ${partes.join(", ")} · ${formatearCOP(total)}`;

  const fila = (o: ObligacionRecordatorio) => {
    const cuando = etiquetaRelativa(o.vence, p.hoy);
    const vencida = diasHasta(o.vence, p.hoy) < 0;
    return {
      html: `<tr>
  <td style="padding:8px 0;border-top:1px solid #e6e3db">${escapar(o.nombre)}${o.tarjeta ? ' <span style="color:#6f6c66">(pago mínimo)</span>' : ""}<br>
  <span style="font-size:13px;color:${vencida ? "#b3261e" : "#6f6c66"}">${vencida ? "! Vencida" : "Vence"} ${escapar(cuando)} · ${o.vence.slice(8)}/${o.vence.slice(5, 7)}</span></td>
  <td style="padding:8px 0;border-top:1px solid #e6e3db;text-align:right;font-weight:700;white-space:nowrap">${escapar(monto(o))}</td>
</tr>`,
      texto: `- ${o.nombre}${o.tarjeta ? " (pago mínimo)" : ""}: ${monto(o)} · ${vencida ? "VENCIDA" : "vence"} ${cuando}`,
    };
  };

  const seccion = (titulo: string, lista: ObligacionRecordatorio[]) =>
    lista.length
      ? `<h2 style="font-size:15px;margin:20px 0 4px">${titulo}</h2>
<table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px">${lista.map((o) => fila(o).html).join("")}</table>`
      : "";

  const boton = p.urlApp
    ? `<p style="margin:24px 0"><a href="${escapar(p.urlApp)}/mes" style="background:#1f5a45;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;display:inline-block">Ver el mes y pagar</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="es"><body style="margin:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;color:#1c1b19">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#ffffff;border-radius:16px;padding:24px">
<p style="margin:0;font-size:13px;color:#6f6c66">Plata Clara · recordatorio diario</p>
<h1 style="font-size:22px;margin:6px 0 0">Tienes ${formatearCOP(total)} por pagar</h1>
${seccion("Vencidas", vencidas)}
${seccion("Por vencer", proximas)}
${boton}
<p style="font-size:12px;color:#6f6c66;margin:16px 0 0">Recibes este correo porque tienes activos los recordatorios. Desactívalos en Configuración → Preferencias.</p>
</div></div></body></html>`;

  const texto = [
    `Tienes ${formatearCOP(total)} por pagar.`,
    vencidas.length ? `\nVencidas:\n${vencidas.map((o) => fila(o).texto).join("\n")}` : "",
    proximas.length ? `\nPor vencer:\n${proximas.map((o) => fila(o).texto).join("\n")}` : "",
    p.urlApp ? `\nVer el mes: ${p.urlApp}/mes` : "",
    "\nDesactiva estos correos en Configuración → Preferencias.",
  ]
    .filter(Boolean)
    .join("\n");

  return { asunto, html, texto };
}

/** Nombre del archivo de respaldo semanal y cuáles borrar (retención en días). */
export function respaldosParaBorrar(nombres: string[], hoy: string, diasRetencion = 56): string[] {
  return nombres.filter((n) => {
    const m = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(n);
    return m !== null && diasHasta(m[1], hoy) < -diasRetencion;
  });
}

/** Domingo en la fecha "YYYY-MM-DD" (ya en la zona del usuario). */
export function esDomingo(fechaISO: string): boolean {
  return new Date(`${fechaISO}T12:00:00Z`).getUTCDay() === 0;
}
