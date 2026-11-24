import {
  type AliasAtajo,
  aliasATexto,
  type CategoriaAtajo,
  diccionarioCategorias,
  diccionarioOrigenes,
  empaquetarClave,
  type OrigenAtajo,
  type SugerenciaCategoria,
  textoDuplicado,
  valorOrigen,
} from "@/lib/domain/atajos";
import { interpretarDictado, interpretarSMS, montoATexto, normalizarMonto } from "@/lib/domain/interpretar";
import { clienteAtajos, leerJson, responder, respuestaDeError, SIN_TOKEN, tokenDe } from "@/lib/atajos";
import { contextoAtajoSchema } from "@/lib/validaciones";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";

type ContextoSQL = {
  accion: "preguntar" | "ignorar";
  hoy: string;
  origen_sugerido: string | null;
  origen_razon: "alias" | "ultimos4" | "nombre" | "reciente" | null;
  categoria_sugerida: SugerenciaCategoria;
  posible_duplicado: { hace_min: number; descripcion: string | null; origen: string; monto: number } | null;
  origenes: OrigenAtajo[];
  categorias_gasto: CategoriaAtajo[];
  categorias_ingreso: CategoriaAtajo[];
  clave: string;
};

/** Orígenes que se reconocieron por algo concreto (no solo "el último usado"). */
const RAZONES_FIRMES = new Set(["alias", "ultimos4", "nombre"]);

/**
 * POST /api/atajos/v1/contexto — primera llamada del atajo, antes de preguntar.
 * Interpreta el SMS, el dictado o los datos de Wallet y devuelve lo que el atajo necesita:
 * monto y descripción para prellenar, orígenes y categorías ("etiqueta → valor", sugerido primero),
 * posible duplicado y la `clave` para /registrar (lleva empaquetados fuente, tipo, comercio y alias).
 * Con `modo: "automatico"` y un origen reconocido, responde `accion: "registrar_directo"`.
 */
export async function POST(request: Request) {
  const token = tokenDe(request);
  if (!token) return SIN_TOKEN();

  const leido = contextoAtajoSchema.safeParse(await leerJson(request));
  const entrada = leido.success ? leido.data : contextoAtajoSchema.parse({});

  let tipo = entrada.tipo;
  let monto: number | null = null;
  let comercio: string | null = null;
  let descripcion: string | null = null;
  let motivo: string | null = null;
  const alias: AliasAtajo[] = [];
  const datos: Record<string, unknown> = { fuente: entrada.fuente };

  if (entrada.fuente === "sms" && entrada.texto) {
    const sms = interpretarSMS(entrada.texto);
    Object.assign(datos, {
      accion: sms.accion,
      medio: sms.medio,
      ultimos4: sms.ultimos4,
      texto_enmascarado: sms.textoEnmascarado,
    });
    motivo = sms.motivo;
    tipo ??= sms.tipo ?? undefined;
    monto = sms.monto;
    comercio = sms.comercio;
    descripcion = sms.descripcion;
    if (sms.ultimos4) alias.push({ tipo: "sms_ultimos4", valor: sms.ultimos4 });
  } else if (entrada.fuente === "dictado" && entrada.texto) {
    const d = interpretarDictado(entrada.texto);
    tipo ??= d.tipo;
    monto = d.monto;
    descripcion = d.descripcion;
    if (d.origenTexto) {
      datos.texto_origen = d.origenTexto;
      alias.push({ tipo: "nombre_dictado", valor: d.origenTexto });
    }
  } else if (entrada.fuente === "wallet") {
    monto = normalizarMonto(entrada.wallet?.monto ?? entrada.monto);
    comercio = entrada.wallet?.comercio ?? entrada.comercio ?? null;
    descripcion = comercio;
    const tarjeta = entrada.wallet?.tarjeta ?? entrada.tarjeta;
    if (tarjeta) {
      datos.tarjeta_wallet = tarjeta;
      alias.push({ tipo: "wallet_tarjeta", valor: tarjeta });
    }
  } else {
    monto = normalizarMonto(entrada.monto);
  }
  const tipoFinal = tipo ?? "gasto";
  Object.assign(datos, { tipo: tipoFinal, monto: monto === null ? null : String(monto), comercio });

  const { data, error } = await clienteAtajos().rpc("atajo_contexto", { p_token: token, p_datos: datos as Json });
  if (error) return respuestaDeError(error);
  const c = data as unknown as ContextoSQL;

  if (c.accion === "ignorar") return responder({ ok: true, accion: "ignorar", motivo });

  const origenes = diccionarioOrigenes(c.origenes, tipoFinal);
  const sugerido = c.origenes.find((o) => o.sugerido && (tipoFinal === "gasto" || !o.tarjeta));
  const valorSugerido = sugerido ? valorOrigen(sugerido) : null;
  const etiquetaSugerida = valorSugerido
    ? (origenes.lista.find((e) => origenes.mapa[e] === valorSugerido) ?? null)
    : null;
  const pedirCategoria = tipoFinal !== "transferencia";
  const categorias = diccionarioCategorias(
    tipoFinal === "ingreso" ? c.categorias_ingreso : c.categorias_gasto,
    pedirCategoria ? c.categoria_sugerida : null,
  );
  const directo =
    entrada.modo === "automatico" &&
    monto !== null &&
    valorSugerido !== null &&
    RAZONES_FIRMES.has(c.origen_razon ?? "") &&
    !c.posible_duplicado;

  return responder({
    ok: true,
    accion: directo ? "registrar_directo" : "preguntar",
    fuente: entrada.fuente,
    tipo: tipoFinal,
    hoy: c.hoy,
    monto,
    monto_texto: montoATexto(monto),
    descripcion: descripcion ?? "",
    comercio: comercio ?? "",
    origen_sugerido: etiquetaSugerida,
    origen_sugerido_valor: valorSugerido ?? "",
    origenes: origenes.mapa,
    origenes_lista: origenes.lista,
    // Texto y no booleano: en Atajos es más confiable comparar "si" que un booleano de JSON.
    pedir_categoria: pedirCategoria ? "si" : "no",
    categoria_sugerida: pedirCategoria ? (c.categoria_sugerida?.nombre ?? null) : null,
    categorias: pedirCategoria ? categorias.mapa : {},
    categorias_lista: pedirCategoria ? categorias.lista : [],
    duplicado: c.posible_duplicado ? textoDuplicado(c.posible_duplicado) : null,
    alias,
    alias_texto: aliasATexto(alias),
    clave: empaquetarClave(c.clave, {
      fuente: entrada.fuente,
      tipo: tipoFinal,
      comercio: comercio ?? undefined,
      alias: aliasATexto(alias),
    }),
  });
}
