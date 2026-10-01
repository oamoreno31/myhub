/**
 * Migración 0004 · deudas, préstamos otorgados y reembolsos Devtopia.
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
const cuenta = async (nombre: string, tipo = "ahorros", saldo = 0) =>
  (
    await uno<{ id: string }>(
      "insert into cuentas (nombre, tipo, saldo_inicial, fecha_saldo_inicial) values ($1, $2, $3, '2026-01-01') returning id",
      [nombre, tipo, saldo],
    )
  ).id;
const saldo = async (id: string) =>
  n((await uno<{ saldo: string }>("select saldo from v_saldos_cuentas where id = $1", [id])).saldo);
const resumen = (mes: string) => uno<Record<string, string>>("select * from v_resumen_periodo where mes = $1", [mes]);

async function pagarCuota(p: {
  deuda: string;
  fecha: string;
  capital: number;
  intereses: number;
  seguros?: number;
  aporte?: number;
  obligacion?: string | null;
}) {
  const monto = p.capital + p.intereses + (p.seguros ?? 0) + (p.aporte ?? 0);
  return uno<{ id: string; movimiento_id: string; movimiento_aporte_id: string | null }>(
    `insert into pagos_deuda (deuda_id, cuenta_origen_id, fecha, monto, a_capital, a_intereses, a_seguros, a_aporte, obligacion_periodo_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id, movimiento_id, movimiento_aporte_id`,
    [p.deuda, ids.ahorros, p.fecha, monto, p.capital, p.intereses, p.seguros ?? 0, p.aporte ?? 0, p.obligacion ?? null],
  );
}

beforeAll(async () => {
  db = await crearBaseDePruebas();
  await crearUsuario(db, OMAR, "oamoreno31@gmail.com");
  await crearUsuario(db, OTRO, "otro@example.com");
  await comoUsuario(db, OMAR);
  ids.ahorros = await cuenta("Ahorros", "ahorros", 5000000);
  ids.coop = await cuenta("Aportes Coomeva", "cooperativa", 1000000);
  ids.visa = await cuenta("Visa", "tarjeta_credito");
}, 60_000);

describe("deudas (préstamos recibidos)", () => {
  it("un préstamo nuevo con desembolso mete la plata a la cuenta (no es ingreso)", async () => {
    ids.libre = (
      await uno<{ id: string }>(
        `insert into deudas (nombre, acreedor, tipo, monto_original, fecha_desembolso, tasa_ea, plazo_meses, cuota,
            seguro_mensual, dia_pago, cuenta_pago_default_id, saldo_inicial, fecha_saldo_inicial, cuenta_desembolso_id)
         values ('Libre inversión', 'Bancolombia', 'banco', 10000000, '2026-09-05', 0.2682, 24, 526000,
            12000, 5, $1, 10000000, '2026-09-05', $1) returning id`,
        [ids.ahorros],
      )
    ).id;
    expect(await saldo(ids.ahorros)).toBe(15000000);
    const r = await resumen("2026-09-01");
    expect(n(r.desembolsos)).toBe(10000000);
    expect(n(r.ingresos)).toBe(0);
    // Cambiar el monto actualiza el desembolso; quitar la cuenta lo borra.
    await db.query("update deudas set monto_original = 9000000, saldo_inicial = 9000000 where id = $1", [ids.libre]);
    expect(await saldo(ids.ahorros)).toBe(14000000);
    await db.query("update deudas set cuenta_desembolso_id = null where id = $1", [ids.libre]);
    expect(await saldo(ids.ahorros)).toBe(5000000);
    await db.query(
      "update deudas set monto_original = 10000000, saldo_inicial = 10000000, cuenta_desembolso_id = $1 where id = $2",
      [ids.ahorros, ids.libre],
    );
    expect(await saldo(ids.ahorros)).toBe(15000000);
  });

  it("la cuota desglosada: capital baja la deuda; intereses y seguros son gasto", async () => {
    const p = await pagarCuota({
      deuda: ids.libre,
      fecha: "2026-10-05",
      capital: 326000,
      intereses: 200000,
      seguros: 12000,
    });
    ids.pago1 = p.id;
    const mov = await uno<Record<string, unknown>>("select tipo, monto, descripcion from movimientos where id = $1", [
      p.movimiento_id,
    ]);
    expect(mov).toMatchObject({ tipo: "pago_deuda", descripcion: "Cuota Libre inversión" });
    expect(n(mov.monto)).toBe(538000);
    expect(p.movimiento_aporte_id).toBeNull();

    const d = await uno<Record<string, string>>("select * from v_estado_deudas where id = $1", [ids.libre]);
    expect(n(d.saldo_capital)).toBe(9674000);
    expect(n(d.pagado_intereses)).toBe(200000);
    expect(n(d.cuota_total)).toBe(538000);

    const oct = await resumen("2026-10-01");
    expect(n(oct.costos_financieros_deudas)).toBe(212000);
    expect(n(oct.gastos)).toBe(212000);
    expect(n(oct.pagos_deuda)).toBe(538000);
    expect(n(oct.salidas_caja)).toBe(538000);
    const g = await uno<{ total: string }>(
      "select total from v_gasto_categoria_mes where mes = '2026-10-01' and categoria_nombre = 'Intereses de préstamos'",
    );
    expect(n(g.total)).toBe(212000);
  });

  it("el desglose debe cuadrar con el monto", async () => {
    await expect(
      db.query(
        `insert into pagos_deuda (deuda_id, cuenta_origen_id, fecha, monto, a_capital, a_intereses)
         values ($1, $2, '2026-10-06', 100000, 50000, 10000)`,
        [ids.libre, ids.ahorros],
      ),
    ).rejects.toThrow(/pagos_deuda_desglose_cuadra/);
    await expect(
      db.query(
        `insert into pagos_deuda (deuda_id, cuenta_origen_id, fecha, monto, a_capital) values ($1, $2, '2026-10-06', 1000, 1000)`,
        [ids.libre, ids.visa],
      ),
    ).rejects.toThrow(/tarjeta de crédito/);
  });

  it("cooperativa: la cuota trae aporte, que va a la cuenta de aportes (ahorro, no gasto)", async () => {
    ids.coopDeuda = (
      await uno<{ id: string }>(
        `insert into deudas (nombre, tipo, monto_original, fecha_desembolso, tasa_ea, plazo_meses, cuota, aporte_mensual,
            cuenta_aportes_id, dia_pago, saldo_inicial, fecha_saldo_inicial)
         values ('Crédito Coomeva', 'cooperativa', 6000000, '2025-06-10', 0.18, 36, 214000, 80000, $1, 10, 4200000, '2026-09-01')
         returning id`,
        [ids.coop],
      )
    ).id;
    const antesAhorros = await saldo(ids.ahorros);
    const p = await pagarCuota({
      deuda: ids.coopDeuda,
      fecha: "2026-10-10",
      capital: 155000,
      intereses: 59000,
      aporte: 80000,
    });
    expect(p.movimiento_aporte_id).not.toBeNull();
    expect((await saldo(ids.ahorros))! - antesAhorros!).toBe(-294000);
    expect(await saldo(ids.coop)).toBe(1080000);
    const oct = await resumen("2026-10-01");
    expect(n(oct.aportes)).toBe(80000);
    expect(n(oct.costos_financieros_deudas)).toBe(212000 + 59000);
    const cat = await uno<{ nombre: string }>(
      "select c.nombre from movimientos m join categorias c on c.id = m.categoria_id where m.id = $1",
      [p.movimiento_id],
    );
    expect(cat.nombre).toBe("Cooperativas");

    // Quitar el aporte en una edición borra su movimiento.
    await db.query("update pagos_deuda set monto = 214000, a_aporte = 0 where id = $1", [p.id]);
    expect(await uno("select id from movimientos where id = $1", [p.movimiento_aporte_id])).toBeUndefined();
    expect(await saldo(ids.coop)).toBe(1000000);
    await db.query("update pagos_deuda set monto = 294000, a_aporte = 80000 where id = $1", [p.id]);
    expect(await saldo(ids.coop)).toBe(1080000);
    ids.pagoCoop = p.id;

    await expect(
      pagarCuota({ deuda: ids.libre, fecha: "2026-10-11", capital: 1000, intereses: 0, aporte: 5000 }),
    ).rejects.toThrow(/cuenta de aportes/);
  });

  it("la cuota paga la obligación del mes (cuota + aporte)", async () => {
    const plantilla = await uno<{ id: string }>(
      `insert into obligaciones (nombre, tipo, categoria_id, monto_estimado, dia_vencimiento, fecha_inicio, deuda_id, cuenta_default_id)
       values ('Crédito Coomeva', 'cooperativa', $1, 294000, 10, '2026-11-01', $2, $3) returning id`,
      [await cat("Cooperativas"), ids.coopDeuda, ids.ahorros],
    );
    await db.query("select generar_periodo('2026-11-01')");
    const op = await uno<{ id: string; deuda_id: string }>(
      "select id, deuda_id from v_obligaciones_mes where obligacion_id = $1",
      [plantilla.id],
    );
    expect(op.deuda_id).toBe(ids.coopDeuda);
    await pagarCuota({
      deuda: ids.coopDeuda,
      fecha: "2026-11-10",
      capital: 157000,
      intereses: 57000,
      aporte: 80000,
      obligacion: op.id,
    });
    const v = await uno<{ pagada: boolean; pagado: string; n_pagos: number }>(
      "select pagada, pagado, n_pagos from v_obligaciones_mes where id = $1",
      [op.id],
    );
    expect(v).toMatchObject({ pagada: true, n_pagos: 2 });
    expect(n(v.pagado)).toBe(294000);
    const d = await uno<{ obligacion_id: string; saldo_capital: string }>(
      "select obligacion_id, saldo_capital from v_estado_deudas where id = $1",
      [ids.coopDeuda],
    );
    expect(d.obligacion_id).toBe(plantilla.id);
    expect(n(d.saldo_capital)).toBe(4200000 - 155000 - 157000);
  });

  it("los movimientos de una cuota no se crean ni editan a mano; borrar la cuota los borra", async () => {
    await expect(
      db.query(
        "insert into movimientos (fecha, tipo, monto, cuenta_id) values ('2026-10-01', 'pago_deuda', 1000, $1)",
        [ids.ahorros],
      ),
    ).rejects.toThrow(/Deudas/);
    const p = await uno<{ movimiento_id: string }>("select movimiento_id from pagos_deuda where id = $1", [ids.pago1]);
    await expect(db.query("update movimientos set monto = 1 where id = $1", [p.movimiento_id])).rejects.toThrow(
      /Deudas/,
    );
    const coop = await uno<{ movimiento_id: string; movimiento_aporte_id: string }>(
      "select movimiento_id, movimiento_aporte_id from pagos_deuda where id = $1",
      [ids.pagoCoop],
    );
    await db.query("delete from pagos_deuda where id = $1", [ids.pagoCoop]);
    expect(
      await varios("select id from movimientos where id in ($1, $2)", [coop.movimiento_id, coop.movimiento_aporte_id]),
    ).toHaveLength(0);
  });
});

describe("préstamos otorgados (me deben)", () => {
  it("prestar sale de la cuenta y no es gasto; los abonos son recuperación", async () => {
    const antes = await saldo(ids.ahorros);
    ids.juan = (
      await uno<{ id: string }>(
        `insert into prestamos_otorgados (deudor, monto, fecha, fecha_esperada, cuenta_origen_id)
         values ('Juan', 500000, '2026-10-02', '2026-12-31', $1) returning id`,
        [ids.ahorros],
      )
    ).id;
    expect((await saldo(ids.ahorros))! - antes!).toBe(-500000);
    let oct = await resumen("2026-10-01");
    expect(n(oct.prestamos_otorgados)).toBe(500000);
    expect(n(oct.gastos)).toBe(212000); // la cuota de la cooperativa se borró en la prueba anterior

    await db.query(
      `insert into movimientos (fecha, tipo, monto, cuenta_id, prestamo_otorgado_id) values ('2026-10-20', 'recuperacion_prestamo', 200000, $1, $2)`,
      [ids.ahorros, ids.juan],
    );
    const p = await uno<Record<string, string>>("select * from v_prestamos_otorgados where id = $1", [ids.juan]);
    expect(p).toMatchObject({ estado: "vigente", n_abonos: 1 });
    expect(n(p.abonado)).toBe(200000);
    expect(n(p.saldo)).toBe(300000);
    oct = await resumen("2026-10-01");
    expect(n(oct.recuperaciones)).toBe(200000);
    expect(n(oct.ingresos)).toBe(0);
    const m = await uno<{ categoria_nombre: string; es_recuperacion: boolean; prestamo_id: string }>(
      "select categoria_nombre, es_recuperacion, prestamo_id from v_movimientos where tipo = 'recuperacion_prestamo'",
    );
    expect(m).toMatchObject({
      categoria_nombre: "Recuperación de préstamos",
      es_recuperacion: true,
      prestamo_id: ids.juan,
    });
  });

  it("un abono sin préstamo se rechaza; el préstamo con abonos no se puede borrar", async () => {
    await expect(
      db.query(
        "insert into movimientos (fecha, tipo, monto, cuenta_id) values ('2026-10-20', 'recuperacion_prestamo', 1, $1)",
        [ids.ahorros],
      ),
    ).rejects.toThrow(/préstamo/);
    await expect(db.query("delete from prestamos_otorgados where id = $1", [ids.juan])).rejects.toThrow();
  });

  it("pagado al completar; castigado conserva lo abonado", async () => {
    await db.query(
      `insert into movimientos (fecha, tipo, monto, cuenta_id, prestamo_otorgado_id) values ('2026-10-25', 'recuperacion_prestamo', 300000, $1, $2)`,
      [ids.ahorros, ids.juan],
    );
    expect(
      (await uno<{ estado: string }>("select estado from v_prestamos_otorgados where id = $1", [ids.juan])).estado,
    ).toBe("pagado");
    const ana = (
      await uno<{ id: string }>(
        "insert into prestamos_otorgados (deudor, monto, fecha, cuenta_origen_id) values ('Ana', 100000, '2026-10-03', $1) returning id",
        [ids.ahorros],
      )
    ).id;
    await expect(
      db.query("update prestamos_otorgados set castigado_en = '2026-10-30' where id = $1", [ana]),
    ).rejects.toThrow();
    await db.query(
      "update prestamos_otorgados set castigado_en = '2026-10-30', motivo_castigo = 'No va a pagar' where id = $1",
      [ana],
    );
    expect(
      (await uno<{ estado: string }>("select estado from v_prestamos_otorgados where id = $1", [ana])).estado,
    ).toBe("castigado");
    // Sin abonos se puede borrar y se va su movimiento.
    const antes = await saldo(ids.ahorros);
    await db.query("delete from prestamos_otorgados where id = $1", [ana]);
    expect((await saldo(ids.ahorros))! - antes!).toBe(100000);
  });
});

describe("reembolsos Devtopia", () => {
  it("gastos y compras reembolsables quedan por cobrar hasta registrar el reembolso", async () => {
    const devtopia = await cat("Devtopia – otros gastos");
    const g1 = await uno<{ id: string }>(
      `insert into movimientos (fecha, tipo, monto, cuenta_id, categoria_id, descripcion, reembolsable)
       values ('2026-10-04', 'gasto', 120000, $1, $2, 'Hosting cliente', true) returning id`,
      [ids.ahorros, devtopia],
    );
    const g2 = await uno<{ id: string }>(
      `insert into movimientos (fecha, tipo, monto, cuenta_id, categoria_id, descripcion, reembolsable)
       values ('2026-10-06', 'gasto', 80000, $1, $2, 'Almuerzo equipo', true) returning id`,
      [ids.ahorros, devtopia],
    );
    const tarjeta = (
      await uno<{ id: string }>(
        "select crear_tarjeta('Master', 'mastercard', null, 5000000, 20::smallint, 5::smallint) as id",
      )
    ).id;
    const c1 = await uno<{ id: string }>(
      `insert into compras_tc (tarjeta_id, fecha, tipo, monto, categoria_id, descripcion, reembolsable)
       values ($1, '2026-10-07', 'compra', 300000, $2, 'Licencia Figma', true) returning id`,
      [tarjeta, devtopia],
    );
    const pendientes = await varios<{ origen: string; monto: string }>(
      "select origen, monto from v_reembolsos_pendientes order by fecha",
    );
    expect(pendientes.map((p) => [p.origen, n(p.monto)])).toEqual([
      ["movimiento", 120000],
      ["movimiento", 80000],
      ["compra_tc", 300000],
    ]);

    const r = await uno<{ id: string }>(
      "select registrar_reembolso($1, '2026-10-28', 420000, $2::uuid[], $3::uuid[]) as id",
      [ids.ahorros, [g1.id], [c1.id]],
    );
    const quedan = await varios<{ id: string }>("select id from v_reembolsos_pendientes");
    expect(quedan.map((q) => q.id)).toEqual([g2.id]);
    const rr = await uno<Record<string, string>>("select * from v_reembolsos where id = $1", [r.id]);
    expect(rr).toMatchObject({ n_items: 2 });
    expect(n(rr.total_items)).toBe(420000);
    const oct = await resumen("2026-10-01");
    expect(n(oct.reembolsos)).toBe(420000);
    expect(n(oct.ingresos)).toBe(0);

    // No se puede cobrar dos veces lo mismo
    await expect(
      db.query("select registrar_reembolso($1, '2026-10-29', 1, $2::uuid[], '{}')", [ids.ahorros, [g1.id]]),
    ).rejects.toThrow(/ya no está pendiente/);

    // Borrar el reembolso deja todo pendiente otra vez
    await db.query("delete from movimientos where id = $1", [r.id]);
    expect(await varios("select id from v_reembolsos_pendientes")).toHaveLength(3);
    ids.g1 = g1.id;
  });

  it("marcar un gasto de un mes cerrado como reembolsado está permitido; editarlo no", async () => {
    const pend = await varios<{ id: string }>("select id from v_reembolsos_pendientes where origen = 'movimiento'");
    await db
      .query("select cerrar_periodo((select id from periodos where mes = '2026-10-01'), '[]'::jsonb)")
      .catch(async () => {
        const ops = await varios<{ id: string }>(
          "select id from v_obligaciones_mes where mes = '2026-10-01' and resolucion is null and not pagada",
        );
        await db.query("select cerrar_periodo((select id from periodos where mes = '2026-10-01'), $1::jsonb)", [
          JSON.stringify(ops.map((o) => ({ id: o.id, accion: "omitir", motivo: "prueba" }))),
        ]);
      });
    expect((await uno<{ estado: string }>("select estado from periodos where mes = '2026-10-01'")).estado).toBe(
      "cerrado",
    );
    await db.query("select registrar_reembolso($1, '2026-11-15', 200000, $2::uuid[], '{}')", [
      ids.ahorros,
      pend.map((p) => p.id),
    ]);
    expect(await varios("select id from v_reembolsos_pendientes where origen = 'movimiento'")).toHaveLength(0);
    await expect(db.query("update movimientos set monto = 1 where id = $1", [ids.g1])).rejects.toThrow(/cerrado/);
    await expect(pagarCuota({ deuda: ids.libre, fecha: "2026-10-30", capital: 1000, intereses: 0 })).rejects.toThrow(
      /cerrado/,
    );
    await expect(db.query("delete from pagos_deuda where id = $1", [ids.pago1])).rejects.toThrow(/cerrado/);
  });
});

describe("seguridad", () => {
  it("otro usuario no ve ni usa las deudas, préstamos ni reembolsos de Omar", async () => {
    await comoUsuario(db, OTRO);
    for (const v of [
      "deudas",
      "pagos_deuda",
      "prestamos_otorgados",
      "v_estado_deudas",
      "v_prestamos_otorgados",
      "v_reembolsos_pendientes",
    ]) {
      expect(await varios(`select * from ${v}`)).toHaveLength(0);
    }
    const suya = (await uno<{ id: string }>("select id from cuentas where nombre = 'Efectivo'")).id;
    await expect(
      db.query(
        "insert into pagos_deuda (deuda_id, cuenta_origen_id, fecha, monto, a_capital) values ($1, $2, '2026-11-01', 1000, 1000)",
        [ids.libre, suya],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into movimientos (fecha, tipo, monto, cuenta_id, prestamo_otorgado_id) values ('2026-11-01', 'recuperacion_prestamo', 1, $1, $2)",
        [suya, ids.juan],
      ),
    ).rejects.toThrow();
    await comoUsuario(db, OMAR);
  });
});
