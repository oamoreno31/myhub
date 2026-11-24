/**
 * Migración 0008 · Captura desde iPhone: tokens, atajo_contexto, atajo_registrar, alias,
 * bitácora técnica, límite de frecuencia y respaldo (docs/08-atajos-iphone.md).
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { hoyISO } from "@/lib/domain/obligaciones";
import { comoAnonimo, comoUsuario, crearBaseDePruebas, crearUsuario } from "./pg-supabase";

const OMAR = "00000000-0000-4000-8000-000000000001";
const OTRO = "00000000-0000-4000-8000-000000000002";

let db: PGlite;
const ids: Record<string, string> = {};
let token = "";
let tokenOtro = "";

type Resultado = {
  ok: boolean;
  mensaje?: string;
  id?: string;
  registro?: "movimiento" | "compra_tc";
  tipo?: string;
  monto?: number;
  fecha?: string;
  origen?: string;
  destino?: string | null;
  categoria?: string | null;
  por_revisar?: boolean;
  cuotas?: number | null;
  repetido?: boolean;
};

type Contexto = {
  accion: string;
  hoy: string;
  origen_sugerido: string | null;
  origen_razon: string | null;
  categoria_sugerida: { id: string; nombre: string; confiable: boolean } | null;
  posible_duplicado: { id: string; hace_min: number; descripcion: string; origen: string } | null;
  origenes: {
    id: string;
    nombre: string;
    tipo: string;
    tarjeta: boolean;
    ultimos4: string | null;
    sugerido: boolean;
  }[];
  categorias_gasto: { id: string; nombre: string; padre: string | null }[];
  categorias_ingreso: { id: string; nombre: string; padre: string | null }[];
  clave: string;
};

async function uno<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0];
}
const cat = async (nombre: string, tipo = "gasto") =>
  (
    await uno<{ id: string }>("select id from categorias where nombre = $1 and tipo = $2::tipo_categoria", [
      nombre,
      tipo,
    ])
  ).id;

async function registrar(datos: Record<string, unknown>, tk = token): Promise<Resultado> {
  await comoAnonimo(db);
  return (await uno<{ r: Resultado }>("select atajo_registrar($1, $2::jsonb) as r", [tk, JSON.stringify(datos)])).r;
}
async function contexto(datos: Record<string, unknown> = {}, tk = token): Promise<Contexto> {
  await comoAnonimo(db);
  return (await uno<{ r: Contexto }>("select atajo_contexto($1, $2::jsonb) as r", [tk, JSON.stringify(datos)])).r;
}
let n = 0;
const clave = () => `prueba-${(n++).toString().padStart(4, "0")}-clave`;

beforeAll(async () => {
  db = await crearBaseDePruebas();
  await crearUsuario(db, OMAR, "oamoreno31@gmail.com");
  await crearUsuario(db, OTRO, "otro@example.com");

  await comoUsuario(db, OTRO);
  ids.cuentaOtro = (
    await uno<{ id: string }>(
      "insert into cuentas (nombre, tipo, saldo_inicial) values ('Ajena', 'ahorros', 10) returning id",
    )
  ).id;
  ids.mercadoOtro = await cat("Mercado");
  tokenOtro = (await uno<{ r: { token: string } }>("select crear_token_api('iPhone otro') as r")).r.token;

  await comoUsuario(db, OMAR);
  ids.ahorros = (
    await uno<{ id: string }>(
      "insert into cuentas (nombre, tipo, saldo_inicial) values ('Ahorros Bancolombia', 'ahorros', 3000000) returning id",
    )
  ).id;
  ids.nequi = (
    await uno<{ id: string }>(
      "insert into cuentas (nombre, tipo, saldo_inicial) values ('Nequi', 'billetera', 0) returning id",
    )
  ).id;
  ids.efectivo = (await uno<{ id: string }>("select id from cuentas where tipo = 'efectivo'")).id;
  ids.tarjeta = (
    await uno<{ id: string }>("select crear_tarjeta('Visa', 'visa', '1234', 5000000, 15::smallint, 30::smallint) as id")
  ).id;
  ids.cuentaVisa = (
    await uno<{ id: string }>("select cuenta_id as id from tarjetas_credito where id = $1", [ids.tarjeta])
  ).id;
  ids.mercado = await cat("Mercado");
  ids.restaurantes = await cat("Restaurantes y domicilios");
  ids.sueldo = await cat("Sueldo / honorarios", "ingreso");
  token = (await uno<{ r: { token: string } }>("select crear_token_api('iPhone de Omar') as r")).r.token;
}, 60_000);

describe("tokens_api", () => {
  it("crea tokens con formato pc_ + 64 hex y guarda solo el hash", async () => {
    expect(token).toMatch(/^pc_[0-9a-f]{64}$/);
    await comoUsuario(db, OMAR);
    const fila = await uno<{ prefijo: string; nombre: string }>("select prefijo, nombre from tokens_api");
    expect(fila).toEqual({ prefijo: token.slice(0, 9), nombre: "iPhone de Omar" });
    await expect(db.query("select token_hash from tokens_api")).rejects.toThrow(/permission denied/);
    // Solo ve los suyos.
    expect((await db.query("select id from tokens_api")).rows).toHaveLength(1);
  });

  it("anon no lee tokens ni la bitácora, ni llama las funciones internas", async () => {
    await comoAnonimo(db);
    await expect(db.query("select id from tokens_api")).rejects.toThrow(/permission denied/);
    await expect(db.query("select id from capturas_atajo")).rejects.toThrow(/permission denied/);
    await expect(db.query("select _token_valido($1)", [token])).rejects.toThrow(/permission denied/);
    await expect(db.query("select crear_token_api('x')")).rejects.toThrow(/permission denied/);
  });

  it("rechaza tokens mal formados o inexistentes con PT401", async () => {
    await expect(contexto({}, "pc_123")).rejects.toMatchObject({ code: "PT401" });
    await expect(contexto({}, `pc_${"0".repeat(64)}`)).rejects.toMatchObject({ code: "PT401" });
  });

  it("máximo 5 tokens activos", async () => {
    await comoUsuario(db, OTRO);
    for (let i = 0; i < 4; i++) await db.query("select crear_token_api($1)", [`extra ${i}`]);
    await expect(db.query("select crear_token_api('sexto')")).rejects.toThrow(/5 tokens activos/);
  });
});

describe("atajo_contexto", () => {
  it("devuelve listas ordenadas, la fecha de hoy y una clave de idempotencia", async () => {
    const c = await contexto({ fuente: "rapido" });
    expect(c.accion).toBe("preguntar");
    expect(c.hoy).toBe(hoyISO());
    expect(c.clave).toMatch(/^[0-9a-f-]{36}$/);
    const nombres = c.origenes.map((o) => o.nombre);
    expect(nombres).toEqual(expect.arrayContaining(["Ahorros Bancolombia", "Nequi", "Efectivo", "Visa"]));
    expect(nombres).not.toContain("Ajena");
    expect(c.origenes.find((o) => o.nombre === "Visa")).toMatchObject({ tarjeta: true, ultimos4: "1234" });
    const gastos = c.categorias_gasto.map((x) => x.nombre);
    expect(gastos).toContain("Mercado");
    expect(gastos).not.toContain("Costos financieros TC");
    expect(gastos).not.toContain("Por clasificar");
    expect(c.categorias_ingreso.map((x) => x.nombre)).not.toContain("Recuperación de préstamos");
  });

  it("los SMS que no son movimientos se registran como ignorados y no devuelven datos", async () => {
    const c = await contexto({ fuente: "sms", accion: "ignorar", texto_enmascarado: "Tu clave es ••••" });
    expect(c).toEqual({ accion: "ignorar" });
    await comoUsuario(db, OMAR);
    const fila = await uno<{ resultado: string; texto_enmascarado: string }>(
      "select resultado, texto_enmascarado from capturas_atajo where fuente = 'sms' order by creado_en desc limit 1",
    );
    expect(fila).toEqual({ resultado: "ignorado", texto_enmascarado: "Tu clave es ••••" });
  });

  it("sugiere la tarjeta por los últimos 4 del SMS", async () => {
    const c = await contexto({ fuente: "sms", ultimos4: "1234", medio: "credito", monto: "45900" });
    expect(c.origen_sugerido).toBe(ids.cuentaVisa);
    expect(c.origen_razon).toBe("ultimos4");
    expect(c.origenes[0]).toMatchObject({ id: ids.cuentaVisa, sugerido: true });
  });

  it("sugiere la cuenta nombrada en el dictado", async () => {
    const c = await contexto({ fuente: "dictado", texto_origen: "nequi" });
    expect(c.origen_sugerido).toBe(ids.nequi);
    expect(c.origen_razon).toBe("nombre");
  });
});

describe("atajo_registrar", () => {
  it("registra un gasto de una cuenta con fecha de hoy y marca de origen", async () => {
    const k = clave();
    const r = await registrar({
      clave: k,
      fuente: "rapido",
      tipo: "gasto",
      origen: ids.nequi,
      monto: "25000",
      descripcion: "Almuerzo",
      categoria: ids.restaurantes,
    });
    expect(r).toMatchObject({
      ok: true,
      registro: "movimiento",
      tipo: "gasto",
      monto: 25000,
      fecha: hoyISO(),
      origen: "Nequi",
      categoria: "Restaurantes y domicilios",
      por_revisar: false,
      repetido: false,
    });
    await comoUsuario(db, OMAR);
    const m = await uno<{ origen_registro: string; clave_idempotencia: string; descripcion: string }>(
      "select origen_registro, clave_idempotencia, descripcion from movimientos where id = $1",
      [r.id],
    );
    expect(m).toEqual({ origen_registro: "atajo_rapido", clave_idempotencia: k, descripcion: "Almuerzo" });
    ids.almuerzo = r.id!;
    ids.claveAlmuerzo = k;
  });

  it("es idempotente: la misma clave devuelve lo ya registrado sin duplicar", async () => {
    const r = await registrar({
      clave: ids.claveAlmuerzo,
      fuente: "rapido",
      origen: ids.nequi,
      monto: "25000",
      categoria: ids.restaurantes,
    });
    expect(r).toMatchObject({ ok: true, repetido: true, id: ids.almuerzo });
    await comoUsuario(db, OMAR);
    const { c } = await uno<{ c: number }>("select count(*)::int as c from movimientos where clave_idempotencia = $1", [
      ids.claveAlmuerzo,
    ]);
    expect(c).toBe(1);
  });

  it("con origen tarjeta crea una compra_tc con cuotas; sin historial queda 'Por clasificar'", async () => {
    const r = await registrar({
      clave: clave(),
      fuente: "wallet",
      origen: ids.cuentaVisa,
      monto: "45900",
      comercio: "EXITO CHAPINERO",
      cuotas: 3,
      alias: [{ tipo: "wallet_tarjeta", valor: "Visa Bancolombia" }],
    });
    expect(r).toMatchObject({
      ok: true,
      registro: "compra_tc",
      origen: "Visa",
      ultimos4: "1234",
      cuotas: 3,
      categoria: "Por clasificar",
      por_revisar: true,
    });
    await comoUsuario(db, OMAR);
    const c = await uno<{ descripcion: string; comercio: string; num_cuotas: number; origen_registro: string }>(
      "select descripcion, comercio, num_cuotas, origen_registro from compras_tc where id = $1",
      [r.id],
    );
    expect(c).toEqual({
      descripcion: "EXITO CHAPINERO",
      comercio: "EXITO CHAPINERO",
      num_cuotas: 3,
      origen_registro: "atajo_wallet",
    });
    const pc = await uno<{ es_sistema: boolean; grupo: string }>(
      "select es_sistema, grupo from categorias where nombre = 'Por clasificar' and tipo = 'gasto'",
    );
    expect(pc).toEqual({ es_sistema: true, grupo: "Otros" });
  });

  it("aprende el alias de Wallet y detecta el posible duplicado del SMS", async () => {
    const c = await contexto({ fuente: "wallet", tarjeta_wallet: "VISA bancolombia", monto: "45900" });
    expect(c.origen_sugerido).toBe(ids.cuentaVisa);
    expect(c.origen_razon).toBe("alias");
    expect(c.posible_duplicado).toMatchObject({ hace_min: 0, origen: "Visa", descripcion: "EXITO CHAPINERO" });
    // Con otro monto no hay duplicado.
    expect(
      (await contexto({ fuente: "wallet", tarjeta_wallet: "Visa Bancolombia", monto: "45901" })).posible_duplicado,
    ).toBeNull();
  });

  it("sugiere la categoría por historial del comercio (confiable con 2+ usos)", async () => {
    await comoUsuario(db, OMAR);
    const gasto = `insert into movimientos (fecha, tipo, monto, cuenta_id, categoria_id, comercio)
                   values (current_date, 'gasto', $1, $2, $3, $4)`;
    await db.query(gasto, [80000, ids.ahorros, ids.mercado, "Éxito"]);
    await db.query(gasto, [60000, ids.ahorros, ids.mercado, "exito"]);
    await db.query(gasto, [30000, ids.ahorros, ids.restaurantes, "Rappi"]);

    const c = await contexto({ fuente: "sms", comercio: "EXITO CHAPINERO" });
    expect(c.categoria_sugerida).toMatchObject({ nombre: "Mercado", confiable: true });

    const confiable = await registrar({
      clave: clave(),
      fuente: "sms",
      origen: ids.ahorros,
      monto: "12000",
      comercio: "EXITO CHAPINERO",
    });
    expect(confiable).toMatchObject({ ok: true, categoria: "Mercado", por_revisar: false });

    // Un solo uso: se sugiere, pero queda por revisar.
    const dudosa = await registrar({
      clave: clave(),
      fuente: "sms",
      origen: ids.ahorros,
      monto: "15000",
      comercio: "RAPPI*COLOMBIA",
    });
    expect(dudosa).toMatchObject({ ok: true, categoria: "Por clasificar", por_revisar: true });
    const rappi = await registrar({
      clave: clave(),
      fuente: "sms",
      origen: ids.ahorros,
      monto: "15000",
      comercio: "Rappi Colombia",
    });
    expect(rappi).toMatchObject({ ok: true, categoria: "Restaurantes y domicilios", por_revisar: true });
  });

  it("'pendiente' y 'revisar' fuerzan la bandeja de revisión", async () => {
    const r = await registrar({
      clave: clave(),
      fuente: "wallet",
      origen: ids.ahorros,
      monto: "9000",
      descripcion: "Algo",
      categoria: "pendiente",
    });
    expect(r).toMatchObject({ ok: true, categoria: "Por clasificar", por_revisar: true });
    const forzada = await registrar({
      clave: clave(),
      fuente: "wallet",
      origen: ids.ahorros,
      monto: "9500",
      categoria: ids.mercado,
      revisar: true,
    });
    expect(forzada).toMatchObject({ ok: true, categoria: "Mercado", por_revisar: true });
  });

  it("registra ingresos y retiros (transferencia a Efectivo)", async () => {
    const ingreso = await registrar({
      clave: clave(),
      fuente: "sms",
      tipo: "ingreso",
      origen: ids.ahorros,
      monto: "5000000",
      descripcion: "Devtopia",
      categoria: ids.sueldo,
    });
    expect(ingreso).toMatchObject({ ok: true, tipo: "ingreso", categoria: "Sueldo / honorarios" });

    const retiro = await registrar({
      clave: clave(),
      fuente: "sms",
      tipo: "transferencia",
      origen: ids.ahorros,
      monto: "200000",
    });
    expect(retiro).toMatchObject({
      ok: true,
      tipo: "transferencia",
      origen: "Ahorros Bancolombia",
      destino: "Efectivo",
      categoria: null,
      por_revisar: false,
    });
  });

  it("rechaza con mensaje claro lo que no cuadra y lo deja en la bitácora", async () => {
    expect(await registrar({ clave: clave(), tipo: "ingreso", origen: ids.cuentaVisa, monto: "1000" })).toEqual({
      ok: false,
      mensaje: "Un ingreso no puede llegar a una tarjeta de crédito",
    });
    expect(await registrar({ clave: clave(), origen: ids.nequi, monto: "-5" })).toMatchObject({
      ok: false,
      mensaje: "El monto no es válido",
    });
    expect(await registrar({ clave: clave(), origen: ids.nequi, monto: "0" })).toMatchObject({
      ok: false,
      mensaje: "El monto debe ser mayor que cero",
    });
    expect(await registrar({ clave: clave(), monto: "1000" })).toMatchObject({
      ok: false,
      mensaje: "Elige el origen del pago",
    });
    expect(
      await registrar({ clave: clave(), origen: ids.cuentaVisa, monto: "1000", cuotas: 60, categoria: ids.mercado }),
    ).toMatchObject({ ok: false, mensaje: "Las cuotas van de 1 a 48" });

    await comoUsuario(db, OMAR);
    const { c } = await uno<{ c: number }>(
      "select count(*)::int as c from capturas_atajo where resultado = 'rechazado'",
    );
    expect(c).toBe(5);
  });
});

describe("aislamiento entre usuarios", () => {
  it("el token de un usuario no puede usar cuentas ni categorías de otro", async () => {
    await comoUsuario(db, OTRO);
    const antes = await uno<{ c: number }>("select count(*)::int as c from movimientos");

    expect(
      await registrar({ clave: clave(), origen: ids.cuentaOtro, monto: "1000", categoria: ids.mercado }),
    ).toMatchObject({
      ok: false,
      mensaje: "Origen no encontrado",
    });
    expect(
      await registrar({ clave: clave(), origen: ids.nequi, monto: "1000", categoria: ids.mercadoOtro }),
    ).toMatchObject({
      ok: false,
      mensaje: "Categoría no encontrada",
    });

    await comoUsuario(db, OTRO);
    expect(await uno<{ c: number }>("select count(*)::int as c from movimientos")).toEqual(antes);
    // Y el contexto del otro usuario no muestra cuentas de Omar.
    const c = await contexto({}, tokenOtro);
    expect(c.origenes.map((o) => o.nombre).sort()).toEqual(["Ajena", "Efectivo"]);
  });

  it("la misma clave en dos usuarios no choca", async () => {
    const r = await registrar(
      { clave: ids.claveAlmuerzo, origen: ids.cuentaOtro, monto: "1000", categoria: ids.mercadoOtro },
      tokenOtro,
    );
    expect(r).toMatchObject({ ok: true, repetido: false });
  });
});

describe("revocación, frecuencia y purga", () => {
  it("un token revocado deja de funcionar", async () => {
    await comoUsuario(db, OTRO);
    const { id } = await uno<{ id: string }>("select id from tokens_api where nombre = 'iPhone otro'");
    await db.query("select revocar_token_api($1)", [id]);
    await expect(contexto({}, tokenOtro)).rejects.toMatchObject({ code: "PT401" });
    await comoUsuario(db, OMAR);
    // Omar no puede revocar tokens ajenos.
    await expect(db.query("select revocar_token_api($1)", [id])).rejects.toThrow(/no encontrado/);
  });

  it("limita a 40 llamadas por minuto por token (PT429)", async () => {
    await comoUsuario(db, OMAR);
    const r = (await uno<{ r: { token: string; id: string } }>("select crear_token_api('Ráfaga') as r")).r;
    await db.exec("reset role;");
    await db.query(
      `insert into capturas_atajo (user_id, token_id, fuente, etapa, resultado)
       select $1, $2, 'rapido', 'contexto', 'consultado' from generate_series(1, 40)`,
      [OMAR, r.id],
    );
    await expect(contexto({}, r.token)).rejects.toMatchObject({ code: "PT429" });
  });

  it("purga la bitácora técnica de más de 30 días (solo service_role)", async () => {
    await db.exec("reset role;");
    await db.query("update capturas_atajo set creado_en = now() - interval '31 days' where etapa = 'contexto'");
    await db.exec("set role service_role;");
    const { n: borradas } = await uno<{ n: number }>("select purgar_capturas_atajo() as n");
    expect(borradas).toBeGreaterThan(0);
    await comoUsuario(db, OMAR);
    await expect(db.query("select purgar_capturas_atajo()")).rejects.toThrow(/permission denied/);
  });
});

describe("respaldo", () => {
  it("incluye alias_origen y restaura respaldos anteriores a las columnas nuevas", async () => {
    await comoUsuario(db, OMAR);
    const r = (
      await uno<{ r: { tablas: Record<string, Record<string, unknown>[]> } }>("select exportar_respaldo() as r")
    ).r;
    expect(r.tablas.alias_origen).toHaveLength(1);
    expect(r.tablas).not.toHaveProperty("tokens_api");
    expect(r.tablas).not.toHaveProperty("capturas_atajo");

    // Simula un respaldo de F6: sin las columnas nuevas ni la tabla de alias.
    const viejo = structuredClone(r);
    delete viejo.tablas.alias_origen;
    for (const t of ["movimientos", "compras_tc"]) {
      for (const fila of viejo.tablas[t]) {
        delete fila.origen_registro;
        delete fila.por_revisar;
        delete fila.clave_idempotencia;
      }
    }
    await db.query("select restaurar_respaldo($1::jsonb)", [JSON.stringify(viejo)]);
    const m = await uno<{ origen_registro: string; por_revisar: boolean }>(
      "select origen_registro, por_revisar from movimientos where id = $1",
      [ids.almuerzo],
    );
    expect(m).toEqual({ origen_registro: "app", por_revisar: false });

    // El completo restaura también los alias y las marcas.
    await db.query("select restaurar_respaldo($1::jsonb)", [JSON.stringify(r)]);
    const m2 = await uno<{ origen_registro: string }>("select origen_registro from movimientos where id = $1", [
      ids.almuerzo,
    ]);
    expect(m2.origen_registro).toBe("atajo_rapido");
    expect((await db.query("select valor from alias_origen")).rows).toEqual([{ valor: "visa bancolombia" }]);
  });
});
