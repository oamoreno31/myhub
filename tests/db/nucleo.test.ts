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
const cat = async (nombre: string) =>
  (await uno<{ id: string }>("select id from categorias where nombre = $1", [nombre])).id;

async function obligacionDelMes(nombre: string, mes: string) {
  return uno<{
    id: string;
    monto_esperado: string;
    pagado: string;
    pendiente: string;
    pagada: boolean;
    fecha_vencimiento: Date;
    resolucion: string | null;
  }>(`select v.* from v_obligaciones_mes v where v.nombre = $1 and v.mes = $2 and v.arrastrada_de_id is null`, [
    nombre,
    mes,
  ]);
}

async function mover(p: {
  fecha: string;
  tipo: "ingreso" | "gasto" | "transferencia";
  monto: number;
  cuenta?: string;
  destino?: string | null;
  categoria?: string | null;
  obligacion?: string | null;
  descripcion?: string | null;
}) {
  return uno<{ id: string; periodo_id: string }>(
    `insert into movimientos (fecha, tipo, monto, cuenta_id, cuenta_destino_id, categoria_id, obligacion_periodo_id, descripcion)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id, periodo_id`,
    [
      p.fecha,
      p.tipo,
      p.monto,
      p.cuenta ?? ids.ahorros,
      p.destino ?? null,
      p.categoria ?? null,
      p.obligacion ?? null,
      p.descripcion ?? null,
    ],
  );
}

beforeAll(async () => {
  db = await crearBaseDePruebas();
  await crearUsuario(db, OMAR, "oamoreno31@gmail.com");
  await crearUsuario(db, OTRO, "otro@example.com");

  await comoUsuario(db, OTRO);
  ids.cuentaOtro = (await uno<{ id: string }>("select id from cuentas where nombre = 'Efectivo'")).id;

  await comoUsuario(db, OMAR);
  ids.efectivo = (await uno<{ id: string }>("select id from cuentas where nombre = 'Efectivo'")).id;
  ids.ahorros = (
    await uno<{ id: string }>(
      "insert into cuentas (nombre, tipo, saldo_inicial, fecha_saldo_inicial) values ('Ahorros', 'ahorros', 1000000, '2026-09-01') returning id",
    )
  ).id;
  ids.visa = (
    await uno<{ id: string }>("insert into cuentas (nombre, tipo) values ('Visa', 'tarjeta_credito') returning id")
  ).id;
  for (const n of [
    "Arriendo",
    "Agua",
    "Energía (luz)",
    "Sueldo / honorarios",
    "Otros gastos",
    "Mercado",
    "Recuperación de préstamos",
  ]) {
    ids[n] = await cat(n);
  }

  const plantilla = `insert into obligaciones (nombre, tipo, categoria_id, monto_estimado, es_variable, estimar_con_promedio,
      dia_vencimiento, frecuencia, fecha_inicio, cuenta_default_id) values ($1,$2,$3,$4,$5,$6,$7,$8,'2026-09-01',$9) returning id`;
  await db.query(plantilla, ["Arriendo", "arriendo", ids.Arriendo, 1800000, false, false, 5, "mensual", ids.ahorros]);
  await db.query(plantilla, ["Agua", "servicio", ids.Agua, 96300, true, false, 18, "bimestral", ids.ahorros]);
  await db.query(plantilla, [
    "Energía",
    "servicio",
    ids["Energía (luz)"],
    142000,
    true,
    true,
    31,
    "mensual",
    ids.ahorros,
  ]);
  await db.query(plantilla, [
    "Sueldo",
    "ingreso_esperado",
    ids["Sueldo / honorarios"],
    9000000,
    false,
    false,
    1,
    "mensual",
    ids.ahorros,
  ]);
}, 60_000);

