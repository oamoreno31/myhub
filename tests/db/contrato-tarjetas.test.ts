/**
 * Prueba de contrato: `recalcular_tarjeta` (SQL) y `libroMayor` (TypeScript, usado en las
 * vistas previas) deben dar exactamente el mismo resultado. Si una cambia, la otra también.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { type CompraTC, cuotasDeCompra, type ExtractoTC, libroMayor, type PagoTC } from "@/lib/domain/tarjetas";
import { comoUsuario, crearBaseDePruebas, crearUsuario } from "./pg-supabase";

const OMAR = "00000000-0000-4000-8000-000000000001";
let db: PGlite;
let ahorros: string;
let mercado: string;

beforeAll(async () => {
  db = await crearBaseDePruebas();
  await crearUsuario(db, OMAR, "oamoreno31@gmail.com");
  await comoUsuario(db, OMAR);
  ahorros = (
    await db.query<{ id: string }>("insert into cuentas (nombre, tipo) values ('Ahorros', 'ahorros') returning id")
  ).rows[0].id;
  mercado = (await db.query<{ id: string }>("select id from categorias where nombre = 'Mercado'")).rows[0].id;
}, 60_000);

/** Generador pseudoaleatorio determinístico (mulberry32). */
function azar(semilla: number) {
  let a = semilla;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dia = (d: Date) => d.toISOString().slice(0, 10);
const sumarDias = (iso: string, n: number) => dia(new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000));

type Escenario = {
  diaCorte: number;
  compras: Omit<CompraTC, "id">[];
  extractos: Omit<ExtractoTC, "id">[];
  pagos: Omit<PagoTC, "id">[];
};

function escenario(semilla: number): Escenario {
  const r = azar(semilla);
  const entre = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const diaCorte = [5, 15, 28, 30, 31][entre(0, 4)];
  const compras: Escenario["compras"] = [];
  const extractos: Escenario["extractos"] = [];
  const pagos: Escenario["pagos"] = [];
  let deuda = 0;
  for (let m = 0; m < 6; m++) {
    const mes = `2026-${String(3 + m).padStart(2, "0")}`;
    for (let k = entre(1, 4); k > 0; k--) {
      const tipo = (["compra", "compra", "compra", "avance", "devolucion", "ajuste"] as const)[entre(0, 5)];
      const monto = tipo === "ajuste" ? entre(-5000, 5000) * 10 || 100 : entre(1, 400) * 5000 + entre(0, 99) / 100;
      compras.push({
        fecha: `${mes}-${String(entre(1, 28)).padStart(2, "0")}`,
        tipo,
        monto,
        num_cuotas: entre(1, 3) === 1 ? entre(2, 24) : 1,
      });
      deuda += tipo === "devolucion" ? -monto : monto;
    }
    const corte = `${mes}-${String(Math.min(diaCorte, 28)).padStart(2, "0")}`;
    const total = Math.max(0, Math.round(deuda * (0.95 + r() * 0.12)));
    const minimo = Math.round(total * (0.1 + r() * 0.3));
    const desglose = r() < 0.4;
    extractos.push({
      fecha_corte: corte,
      fecha_limite_pago: sumarDias(corte, 15),
      pago_total_banco: total,
      pago_minimo_banco: minimo,
      intereses: desglose ? entre(0, 60000) : null,
      cuota_manejo: desglose ? 32900 : null,
    });
    for (let k = entre(0, 3); k > 0; k--) {
      const opcion = entre(0, 4);
      const monto = [total, minimo, Math.round(minimo * 0.5) + 1, entre(1, 200) * 10000, minimo + 500][opcion] || 1000;
      pagos.push({ fecha: sumarDias(corte, entre(-3, 20)), monto });
      deuda -= monto;
    }
  }
  return { diaCorte, compras, extractos, pagos };
}

async function cargar(e: Escenario, i: number) {
  const tarjeta = (
    await db.query<{ id: string }>(
      "select crear_tarjeta($1, 'visa', null, 10000000, $2::smallint, 10::smallint) as id",
      [`Tarjeta ${i}`, e.diaCorte],
    )
  ).rows[0].id;
  // Se insertan en un orden distinto al cronológico para probar que el orden no importa.
  for (const c of [...e.compras].reverse()) {
    await db.query(
      `insert into compras_tc (tarjeta_id, fecha, tipo, monto, num_cuotas, categoria_id, descripcion, cuenta_destino_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        tarjeta,
        c.fecha,
        c.tipo,
        c.monto,
        c.num_cuotas,
        c.tipo === "compra" || c.tipo === "devolucion" ? mercado : null,
        c.tipo === "ajuste" ? "Ajuste" : null,
        c.tipo === "avance" ? ahorros : null,
      ],
    );
  }
  for (const p of e.pagos) {
    await db.query("insert into pagos_tc (tarjeta_id, cuenta_origen_id, fecha, monto) values ($1, $2, $3, $4)", [
      tarjeta,
      ahorros,
      p.fecha,
      p.monto,
    ]);
  }
  for (const x of e.extractos) {
    await db.query(
      `insert into extractos_tc (tarjeta_id, fecha_corte, fecha_limite_pago, pago_total_banco, pago_minimo_banco, intereses, cuota_manejo)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        tarjeta,
        x.fecha_corte,
        x.fecha_limite_pago,
        x.pago_total_banco,
        x.pago_minimo_banco,
        x.intereses,
        x.cuota_manejo,
      ],
    );
  }
  return tarjeta;
}

