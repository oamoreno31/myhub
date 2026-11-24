import {
  type CategoriaAtajo,
  diccionarioCategorias,
  diccionarioOrigenes,
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
  categoria_sugerida: SugerenciaCategoria;
  posible_duplicado: { hace_min: number; descripcion: string | null; origen: string; monto: number } | null;
  origenes: OrigenAtajo[];
  categorias_gasto: CategoriaAtajo[];
  categorias_ingreso: CategoriaAtajo[];
  clave: string;
};

type Alias = { tipo: "wallet_tarjeta" | "sms_ultimos4" | "nombre_dictado"; valor: string };

/**
 * POST /api/atajos/v1/contexto — primera llamada del atajo, antes de preguntar.
 * Interpreta el SMS, el dictado o los datos de Wallet y devuelve lo que el atajo necesita:
 * monto y descripción para prellenar, orígenes y categorías ("etiqueta → valor", sugerido primero),
 * posible duplicado, alias a aprender y la clave de idempotencia para /registrar.
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
  const alias: Alias[] = [];
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
    comercio = entrada.wallet?.comercio ?? null;
    descripcion = comercio;
    if (entrada.wallet?.tarjeta) {
      datos.tarjeta_wallet = entrada.wallet.tarjeta;
      alias.push({ tipo: "wallet_tarjeta", valor: entrada.wallet.tarjeta });
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
  const sugerido = c.origenes.find((o) => o.sugerido);
  const etiquetaSugerida = sugerido
    ? (origenes.lista.find((e) => origenes.mapa[e] === valorOrigen(sugerido)) ?? null)
    : null;
  const pedirCategoria = tipoFinal !== "transferencia";
  const categorias = diccionarioCategorias(
    tipoFinal === "ingreso" ? c.categorias_ingreso : c.categorias_gasto,
    pedirCategoria ? c.categoria_sugerida : null,
  );

  return responder({
    ok: true,
    accion: "preguntar",
    fuente: entrada.fuente,
    tipo: tipoFinal,
    hoy: c.hoy,
    monto,
    monto_texto: montoATexto(monto),
    descripcion: descripcion ?? "",
    comercio: comercio ?? "",
    origen_sugerido: etiquetaSugerida,
    origenes: origenes.mapa,
    origenes_lista: origenes.lista,
    pedir_categoria: pedirCategoria,
    categoria_sugerida: pedirCategoria ? (c.categoria_sugerida?.nombre ?? null) : null,
    categorias: pedirCategoria ? categorias.mapa : {},
    categorias_lista: pedirCategoria ? categorias.lista : [],
    duplicado: c.posible_duplicado ? textoDuplicado(c.posible_duplicado) : null,
    alias,
    clave: c.clave,
  });
}