describe("frecuencias y fechas", () => {
  it("calcula en qué meses aplica cada frecuencia", async () => {
    const r = await uno<{ sep: boolean; oct: boolean; nov: boolean; ago: boolean; anual: boolean }>(`select
      obligacion_aplica('bimestral', '2026-09-01', '2026-09-01', null, '2026-09-01') as sep,
      obligacion_aplica('bimestral', '2026-09-01', '2026-09-01', null, '2026-10-01') as oct,
      obligacion_aplica('bimestral', '2026-09-01', '2026-09-01', null, '2026-11-01') as nov,
      obligacion_aplica('mensual',   '2026-09-01', '2026-09-01', null, '2026-08-01') as ago,
      obligacion_aplica('anual',     '2025-03-01', '2025-03-01', null, '2027-03-01') as anual`);
    expect(r).toEqual({ sep: true, oct: false, nov: true, ago: false, anual: true });
  });

  it("respeta la fecha fin", async () => {
    const r = await uno<{ a: boolean; b: boolean }>(`select
      obligacion_aplica('mensual', '2026-01-01', '2026-01-01', '2026-06-30', '2026-06-01') as a,
      obligacion_aplica('mensual', '2026-01-01', '2026-01-01', '2026-06-30', '2026-07-01') as b`);
    expect(r).toEqual({ a: true, b: false });
  });

  it("ajusta el día 31 al último día del mes", async () => {
    const r = await uno<{ sep: string; feb: string }>(
      "select fecha_en_mes('2026-09-01', 31::smallint)::text as sep, fecha_en_mes('2027-02-01', 30::smallint)::text as feb",
    );
    expect(r).toEqual({ sep: "2026-09-30", feb: "2027-02-28" });
  });
});

describe("plantillas", () => {
  it("exige que la categoría coincida con el tipo", async () => {
    await comoUsuario(db, OMAR);
    await expect(
      db.query(
        "insert into obligaciones (nombre, tipo, categoria_id, dia_vencimiento) values ('Mal', 'ingreso_esperado', $1, 5)",
        [ids.Arriendo],
      ),
    ).rejects.toThrow(/categoría debe ser de ingreso/);
  });

  it("no acepta categorías de otro usuario", async () => {
    await comoUsuario(db, OTRO);
    await expect(
      db.query("insert into obligaciones (nombre, tipo, categoria_id, dia_vencimiento) values ('X', 'otro', $1, 5)", [
        ids.Arriendo,
      ]),
    ).rejects.toThrow(/no encontrada/);
  });
});

describe("generar_periodo", () => {
  it("crea las obligaciones del mes desde las plantillas", async () => {
    await comoUsuario(db, OMAR);
    await db.query("select generar_periodo('2026-09-15')");
    const filas = await varios<{ nombre: string; fecha: string; monto: string }>(
      "select nombre, fecha_vencimiento::text as fecha, monto_esperado::text as monto from v_obligaciones_mes where mes = '2026-09-01' order by nombre",
    );
    expect(filas).toEqual([
      { nombre: "Agua", fecha: "2026-09-18", monto: "96300.00" },
      { nombre: "Arriendo", fecha: "2026-09-05", monto: "1800000.00" },
      { nombre: "Energía", fecha: "2026-09-30", monto: "142000.00" },
      { nombre: "Sueldo", fecha: "2026-09-01", monto: "9000000.00" },
    ]);
  });

  it("es idempotente", async () => {
    await comoUsuario(db, OMAR);
    await db.query("select generar_periodo('2026-09-01')");
    const r = await uno<{ n: number }>("select count(*)::int as n from obligaciones_periodo");
    expect(r.n).toBe(4);
  });

  it("omite el agua en los meses que no le corresponden", async () => {
    await comoUsuario(db, OMAR);
    await db.query("select generar_periodo('2026-10-01')");
    await db.query("select generar_periodo('2026-11-01')");
    const r = await varios<{ mes: string; n: number }>(
      "select mes::text, count(*)::int as n from v_obligaciones_mes where nombre = 'Agua' group by mes order by mes",
    );
    expect(r).toEqual([
      { mes: "2026-09-01", n: 1 },
      { mes: "2026-11-01", n: 1 },
    ]);
  });

  it("no está disponible para usuarios la versión administrativa", async () => {
    await comoUsuario(db, OMAR);
    await expect(db.query("select generar_periodo_de_usuario($1, '2026-12-01')", [OMAR])).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.query("select generar_periodo_todos('2026-12-01')")).rejects.toThrow(/permission denied/);
  });
});