const TS = `to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US')`;
const num = (v: unknown) => (v === null ? null : Number(v));

async function leer(tarjeta: string) {
  const compras = (
    await db.query<CompraTC>(
      `select id, fecha::text, tipo, monto::float8 as monto, num_cuotas, ${TS} as created_at from compras_tc where tarjeta_id = $1`,
      [tarjeta],
    )
  ).rows;
  const extractos = (
    await db.query<ExtractoTC & Record<string, unknown>>(
      `select *, fecha_corte::text as fecha_corte, fecha_limite_pago::text as fecha_limite_pago, ${TS} as created_at
       from extractos_tc where tarjeta_id = $1`,
      [tarjeta],
    )
  ).rows;
  const pagos = (
    await db.query<PagoTC & Record<string, unknown>>(
      `select *, fecha::text as fecha, monto::float8 as monto, ${TS} as created_at from pagos_tc where tarjeta_id = $1`,
      [tarjeta],
    )
  ).rows;
  const estado = (
    await db.query<{ capital: string; otros_pendientes: string }>(
      "select capital, otros_pendientes from v_estado_tarjetas where id = $1",
      [tarjeta],
    )
  ).rows[0];
  return { compras, extractos, pagos, estado };
}

const vistos = { tipos: new Set<string>(), alertas: new Set<string>(), estados: new Set<string>(), aFavor: 0 };

describe("contrato recalcular_tarjeta ↔ libroMayor", () => {
  it.each(Array.from({ length: 12 }, (_, i) => i + 1))("escenario aleatorio #%i", async (semilla) => {
    const e = escenario(semilla * 7919);
    const tarjeta = await cargar(e, semilla);
    const bd = await leer(tarjeta);
    expect(bd.extractos).toHaveLength(6);
    for (const p of bd.pagos) {
      vistos.tipos.add(String(p.tipo_calculado));
      if (Number(p.saldo_a_favor) > 0) vistos.aFavor++;
    }
    for (const x of bd.extractos) {
      vistos.estados.add(String(x.estado));
      if (x.alerta) vistos.alertas.add(String(x.alerta));
    }
    const ts = libroMayor(
      bd.compras,
      bd.extractos.map((x) => ({
        ...x,
        pago_total_banco: Number(x.pago_total_banco),
        pago_minimo_banco: Number(x.pago_minimo_banco),
      })),
      bd.pagos,
      { diaCorte: e.diaCorte },
    );

    for (const x of bd.extractos) {
      expect(
        {
          saldo_sistema_al_corte: num(x.saldo_sistema_al_corte),
          otros_generados: num(x.otros_generados),
          capital_facturado: num(x.capital_facturado),
          minimo_estimado: num(x.minimo_estimado),
          diferencia_no_explicada: num(x.diferencia_no_explicada),
          alerta: x.alerta,
          pagado: num(x.pagado),
          estado: x.estado,
        },
        `extracto ${x.fecha_corte}`,
      ).toEqual(ts.extractos[x.id]);
    }
    for (const p of bd.pagos) {
      expect(
        {
          extracto_id: p.extracto_id,
          tipo_calculado: p.tipo_calculado,
          imputado_otros: num(p.imputado_otros),
          imputado_capital: num(p.imputado_capital),
          saldo_a_favor: num(p.saldo_a_favor),
        },
        `pago ${p.fecha}`,
      ).toEqual(ts.pagos[p.id]);
    }
    expect(num(bd.estado.capital)).toBe(ts.capital);
    expect(num(bd.estado.otros_pendientes)).toBe(Math.max(ts.otros, 0));
  });

  it("los escenarios cubren todas las ramas", () => {
    expect([...vistos.tipos].sort()).toEqual(["inferior_minimo", "minimo", "otro", "total"]);
    expect([...vistos.estados].sort()).toEqual(["minimo_cubierto", "pagado_total", "parcial", "pendiente"]);
    expect(vistos.alertas.size).toBe(2);
    expect(vistos.aFavor).toBeGreaterThan(0);
  });

  it("cuotas_de_compra coincide con cuotasDeCompra", async () => {
    const casos: CompraTC[] = [];
    const r = azar(42);
    for (let i = 0; i < 150; i++) {
      const tipo = (["compra", "avance", "devolucion", "ajuste"] as const)[i % 4];
      casos.push({
        id: String(i),
        fecha: `2026-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + Math.floor(r() * 28)).padStart(2, "0")}`,
        tipo,
        monto: Math.round(r() * 5_000_000_00) / 100 + 0.01,
        num_cuotas: 1 + Math.floor(r() * 48),
      });
    }
    for (const diaCorte of [1, 15, 29, 31]) {
      const { rows } = await db.query<{ n: number; numero: number; corte: string; valor: number }>(
        `select c.n, q.numero, q.corte::text as corte, q.valor::float8 as valor
         from jsonb_to_recordset($1::jsonb) as c(n int, fecha date, tipo tipo_compra_tc, monto numeric, num_cuotas smallint),
         lateral cuotas_de_compra(c.fecha, c.tipo, c.monto, c.num_cuotas, $2::smallint) q
         order by c.n, q.numero`,
        [JSON.stringify(casos.map((c, n) => ({ ...c, n }))), diaCorte],
      );
      const esperado = casos.flatMap((c, n) => cuotasDeCompra(c, diaCorte).map((q) => ({ n, ...q })));
      expect(rows).toEqual(esperado);
    }
  });
});
