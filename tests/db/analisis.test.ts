/**
 * Migración 0005 · análisis (consumo, caja, comercios), patrimonio y presupuestos.
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
async function varios<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const cat = async (nombre: string) =>
  (await uno<{ id: string }>("select id from categorias where nombre = $1", [nombre])).id;

beforeAll(async () => {
  db = await crearBaseDePruebas();
  await crearUsuario(db, OMAR, "oamoreno31@gmail.com");
  await crearUsuario(db, OTRO, "otro@example.com");
  await comoUsuario(db, OMAR);
  ids.ahorros = (
    await uno<{ id: string }>(
      "insert into cuentas (nombre, tipo, saldo_inicial, fecha_saldo_inicial) values ('Ahorros', 'ahorros', 3000000, '2026-09-01') returning id",
    )
  ).id;
  for (const c of [
    "Mercado",
    "Restaurantes y domicilios",
    "Arriendo",
    "Devtopia – otros gastos",
    "Sueldo / honorarios",
  ])
    ids[c] = await cat(c);

  const gasto = `insert into movimientos (fecha, tipo, monto, cuenta_id, categoria_id, comercio, descripcion, reembolsable)
                 values ($1, 'gasto', $2, $3, $4, $5, $6, $7)`;
  await db.query(gasto, ["2026-09-03", 1800000, ids.ahorros, ids.Arriendo, null, null, false]);
  await db.query(gasto, ["2026-09-05", 250000, ids.ahorros, ids.Mercado, "Éxito", null, false]);
  await db.query(gasto, ["2026-09-12", 150000, ids.ahorros, ids.Mercado, "  éxito ", null, false]);
  await db.query(gasto, ["2026-09-14", 90000, ids.ahorros, ids["Restaurantes y domicilios"], "Crepes", null, false]);
  await db.query(gasto, ["2026-09-20", 120000, ids.ahorros, ids["Devtopia – otros gastos"], null, "Hosting", true]);
  await db.query(
    "insert into movimientos (fecha, tipo, monto, cuenta_id, categoria_id) values ('2026-09-01', 'ingreso', 9000000, $1, $2)",
    [ids.ahorros, ids["Sueldo / honorarios"]],
  );

  ids.tarjeta = (
    await uno<{ id: string }>("select crear_tarjeta('Visa', 'visa', null, 5000000, 15::smallint, 30::smallint) as id")
  ).id;
  await db.query(
    `insert into compras_tc (tarjeta_id, fecha, tipo, monto, num_cuotas, categoria_id, comercio)
     values ($1, '2026-09-08', 'compra', 300000, 1, $2, 'Exito'), ($1, '2026-09-09', 'compra', 60000, 1, $3, 'Crepes')`,
    [ids.tarjeta, ids.Mercado, ids["Restaurantes y domicilios"]],
  );
  await db.query(
    `insert into extractos_tc (tarjeta_id, fecha_corte, fecha_limite_pago, pago_total_banco, pago_minimo_banco)
     values ($1, '2026-09-15', '2026-09-30', 380000, 80000)`,
    [ids.tarjeta],
  );
  await db.query(
    "insert into pagos_tc (tarjeta_id, cuenta_origen_id, fecha, monto) values ($1, $2, '2026-09-25', 380000)",
    [ids.tarjeta, ids.ahorros],
  );
}, 60_000);

describe("vista Consumo", () => {
  it("suma gastos, compras con tarjeta y otros cargos por categoría hoja, igual que el resumen", async () => {
    const filas = await varios<{ categoria_nombre: string; origen: string; reembolsable: boolean; total: string }>(
      "select categoria_nombre, origen, reembolsable, total from v_consumo_mes where mes = '2026-09-01' order by categoria_nombre, origen",
    );
    const mapa = Object.fromEntries(filas.map((f) => [`${f.categoria_nombre}|${f.origen}`, n(f.total)]));
    expect(mapa).toEqual({
      "Arriendo|cuenta": 1800000,
      "Costos financieros TC|cargos_tarjeta": 20000,
      "Devtopia – otros gastos|cuenta": 120000,
      "Mercado|cuenta": 400000,
      "Mercado|tarjeta": 300000,
      "Restaurantes y domicilios|cuenta": 90000,
      "Restaurantes y domicilios|tarjeta": 60000,
    });
    const total = filas.reduce((a, f) => a + n(f.total)!, 0);
    const r = await uno<{ gastos: string }>("select gastos from v_resumen_periodo where mes = '2026-09-01'");
    expect(total).toBe(n(r.gastos));
    const mercado = await uno<{ padre_nombre: string; bolsa: string; es_fija: boolean }>(
      "select padre_nombre, bolsa, es_fija from v_consumo_mes where categoria_nombre = 'Mercado' limit 1",
    );
    expect(mercado).toEqual({ padre_nombre: "Otros gastos", bolsa: "necesidad", es_fija: false });
    const arriendo = await uno<{ es_fija: boolean }>(
      "select es_fija from v_consumo_mes where categoria_nombre = 'Arriendo'",
    );
    expect(arriendo.es_fija).toBe(true);
  });

  it("vista Caja: el pago completo de la tarjeta es salida de caja; las compras con tarjeta no", async () => {
    const filas = await varios<{ concepto: string; total: string }>(
      "select concepto, sum(total) as total from v_caja_mes where mes = '2026-09-01' group by concepto order by concepto",
    );
    expect(Object.fromEntries(filas.map((f) => [f.concepto, n(f.total)]))).toEqual({
      Arriendo: 1800000,
      "Devtopia – otros gastos": 120000,
      "Otros gastos": 490000,
      "Pagos de tarjetas": 380000,
    });
    const r = await uno<{ salidas_caja: string }>(
      "select salidas_caja from v_resumen_periodo where mes = '2026-09-01'",
    );
    expect(filas.reduce((a, f) => a + n(f.total)!, 0)).toBe(n(r.salidas_caja));
  });

  it("top comercios une mayúsculas, espacios y tildes", async () => {
    const filas = await varios<{ clave: string; comercio: string; total: string; n: number }>(
      `select clave, mode() within group (order by comercio) as comercio, sum(total) as total, sum(n)::int as n
       from v_comercios_mes where mes = '2026-09-01' group by clave order by 3 desc`,
    );
    expect(filas.map((f) => [f.clave, n(f.total), f.n])).toEqual([
      ["exito", 700000, 3],
      ["crepes", 150000, 2],
    ]);
    // Formas escritas: "Éxito", "  éxito " y "Exito" (una vez cada una) → en empate gana la que tiene mayúscula.
    const nombres = await varios<{ comercio: string }>(
      "select comercio from v_comercios_mes where mes = '2026-09-01' and clave = 'exito'",
    );
    expect(nombres.map((x) => x.comercio)).toEqual(["Exito"]);
  });
});

describe("patrimonio neto", () => {
  it("cuentas + por cobrar + Devtopia − tarjetas − préstamos, y queda en la foto del cierre", async () => {
    const p = await uno<Record<string, string>>("select * from v_patrimonio");
    // Ahorros: 3.000.000 + 9.000.000 − 1.800.000 − 250.000 − 150.000 − 90.000 − 120.000 − 380.000
    expect(n(p.cuentas)).toBe(9210000);
    expect(n(p.devtopia)).toBe(120000);
    expect(n(p.deuda_tarjetas)).toBe(0);
    expect(n(p.patrimonio)).toBe(9330000);

    await db.query(
      `insert into prestamos_otorgados (deudor, monto, fecha, cuenta_origen_id) values ('Juan', 500000, '2026-09-26', $1)`,
      [ids.ahorros],
    );
    await db.query(
      `insert into deudas (nombre, tipo, monto_original, fecha_desembolso, plazo_meses, cuota, dia_pago, saldo_inicial, fecha_saldo_inicial)
       values ('Préstamo mamá', 'persona', 1000000, '2026-01-01', 10, 100000, 5, 700000, '2026-09-01')`,
    );
    const q = await uno<Record<string, string>>("select * from v_patrimonio");
    expect(n(q.cuentas)).toBe(8710000);
    expect(n(q.por_cobrar)).toBe(500000);
    expect(n(q.prestamos)).toBe(700000);
    expect(n(q.patrimonio)).toBe(9330000 - 700000);

    const ops = await varios<{ id: string }>(
      "select id from v_obligaciones_mes where mes = '2026-09-01' and resolucion is null and not pagada",
    );
    const foto = await uno<{ snapshot: Record<string, unknown> }>(
      "select cerrar_periodo((select id from periodos where mes = '2026-09-01'), $1::jsonb) as snapshot",
      [JSON.stringify(ops.map((o) => ({ id: o.id, accion: "omitir", motivo: "prueba" })))],
    );
    expect(foto.snapshot.version).toBeGreaterThanOrEqual(2);
    expect(Number((foto.snapshot.patrimonio as Record<string, string>).patrimonio)).toBe(8630000);
    expect(Number(foto.snapshot.gastos)).toBe(2790000);
  });
});

describe("presupuestos", () => {
  it("guarda el presupuesto del mes y la plantilla por separado, reemplazando lo anterior", async () => {
    await db.query("select generar_periodo('2026-10-01')");
    const oct = (await uno<{ id: string }>("select id from periodos where mes = '2026-10-01'")).id;
    const items = [
      { categoria_id: ids.Mercado, monto: 700000 },
      { categoria_id: ids["Restaurantes y domicilios"], monto: 200000 },
      { categoria_id: ids.Arriendo, monto: 0 },
    ];
    expect(
      (await uno<{ n: number }>("select guardar_presupuesto($1, $2::jsonb) as n", [oct, JSON.stringify(items)])).n,
    ).toBe(2);
    expect(
      (
        await uno<{ n: number }>("select guardar_presupuesto(null, $1::jsonb) as n", [
          JSON.stringify(items.slice(0, 1)),
        ])
      ).n,
    ).toBe(1);
    expect(
      (
        await uno<{ n: number }>("select guardar_presupuesto($1, $2::jsonb) as n", [
          oct,
          JSON.stringify(items.slice(1)),
        ])
      ).n,
    ).toBe(1);
    const filas = await varios<{ periodo_id: string | null; monto: string }>(
      "select periodo_id, monto from presupuestos order by periodo_id nulls first",
    );
    expect(filas.map((f) => [f.periodo_id === null ? "plantilla" : "oct", n(f.monto)])).toEqual([
      ["plantilla", 700000],
      ["oct", 200000],
    ]);
  });

  it("no se presupuestan ingresos ni meses cerrados", async () => {
    const sep = (await uno<{ id: string }>("select id from periodos where mes = '2026-09-01'")).id;
    await expect(
      db.query("select guardar_presupuesto($1, $2::jsonb)", [
        sep,
        JSON.stringify([{ categoria_id: ids.Mercado, monto: 1 }]),
      ]),
    ).rejects.toThrow(/cerrado/);
    await expect(
      db.query("select guardar_presupuesto(null, $1::jsonb)", [
        JSON.stringify([{ categoria_id: ids["Sueldo / honorarios"], monto: 1 }]),
      ]),
    ).rejects.toThrow(/gasto/);
  });

  it("otro usuario no ve ni borra presupuestos ni análisis de Omar", async () => {
    await comoUsuario(db, OTRO);
    for (const v of ["presupuestos", "v_consumo_mes", "v_caja_mes", "v_comercios_mes"])
      expect(await varios(`select * from ${v}`)).toHaveLength(0);
    const p = await uno<{ patrimonio: string }>("select patrimonio from v_patrimonio");
    expect(n(p.patrimonio)).toBe(0);
    await db.query("select guardar_presupuesto(null, '[]'::jsonb)");
    await comoUsuario(db, OMAR);
    expect(await varios("select * from presupuestos where periodo_id is null")).toHaveLength(1);
  });
});
