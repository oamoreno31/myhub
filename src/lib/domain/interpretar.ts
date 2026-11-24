/**
 * Intérprete de lo que llega del iPhone (docs/08 §2): montos escritos de cualquier forma, SMS de
 * bancos colombianos y frases dictadas. Funciones puras, sin dependencias.
 *
 * Las reglas de SMS son genéricas (palabras clave + patrones de monto, comercio y últimos 4).
 * Se afinan con SMS reales anonimizados (F8.0) agregando casos a interpretar.test.ts.
 */

export type TipoAtajo = "gasto" | "ingreso" | "transferencia";
export type OperacionSMS = "compra" | "pago" | "transferencia_enviada" | "transferencia_recibida" | "retiro";

const TILDES: Record<string, string> = {
  á: "a",
  é: "e",
  í: "i",
  ó: "o",
  ú: "u",
  ü: "u",
  à: "a",
  è: "e",
  ì: "i",
  ò: "o",
  ù: "u",
};

/**
 * Clave de comparación: sin mayúsculas, espacios dobles ni tildes.
 * Espejo exacto de la función SQL `clave_texto` (misma tabla de reemplazos).
 */
export function claveTexto(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const k = texto
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/[áéíóúüàèìòù]/g, (c) => TILDES[c]);
  return k || null;
}

