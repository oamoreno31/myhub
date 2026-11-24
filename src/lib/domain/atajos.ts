/**
 * Respuestas para los Atajos de iPhone (docs/08 §3.2). Funciones puras: arman los diccionarios
 * "etiqueta → valor" que el atajo muestra con "Elegir de la lista" y los mensajes de notificación.
 *
 * Los valores de origen llevan prefijo: "t:<id>" tarjeta de crédito, "c:<id>" cuenta. El atajo
 * pregunta cuotas solo si el valor elegido empieza por "t:". El id siempre es el de la cuenta.
 */
import { formatearCOP } from "./dinero";

export type OrigenAtajo = {
  id: string;
  nombre: string;
  tipo: string;
  tarjeta: boolean;
  ultimos4: string | null;
  sugerido: boolean;
};

export type CategoriaAtajo = { id: string; nombre: string; padre: string | null };

export type SugerenciaCategoria = { id: string; nombre: string; confiable: boolean } | null;

export type ResumenRegistro = {
  ok: boolean;
  mensaje?: string;
  id?: string;
  registro?: "movimiento" | "compra_tc";
  tipo?: string;
  monto?: number | string;
  origen?: string;
  destino?: string | null;
  ultimos4?: string | null;
  categoria?: string | null;
  por_revisar?: boolean;
  cuotas?: number | null;
  repetido?: boolean;
};

const ICONOS: Record<string, string> = {
  tarjeta_credito: "💳",
  efectivo: "💵",
  billetera: "📱",
  ahorros: "🏦",
  corriente: "🏦",
  cooperativa: "🤝",
  inversion: "📈",
};

/** Valor que viaja al atajo: "t:<cuenta>" o "c:<cuenta>". */
export function valorOrigen(o: Pick<OrigenAtajo, "id" | "tarjeta">): string {
  return `${o.tarjeta ? "t" : "c"}:${o.id}`;
}

/** Acepta "t:<uuid>", "c:<uuid>" o el uuid solo. */
export function idDeOrigen(valor: string): string {
  return valor.trim().replace(/^[tc]:/i, "");
}

export function etiquetaOrigen(o: OrigenAtajo): string {
  return `${ICONOS[o.tipo] ?? "•"} ${o.nombre}${o.ultimos4 ? ` ·${o.ultimos4}` : ""}`;
}

/**
 * Diccionario con etiquetas únicas en el orden dado (JSON conserva el orden de inserción de
 * claves no numéricas, y Atajos lo respeta). También devuelve la lista de etiquetas.
 */
export function diccionario(pares: [string, string][]): { mapa: Record<string, string>; lista: string[] } {
  const mapa: Record<string, string> = {};
  const lista: string[] = [];
  for (const [etiqueta, valor] of pares) {
    let clave = etiqueta;
    for (let i = 2; clave in mapa; i++) clave = `${etiqueta} (${i})`;
    mapa[clave] = valor;
    lista.push(clave);
  }
  return { mapa, lista };
}

export function diccionarioOrigenes(origenes: OrigenAtajo[], tipo: string) {
  // Un ingreso o un retiro no pueden ir a una tarjeta de crédito.
  const validos = tipo === "gasto" ? origenes : origenes.filter((o) => !o.tarjeta);
  return diccionario(validos.map((o) => [etiquetaOrigen(o), valorOrigen(o)]));
}

export const CLASIFICAR_DESPUES = "📥 Clasificar después";

/**
 * Categorías: la sugerida primero (con su id: elegirla la confirma), luego por uso y al final
 * "Clasificar después" (= auto: usa el historial si es confiable o la deja en la bandeja).
 */
export function diccionarioCategorias(categorias: CategoriaAtajo[], sugerida: SugerenciaCategoria) {
  const repetidos = new Set(categorias.map((c) => c.nombre).filter((n, i, todos) => todos.indexOf(n) !== i));
  const pares: [string, string][] = [];
  if (sugerida) pares.push([`✨ ${sugerida.nombre} (sugerida)`, sugerida.id]);
  for (const c of categorias) {
    if (sugerida && c.id === sugerida.id) continue;
    pares.push([repetidos.has(c.nombre) && c.padre ? `${c.nombre} · ${c.padre}` : c.nombre, c.id]);
  }
  pares.push([CLASIFICAR_DESPUES, "auto"]);
  return diccionario(pares);
}

