/**
 * Migración 0009 · Bandeja "Por revisar": regla "Por clasificar ⇒ por revisar" y vista v_por_revisar.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { comoAnonimo, comoUsuario, crearBaseDePruebas, crearUsuario } from "./pg-supabase";

const OMAR = "00000000-0000-4000-8000-000000000001";
const OTRO = "00000000-0000-4000-8000-000000000002";

let db: PGlite;
const ids: Record<string, string> = {};

async function uno<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0];
}
async function registrar(token: string, datos: Record<string, unknown>) {
  await comoAnonimo(db);
  return (
    await uno<{ r: { ok: boolean; id: string } }>("select atajo_registrar($1, $2::jsonb) as r", [
      token,
      JSON.stringify(datos),
    ])
  ).r;
}
type Fila = { registro: string; id: string; por_clasificar: boolean; categoria_nombre: string | null };
const bandeja = async () =>
  (await db.query<Fila>("select registro, id, por_clasificar, categoria_nombre from v_por_revisar order by created_at"))
    .rows;

beforeAll(async () => {
  db = await crearBaseDePruebas();
  await crearUsuario(db, OMAR, "oamoreno31@gmail.com");
  await crearUsuario(db, OTRO, "otro@example.com");
  await comoUsuario(db, OMAR);
  ids.ahorros = (
    await uno<{ id: string }>(
      "insert into cuentas (nombre, tipo, saldo_inicial) values ('Ahorros', 'ahorros', 1000000) returning id",
    )
  ).id;
  ids.tarjeta = (
    await uno<{ id: string }>("select crear_tarjeta('Visa', 'visa', '1234', 5000000, 15::smallint, 30::smallint) as id")
  ).id;
  ids.cuentaVisa = (
    await uno<{ id: string }>("select cuenta_id as id from tarjetas_credito where id = $1", [ids.tarjeta])
  ).id;
  ids.mercado = (await uno<{ id: string }>("select id from categorias where nombre = 'Mercado'")).id;
  const token = (await uno<{ r: { token: string } }>("select crear_token_api('iPhone') as r")).r.token;

  ids.pendiente = (
    await registrar(token, {
      clave: "bandeja-0001",
      origen: ids.ahorros,
      monto: "12000",
      descripcion: "Algo",
      categoria: "pendiente",
    })
  ).id;
  ids.compra = (
    await registrar(token, {
      clave: "bandeja-0002",
      origen: ids.cuentaVisa,
      monto: "45900",
      categoria: ids.mercado,
      revisar: true,
    })
  ).id;
  await registrar(token, { clave: "bandeja-0003", origen: ids.ahorros, monto: "5000", categoria: ids.mercado });
  await comoUsuario(db, OMAR);
  ids.porClasificar = (
    await uno<{ id: string }>("select id from categorias where nombre = 'Por clasificar' and tipo = 'gasto'")
  ).id;
}, 60_000);

describe("v_por_revisar", () => {
  it("une movimientos y compras pendientes, solo del usuario", async () => {
    await comoUsuario(db, OMAR);
    expect(await bandeja()).toEqual([
      { registro: "movimiento", id: ids.pendiente, por_clasificar: true, categoria_nombre: "Por clasificar" },
      { registro: "compra_tc", id: ids.compra, por_clasificar: false, categoria_nombre: "Mercado" },
    ]);
    const compra = await uno<{ ultimos4: string; num_cuotas: number; origen_nombre: string; origen_registro: string }>(
      "select ultimos4, num_cuotas, origen_nombre, origen_registro from v_por_revisar where id = $1",
      [ids.compra],
    );
    expect(compra).toEqual({ ultimos4: "1234", num_cuotas: 1, origen_nombre: "Visa", origen_registro: "atajo_rapido" });

    await comoUsuario(db, OTRO);
    expect(await bandeja()).toEqual([]);
    await comoAnonimo(db);
    await expect(db.query("select id from v_por_revisar")).rejects.toThrow(/permission denied/);
  });
});

describe("Por clasificar ⇒ por revisar", () => {
  it("apagar la marca sin cambiar la categoría no lo saca de la bandeja", async () => {
    await comoUsuario(db, OMAR);
    await db.query("update movimientos set por_revisar = false, descripcion = 'Otra cosa' where id = $1", [
      ids.pendiente,
    ]);
    expect((await bandeja()).map((f) => f.id)).toContain(ids.pendiente);
  });

  it("al elegir una categoría real y confirmar, sale de la bandeja", async () => {
    await comoUsuario(db, OMAR);
    await db.query("update movimientos set categoria_id = $2, por_revisar = false where id = $1", [
      ids.pendiente,
      ids.mercado,
    ]);
    await db.query("update compras_tc set por_revisar = false where id = $1", [ids.compra]);
    expect(await bandeja()).toEqual([]);
  });

  it("un registro de la app con 'Por clasificar' entra solo a la bandeja", async () => {
    await comoUsuario(db, OMAR);
    const { id } = await uno<{ id: string }>(
      `insert into movimientos (fecha, tipo, monto, cuenta_id, categoria_id)
       values (current_date, 'gasto', 3000, $1, $2) returning id`,
      [ids.ahorros, ids.porClasificar],
    );
    expect((await bandeja()).map((f) => f.id)).toEqual([id]);
  });
});