describe("movimientos", () => {
  it("un pago completo deja la obligación pagada", async () => {
    await comoUsuario(db, OMAR);
    const arriendo = await obligacionDelMes("Arriendo", "2026-09-01");
    await mover({
      fecha: "2026-09-05",
      tipo: "gasto",
      monto: 1800000,
      categoria: ids.Arriendo,
      obligacion: arriendo.id,
    });
    const v = await obligacionDelMes("Arriendo", "2026-09-01");
    expect(v.pagada).toBe(true);
    expect(Number(v.pendiente)).toBe(0);
  });

  it("un pago parcial deja saldo pendiente", async () => {
    await comoUsuario(db, OMAR);
    const energia = await obligacionDelMes("Energía", "2026-09-01");
    await mover({
      fecha: "2026-09-12",
      tipo: "gasto",
      monto: 100000,
      categoria: ids["Energía (luz)"],
      obligacion: energia.id,
    });
    const v = await obligacionDelMes("Energía", "2026-09-01");
    expect(v.pagada).toBe(false);
    expect(Number(v.pagado)).toBe(100000);
    expect(Number(v.pendiente)).toBe(42000);
  });

  it("asigna el periodo según la fecha, aunque pague una obligación de otro mes", async () => {
    await comoUsuario(db, OMAR);
    const sueldo = await obligacionDelMes("Sueldo", "2026-09-01");
    const m = await mover({
      fecha: "2026-09-01",
      tipo: "ingreso",
      monto: 9000000,
      categoria: ids["Sueldo / honorarios"],
      obligacion: sueldo.id,
    });
    const p = await uno<{ mes: string }>("select mes::text from periodos where id = $1", [m.periodo_id]);
    expect(p.mes).toBe("2026-09-01");
    const otroMes = await mover({
      fecha: "2026-10-02",
      tipo: "gasto",
      monto: 38750,
      categoria: ids["Energía (luz)"],
      obligacion: (await obligacionDelMes("Energía", "2026-09-01")).id,
    });
    const p2 = await uno<{ mes: string }>("select mes::text from periodos where id = $1", [otroMes.periodo_id]);
    expect(p2.mes).toBe("2026-10-01");
    await db.query("delete from movimientos where id = $1", [otroMes.id]);
  });

  it("valida categoría, descripción, cuentas y obligaciones", async () => {
    await comoUsuario(db, OMAR);
    await expect(
      mover({ fecha: "2026-09-10", tipo: "gasto", monto: 1000, categoria: ids["Sueldo / honorarios"] }),
    ).rejects.toThrow(/no es de gasto/);
    await expect(
      mover({ fecha: "2026-09-10", tipo: "gasto", monto: 1000, categoria: ids["Otros gastos"] }),
    ).rejects.toThrow(/requiere una descripción/);
    await expect(
      mover({ fecha: "2026-09-10", tipo: "gasto", monto: 1000, categoria: ids.Mercado, cuenta: ids.visa }),
    ).rejects.toThrow(/módulo de tarjetas/);
    await expect(
      mover({ fecha: "2026-09-10", tipo: "gasto", monto: 1000, categoria: ids.Mercado, cuenta: ids.cuentaOtro }),
    ).rejects.toThrow(/no encontrada/);
    await expect(mover({ fecha: "2026-09-10", tipo: "gasto", monto: 0, categoria: ids.Mercado })).rejects.toThrow(
      /check/,
    );
    await expect(
      mover({ fecha: "2026-09-10", tipo: "transferencia", monto: 1000, destino: ids.ahorros }),
    ).rejects.toThrow(/distinta/);
    const sueldo = await obligacionDelMes("Sueldo", "2026-09-01");
    await expect(
      mover({ fecha: "2026-09-10", tipo: "gasto", monto: 1000, categoria: ids.Mercado, obligacion: sueldo.id }),
    ).rejects.toThrow(/no corresponde/);
  });

  it("acepta gastos, otros gastos con descripción y transferencias", async () => {
    await comoUsuario(db, OMAR);
    await mover({ fecha: "2026-09-14", tipo: "gasto", monto: 250000, categoria: ids.Mercado, cuenta: ids.efectivo });
    await mover({
      fecha: "2026-09-15",
      tipo: "gasto",
      monto: 50000,
      categoria: ids["Otros gastos"],
      descripcion: "Regalo",
    });
    await mover({
      fecha: "2026-09-16",
      tipo: "transferencia",
      monto: 300000,
      cuenta: ids.ahorros,
      destino: ids.efectivo,
    });
    await mover({ fecha: "2026-09-20", tipo: "ingreso", monto: 200000, categoria: ids["Recuperación de préstamos"] });
  });

  it("calcula saldos por cuenta", async () => {
    await comoUsuario(db, OMAR);
    const saldos = await varios<{ nombre: string; saldo: string }>(
      "select nombre, saldo::text from v_saldos_cuentas where nombre in ('Ahorros', 'Efectivo') order by nombre",
    );
    // Ahorros: 1.000.000 + 9.000.000 + 200.000 − 1.800.000 − 100.000 − 50.000 − 300.000
    // Efectivo: 0 + 300.000 − 250.000
    expect(saldos).toEqual([
      { nombre: "Ahorros", saldo: "7950000.00" },
      { nombre: "Efectivo", saldo: "50000.00" },
    ]);
  });

  it("resume el mes separando ingreso operativo y recuperaciones", async () => {
    await comoUsuario(db, OMAR);
    const r = await uno<Record<string, string | number>>("select * from v_resumen_periodo where mes = '2026-09-01'");
    expect(Number(r.ingresos)).toBe(9000000);
    expect(Number(r.recuperaciones)).toBe(200000);
    expect(Number(r.gastos)).toBe(1800000 + 100000 + 250000 + 50000);
    expect(r.obligaciones_total).toBe(3);
    expect(r.obligaciones_pagadas).toBe(1);
    expect(r.obligaciones_pendientes).toBe(2);
    expect(Number(r.monto_pendiente_obligaciones)).toBe(96300 + 42000);
    expect(Number(r.ingresos_esperados_recibidos)).toBe(9000000);
  });

  it("estima las obligaciones variables con el promedio pagado", async () => {
    await comoUsuario(db, OMAR);
    await db.query("select generar_periodo('2026-12-01')");
    const dic = await obligacionDelMes("Energía", "2026-12-01");
    expect(Number(dic.monto_esperado)).toBe(100000);
  });

  it("agrupa el gasto por categoría", async () => {
    await comoUsuario(db, OMAR);
    const r = await varios<{ categoria_nombre: string; padre_nombre: string | null; total: string }>(
      "select v.categoria_nombre, v.padre_nombre, v.total::text as total from v_gasto_categoria_mes v where v.mes = '2026-09-01' order by v.total desc",
    );
    expect(r[0]).toEqual({ categoria_nombre: "Arriendo", padre_nombre: null, total: "1800000.00" });
    expect(r.find((x) => x.categoria_nombre === "Mercado")?.padre_nombre).toBe("Otros gastos");
  });
});

