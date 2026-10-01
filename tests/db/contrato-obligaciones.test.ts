/**
 * Prueba de contrato: las reglas de plantillas en TypeScript (vistas previas)
 * deben coincidir exactamente con las funciones SQL que generan el mes.
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { aplicaEnMes, type Frecuencia, fechaEnMes } from "@/lib/domain/obligaciones";
import { desplazarPeriodo } from "@/lib/domain/periodos";
import { crearBaseDePruebas } from "./pg-supabase";

let db: PGlite;

beforeAll(async () => {
  db = await crearBaseDePruebas();
}, 60_000);

const FRECUENCIAS: Frecuencia[] = ["mensual", "bimestral", "trimestral", "semestral", "anual"];

describe("contrato TS ↔ SQL", () => {
  it("obligacion_aplica coincide para 5 frecuencias × 3 anclas × 30 meses", async () => {
    const casos: [Frecuencia, string, string, string | null, string][] = [];
    for (const f of FRECUENCIAS) {
      for (const ancla of ["2025-11", "2026-02", "2026-09"]) {
        const fin = f === "mensual" ? "2027-01" : null;
        for (let i = 0; i < 30; i++) casos.push([f, ancla, ancla, fin, desplazarPeriodo("2025-10", i)]);
      }
    }
    const { rows } = await db.query<{ r: boolean[] }>(
      `select array_agg(obligacion_aplica(c.f::frecuencia, (c.a || '-01')::date, (c.i || '-01')::date,
              case when c.fin is null then null else (c.fin || '-28')::date end, (c.m || '-01')::date) order by c.n) as r
       from jsonb_to_recordset($1::jsonb) as c(n int, f text, a text, i text, fin text, m text)`,
      [JSON.stringify(casos.map(([f, a, i, fin, m], n) => ({ n, f, a, i, fin, m })))],
    );
    const esperado = casos.map(([f, a, i, fin, m]) => aplicaEnMes(f, a, i, fin, m));
    expect(rows[0].r).toEqual(esperado);
  });

  it("fecha_en_mes coincide para todos los días en meses de 28 a 31 días", async () => {
    const meses = ["2026-02", "2028-02", "2026-04", "2026-09", "2026-10"];
    const casos = meses.flatMap((m) => Array.from({ length: 31 }, (_, d) => ({ m, d: d + 1 })));
    const { rows } = await db.query<{ r: string[] }>(
      `select array_agg(fecha_en_mes((c.m || '-01')::date, c.d::smallint)::text order by c.n) as r
       from jsonb_to_recordset($1::jsonb) as c(n int, m text, d int)`,
      [JSON.stringify(casos.map((c, n) => ({ n, ...c })))],
    );
    expect(rows[0].r).toEqual(casos.map((c) => fechaEnMes(c.m, c.d)));
  });
});
