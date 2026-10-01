import { describe, expect, it } from "vitest";
import {
  compararConPromedio,
  estadoPresupuesto,
  etiquetaEjeMes,
  type FilaConsumo,
  fijoVariable,
  filtrarConsumo,
  gastoPorLinea,
  gastoSinPresupuesto,
  promediosPorCategoria,
  propuesta503020,
  reparto503020,
  serieApilada,
  totalesPorCategoria,
  totalPorPeriodo,
  variacion,
  ventanaPeriodos,
} from "./analisis";

const OTROS = { padre_id: "otros", padre_nombre: "Otros gastos" };
const fila = (periodo: string, id: string, total: number, extra: Partial<FilaConsumo> = {}): FilaConsumo => ({
  periodo,
  categoria_id: id,
  categoria_nombre: id.charAt(0).toUpperCase() + id.slice(1),
  padre_id: null,
  padre_nombre: null,
  bolsa: "necesidad",
  es_fija: false,
  origen: "cuenta",
  reembolsable: false,
  total,
  ...extra,
});

const FILAS: FilaConsumo[] = [
  fila("2026-06", "arriendo", 1_800_000, { es_fija: true }),
  fila("2026-06", "mercado", 600_000, OTROS),
  fila("2026-06", "restaurantes", 150_000, { ...OTROS, bolsa: "deseo" }),
  fila("2026-07", "arriendo", 1_800_000, { es_fija: true }),
  fila("2026-07", "mercado", 700_000, OTROS),
  fila("2026-08", "arriendo", 1_800_000, { es_fija: true }),
  fila("2026-08", "mercado", 500_000, OTROS),
  fila("2026-08", "restaurantes", 300_000, { ...OTROS, bolsa: "deseo" }),
  fila("2026-09", "arriendo", 1_800_000, { es_fija: true }),
  fila("2026-09", "mercado", 450_000, OTROS),
  fila("2026-09", "mercado", 300_000, { ...OTROS, origen: "tarjeta" }),
  fila("2026-09", "restaurantes", 400_000, { ...OTROS, bolsa: "deseo" }),
  fila("2026-09", "devtopia", 120_000, { bolsa: "no_aplica", reembolsable: true }),
  fila("2026-09", "hosting", 0.3, { bolsa: "no_aplica" }),
];