describe("cierre de mes", () => {
  it("no cierra si quedan pendientes sin decisión", async () => {
    await comoUsuario(db, OMAR);
    const p = await uno<{ id: string }>("select id from periodos where mes = '2026-09-01'");
    await expect(db.query("select cerrar_periodo($1)", [p.id])).rejects.toThrow(/Quedan 2 obligaciones/);
  });

  it("cierra omitiendo y arrastrando pendientes", async () => {
    await comoUsuario(db, OMAR);
    const p = await uno<{ id: string }>("select id from periodos where mes = '2026-09-01'");
    const agua = await obligacionDelMes("Agua", "2026-09-01");
    const energia = await obligacionDelMes("Energía", "2026-09-01");
    const decisiones = [
      { id: agua.id, accion: "omitir", motivo: "Factura llegó tarde, se paga en noviembre" },
      { id: energia.id, accion: "arrastrar" },
    ];
    const r = await uno<{ snap: Record<string, unknown> }>("select cerrar_periodo($1, $2::jsonb) as snap", [
      p.id,
      JSON.stringify(decisiones),
    ]);
    expect(Number(r.snap.ingresos)).toBe(9000000);
    expect(r.snap.obligaciones_arrastradas).toBe(1);

    const estado = await uno<{ estado: string }>("select estado from periodos where id = $1", [p.id]);
    expect(estado.estado).toBe("cerrado");

    const arrastrada = await uno<{ monto_esperado: string; fecha: string; mes: string }>(
      "select monto_esperado, fecha_vencimiento::text as fecha, mes::text from v_obligaciones_mes where arrastrada_de_id = $1",
      [energia.id],
    );
    expect(arrastrada).toEqual({ monto_esperado: "42000.00", fecha: "2026-09-30", mes: "2026-10-01" });
  });

  it("bloquea cambios en el mes cerrado", async () => {
    await comoUsuario(db, OMAR);
    await expect(mover({ fecha: "2026-09-28", tipo: "gasto", monto: 1000, categoria: ids.Mercado })).rejects.toThrow(
      /está cerrado/,
    );
    await expect(db.query("update movimientos set monto = 1 where fecha = '2026-09-14'")).rejects.toThrow(
      /está cerrado/,
    );
    await expect(db.query("delete from movimientos where fecha = '2026-09-14'")).rejects.toThrow(/está cerrado/);
    await expect(
      db.query(
        "update obligaciones_periodo set nota = 'x' where periodo_id = (select id from periodos where mes = '2026-09-01')",
      ),
    ).rejects.toThrow(/está cerrado/);
  });

  it("no permite pagar la obligación original que se arrastró", async () => {
    await comoUsuario(db, OMAR);
    const energia = await uno<{ id: string }>(
      "select id from v_obligaciones_mes where nombre = 'Energía' and mes = '2026-09-01' and arrastrada_de_id is null",
    );
    await expect(
      mover({
        fecha: "2026-10-03",
        tipo: "gasto",
        monto: 42000,
        categoria: ids["Energía (luz)"],
        obligacion: energia.id,
      }),
    ).rejects.toThrow(/arrastrada/);
  });

  it("reabre con motivo y deja rastro en la bitácora", async () => {
    await comoUsuario(db, OMAR);
    const p = await uno<{ id: string }>("select id from periodos where mes = '2026-09-01'");
    await expect(db.query("select reabrir_periodo($1, '')", [p.id])).rejects.toThrow(/motivo/);
    await db.query("select reabrir_periodo($1, 'Faltó un gasto')", [p.id]);
    const estado = await uno<{ estado: string }>("select estado from periodos where id = $1", [p.id]);
    expect(estado.estado).toBe("abierto");
    const b = await varios<{ accion: string }>("select accion from bitacora order by creado_en");
    expect(b.map((x) => x.accion)).toEqual(["cerrar", "reabrir"]);
    await mover({ fecha: "2026-09-28", tipo: "gasto", monto: 1000, categoria: ids.Mercado });
  });
});

