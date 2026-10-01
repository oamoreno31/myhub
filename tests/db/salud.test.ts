/**
 * Migración 0006 · salud financiera: insumos de indicadores, metas y foto de cierre v3.
 * Escenario: julio (mes anterior, para el gasto esencial) y agosto completo.
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
const periodo = async (mes: string) => (await uno<{ id: string }>("select generar_periodo($1::date) as id", [mes])).id;
const insumos = async (mes: string) =>
  (await uno<{ j: Record<string, unknown> }>("select insumos_salud($1) as j", [await periodo(mes)])).j;

beforeAll(async () => {
  db = await crearBaseDePruebas();
  await crearUsuario(db, OMAR, "oamoreno31@gmail.com");
  await crearUsuario(db, OTRO, "otro@example.com");
  await comoUsuario(db, OMAR);
  ids.ahorros = (
    await uno<{ id: string }>(
      "insert into cuentas (nombre, tipo, saldo_inicial, fecha_saldo_inicial) values ('Ahorros', 'ahorros', 3000000, '2026-07-01') returning id",
    )
  ).id;
  ids.coop = (
    await uno<{ id: string }>(
      "insert into cuentas (nombre, tipo, saldo_inicial, fecha_saldo_inicial) values ('Aportes', 'cooperativa', 900000, '2026-07-01') returning id",
    )
  ).id;

  const gasto = `insert into movimientos (fecha, tipo, monto, cuenta_id, categoria_id, descripcion, reembolsable)
                 values ($1, $2, $3, $4, $5, $6, $7)`;
  const mov = async (
    fecha: string,
    tipo: string,
    monto: number,
    categoria: string,
    reemb = false,
    desc: string | null = null,
  ) => db.query(gasto, [fecha, tipo, monto, ids.ahorros, await cat(categoria), desc, reemb]);

  // Julio: gasto esencial 2.000.000 (arriendo + mercado)
  await mov("2026-07-01", "ingreso", 5000000, "Sueldo / honorarios");
  await mov("2026-07-03", "gasto", 1500000, "Arriendo");
  await mov("2026-07-10", "gasto", 500000, "Mercado");

  // Agosto
  await mov("2026-08-01", "ingreso", 5000000, "Sueldo / honorarios");
  await mov("2026-08-03", "gasto", 1500000, "Arriendo");
  await mov("2026-08-12", "gasto", 300000, "Restaurantes y domicilios");
  await mov("2026-08-15", "gasto", 400000, "Ahorro y metas");
  await mov("2026-08-18", "gasto", 100000, "Devtopia – otros gastos", true, "Hosting");

  // Tarjeta: compra de 1.200.000, extracto con 50.000 de otros cargos, pago del mínimo a tiempo
  ids.tarjeta = (
    await uno<{ id: string }>("select crear_tarjeta('Visa', 'visa', null, 4000000, 15::smallint, 30::smallint) as id")
  ).id;
  await db.query(
    `insert into compras_tc (tarjeta_id, fecha, tipo, monto, num_cuotas, categoria_id, comercio)
     values ($1, '2026-08-03', 'compra', 1200000, 1, $2, 'Éxito')`,
    [ids.tarjeta, await cat("Mercado")],
  );
  await db.query(
    `insert into extractos_tc (tarjeta_id, fecha_corte, fecha_limite_pago, pago_total_banco, pago_minimo_banco)
     values ($1, '2026-08-15', '2026-08-30', 1250000, 150000)`,
    [ids.tarjeta],
  );
  await db.query(
    "insert into pagos_tc (tarjeta_id, cuenta_origen_id, fecha, monto) values ($1, $2, '2026-08-28', 150000)",
    [ids.tarjeta, ids.ahorros],
  );

  // Internet (pagado tarde) y cuota de cooperativa (con aporte social) sin pagar
  await db.query(
    `insert into obligaciones (nombre, tipo, categoria_id, monto_estimado, dia_vencimiento, fecha_inicio, cuenta_default_id)
     values ('Internet', 'telecom', $1, 100000, 10, '2026-08-01', $2)`,
    [await cat("Internet"), ids.ahorros],
  );
  ids.deuda = (
    await uno<{ id: string }>(
      `insert into deudas (nombre, tipo, monto_original, fecha_desembolso, tasa_ea, plazo_meses, cuota, aporte_mensual,
          cuenta_aportes_id, dia_pago, saldo_inicial, fecha_saldo_inicial)
       values ('Crédito Coomeva', 'cooperativa', 6000000, '2025-06-10', 0.18, 36, 214000, 80000, $1, 20, 4000000, '2026-07-01')
       returning id`,
      [ids.coop],
    )
  ).id;
  await db.query(
    `insert into obligaciones (nombre, tipo, categoria_id, monto_estimado, dia_vencimiento, fecha_inicio, deuda_id, cuenta_default_id)
     values ('Crédito Coomeva', 'cooperativa', $1, 294000, 20, '2026-08-01', $2, $3)`,
    [await cat("Cooperativas"), ids.deuda, ids.ahorros],
  );
  const agosto = await periodo("2026-08-01");
  const internet = await uno<{ id: string }>(
    "select id from v_obligaciones_mes where periodo_id = $1 and nombre = 'Internet'",
    [agosto],
  );
  await db.query(
    `insert into movimientos (fecha, tipo, monto, cuenta_id, categoria_id, obligacion_periodo_id)
     values ('2026-08-12', 'gasto', 100000, $1, $2, $3)`,
    [ids.ahorros, await cat("Internet"), internet.id],
  );
}, 60_000);

describe("insumos de salud financiera", () => {
  it("calcula las cifras del mes sin reembolsables ni ahorro como consumo", async () => {
    const j = await insumos("2026-08-01");
    expect({
      ingresos: n(j.ingresos),
      // arriendo 1.5M + restaurantes 300k + mercado TC 1.2M + internet 100k + otros cargos 50k
      gasto_personal: n(j.gasto_personal),
      ahorro_registrado: n(j.ahorro_registrado),
      costo_financiero: n(j.costo_financiero),
      // mínimo Visa 150k + cuota Coomeva sin aporte 214k
      pagos_deuda: n(j.pagos_deuda),
      // internet 100k + Visa 150k + Coomeva 214k
      obligaciones_fijas: n(j.obligaciones_fijas),
      gasto_esencial: n(j.gasto_esencial),
      deuda_tc: n(j.deuda_tc),
      cupo_tc: n(j.cupo_tc),
    }).toEqual({
      ingresos: 5000000,
      gasto_personal: 3150000,
      ahorro_registrado: 400000,
      costo_financiero: 50000,
      pagos_deuda: 364000,
      obligaciones_fijas: 464000,
      gasto_esencial: 2000000,
      deuda_tc: 1100000,
      cupo_tc: 4000000,
    });
  });

  it("puntualidad y forma de pago de la tarjeta", async () => {
    const j = await insumos("2026-08-01");
    // Internet tarde, Visa a tiempo (mínimo), Coomeva vencida sin pagar
    expect([n(j.oblig_evaluables), n(j.oblig_a_tiempo)]).toEqual([3, 1]);
    expect([n(j.tc_total), n(j.tc_otro), n(j.tc_minimo)]).toEqual([0, 0, 1]);
  });

  it("ahorro líquido excluye aportes de cooperativa y tarjetas", async () => {
    const j = await insumos("2026-08-01");
    // 3M + 5M − 2M (jul) + 5M − 1.5M − 0.3M − 0.4M − 0.1M − 0.15M − 0.1M (ago)
    expect(n(j.ahorro_liquido)).toBe(8450000);
  });

  it("sin meses anteriores, el gasto esencial es el del mismo mes", async () => {
    const j = await insumos("2026-07-01");
    expect(n(j.gasto_esencial)).toBe(2000000);
  });

  it("el cierre guarda los insumos en la foto (versión 3)", async () => {
    const agosto = await periodo("2026-08-01");
    const coop = await uno<{ id: string }>(
      "select id from v_obligaciones_mes where periodo_id = $1 and nombre = 'Crédito Coomeva'",
      [agosto],
    );
    const foto = await uno<{ s: Record<string, unknown> }>("select cerrar_periodo($1, $2) as s", [
      agosto,
      JSON.stringify([{ id: coop.id, accion: "omitir", motivo: "Se pagó por nómina" }]),
    ]);
    expect(foto.s.version).toBe(3);
    const salud = foto.s.salud as Record<string, unknown>;
    // La cuota omitida ya no cuenta para la puntualidad
    expect([n(salud.oblig_evaluables), n(salud.oblig_a_tiempo)]).toEqual([2, 1]);
    expect(n(salud.gasto_personal)).toBe(3150000);
    expect((foto.s.patrimonio as Record<string, unknown>).patrimonio).toBeDefined();
  });
});

describe("metas", () => {
  it("avance: saldo de la cuenta o lo pagado de la deuda", async () => {
    await db.query(
      `insert into metas (nombre, tipo, monto_objetivo, cuenta_id, aporte_mensual) values
       ('Fondo de emergencia', 'fondo_emergencia', 12000000, $1, 500000)`,
      [ids.ahorros],
    );
    await db.query(
      "insert into metas (nombre, tipo, monto_objetivo, deuda_id) values ('Salir de Coomeva', 'pagar_deuda', 4000000, $1)",
      [ids.deuda],
    );
    const filas = (
      await db.query<{ nombre: string; actual: string; cuenta_nombre: string | null; deuda_saldo: string | null }>(
        "select nombre, actual, cuenta_nombre, deuda_saldo from v_metas order by nombre",
      )
    ).rows;
    expect(filas.map((f) => [f.nombre, n(f.actual), f.cuenta_nombre, n(f.deuda_saldo)])).toEqual([
      ["Fondo de emergencia", 8450000, "Ahorros", null],
      ["Salir de Coomeva", 0, null, 4000000],
    ]);
  });

  it("valida tipo, cuenta y dueño", async () => {
    await expect(
      db.query("insert into metas (nombre, tipo, monto_objetivo) values ('Sin cuenta', 'ahorro', 1000)"),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into metas (nombre, tipo, monto_objetivo, cuenta_id) values ('Deuda sin deuda', 'pagar_deuda', 1000, $1)",
        [ids.ahorros],
      ),
    ).rejects.toThrow();
    const tc = await uno<{ cuenta_id: string }>("select cuenta_id from tarjetas_credito where id = $1", [ids.tarjeta]);
    await expect(
      db.query(
        "insert into metas (nombre, tipo, monto_objetivo, cuenta_id) values ('En tarjeta', 'ahorro', 1000, $1)",
        [tc.cuenta_id],
      ),
    ).rejects.toThrow(/tarjeta de crédito/);
  });

  it("RLS: otro usuario no ve metas ni puede usar mis cuentas", async () => {
    await comoUsuario(db, OTRO);
    expect(n((await uno<{ c: string }>("select count(*) as c from v_metas")).c)).toBe(0);
    await expect(
      db.query("insert into metas (nombre, tipo, monto_objetivo, cuenta_id) values ('Ajena', 'ahorro', 1000, $1)", [
        ids.ahorros,
      ]),
    ).rejects.toThrow();
    await comoUsuario(db, OMAR);
  });
});