export function textoDuplicado(d: {
  hace_min: number;
  descripcion: string | null;
  origen: string;
  monto: number | string;
}) {
  const cuando = d.hace_min <= 0 ? "hace un momento" : `hace ${d.hace_min} min`;
  const donde = d.descripcion ? `en ${d.descripcion}` : `con ${d.origen}`;
  return `¿Ya registraste ${formatearCOP(d.monto)} ${donde} (${d.origen}) ${cuando}?`;
}

/** Mensaje para "Mostrar notificación" en el iPhone. */
export function mensajeRegistro(r: ResumenRegistro): string {
  if (!r.ok) return `⚠️ ${r.mensaje ?? "No se pudo registrar"}`;
  const monto = formatearCOP(r.monto ?? 0);
  const origen = `${r.origen ?? ""}${r.ultimos4 ? ` ·${r.ultimos4}` : ""}`;
  let texto: string;
  if (r.tipo === "transferencia") {
    texto = `${monto} de ${origen} a ${r.destino ?? "—"}`;
  } else if (r.registro === "compra_tc") {
    const cuotas = r.cuotas && r.cuotas > 1 ? `${r.cuotas} cuotas` : "1 cuota";
    texto = `Compra de ${monto} · ${origen} · ${r.categoria ?? "—"} · ${cuotas}`;
  } else {
    texto = `${r.tipo === "ingreso" ? "Ingreso" : "Gasto"} de ${monto} · ${origen} · ${r.categoria ?? "—"}`;
  }
  if (r.por_revisar) texto += " · 📥 por revisar";
  return r.repetido ? `Ya estaba registrado: ${texto}` : `✓ ${texto}`;
}

// ---------------------------------------------------------------------------
// Pantalla Configuración → Atajos de iPhone y bandeja "Por revisar"
// ---------------------------------------------------------------------------

export const ETIQUETA_FUENTE: Record<string, string> = {
  wallet: "Wallet",
  sms: "SMS",
  rapido: "Registro rápido",
  dictado: "Dictado",
};

/** "atajo_wallet" → "Wallet"; lo registrado en la app → null. */
export function fuenteDeRegistro(origen: string | null | undefined): string | null {
  if (!origen || !origen.startsWith("atajo_")) return null;
  return ETIQUETA_FUENTE[origen.slice("atajo_".length)] ?? "iPhone";
}

export const ETIQUETA_ALIAS: Record<string, string> = {
  wallet_tarjeta: "Tarjeta en Wallet",
  sms_ultimos4: "Últimos 4 del SMS",
  nombre_dictado: "Nombre dictado",
};

export type TonoBadge = "success" | "warning" | "danger" | "info" | "neutral";

export const RESULTADO_CAPTURA: Record<string, { etiqueta: string; tono: TonoBadge }> = {
  registrado: { etiqueta: "✓ Registrado", tono: "success" },
  repetido: { etiqueta: "↻ Repetido", tono: "info" },
  rechazado: { etiqueta: "! Rechazado", tono: "danger" },
  ignorado: { etiqueta: "— SMS ignorado", tono: "neutral" },
  consultado: { etiqueta: "Consulta", tono: "neutral" },
};

export type EstadoToken = "activo" | "revocado" | "vencido";

export function estadoToken(
  t: { revocado_en: string | null; expira_en: string | null },
  ahora: Date = new Date(),
): EstadoToken {
  if (t.revocado_en) return "revocado";
  if (t.expira_en && Date.parse(t.expira_en) <= ahora.getTime()) return "vencido";
  return "activo";
}

/** "hace un momento", "hace 5 min", "hace 3 h", "hace 2 días"; null → "nunca". */
export function haceCuanto(iso: string | null, ahora: Date = new Date()): string {
  if (!iso) return "nunca";
  const min = Math.floor((ahora.getTime() - Date.parse(iso)) / 60_000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "hace 1 día" : `hace ${d} días`;
}
