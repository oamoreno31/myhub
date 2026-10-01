import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { comoAnonimo, comoUsuario, crearBaseDePruebas, crearUsuario } from "./pg-supabase";

const OMAR = "00000000-0000-4000-8000-000000000001";
const OTRO = "00000000-0000-4000-8000-000000000002";

let db: PGlite;

beforeAll(async () => {
  db = await crearBaseDePruebas();
  await crearUsuario(db, OMAR, "oamoreno31@gmail.com");
  await crearUsuario(db, OTRO, "otro@example.com");
}, 60_000);

describe("migración 0001 · inicialización de usuario", () => {
  it("crea parámetros con valores por defecto", async () => {
    await comoUsuario(db, OMAR);
    const { rows } = await db.query<{ moneda: string; zona_horaria: string; imputacion_tc: string }>(
      "select moneda, zona_horaria, imputacion_tc from parametros",
    );
    expect(rows).toEqual([{ moneda: "COP", zona_horaria: "America/Bogota", imputacion_tc: "cargos_primero" }]);
  });

  it("crea la cuenta Efectivo", async () => {
    await comoUsuario(db, OMAR);
    const { rows } = await db.query<{ nombre: string; tipo: string }>("select nombre, tipo from cuentas");
    expect(rows).toEqual([{ nombre: "Efectivo", tipo: "efectivo" }]);
  });

  it("siembra las categorías del análisis funcional", async () => {
    await comoUsuario(db, OMAR);
    const { rows } = await db.query<{ tipo: string; n: number }>(
      "select tipo::text, count(*)::int as n from categorias where padre_id is null group by tipo order by tipo",
    );
    expect(rows).toEqual([
      { tipo: "gasto", n: 16 },
      { tipo: "ingreso", n: 9 },
    ]);
    const subs = await db.query<{ n: number }>(
      `select count(*)::int as n from categorias c
       join categorias p on p.id = c.padre_id where p.nombre = 'Otros gastos'`,
    );
    expect(subs.rows[0].n).toBe(14);
  });

  it("marca 'Otros gastos' y 'Devtopia' como de descripción obligatoria", async () => {
    await comoUsuario(db, OMAR);
    const { rows } = await db.query<{ nombre: string }>(
      "select nombre from categorias where requiere_descripcion and padre_id is null and tipo = 'gasto' order by nombre",
    );
    expect(rows.map((r) => r.nombre)).toEqual(["Devtopia – otros gastos", "Otros gastos"]);
  });

  it("es idempotente", async () => {
    await db.exec("reset role;");
    await db.query("select public.inicializar_usuario($1)", [OMAR]);
    await comoUsuario(db, OMAR);
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from categorias");
    expect(rows[0].n).toBe(9 + 16 + 14);
  });
});

describe("migración 0001 · seguridad (RLS)", () => {
  it("un usuario no ve datos de otro", async () => {
    await comoUsuario(db, OTRO);
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from categorias where user_id = $1", [
      OMAR,
    ]);
    expect(rows[0].n).toBe(0);
  });

  it("no permite insertar filas a nombre de otro usuario", async () => {
    await comoUsuario(db, OTRO);
    await expect(
      db.query("insert into cuentas (user_id, nombre, tipo) values ($1, 'Intrusa', 'ahorros')", [OMAR]),
    ).rejects.toThrow(/row-level security/);
  });

  it("asigna user_id automáticamente con auth.uid()", async () => {
    await comoUsuario(db, OMAR);
    const { rows } = await db.query<{ user_id: string }>(
      "insert into cuentas (nombre, tipo) values ('Ahorros', 'ahorros') returning user_id",
    );
    expect(rows[0].user_id).toBe(OMAR);
  });

  it("el rol anónimo no puede leer nada", async () => {
    await comoAnonimo(db);
    await expect(db.query("select * from categorias")).rejects.toThrow(/permission denied/);
  });

  it("el usuario no puede crear ni borrar su fila de parámetros", async () => {
    await comoUsuario(db, OMAR);
    await expect(db.query("delete from parametros")).rejects.toThrow(/permission denied/);
    const { rows } = await db.query<{ meta_ahorro_pct: string }>(
      "update parametros set meta_ahorro_pct = 0.25 returning meta_ahorro_pct",
    );
    expect(Number(rows[0].meta_ahorro_pct)).toBe(0.25);
  });

  it("no expone la función de inicialización a usuarios", async () => {
    await comoUsuario(db, OMAR);
    await expect(db.query("select public.inicializar_usuario($1)", [OTRO])).rejects.toThrow(/permission denied/);
  });
});

describe("migración 0001 · reglas de integridad", () => {
  it("solo permite un nivel de subcategorías", async () => {
    await comoUsuario(db, OMAR);
    const { rows } = await db.query<{ id: string }>("select id from categorias where nombre = 'Mercado'");
    await expect(
      db.query("insert into categorias (tipo, grupo, nombre, padre_id) values ('gasto', 'Otros', 'Frutas', $1)", [
        rows[0].id,
      ]),
    ).rejects.toThrow(/un nivel/);
  });

  it("una subcategoría hereda el tipo de su padre", async () => {
    await comoUsuario(db, OMAR);
    const { rows } = await db.query<{ id: string }>(
      "select id from categorias where nombre = 'Otros gastos' and padre_id is null",
    );
    await expect(
      db.query("insert into categorias (tipo, grupo, nombre, padre_id) values ('ingreso', 'Otros', 'Raro', $1)", [
        rows[0].id,
      ]),
    ).rejects.toThrow(/mismo usuario y tipo/);
  });

  it("los periodos siempre inician el día 1 y son únicos por mes", async () => {
    await comoUsuario(db, OMAR);
    await expect(db.query("insert into periodos (mes) values ('2026-09-15')")).rejects.toThrow(/check/);
    await db.query("insert into periodos (mes) values ('2026-09-01')");
    await expect(db.query("insert into periodos (mes) values ('2026-09-01')")).rejects.toThrow(/unique|duplicate/);
  });

  it("un periodo cerrado exige fecha de cierre", async () => {
    await comoUsuario(db, OMAR);
    await expect(db.query("update periodos set estado = 'cerrado' where mes = '2026-09-01'")).rejects.toThrow(/check/);
  });

  it("actualiza updated_at en cada cambio", async () => {
    await comoUsuario(db, OMAR);
    const antes = await db.query<{ updated_at: Date }>("select updated_at from cuentas where nombre = 'Efectivo'");
    await new Promise((r) => setTimeout(r, 10));
    const despues = await db.query<{ updated_at: Date }>(
      "update cuentas set orden = 5 where nombre = 'Efectivo' returning updated_at",
    );
    expect(despues.rows[0].updated_at.getTime()).toBeGreaterThan(antes.rows[0].updated_at.getTime());
  });
});