/** Minúsculas y sin diacríticos (para buscar palabras clave). La ñ queda como n. */
function plano(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Montos
// ---------------------------------------------------------------------------

const MULTIPLICADOR: Record<string, number> = {
  millones: 1_000_000,
  millon: 1_000_000,
  palos: 1_000_000,
  palo: 1_000_000,
  m: 1_000_000,
  lucas: 1_000,
  luca: 1_000,
  mil: 1_000,
  k: 1_000,
};

// Número con separadores ("45.900,00", "45,900.00", "45 900", "1'500.000") y multiplicador opcional.
// No toma cifras pegadas a letras ("D1", "T2").
const RE_MONTO =
  /(?<![a-z0-9])(\d(?:[\d.,']|\s(?=\d{3}(?!\d)))*)\s*(millones|millon|palos|palo|lucas|luca|mil|k|m)?(?![a-z0-9])/;

function parsearNumero(token: string): number | null {
  const s = token.replace(/[\s']/g, "").replace(/[.,]+$/, "");
  if (!s) return null;
  const puntos = (s.match(/\./g) ?? []).length;
  const comas = (s.match(/,/g) ?? []).length;
  let limpio: string;
  if (puntos && comas) {
    // El último separador es el decimal: "45.900,50" (es-CO) o "45,900.50" (en-US).
    const decimal = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    const miles = decimal === "." ? "," : ".";
    limpio = s.split(miles).join("").replace(decimal, ".");
  } else if (!puntos && !comas) {
    limpio = s;
  } else {
    const sep = puntos ? "." : ",";
    const partes = s.split(sep);
    // Varios separadores o grupo de 3 cifras → miles ("45.900", "1.500.000"); si no, decimal ("1,5").
    limpio = partes.length > 2 || partes[1].length === 3 ? partes.join("") : partes.join(".");
  }
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

function montoValido(n: number | null): number | null {
  if (n === null || !Number.isFinite(n) || n <= 0 || n >= 1e12) return null;
  return Math.round(n * 100) / 100;
}

/** Primer monto del texto con su posición (para poder quitarlo de una frase). */
export function encontrarMonto(texto: string): { valor: number; inicio: number; fin: number } | null {
  const fuente = plano(texto.replace(/ /g, " "));
  const m = RE_MONTO.exec(fuente);
  if (!m) return null;
  // "-5": un monto negativo no es válido (el tipo de movimiento da el signo).
  if (/-\s*\$?\s*$/.test(fuente.slice(0, m.index))) return null;
  const base = parsearNumero(m[1]);
  if (base === null) return null;
  const valor = montoValido(base * (m[2] ? MULTIPLICADOR[m[2]] : 1));
  if (valor === null) return null;
  return { valor, inicio: m.index, fin: m.index + m[0].length };
}

/**
 * Normaliza un monto escrito de cualquier forma: "$ 45.900,00", "45,900.00", "45900", "45k",
 * "45 mil", "1,5 millones", "25 lucas". Devuelve pesos con máximo 2 decimales o null.
 */
export function normalizarMonto(entrada: unknown): number | null {
  if (typeof entrada === "number") return montoValido(entrada);
  if (typeof entrada !== "string") return null;
  return encontrarMonto(entrada)?.valor ?? null;
}

/** "45900" → "45.900" (para prellenar en el iPhone). */
export function montoATexto(monto: number | null): string {
  if (monto === null) return "";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(monto);
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

/** "EXITO CHAPINERO" → "Exito Chapinero"; si ya trae minúsculas se respeta. */
export function nombreBonito(texto: string): string {
  const t = texto.trim().replace(/\s+/g, " ");
  if (/\p{Ll}/u.test(t)) return t;
  return t
    .split(" ")
    .map((p) => (/[.\d]/.test(p) ? p : p.charAt(0) + p.slice(1).toLowerCase()))
    .join(" ");
}

function capitalizar(texto: string): string {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

// Saldos y cupos disponibles: nunca se guardan ni se confunden con el monto del movimiento.
const RE_SALDO =
  /\b(?:saldos?(?:\s+(?:disponibles?|actual(?:es)?|total(?:es)?|en\s+(?:tu|su)\s+cuenta))?|disponible|cupo(?:\s+disponible)?)\b\s*(?:es|de|:|=)?\s*(?:de\s+)?(?:cop\s*)?\$?\s*\d[\d.,']*/gi;

/** Quita saldos y enmascara secuencias largas de dígitos (cuentas, documentos). Máx. 500 caracteres. */
export function enmascararTexto(texto: string): string {
  return texto
    .replace(/\s+/g, " ")
    .trim()
    .replace(RE_SALDO, "saldo [omitido]")
    .replace(/\d{6,}/g, (d) => `••••${d.slice(-4)}`)
    .slice(0, 500);
}

// ---------------------------------------------------------------------------
// SMS
// ---------------------------------------------------------------------------

export type InterpretacionSMS = {
  accion: "preguntar" | "ignorar";
  motivo: string | null;
  operacion: OperacionSMS | null;
  tipo: TipoAtajo | null;
  medio: "credito" | "debito" | null;
  monto: number | null;
  comercio: string | null;
  descripcion: string | null;
  ultimos4: string | null;
  textoEnmascarado: string;
};

// Orden importa: la primera que coincide gana.
const OPERACIONES: [OperacionSMS, RegExp][] = [
  [
    "transferencia_recibida",
    /\b(recibiste|has recibido|te (?:transfirieron|enviaron|consignaron|abonaron|pagaron|depositaron)|transferencia recibida|recibio (?:una )?transferencia|consignacion (?:recibida|en tu|a tu)|abono (?:a|en) tu cuenta)\b/,
  ],
  ["retiro", /\b(retiraste|has retirado|retiro (?:en|de|por|aprobado|exitoso|realizado))\b/],
  [
    "transferencia_enviada",
    /\b(transferiste|enviaste|has transferido|transferencia (?:exitosa|realizada|enviada|aprobada|por|de \$|a )|envio de dinero|pasaste plata)/,
  ],
  [
    "compra",
    /\b(compraste|has comprado|compra (?:aprobada|exitosa|realizada|por|de|en|con)|realizaste una compra|transaccion (?:aprobada|exitosa|por|de)|cargo (?:por|de)|debito (?:por|de|automatico))\b/,
  ],
  ["pago", /\b(pagaste|has pagado|pago (?:exitoso|aprobado|realizado|de|por|a|en|con)|pago pse)\b/],
];

const RE_CODIGO = /\b(clave|codigo|otp|token|contrasena|verificacion|no (?:lo )?compartas)\b/;
const RE_PUBLICIDAD = /\b(oferta|promocion|descuento|aprovecha|participa|preaprobad[oa]|gana|sorteo)\b/;
const RE_CREDITO = /(t\.?\s?cred|tarj(?:eta)?\.?\s+(?:de\s+)?cred|\btc\b|\bt\.c\.|\bcredito\b)/;
const RE_DEBITO =
  /(t\.?\s?deb|tarj(?:eta)?\.?\s+(?:de\s+)?deb|\bdebito\b|\bcuenta\b|\bcta\b|\bahorros\b|\bcorriente\b|\bnequi\b|\bdaviplata\b)/;
const RE_ULTIMOS4 =
  /(?:\*{1,4}|\bx{2,4}|\b(?:terminad[ao]|finalizad[ao])\s+en\s+|\b(?:no\.?|nro\.?|num\.?|numero)\s*\*?)(\d{4})(?!\d)/i;
// Monto del movimiento: precedido de $, COP, "por" o "valor".
const RE_MONTO_SMS =
  /(?:\$|\bcop\b|\bpor(?:\s+(?:un\s+)?valor\s+de)?|\bvalor(?:\s+de)?)\s*:?\s*\$?\s*(\d[\d.,']*\d|\d)/gi;
// Fin de un nombre (comercio / persona) dentro del SMS.
const FIN_NOMBRE = String.raw`(?=\s+(?:con|desde|el\s+\d|el\s+dia|hoy|a\s+las|por|usando|en\s+tu|a\s+tu|via|mediante)\b|\s+\d{1,2}[/-]\d{1,2}|[.;,](?:\s|$)|\s*$)`;

function montoSMS(texto: string): { valor: number; fin: number } | null {
  const candidatos = [...texto.matchAll(RE_MONTO_SMS)];
  // Preferir los que llevan "$" o "COP".
  candidatos.sort((a, b) => Number(/\$|cop/i.test(b[0])) - Number(/\$|cop/i.test(a[0])));
  for (const c of candidatos) {
    const valor = montoValido(parsearNumero(c[1]));
    if (valor !== null) return { valor, fin: (c.index ?? 0) + c[0].length };
  }
  return null;
}

function nombreTras(texto: string, preposicion: string, desde: number): string | null {
  const re = new RegExp(String.raw`\b(?:${preposicion})\s+(.+?)${FIN_NOMBRE}`, "i");
  const buscar = (t: string) => {
    const m = re.exec(t);
    if (!m) return null;
    const nombre = m[1]
      .replace(/\s*(?:\*|x{2,})\d{2,4}\b.*$/i, "")
      .replace(/^(?:la|el)\s+/i, "")
      .trim();
    if (!nombre || /^(?:tu|su|la cuenta|cuenta|tarjeta|\*|\d)/i.test(nombre) || nombre.length > 60) return null;
    return nombreBonito(nombre.slice(0, 40));
  };
  return buscar(texto.slice(desde)) ?? buscar(texto);
}

/** Interpreta el SMS de un banco: qué pasó, cuánto, dónde y con qué tarjeta/cuenta. */
export function interpretarSMS(texto: string): InterpretacionSMS {
  const limpio = texto.replace(/ /g, " ").replace(/\s+/g, " ").trim();
  const sinSaldo = limpio.replace(RE_SALDO, "saldo [omitido]");
  const b = plano(sinSaldo);
  const base: InterpretacionSMS = {
    accion: "ignorar",
    motivo: null,
    operacion: null,
    tipo: null,
    medio: null,
    monto: null,
    comercio: null,
    descripcion: null,
    ultimos4: null,
    textoEnmascarado: enmascararTexto(limpio),
  };

  const operacion = OPERACIONES.find(([, re]) => re.test(b))?.[0] ?? null;
  const monto = montoSMS(sinSaldo);

  if (!monto && RE_CODIGO.test(b)) return { ...base, motivo: "Código o clave" };
  if (!monto && RE_PUBLICIDAD.test(b)) return { ...base, motivo: "Publicidad" };
  if (!operacion) return { ...base, motivo: "No parece un movimiento" };

  const medio = RE_CREDITO.test(b) ? "credito" : RE_DEBITO.test(b) ? "debito" : null;
  const ultimos4 = RE_ULTIMOS4.exec(sinSaldo)?.[1] ?? null;
  const desde = monto?.fin ?? 0;

  let tipo: TipoAtajo;
  let comercio: string | null = null;
  let descripcion: string | null;
  switch (operacion) {
    case "transferencia_recibida":
      tipo = "ingreso";
      comercio = nombreTras(sinSaldo, "de", desde);
      descripcion = comercio ? `Transferencia de ${comercio}` : "Transferencia recibida";
      break;
    case "retiro":
      tipo = "transferencia";
      descripcion = "Retiro en cajero";
      break;
    case "transferencia_enviada":
      tipo = "gasto";
      comercio = nombreTras(sinSaldo, "a", desde);
      descripcion = comercio ? `Transferencia a ${comercio}` : "Transferencia";
      break;
    default:
      tipo = "gasto";
      comercio = nombreTras(sinSaldo, "en|a", desde);
      descripcion = comercio;
  }

  return {
    ...base,
    accion: "preguntar",
    operacion,
    tipo,
    medio,
    monto: monto?.valor ?? null,
    comercio,
    descripcion,
    ultimos4,
  };
}

// ---------------------------------------------------------------------------
// Dictado ("Gasté 25 mil en almuerzo con Nequi")
// ---------------------------------------------------------------------------

export type InterpretacionDictado = {
  tipo: "gasto" | "ingreso";
  monto: number | null;
  descripcion: string | null;
  /** Lo que se dijo después de "con / desde" (o "en / a" en ingresos): nombre de la cuenta. */
  origenTexto: string | null;
};

const RE_INGRESO =
  /\b(recibi|me (?:pagaron|consignaron|transfirieron|abonaron|depositaron|llego|llegaron|entro|entraron)|ingreso|ingresaron|cobre|vendi)\b/;
// Sin \b al final: en JavaScript \b no reconoce letras con tilde ("gasté").
const RE_VERBO =
  /^\s*(?:hoy\s+)?(?:me\s+)?(?:gast[eéo]|pagu[eé]|compr[eé]|pag[oó]|gasto|pago|compra|recib[ií]|(?:pagaron|consignaron|transfirieron|abonaron|depositaron|lleg[oó]|llegaron|entr[oó]|entraron)|ingres[oó]|ingresaron|ingreso|cobr[eé]|vend[ií])(?![\p{L}\d])/iu;
const RE_ARTICULOS = /^\s*(?:en|de|del|por|para|un|una|unos|unas|el|la|los|las|al)\s+/i;

export function interpretarDictado(texto: string): InterpretacionDictado {
  // NFC: las posiciones del monto se calculan sobre el texto sin tildes y deben coincidir.
  const t = texto.normalize("NFC").replace(/ /g, " ").replace(/\s+/g, " ").trim();
  const tipo = RE_INGRESO.test(plano(t)) ? "ingreso" : "gasto";

  // 1) Monto (y su "$" / "pesos").
  let resto = t;
  const monto = encontrarMonto(t);
  if (monto) {
    resto = `${t.slice(0, monto.inicio).replace(/\$\s*$/, "")} ${t.slice(monto.fin).replace(/^\s*(?:pesos|cop)\b/i, "")}`;
  }
  resto = resto.replace(/\s+/g, " ").replace(RE_VERBO, "").trim();

  // 2) Origen: la última mención "con / desde / usando …" (en ingresos, "en / a …").
  const marcador =
    tipo === "ingreso"
      ? String.raw`(?:en|a|al)\s+(?:(?:la|el|mi|mis)\s+)?(?:cuenta\s+(?:de\s+)?)?`
      : String.raw`(?:con|desde|usando)\s+(?:(?:la|el|mi|mis)\s+)?(?:(?:tarjeta|cuenta|billetera)\s+(?:de\s+)?)?`;
  const corte = tipo === "ingreso" ? String.raw`(?:de|por|para)` : String.raw`(?:en|para|por|de)`;
  const reOrigen = new RegExp(String.raw`(?:^|\s)${marcador}(.+?)(?=\s+${corte}\s|[.,;]|$)`, "gi");
  const menciones = [...resto.matchAll(reOrigen)];
  let origenTexto: string | null = null;
  const ultima = menciones.at(-1);
  if (ultima) {
    origenTexto = claveTexto(ultima[1].replace(/[.,;!?]+$/, ""));
    const i = ultima.index ?? 0;
    resto = `${resto.slice(0, i)} ${resto.slice(i + ultima[0].length)}`;
  }

  // 3) Descripción: lo que queda, sin preposiciones ni artículos iniciales.
  let descripcion = resto
    .replace(/\s+/g, " ")
    .replace(/[.,;!?]+$/, "")
    .trim();
  while (RE_ARTICULOS.test(descripcion)) descripcion = descripcion.replace(RE_ARTICULOS, "");
  descripcion = capitalizar(descripcion.trim()).slice(0, 200);

  return { tipo, monto: monto?.valor ?? null, descripcion: descripcion || null, origenTexto };
}