describe("seguridad del núcleo", () => {
  it("otro usuario no ve obligaciones, movimientos ni resúmenes ajenos", async () => {
    await comoUsuario(db, OTRO);
    for (const tabla of [
      "obligaciones",
      "obligaciones_periodo",
      "movimientos",
      "v_obligaciones_mes",
      "v_movimientos",
      "v_resumen_periodo",
      "v_gasto_categoria_mes",
      "bitacora",
    ]) {
      const r = await uno<{ n: number }>(`select count(*)::int as n from ${tabla}`);
      expect(r.n, tabla).toBe(0);
    }
  });

  it("otro usuario no puede cerrar un mes ajeno", async () => {
    await comoUsuario(db, OMAR);
    const p = await uno<{ id: string }>("select id from periodos where mes = '2026-10-01'");
    await comoUsuario(db, OTRO);
    await expect(db.query("select cerrar_periodo($1)", [p.id])).rejects.toThrow(/no encontrado/);
  });

  it("borrar el usuario elimina todo aunque haya meses cerrados", async () => {
    await comoUsuario(db, OMAR);
    const p = await uno<{ id: string }>("select id from periodos where mes = '2026-11-01'");
    const pend = await varios<{ id: string }>(
      "select id from v_obligaciones_mes where periodo_id = $1 and resolucion is null and not pagada",
      [p.id],
    );
    await db.query("select cerrar_periodo($1, $2::jsonb)", [
      p.id,
      JSON.stringify(pend.map((x) => ({ id: x.id, accion: "omitir", motivo: "prueba" }))),
    ]);
    await db.exec("reset role;");
    await db.query("delete from auth.users where id = $1", [OMAR]);
    const r = await uno<{ n: number }>("select count(*)::int as n from movimientos");
    expect(r.n).toBe(0);
  });
});
