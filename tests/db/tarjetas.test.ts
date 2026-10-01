/**
 * Migración 0003 · tarjetas de crédito (doc 03).
 * Recorre el ejemplo del doc 03 §4 contra Postgres real: libro mayor, obligación del mes,
 * pagos ↔ movimientos, vistas y bloqueos.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { comoUsuario, crearBaseDePruebas, crearUsuario } from "./pg-supabase";

const OMAR = "00000000-0000-4000-8000-000000000001";
const OTRO = "00000000-0000-4000-8000-000000000002";

let db: PGlite;
const ids: Record<string, string> = {};

async function uno<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query<T>(sql, params);
  return rows[0];
}
async function varios<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

async function comprar(fecha: string, monto: number, cuotas = 1, tipo = "compra", extra: Record<string, unknown> = {}) {
  return uno<{ id: string }>(
    `insert into compras_tc (tarjeta_id, fecha, tipo, monto, num_cuotas, categoria_id, descripcion, cuenta_destino_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [
      ids.tarjeta,
      fecha,
      tipo,
      monto,
      cuotas,
      tipo === "compra" || tipo === "devolucion" ? (extra.categoria ?? ids.mercado) : null,
      extra.descripcion ?? null,
      extra.destino ?? null,
    ],
  );
}
async function pagar(fecha: string, monto: number, tipo = "otro") {
  return uno<{ id: string; movimiento_id: string }>(
    `insert into pagos_tc (tarjeta_id, cuenta_origen_id, fecha, monto, tipo_elegido)
     values ($1, $2, $3, $4, $5) returning id, movimiento_id`,
    [ids.tarjeta, ids.ahorros, fecha, monto, tipo],
  );
}
const extracto = (id: string) => uno<Record<string, unknown>>("select * from extractos_tc where id = $1", [id]);
const pago = (id: string) => uno<Record<string, unknown>>("select * from pagos_tc where id = $1", [id]);
const estado = () => uno<Record<string, unknown>>("select * from v_estado_tarjetas where id = $1", [ids.tarjeta]);

beforeAll(async () => {
  db = await crearBaseDePruebas();
  await crearUsuario(db, OMAR, "oamoreno31@gmail.com");
  await crearUsuario(db, OTRO, "otro@example.com");
  await comoUsuario(db, OMAR);
  ids.ahorros = (
    await uno<{ id: string }>(
      "insert into cuentas (nombre, tipo, saldo_inicial, fecha_saldo_inicial) values ('Ahorros', 'ahorros', 10000000, '2026-09-01') returning id",
    )
  ).id;
  ids.mercado = (await uno<{ id: string }>("select id from categorias where nombre = 'Mercado'")).id;
  ids.arriendo = (await uno<{ id: string }>("select id from categorias where nombre = 'Arriendo'")).id;
  ids.tarjeta = (
    await uno<{ id: string }>(
      "select crear_tarjeta('Visa Bancolombia', 'visa', '4821', 8000000, 15::smallint, 30::smallint, 0.2682, 32900, $1, 'Bancolombia') as id",
      [ids.ahorros],
    )
  ).id;
}, 60_000);

describe("crear_tarjeta", () => {
  it("crea la cuenta tipo tarjeta y la tarjeta en una sola operación", async () => {
    const t = await uno<{ nombre: string; tipo: string; dia_corte: number; cupo: string }>(
      `select c.nombre, c.tipo, t.dia_corte, t.cupo from tarjetas_credito t join cuentas c on c.id = t.cuenta_id where t.id = $1`,
      [ids.tarjeta],
    );
    expect(t).toMatchObject({ nombre: "Visa Bancolombia", tipo: "tarjeta_credito", dia_corte: 15 });
    expect(n(t.cupo)).toBe(8000000);
  });

  it("rechaza pagar con otra tarjeta y datos inválidos", async () => {
    const cuentaTc = (
      await uno<{ cuenta_id: string }>("select cuenta_id from tarjetas_credito where id = $1", [ids.tarjeta])
    ).cuenta_id;
    await expect(
      db.query("update tarjetas_credito set cuenta_pago_default_id = $1 where id = $2", [cuentaTc, ids.tarjeta]),
    ).rejects.toThrow(/otra tarjeta/);
    await expect(
      db.query("select crear_tarjeta('Mala', 'visa', '12a4', 0, 40::smallint, 5::smallint)"),
    ).rejects.toThrow();
  });
});

describe("ejemplo del doc 03 §4", () => {
  it("las compras solo suman capital y sus cuotas quedan en el calendario", async () => {
    ids.c1 = (await comprar("2026-09-20", 320000)).id;
    ids.c2 = (await comprar("2026-09-28", 2400000, 12)).id;
    ids.c3 = (await comprar("2026-10-03", 180000)).id;
    const e = await estado();
    expect(n(e.capital)).toBe(2900000);
    expect(n(e.otros_pendientes)).toBe(0);
    const cuotas = await varios<{ numero: number; valor: string }>(
      "select numero, valor from v_cuotas_tc where compra_id = $1 order by numero",
      [ids.c2],
    );
    expect(cuotas).toHaveLength(12);
    expect(n(cuotas[0].valor)).toBe(200000);
    const sep = await uno<{ gastos: string; gastos_tc: string }>(
      "select gastos, gastos_tc from v_resumen_periodo where mes = '2026-09-01'",
    );
    expect(n(sep.gastos)).toBe(2720000);
    expect(n(sep.gastos_tc)).toBe(2720000);
  });

  it("el extracto deduce los otros cargos, el capital facturado y el mínimo estimado", async () => {
    ids.e1 = (
      await uno<{ id: string }>(
        `insert into extractos_tc (tarjeta_id, fecha_corte, fecha_limite_pago, pago_total_banco, pago_minimo_banco)
         values ($1, '2026-10-15', '2026-10-30', 2948500, 748500) returning id`,
        [ids.tarjeta],
      )
    ).id;
    const e = await extracto(ids.e1);
    expect(n(e.saldo_sistema_al_corte)).toBe(2900000);
    expect(n(e.otros_generados)).toBe(48500);
    expect(n(e.capital_facturado)).toBe(700000);
    expect(n(e.minimo_estimado)).toBe(748500);
    expect(e.alerta).toBeNull();
    expect(e.estado).toBe("pendiente");
  });

  it("crea la obligación del mes en el mes de la fecha límite (monto = pago mínimo)", async () => {
    const o = await uno<Record<string, unknown>>("select * from v_obligaciones_mes where extracto_id = $1", [ids.e1]);
    expect(o).toMatchObject({
      nombre: "Pago Visa Bancolombia",
      tipo: "tarjeta",
      tarjeta_id: ids.tarjeta,
      pagada: false,
    });
    expect(n(o.monto_esperado)).toBe(748500);
    expect(n(o.pago_total_tc)).toBe(2948500);
    expect(n(o.pago_minimo_tc)).toBe(748500);
    expect(o.fecha_vencimiento).toEqual(new Date("2026-10-30T00:00:00Z"));
    ids.op1 = o.id as string;
  });

  it("los otros cargos son costo financiero del mes del corte", async () => {
    const oct = await uno<Record<string, string>>("select * from v_resumen_periodo where mes = '2026-10-01'");
    expect(n(oct.gastos_tc)).toBe(180000);
    expect(n(oct.costos_financieros_tc)).toBe(48500);
    expect(n(oct.gastos)).toBe(228500);
    const cat = await uno<{ total: string }>(
      "select total from v_gasto_categoria_mes where mes = '2026-10-01' and categoria_nombre = 'Costos financieros TC'",
    );
    expect(n(cat.total)).toBe(48500);
  });

  it("escenario B: pago del mínimo → movimiento de caja ligado, imputación y estados", async () => {
    const p = await pagar("2026-10-25", 748500, "minimo");
    ids.p1 = p.id;
    const mov = await uno<Record<string, unknown>>("select * from movimientos where id = $1", [p.movimiento_id]);
    expect(mov).toMatchObject({
      tipo: "pago_tc",
      cuenta_id: ids.ahorros,
      obligacion_periodo_id: ids.op1,
      descripcion: "Pago Visa Bancolombia",
    });
    expect(n(mov.monto)).toBe(748500);

    const pg = await pago(p.id);
    expect(pg).toMatchObject({ extracto_id: ids.e1, tipo_calculado: "minimo" });
    expect(n(pg.imputado_otros)).toBe(48500);
    expect(n(pg.imputado_capital)).toBe(700000);
    expect((await extracto(ids.e1)).estado).toBe("minimo_cubierto");

    const o = await uno<Record<string, unknown>>("select pagada, pendiente from v_obligaciones_mes where id = $1", [
      ids.op1,
    ]);
    expect(o.pagada).toBe(true);
    expect(n(o.pendiente)).toBe(0);

    const e = await estado();
    expect(n(e.capital)).toBe(2200000);
    expect(n(e.otros_pendientes)).toBe(0);
    expect(n(e.deuda_total)).toBe(2200000);

    const oct = await uno<Record<string, string>>("select * from v_resumen_periodo where mes = '2026-10-01'");
    expect(n(oct.pagos_tc)).toBe(748500);
    expect(n(oct.gastos)).toBe(228500); // sin doble conteo: el pago no es gasto
    expect(n(oct.salidas_caja)).toBe(748500);
    const s = await uno<{ saldo: string }>("select saldo from v_saldos_cuentas where id = $1", [ids.ahorros]);
    expect(n(s.saldo)).toBe(10000000 - 748500);
  });

  it("editar el monto del pago actualiza su movimiento y reclasifica (escenario C)", async () => {
    await db.query("update pagos_tc set monto = 1500000 where id = $1", [ids.p1]);
    const pg = await pago(ids.p1);
    expect(pg.tipo_calculado).toBe("otro");
    expect(n(pg.imputado_capital)).toBe(1451500);
    const mov = await uno<{ monto: string }>("select monto from movimientos where id = $1", [pg.movimiento_id]);
    expect(n(mov.monto)).toBe(1500000);
    expect(n((await estado()).capital)).toBe(1448500);
  });

  it("dos pagos que suman el total dejan el extracto pagado (escenario A)", async () => {
    const p2 = await pagar("2026-10-28", 1448500);
    expect((await pago(p2.id)).tipo_calculado).toBe("total");
    expect((await extracto(ids.e1)).estado).toBe("pagado_total");
    expect(n((await estado()).deuda_total)).toBe(0);
    await db.query("delete from pagos_tc where id = $1", [p2.id]);
    expect(await uno("select id from movimientos where id = $1", [p2.movimiento_id])).toBeUndefined();
    expect((await extracto(ids.e1)).estado).toBe("minimo_cubierto");
  });

  it("borrar el movimiento desde la lista borra el pago y recalcula", async () => {
    const p3 = await pagar("2026-10-29", 100000);
    await db.query("delete from movimientos where id = $1", [p3.movimiento_id]);
    expect(await pago(p3.id)).toBeUndefined();
    expect(n((await estado()).capital)).toBe(1448500);
  });

  it("el pago del extracto de noviembre deja ver los intereses", async () => {
    // Deshacer el cambio del escenario C para seguir el hilo del escenario B.
    await db.query("update pagos_tc set monto = 748500 where id = $1", [ids.p1]);
    ids.c4 = (await comprar("2026-11-01", 450000)).id;
    ids.e2 = (
      await uno<{ id: string }>(
        `insert into extractos_tc (tarjeta_id, fecha_corte, fecha_limite_pago, pago_total_banco, pago_minimo_banco, intereses, cuota_manejo)
         values ($1, '2026-11-15', '2026-11-30', 2711300, 711300, 28400, 32900) returning id`,
        [ids.tarjeta],
      )
    ).id;
    const e2 = await extracto(ids.e2);
    expect(n(e2.saldo_sistema_al_corte)).toBe(2650000);
    expect(n(e2.otros_generados)).toBe(61300);
    expect(n(e2.capital_facturado)).toBe(650000);
    expect(n(e2.diferencia_no_explicada)).toBe(0);
    const e = await estado();
    expect(e.ultimo_extracto_id).toBe(ids.e2);
    expect(n(e.costo_financiero_total)).toBe(109800);
  });
});

describe("reglas y bloqueos", () => {
  it("no se puede crear ni editar un movimiento pago_tc por fuera del módulo", async () => {
    const cuentaTc = (
      await uno<{ cuenta_id: string }>("select cuenta_id from tarjetas_credito where id = $1", [ids.tarjeta])
    ).cuenta_id;
    await expect(
      db.query(
        "insert into movimientos (fecha, tipo, monto, cuenta_id, cuenta_destino_id) values ('2026-10-10', 'pago_tc', 1000, $1, $2)",
        [ids.ahorros, cuentaTc],
      ),
    ).rejects.toThrow(/módulo de tarjetas/);
    const { movimiento_id } = await pago(ids.p1);
    await expect(db.query("update movimientos set monto = 1 where id = $1", [movimiento_id])).rejects.toThrow(
      /módulo de tarjetas/,
    );
    await expect(
      db.query(
        "insert into movimientos (fecha, tipo, monto, cuenta_id, categoria_id, obligacion_periodo_id) values ('2026-10-10', 'gasto', 1000, $1, $2, $3)",
        [ids.ahorros, ids.arriendo, ids.op1],
      ),
    ).rejects.toThrow();
  });

  it("valida categoría de gasto, descripción de ajustes y montos", async () => {
    const sueldo = (await uno<{ id: string }>("select id from categorias where nombre = 'Sueldo / honorarios'")).id;
    await expect(comprar("2026-10-05", 1000, 1, "compra", { categoria: sueldo })).rejects.toThrow(/no es de gasto/);
    await expect(comprar("2026-10-05", -1000, 1, "ajuste")).rejects.toThrow(/motivo/);
    await expect(comprar("2026-10-05", -1000, 1, "compra")).rejects.toThrow();
    const aj = await comprar("2026-10-05", -1000, 1, "ajuste", { descripcion: "Ajuste de centavos" });
    expect(
      n(
        (await uno<{ categoria_id: string | null }>("select categoria_id from compras_tc where id = $1", [aj.id]))
          .categoria_id,
      ),
    ).toBeNull();
    await db.query("delete from compras_tc where id = $1", [aj.id]);
  });

  it("un avance suma capital y entra como dinero a la cuenta destino", async () => {
    const antes = n(
      (await uno<{ saldo: string }>("select saldo from v_saldos_cuentas where id = $1", [ids.ahorros])).saldo,
    )!;
    const av = await comprar("2026-11-05", 300000, 1, "avance", { destino: ids.ahorros });
    const despues = n(
      (await uno<{ saldo: string }>("select saldo from v_saldos_cuentas where id = $1", [ids.ahorros])).saldo,
    )!;
    expect(despues - antes).toBe(300000);
    const nov = await uno<Record<string, string>>("select gastos_tc from v_resumen_periodo where mes = '2026-11-01'");
    expect(n(nov.gastos_tc)).toBe(450000); // el avance no es gasto de consumo
    await db.query("delete from compras_tc where id = $1", [av.id]);
  });

  it("otro usuario no ve ni toca las tarjetas de Omar", async () => {
    await comoUsuario(db, OTRO);
    expect(await varios("select * from tarjetas_credito")).toHaveLength(0);
    expect(await varios("select * from v_estado_tarjetas")).toHaveLength(0);
    expect(await varios("select * from compras_tc")).toHaveLength(0);
    const cuentaOtro = (await uno<{ id: string }>("select id from cuentas where nombre = 'Efectivo'")).id;
    await expect(
      db.query(
        "insert into pagos_tc (tarjeta_id, cuenta_origen_id, fecha, monto) values ($1, $2, '2026-10-10', 1000)",
        [ids.tarjeta, cuentaOtro],
      ),
    ).rejects.toThrow();
    await comoUsuario(db, OMAR);
  });

  it("un pago mayor a la deuda deja saldo a favor (capital negativo)", async () => {
    const e = await estado();
    const deuda = n(e.deuda_total)!;
    const p = await pagar("2026-11-28", deuda + 50000);
    expect(n((await pago(p.id)).saldo_a_favor)).toBe(50000);
    expect(n((await estado()).capital)).toBe(-50000);
    await db.query("delete from pagos_tc where id = $1", [p.id]);
  });

  it("mes cerrado: no admite compras ni pagos nuevos, pero la obligación TC se arrastra y el pago la sigue", async () => {
    await db.query("select generar_periodo('2026-11-01')");
    await db.query("select generar_periodo('2026-12-01')");
    const op2 = await uno<{ id: string }>("select id from obligaciones_periodo where extracto_id = $1", [ids.e2]);
    const pendientes = await varios<{ id: string }>(
      `select v.id from v_obligaciones_mes v where v.mes = '2026-11-01' and v.resolucion is null and not v.pagada`,
    );
    await db.query("select cerrar_periodo((select id from periodos where mes = '2026-11-01'), $1::jsonb)", [
      JSON.stringify(pendientes.map((p) => ({ id: p.id, accion: "arrastrar" }))),
    ]);
    await expect(comprar("2026-11-20", 1000)).rejects.toThrow(/cerrado/);
    await expect(pagar("2026-11-20", 1000)).rejects.toThrow(/cerrado/);
    await expect(db.query("delete from pagos_tc where id = $1", [ids.p1])).resolves.toBeDefined(); // octubre sigue abierto

    const copia = await uno<{ id: string; periodo_id: string }>(
      "select id from obligaciones_periodo where arrastrada_de_id = $1",
      [op2.id],
    );
    expect(copia).toBeDefined();
    const p = await pagar("2026-12-03", 711300);
    const mov = await uno<{ obligacion_periodo_id: string }>(
      "select obligacion_periodo_id from movimientos where id = $1",
      [p.movimiento_id],
    );
    expect(mov.obligacion_periodo_id).toBe(copia.id);
    expect((await pago(p.id)).extracto_id).toBe(ids.e2);
  });

  it("el extracto de un mes cerrado no se edita, pero se sigue recalculando", async () => {
    await db.query(
      `insert into extractos_tc (tarjeta_id, fecha_corte, fecha_limite_pago, pago_total_banco, pago_minimo_banco)
       values ($1, '2026-12-15', '2026-12-30', 100, 100)`,
      [ids.tarjeta],
    );
    await expect(db.query("update extractos_tc set pago_total_banco = 1 where id = $1", [ids.e2])).rejects.toThrow(
      /cerrado/,
    );
    expect(n((await extracto(ids.e2)).pagado)).toBeGreaterThan(0);
  });
});
