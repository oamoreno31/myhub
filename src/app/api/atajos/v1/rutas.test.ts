/**
 * Rutas /api/atajos/v1/* con Supabase simulado: lo que manda el iPhone, lo que llega a las
 * funciones SQL y lo que vuelve al atajo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ejemplo.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_prueba";
  return { rpc: vi.fn() };
});
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));

import { desempaquetarClave } from "@/lib/domain/atajos";
import { POST as contexto } from "./contexto/route";
import { POST as registrar } from "./registrar/route";

const TOKEN = `pc_${"a".repeat(64)}`;
const VISA = "11111111-1111-4111-8111-111111111111";
const NEQUI = "22222222-2222-4222-8222-222222222222";
const UUID = "33333333-3333-4333-8333-333333333333";

function peticion(cuerpo: unknown, { token = TOKEN, tipo = "application/json" } = {}) {
  return new Request("https://app.test/api/atajos/v1/x", {
    method: "POST",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": tipo },
    body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
  });
}

const contextoSQL = (extra: Record<string, unknown> = {}) => ({
  accion: "preguntar",
  hoy: "2026-11-24",
  origen_sugerido: VISA,
  origen_razon: "ultimos4",
  categoria_sugerida: { id: UUID, nombre: "Mercado", confiable: true },
  posible_duplicado: null,
  origenes: [
    { id: VISA, nombre: "Visa", tipo: "tarjeta_credito", tarjeta: true, ultimos4: "1234", sugerido: true },
    { id: NEQUI, nombre: "Nequi", tipo: "billetera", tarjeta: false, ultimos4: null, sugerido: false },
  ],
  categorias_gasto: [{ id: UUID, nombre: "Mercado", padre: "Otros gastos" }],
  categorias_ingreso: [],
  clave: "44444444-4444-4444-8444-444444444444",
  ...extra,
});

beforeEach(() => rpc.mockReset());

describe("POST /contexto", () => {
  it("sin token → 401 con mensaje", async () => {
    const r = await contexto(peticion({}, { token: "" }));
    expect(r.status).toBe(401);
    expect((await r.json()).mensaje).toMatch(/Falta el token/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("SMS: interpreta, consulta SQL y devuelve todo listo para el atajo", async () => {
    rpc.mockResolvedValue({ data: contextoSQL(), error: null });
    const r = await contexto(
      peticion({
        fuente: "sms",
        texto: "Compraste $45.900,00 en EXITO CHAPINERO con tu T.Cred *1234. Saldo disponible $2.000.000",
      }),
    );
    expect(r.status).toBe(200);
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe("atajo_contexto");
    expect(args.p_token).toBe(TOKEN);
    expect(args.p_datos).toMatchObject({
      fuente: "sms",
      accion: "preguntar",
      tipo: "gasto",
      monto: "45900",
      comercio: "Exito Chapinero",
      ultimos4: "1234",
      medio: "credito",
    });
    expect(args.p_datos.texto_enmascarado).not.toContain("2.000.000");

    const c = await r.json();
    expect(c).toMatchObject({
      ok: true,
      accion: "preguntar",
      monto: 45900,
      monto_texto: "45.900",
      descripcion: "Exito Chapinero",
      origen_sugerido: "💳 Visa ·1234",
      origen_sugerido_valor: `t:${VISA}`,
      origenes_lista: ["💳 Visa ·1234", "📱 Nequi"],
      categoria_sugerida: "Mercado",
      pedir_categoria: "si",
      categorias_lista: ["✨ Mercado (sugerida)", "📥 Clasificar después"],
      alias_texto: "sms_ultimos4:1234",
      duplicado: null,
    });
    expect(c.origenes["📱 Nequi"]).toBe(`c:${NEQUI}`);
    expect(desempaquetarClave(c.clave)).toEqual({
      clave: "44444444-4444-4444-8444-444444444444",
      paquete: { fuente: "sms", tipo: "gasto", comercio: "Exito Chapinero", alias: "sms_ultimos4:1234" },
    });
  });

  it("SMS que no es movimiento → ignorar con motivo", async () => {
    rpc.mockResolvedValue({ data: { accion: "ignorar" }, error: null });
    const r = await contexto(peticion({ fuente: "sms", texto: "Tu clave dinámica es 482913. No la compartas." }));
    expect(await r.json()).toEqual({ ok: true, accion: "ignorar", motivo: "Código o clave" });
    expect(rpc.mock.calls[0][1].p_datos.accion).toBe("ignorar");
  });

  it("Wallet con campos planos y modo automático → registrar_directo si la tarjeta es conocida", async () => {
    rpc.mockResolvedValue({ data: contextoSQL({ origen_razon: "alias" }), error: null });
    const r = await contexto(
      peticion({
        fuente: "wallet",
        tarjeta: "Visa Bancolombia",
        comercio: "Éxito",
        monto: "45.900,00 $",
        modo: "Automático",
      }),
    );
    const c = await r.json();
    expect(c).toMatchObject({ accion: "registrar_directo", monto: 45900, origen_sugerido_valor: `t:${VISA}` });
    expect(rpc.mock.calls[0][1].p_datos).toMatchObject({ tarjeta_wallet: "Visa Bancolombia", comercio: "Éxito" });

    rpc.mockResolvedValue({ data: contextoSQL({ origen_razon: "reciente" }), error: null });
    const c2 = await (await contexto(peticion({ fuente: "wallet", monto: "1000", modo: "automatico" }))).json();
    expect(c2.accion).toBe("preguntar");
  });

  it("acepta cuerpo de formulario y JSON sin Content-Type", async () => {
    rpc.mockResolvedValue({ data: contextoSQL(), error: null });
    await contexto(
      peticion("fuente=dictado&texto=Gast%C3%A9+25+mil+en+almuerzo+con+Nequi", {
        tipo: "application/x-www-form-urlencoded",
      }),
    );
    expect(rpc.mock.calls[0][1].p_datos).toMatchObject({ fuente: "dictado", monto: "25000", texto_origen: "nequi" });

    await contexto(peticion({ fuente: "rapido", monto: 9000 }, { tipo: "application/octet-stream" }));
    expect(rpc.mock.calls[1][1].p_datos).toMatchObject({ fuente: "rapido", monto: "9000" });
  });

  it("errores de token de la BD → su código HTTP", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PT401", message: "Token inválido o revocado" } });
    const r = await contexto(peticion({}));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ ok: false, mensaje: "⚠️ Token inválido o revocado" });
  });
});

describe("POST /registrar", () => {
  const clave = `44444444-4444-4444-8444-444444444444.${Buffer.from(
    JSON.stringify({ fuente: "sms", tipo: "gasto", comercio: "Exito Chapinero", alias: "sms_ultimos4:1234" }),
  ).toString("base64url")}`;

  it("con lo mínimo (clave, origen, monto) recupera lo empaquetado y responde el mensaje", async () => {
    rpc.mockResolvedValue({
      data: {
        ok: true,
        repetido: false,
        id: UUID,
        registro: "compra_tc",
        tipo: "gasto",
        monto: 45900,
        origen: "Visa",
        ultimos4: "1234",
        categoria: "Mercado",
        cuotas: 3,
        por_revisar: false,
      },
      error: null,
    });
    const r = await registrar(
      peticion({ clave, origen: `t:${VISA}`, monto: "45.900", descripcion: "Éxito", cuotas: "3" }),
    );
    expect(r.status).toBe(201);
    expect(rpc.mock.calls[0][1].p_datos).toMatchObject({
      clave: "44444444-4444-4444-8444-444444444444",
      fuente: "sms",
      tipo: "gasto",
      origen: VISA,
      monto: "45900",
      descripcion: "Éxito",
      comercio: "Exito Chapinero",
      categoria: "auto",
      cuotas: 3,
      revisar: false,
      alias: [{ tipo: "sms_ultimos4", valor: "1234" }],
    });
    expect((await r.json()).mensaje).toBe("✓ Compra de $ 45.900 · Visa ·1234 · Mercado · 3 cuotas");
  });

  it("los campos explícitos ganan a lo empaquetado; cuotas vacías no cuentan", async () => {
    rpc.mockResolvedValue({
      data: {
        ok: true,
        repetido: true,
        registro: "movimiento",
        tipo: "ingreso",
        monto: 1000,
        origen: "Nequi",
        categoria: "Sueldo",
      },
      error: null,
    });
    const r = await registrar(
      peticion({
        clave,
        origen: NEQUI,
        monto: 1000,
        tipo: "ingreso",
        fuente: "rapido",
        cuotas: "",
        revisar: "true",
        alias: "",
      }),
    );
    expect(r.status).toBe(200);
    const d = rpc.mock.calls[0][1].p_datos;
    expect(d).toMatchObject({ fuente: "rapido", tipo: "ingreso", revisar: true, alias: [] });
    expect(d.cuotas).toBeUndefined();
  });

  it("monto u origen inválidos → 400; regla de negocio → 422", async () => {
    expect((await registrar(peticion({ clave, origen: NEQUI, monto: "abc" }))).status).toBe(400);
    const sinOrigen = await registrar(peticion({ clave, monto: "1000" }));
    expect(sinOrigen.status).toBe(400);
    expect((await sinOrigen.json()).mensaje).toBe("⚠️ Elige el origen del pago");

    rpc.mockResolvedValue({
      data: { ok: false, mensaje: "Un ingreso no puede llegar a una tarjeta de crédito" },
      error: null,
    });
    const r = await registrar(peticion({ clave, origen: VISA, monto: "1000", tipo: "ingreso" }));
    expect(r.status).toBe(422);
    expect((await r.json()).mensaje).toBe("⚠️ Un ingreso no puede llegar a una tarjeta de crédito");
  });
});