describe("agregados", () => {
  it("ventana de periodos y etiquetas de eje", () => {
    expect(ventanaPeriodos("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(ventanaPeriodos("2026-02", 3).map(etiquetaEjeMes)).toEqual(["dic", "ene 26", "feb"]);
  });

  it("totales por categoría hoja con su etiqueta, sumando orígenes", () => {
    const t = totalesPorCategoria(FILAS, "2026-09");
    expect(t.map((x) => [x.etiqueta, x.total])).toEqual([
      ["Arriendo", 1_800_000],
      ["Otros gastos › Mercado", 750_000],
      ["Otros gastos › Restaurantes", 400_000],
      ["Devtopia", 120_000],
      ["Hosting", 0.3],
    ]);
  });

  it("excluir reembolsables quita lo de Devtopia", () => {
    const sin = filtrarConsumo(FILAS, { excluirReembolsables: true });
    expect(totalPorPeriodo(sin, ["2026-09"])).toEqual([2_950_000.3]);
    expect(totalPorPeriodo(FILAS, ["2026-08", "2026-09", "2026-10"])).toEqual([2_600_000, 3_070_000.3, 0]);
  });

  it("serie apilada: principales + Otras, con valores por mes", () => {
    const s = serieApilada(FILAS, ["2026-08", "2026-09"], 2);
    expect(s.map((x) => [x.nombre, x.valores])).toEqual([
      ["Arriendo", [1_800_000, 1_800_000]],
      ["Mercado", [500_000, 750_000]],
      ["Otras", [300_000, 520_000.3]],
    ]);
    expect(serieApilada(FILAS, ["2026-06"], 5).map((x) => x.nombre)).toEqual(["Arriendo", "Mercado", "Restaurantes"]);
  });

  it("mes contra promedio de los 3 anteriores (meses sin gasto cuentan como 0)", () => {
    const c = compararConPromedio(FILAS, "2026-09");
    const r = Object.fromEntries(c.map((x) => [x.id, [x.actual, x.promedio, x.diferencia, x.variacion]]));
    expect(r.mercado).toEqual([750_000, 600_000, 150_000, 0.25]);
    expect(r.restaurantes).toEqual([400_000, 150_000, 250_000, 250_000 / 150_000]);
    expect(r.arriendo).toEqual([1_800_000, 1_800_000, 0, 0]);
    expect(r.devtopia[3]).toBeNull();
    expect(c[0].id).toBe("restaurantes");
  });

  it("fijo vs variable", () => {
    expect(fijoVariable(FILAS, "2026-09")).toEqual({ fijo: 1_800_000, variable: 1_270_000.3 });
  });

  it("variación segura", () => {
    expect(variacion(120, 100)).toBeCloseTo(0.2);
    expect(variacion(10, 0)).toBeNull();
    expect(variacion(-50, -100)).toBeCloseTo(0.5);
  });
});

describe("regla 50/30/20", () => {
  it("reparte el ingreso y califica cada bolsa", () => {
    const r = reparto503020(FILAS, "2026-09", 5_000_000);
    expect(r.necesidad).toEqual({ total: 2_550_000, pct: 0.51, estado: "atencion" });
    expect(r.deseo).toEqual({ total: 400_000, pct: 0.08, estado: "ok" });
    expect(r.sinClasificar).toBe(120_000.3);
    expect(r.ahorro.total).toBe(1_929_999.7);
    expect(r.ahorro.estado).toBe("ok");
    expect(reparto503020(FILAS, "2026-09", 3_300_000).ahorro.estado).toBe("riesgo");
    expect(reparto503020(FILAS, "2026-09", 0).necesidad.pct).toBeNull();
  });

  it("propone montos: recorta la bolsa que se pasa y deja la que cabe", () => {
    const promedios = promediosPorCategoria(FILAS, "2026-09");
    expect(promedios.map((p) => [p.categoria_id, p.promedio])).toEqual([
      ["arriendo", 1_800_000],
      ["mercado", 600_000],
      ["restaurantes", 150_000],
    ]);
    const p = propuesta503020({ ingresoPromedio: 4_000_000, promedios, categoriaAhorroId: "ahorro" });
    // Necesidades promedian 2.400.000 > 50 % (2.000.000): se escalan × 5/6.
    expect(p.items).toEqual([
      { categoria_id: "arriendo", monto: 1_500_000 },
      { categoria_id: "mercado", monto: 500_000 },
      { categoria_id: "restaurantes", monto: 150_000 },
      { categoria_id: "ahorro", monto: 800_000 },
    ]);
    expect(p.bolsas.necesidad).toEqual({ meta: 2_000_000, promedio: 2_400_000, propuesto: 2_000_000 });
    expect(p.bolsas.deseo).toEqual({ meta: 1_200_000, promedio: 150_000, propuesto: 150_000 });
    expect(p.bolsas.ahorro.propuesto).toBe(800_000);
    expect(propuesta503020({ ingresoPromedio: 0, promedios: [] }).items).toEqual([]);
  });
});

describe("presupuesto", () => {
  it("estado al 80 % y al 100 %", () => {
    expect(estadoPresupuesto(79, 100)).toEqual({ pct: 0.79, estado: "ok" });
    expect(estadoPresupuesto(80, 100).estado).toBe("atencion");
    expect(estadoPresupuesto(99.99, 100).estado).toBe("atencion");
    expect(estadoPresupuesto(100, 100).estado).toBe("tope");
    expect(estadoPresupuesto(100.01, 100).estado).toBe("excedido");
    expect(estadoPresupuesto(10, 0)).toEqual({ pct: 0, estado: "ok" });
  });

  it("la línea del padre cubre las subcategorías sin presupuesto propio", () => {
    const lineas = [
      { categoria_id: "otros", monto: 500_000 },
      { categoria_id: "restaurantes", monto: 300_000 },
      { categoria_id: "arriendo", monto: 1_800_000 },
    ];
    const g = gastoPorLinea(FILAS, "2026-09", lineas);
    expect(Object.fromEntries(g)).toEqual({ arriendo: 1_800_000, otros: 750_000, restaurantes: 400_000 });
    expect(gastoSinPresupuesto(FILAS, "2026-09", lineas)).toBe(120_000.3);
  });
});
