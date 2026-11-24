import { aliasDeTexto, desempaquetarClave, mensajeRegistro, type ResumenRegistro } from "@/lib/domain/atajos";
import { normalizarMonto } from "@/lib/domain/interpretar";
import { clienteAtajos, fallo, leerJson, responder, respuestaDeError, SIN_TOKEN, tokenDe } from "@/lib/atajos";
import { FUENTES_ATAJO, registrarAtajoSchema, TIPOS_ATAJO } from "@/lib/validaciones";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";

const esFuente = (v: unknown): v is (typeof FUENTES_ATAJO)[number] =>
  typeof v === "string" && (FUENTES_ATAJO as readonly string[]).includes(v);
const esTipo = (v: unknown): v is (typeof TIPOS_ATAJO)[number] =>
  typeof v === "string" && (TIPOS_ATAJO as readonly string[]).includes(v);

/**
 * POST /api/atajos/v1/registrar — crea el gasto, ingreso o retiro (cuenta) o la compra (tarjeta de
 * crédito) con fecha de hoy. Mínimo: `clave` (de /contexto), `origen`, `monto`; lo demás es opcional
 * (fuente, tipo, comercio y alias vienen empaquetados en la clave). Idempotente por clave.
 * Respuestas: 201 creado · 200 repetido · 400 datos inválidos · 401 token · 422 regla de negocio
 * · 429 frecuencia. Siempre trae `mensaje`, listo para "Mostrar notificación".
 */
export async function POST(request: Request) {
  const token = tokenDe(request);
  if (!token) return SIN_TOKEN();

  const leido = registrarAtajoSchema.safeParse(await leerJson(request));
  if (!leido.success) return fallo(leido.error.issues[0]?.message ?? "Datos inválidos", 400);
  const e = leido.data;
  const monto = normalizarMonto(e.monto);
  if (monto === null) return fallo("El monto no es válido", 400);

  const { clave, paquete } = e.clave ? desempaquetarClave(e.clave) : { clave: undefined, paquete: {} };
  const alias = typeof e.alias === "string" ? aliasDeTexto(e.alias) : (e.alias ?? aliasDeTexto(paquete.alias));

  const datos = {
    clave,
    fuente: e.fuente ?? (esFuente(paquete.fuente) ? paquete.fuente : "rapido"),
    tipo: e.tipo ?? (esTipo(paquete.tipo) ? paquete.tipo : "gasto"),
    origen: e.origen,
    destino: e.destino,
    monto: String(monto),
    descripcion: e.descripcion,
    comercio: e.comercio ?? paquete.comercio,
    categoria: e.categoria ?? "auto",
    cuotas: e.cuotas,
    revisar: e.revisar,
    alias,
  };

  const { data, error } = await clienteAtajos().rpc("atajo_registrar", { p_token: token, p_datos: datos as Json });
  if (error) return respuestaDeError(error);
  const r = data as unknown as ResumenRegistro;

  return responder({ ...r, mensaje: mensajeRegistro(r) }, !r.ok ? 422 : r.repetido ? 200 : 201);
}
