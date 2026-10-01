/**
 * Migración 0007 · respaldo y restauración JSON, recordatorios del correo diario.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { comoUsuario, crearBaseDePruebas, crearUsuario } from "./pg-supabase";

const OMAR = "00000000-0000-4000-8000-000000000001";
const OTRO = "00000000-0000-4000-8000-000000000002";

let db: PGlite;
const ids: Record<string, string> = {};

async function uno<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(sql, params)).rows[0];
}
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const cat = async (nombre: string) =>
  (await uno<{ id: string }>("select id from categorias where nombre = $1", [nombre])).id;
const respaldo = async () =>
  (
    await uno<{ r: { tablas: Record<string, Record<string, unknown>[]>; exportado_en: string } }>(
      "select exportar_respaldo() as r",
    )
  ).r;
/** Respaldo sin marcas de tiempo que cambian al restaurar, ordenado para comparar. */
const normalizar = (r: { tablas: Record<string, Record<string, unknown>[]> }) =>
  Object.fromEntries(
    Object.entries(r.tablas)
      .filter(([t]) => t !== "bitacora")
      .map(([t, filas]) => [
        t,
        filas
          .map((f) => {
            const resto = { ...f };
            delete resto.updated_at;
            return JSON.stringify(resto);
          })
          .sort(),
      ]),
  );

beforeAll(async () => {
  db = await crearBaseDePruebas();
  await crearUsuario(db, OMAR, "oamoreno31@gmail.com");
  await crearUsuario(db, OTRO, "otro@example.com");

  await comoUsuario(db, OTRO);
  ids.cuentaOtro = (
    await uno<{ id: string }>(
      "insert into cuentas (nombre, tipo, saldo_inicial, fecha_saldo_inicial) values ('Ajena', 'ahorros', 10, '2026-07-01') returning id",
    )
  ).id;

  await comoUsuario(db, OMAR);
  ids.ahorros = (
    await uno<{ id: string }>(
      "insert into cuentas (nombre, tipo, saldo_inicial, fecha_saldo_inicial) values ('Ahorros', 'ahorros', 3000000, '2026-07-01') returning id",
    )
  ).id;
  const gasto = `insert into movimientos (fecha, tipo, monto, cuenta_id, categoria_id, descripcion, reembolsable)
                 values ($1, $2, $3, $4, $5, $6, $7) returning id`;
  await db.query(gasto, ["2026-07-01", "ingreso", 5000000, ids.ahorros, await cat("Sueldo / honorarios"), null, false]);
  await db.query(gasto, ["2026-07-03", "gasto", 1500000, ids.ahorros, await cat("Arriendo"), null, false]);
  ids.hosting = (
    await uno<{ id: string }>(gasto, [
      "2026-07-10",
      "gasto",
      100000,
      ids.ahorros,
      await cat("Devtopia – otros gastos"),
      "Hosting",
      true,
    ])
  ).id;
  // Reembolso ligado (referencia de movimientos a movimientos)
  await db.query(
    "select registrar_reembolso($1, '2026-07-20', 100000, array[$2]::uuid[], array[]::uuid[], 'Reembolso')",
    [ids.ahorros, ids.hosting],
  );
  // Subcategoría propia (referencia a la misma tabla)
  await db.query("insert into categorias (tipo, grupo, nombre, padre_id) values ('gasto', 'Otros', 'Café', $1)", [
    await cat("Otros gastos"),
  ]);
  // Tarjeta con compra, extracto y pago (el pago crea su movimiento por trigger)
  ids.tarjeta = (
    await uno<{ id: string }>("select crear_tarjeta('Visa', 'visa', null, 4000000, 15::smallint, 30::smallint) as id")
  ).id;
  await db.query(
    `insert into compras_tc (tarjeta_id, fecha, tipo, monto, num_cuotas, categoria_id, comercio)
     values ($1, '2026-07-05', 'compra', 600000, 3, $2, 'Éxito')`,
    [ids.tarjeta, await cat("Mercado")],
  );
  await db.query(
    `insert into extractos_tc (tarjeta_id, fecha_corte, fecha_limite_pago, pago_total_banco, pago_minimo_banco)
     values ($1, '2026-07-15', '2026-07-30', 640000, 240000)`,
    [ids.tarjeta],
  );
  await db.query(
    "insert into pagos_tc (tarjeta_id, cuenta_origen_id, fecha, monto) values ($1, $2, '2026-07-28', 240000)",
    [ids.tarjeta, ids.ahorros],
  );
  // Deuda con desembolso (deuda → movimiento) y préstamo otorgado (préstamo ↔ movimiento)
  await db.query(
    `insert into deudas (nombre, tipo, monto_original, fecha_desembolso, tasa_ea, plazo_meses, cuota, dia_pago,
        saldo_inicial, fecha_saldo_inicial, cuenta_desembolso_id)
     values ('Libre', 'banco', 2000000, '2026-07-02', 0.24, 12, 187000, 2, 2000000, '2026-07-02', $1)`,
    [ids.ahorros],
  );
  await db.query(
    "insert into prestamos_otorgados (deudor, monto, fecha, cuenta_origen_id) values ('Juan', 300000, '2026-07-12', $1)",
    [ids.ahorros],
  );
  await db.query(
    "insert into metas (nombre, tipo, monto_objetivo, cuenta_id) values ('Fondo', 'fondo_emergencia', 9000000, $1)",
    [ids.ahorros],
  );
  // Julio cerrado (luego se intenta escribir en él)
  const julio = await uno<{ id: string }>("select generar_periodo('2026-07-01') as id");
  ids.julio = julio.id;
  await db.query("select cerrar_periodo($1)", [julio.id]);
}, 60_000);

describe("respaldo JSON", () => {
  it("exporta todas las tablas del usuario sin user_id", async () => {
    const r = await respaldo();
    expect(Object.keys(r.tablas)).toContain("pagos_tc");
    expect(r.tablas.cuentas.map((c) => c.nombre)).toEqual(expect.arrayContaining(["Ahorros", "Visa"]));
    expect(r.tablas.cuentas.some((c) => c.nombre === "Ajena")).toBe(false);
    expect(r.tablas.movimientos.every((m) => !("user_id" in m))).toBe(true);
    expect(r.tablas.parametros).toHaveLength(1);
  });

  it("restaura exactamente lo exportado, aunque haya cambios y el mes esté cerrado", async () => {
    const antes = await respaldo();
    // Cambios posteriores: una cuenta nueva y un gasto en agosto
    const nueva = await uno<{ id: string }>(
      "insert into cuentas (nombre, tipo, saldo_inicial, fecha_saldo_inicial) values ('Nueva', 'efectivo', 0, '2026-08-01') returning id",
    );
    await db.query(
      "insert into movimientos (fecha, tipo, monto, cuenta_id, categoria_id) values ('2026-08-02', 'gasto', 5000, $1, $2)",
      [nueva.id, await cat("Mercado")],
    );
    const filas = await uno<{ r: Record<string, number> }>("select restaurar_respaldo($1) as r", [
      JSON.stringify(antes),
    ]);
    expect(filas.r.movimientos).toBe(antes.tablas.movimientos.length);
    const despues = await respaldo();
    expect(normalizar(despues)).toEqual(normalizar(antes));
    // Los saldos calculados quedan iguales
    expect(
      n((await uno<{ saldo: string }>("select saldo from v_saldos_cuentas where id = $1", [ids.ahorros])).saldo),
    ).toBe(
      n((antes.tablas.cuentas.find((c) => c.id === ids.ahorros) as { saldo_inicial: number }).saldo_inicial)! +
        5000000 -
        1500000 -
        100000 +
        100000 -
        240000 +
        2000000 -
        300000,
    );
  });

  it("los triggers vuelven a funcionar: el mes cerrado sigue bloqueado", async () => {
    await expect(
      db.query(
        "insert into movimientos (fecha, tipo, monto, cuenta_id, categoria_id) values ('2026-07-15', 'gasto', 1, $1, $2)",
        [ids.ahorros, await cat("Mercado")],
      ),
    ).rejects.toThrow();
    const b = await uno<{ accion: string }>("select accion from bitacora where entidad = 'respaldo'");
    expect(b.accion).toBe("restaurar");
  });

  it("rechaza archivos ajenos o que apunten a datos de otro usuario, sin cambiar nada", async () => {
    await expect(
      db.query("select restaurar_respaldo($1)", [JSON.stringify({ app: "otra", version: 1 })]),
    ).rejects.toThrow(/no es un respaldo/);
    const r = await respaldo();
    const trampa = structuredClone(r);
    (trampa.tablas.movimientos[0] as Record<string, unknown>).cuenta_id = ids.cuentaOtro;
    await expect(db.query("select restaurar_respaldo($1)", [JSON.stringify(trampa)])).rejects.toThrow(/no son tuyos/);
    expect(normalizar(await respaldo())).toEqual(normalizar(r));
  });

  it("otro usuario no ve ni restaura mis datos; exportar para otro es solo del cron", async () => {
    await comoUsuario(db, OTRO);
    const r = await respaldo();
    const nombres = r.tablas.cuentas.map((c) => c.nombre);
    expect(nombres).toContain("Ajena");
    expect(nombres).not.toContain("Ahorros");
    await expect(db.query("select exportar_respaldo_usuario($1)", [OMAR])).rejects.toThrow();
    await comoUsuario(db, OMAR);
  });
});

describe("recordatorios del correo diario", () => {
  it("lista lo vencido o por vencer (≤ 3 días) sin pagar, por usuario con recordatorios activos", async () => {
    await db.query(
      `insert into obligaciones (nombre, tipo, categoria_id, monto_estimado, dia_vencimiento, fecha_inicio, cuenta_default_id)
       values ('Internet', 'telecom', $1, 100000, 5, '2026-09-01', $2), ('Agua', 'servicio', $3, 80000, 25, '2026-09-01', $2)`,
      [await cat("Internet"), ids.ahorros, await cat("Agua")],
    );
    await db.query("select generar_periodo('2026-09-01')");
    await db.exec("reset role; set role service_role;");
    const filas = (
      await db.query<{ email: string; obligaciones: { nombre: string; vence: string; pendiente: number }[] }>(
        "select email, obligaciones from recordatorios_hoy('2026-09-03')",
      )
    ).rows;
    expect(filas).toHaveLength(1);
    expect(filas[0].email).toBe("oamoreno31@gmail.com");
    // Internet vence el 5 (≤ 3 días); Agua (25) todavía no
    expect(filas[0].obligaciones.map((o) => [o.nombre, o.vence])).toEqual([["Internet", "2026-09-05"]]);

    await db.exec("reset role;");
    await db.query("update parametros set recordatorios_email = false where user_id = $1", [OMAR]);
    await db.exec("set role service_role;");
    expect((await db.query("select * from recordatorios_hoy('2026-09-03')")).rows).toHaveLength(0);
    await comoUsuario(db, OMAR);
    await expect(db.query("select * from recordatorios_hoy('2026-09-03')")).rejects.toThrow();
  });
});
