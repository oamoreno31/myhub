import { describe, expect, it } from "vitest";
import { avanceMeta, mesesEntre, objetivoFondo } from "./metas";
import { calcularPila, leerParamsPila, tarifaFsp } from "./pila";
import {
  accionesSugeridas,
  bandaDe,
  calcularIndicadores,
  calcularScore,
  type ContextoAcciones,
  type Insumos,
  leerInsumos,
  leerUmbrales,
  puntajeDe,
  UMBRALES_DEFECTO,
} from "./salud";
import { simular } from "./simulador";

// Mismo escenario que tests/db/salud.test.ts (agosto).
const agosto: Insumos = {
  ingresos: 5_000_000,
  gasto_personal: 3_150_000,
  ahorro_registrado: 400_000,
  costo_financiero: 50_000,
  pagos_deuda: 364_000,
  obligaciones_fijas: 464_000,
  oblig_evaluables: 3,
  oblig_a_tiempo: 1,
  tc_total: 0,
  tc_otro: 0,
  tc_minimo: 1,
  deuda_tc: 1_100_000,
  cupo_tc: 4_000_000,
  ahorro_liquido: 8_450_000,
  gasto_esencial: 2_000_000,
};

const ctx: ContextoAcciones = {
  tarjetas: [{ id: "visa", nombre: "Visa", deuda: 1_100_000, cupo: 4_000_000, otrosCargos: 50_000, tasaEA: 0.28 }],
  deudas: [{ id: "coomeva", nombre: "Coomeva", saldo: 4_000_000, tasaEA: 0.18 }],
  categoriaQueMasSubio: { nombre: "Mercado", diferencia: 700_000 },
  tieneMetaFondo: false,
  usuraEA: null,
};

describe("bandas y puntajes", () => {
  it("clasifica en sano · atención · riesgo en ambos sentidos", () => {
    expect(bandaDe(0.2, UMBRALES_DEFECTO.tasa_ahorro, true)).toBe("sano");
    expect(bandaDe(0.15, UMBRALES_DEFECTO.tasa_ahorro, true)).toBe("atencion");
    expect(bandaDe(0.05, UMBRALES_DEFECTO.tasa_ahorro, true)).toBe("riesgo");
    expect(bandaDe(0.3, UMBRALES_DEFECTO.carga_deuda, false)).toBe("sano");
    expect(bandaDe(0.35, UMBRALES_DEFECTO.carga_deuda, false)).toBe("atencion");
    expect(bandaDe(0.41, UMBRALES_DEFECTO.carga_deuda, false)).toBe("riesgo");
  });

  it("puntaje: sano 100, umbral de riesgo 50, extremo 0 (lineal por tramos)", () => {
    const u = UMBRALES_DEFECTO.tasa_ahorro;
    expect(puntajeDe(0.25, u, true, 0)).toBe(100);
    expect(puntajeDe(0.15, u, true, 0)).toBe(75);
    expect(puntajeDe(0.1, u, true, 0)).toBe(50);
    expect(puntajeDe(0.05, u, true, 0)).toBe(25);
    expect(puntajeDe(-0.3, u, true, 0)).toBe(0);
    const c = UMBRALES_DEFECTO.carga_deuda;
    expect(puntajeDe(0.35, c, false, 0.6)).toBeCloseTo(75);
    expect(puntajeDe(0.5, c, false, 0.6)).toBeCloseTo(25);
  });

  it("lee umbrales y cae al defecto en lo que no sea válido", () => {
    const u = leerUmbrales({ tasa_ahorro: { sano: 0.25, riesgo: 0.12 }, carga_deuda: { sano: "x" } });
    expect(u.tasa_ahorro).toEqual({ sano: 0.25, riesgo: 0.12 });
    expect(u.carga_deuda).toEqual(UMBRALES_DEFECTO.carga_deuda);
  });

  it("lee los insumos de la BD (numéricos como texto)", () => {
    expect(leerInsumos({ ...agosto, ingresos: "5000000.00" })?.ingresos).toBe(5_000_000);
    expect(leerInsumos(null)).toBeNull();
  });
});

describe("indicadores y score del escenario de agosto", () => {
  const ind = calcularIndicadores(agosto);
  const por = Object.fromEntries(ind.map((x) => [x.clave, x]));

  it("valores y bandas", () => {
    expect(por.tasa_ahorro.valor).toBeCloseTo(0.37);
    expect(por.tasa_ahorro.banda).toBe("sano");
    expect(por.carga_deuda.valor).toBeCloseTo(0.0728);
    expect(por.utilizacion_tc.valor).toBeCloseTo(0.275);
    expect(por.utilizacion_tc.banda).toBe("sano");
    expect(por.fondo_emergencia.valor).toBeCloseTo(4.225);
    expect(por.fondo_emergencia.banda).toBe("atencion");
    expect(por.costo_financiero.valor).toBeCloseTo(0.01);
    expect(por.puntualidad.valor).toBeCloseTo(1 / 3);
    expect(por.puntualidad.banda).toBe("riesgo");
    expect(por.pago_tc.banda).toBe("riesgo");
    expect(por.pago_tc.puntaje).toBe(0);
    expect(por.gastos_fijos.peso).toBe(0);
  });

  it("score ponderado 0–100 con su lectura", () => {
    // fondo 4,225 meses → 50 + 50·(1,225/3) = 70,4; puntualidad 0,333 < extremo 0,5 → 0; pago TC 0
    // (20·100 + 20·100 + 15·100 + 15·70,4 + 10·100 + 10·0 + 10·0) / 100 = 75,6 → 76
    const s = calcularScore(ind);
    expect(s).toEqual({ valor: 76, lectura: "estable", cobertura: 100 });
  });

  it("sin tarjetas el score se reparte entre lo disponible; sin ingresos no hay score", () => {
    const sinTc = calcularScore(calcularIndicadores({ ...agosto, cupo_tc: 0, deuda_tc: 0, tc_minimo: 0 }));
    expect(sinTc.cobertura).toBe(75);
    expect(calcularScore(calcularIndicadores({ ...agosto, ingresos: 0 })).valor).toBeNull();
  });

  it("acciones: las 3 de mayor impacto, con cifras concretas", () => {
    const acc = accionesSugeridas(ind, agosto, ctx);
    expect(acc.map((a) => a.id)).toEqual(["pago-total-visa", "puntualidad", "fondo"]);
    expect(acc[0].detalle).toContain("$ 50.000");
    // 6 × 2.000.000 − 8.450.000 = 3.550.000
    expect(acc[2].titulo).toContain("$ 3.550.000");
    expect(acc[2].detalle).toContain("créalo como meta");
  });

  it("acción de usura cuando una tasa supera la registrada", () => {
    const acc = accionesSugeridas(ind, agosto, { ...ctx, usuraEA: 0.25 }, 5);
    expect(acc.find((a) => a.id === "usura")?.titulo).toContain("Visa");
  });
});

describe("simulador de deudas", () => {
  const deudas = [
    { id: "tc", nombre: "Tarjeta", saldo: 3_000_000, tasaEA: 0.3, minimo: 150_000 },
    { id: "libre", nombre: "Libre inversión", saldo: 1_000_000, tasaEA: 0.2, minimo: 100_000 },
  ];

  it("avalancha ataca la tasa más alta; bola de nieve el saldo más pequeño", () => {
    expect(simular(deudas, 200_000, "avalancha").orden).toEqual(["tc", "libre"]);
    expect(simular(deudas, 200_000, "bola_nieve").orden).toEqual(["libre", "tc"]);
  });

  it("con extra se sale antes y se pagan menos intereses; avalancha paga ≤ bola de nieve", () => {
    const min = simular(deudas, 200_000, "minimos");
    const ava = simular(deudas, 200_000, "avalancha");
    const bola = simular(deudas, 200_000, "bola_nieve");
    expect(min.meses).not.toBeNull();
    expect(ava.meses!).toBeLessThan(min.meses!);
    expect(ava.intereses).toBeLessThan(min.intereses);
    expect(ava.intereses).toBeLessThanOrEqual(bola.intereses);
    expect(bola.saldadas.libre).toBeLessThan(ava.saldadas.libre);
    // lo pagado = saldos + intereses
    expect(ava.pagado).toBeCloseTo(4_000_000 + ava.intereses, 0);
    expect(ava.serie[0]).toBe(4_000_000);
    expect(ava.serie.at(-1)).toBe(0);
  });

  it("detecta un mínimo que no cubre ni los intereses", () => {
    const r = simular([{ id: "x", nombre: "X", saldo: 10_000_000, tasaEA: 0.3, minimo: 100_000 }], 0, "minimos");
    expect(r.noAlcanza).toEqual(["x"]);
    expect(r.meses).toBeNull();
  });
});

describe("metas", () => {
  it("avance, aporte para la fecha y fecha estimada con el aporte declarado", () => {
    const a = avanceMeta({
      objetivo: 12_000_000,
      actual: 8_450_000,
      aporteMensual: 500_000,
      fechaObjetivo: "2026-12-31",
      hoy: "2026-09",
    });
    expect(a.restante).toBe(3_550_000);
    expect(a.mesesConAporte).toBe(8);
    expect(a.fechaEstimada).toBe("2027-04");
    expect(a.mesesHastaFecha).toBe(4);
    expect(a.aporteParaFecha).toBe(888_000);
    expect(a.atrasada).toBe(true);
    expect(a.pct).toBeCloseTo(0.704, 3);
  });

  it("meta completa y utilidades", () => {
    expect(
      avanceMeta({ objetivo: 1000, actual: 1500, aporteMensual: null, fechaObjetivo: null, hoy: "2026-09" }),
    ).toMatchObject({
      completa: true,
      pct: 1,
      restante: 0,
      atrasada: false,
    });
    expect(mesesEntre("2026-09", "2027-02")).toBe(5);
    expect(objetivoFondo(2_030_000)).toBe(12_200_000);
  });
});

describe("PILA independiente", () => {
  const p = leerParamsPila({ ibc_pct: 0.4, salud_pct: 0.125, pension_pct: 0.16, arl_clase: 1, smmlv: 1_500_000 });

  it("IBC 40 % con aportes al múltiplo de 100", () => {
    const r = calcularPila(9_000_000, p)!;
    expect(r.ibc).toBe(3_600_000);
    expect(r.ajuste).toBeNull();
    expect([r.salud, r.pension, r.fsp, r.arl]).toEqual([450_000, 576_000, 0, 18_800]);
    expect(r.total).toBe(1_044_800);
  });

  it("IBC mínimo 1 SMMLV y máximo 25; fondo de solidaridad desde 4 SMMLV", () => {
    expect(calcularPila(1_000_000, p)).toMatchObject({ ibc: 1_500_000, ajuste: "minimo" });
    expect(calcularPila(200_000_000, p)).toMatchObject({ ibc: 37_500_000, ajuste: "maximo", fspPct: 0.02 });
    expect(calcularPila(15_000_000, p)).toMatchObject({ ibc: 6_000_000, fsp: 60_000 });
    expect(tarifaFsp(16.5)).toBeCloseTo(0.012);
    expect(tarifaFsp(19.9)).toBeCloseTo(0.018);
  });

  it("sin SMMLV configurado no calcula", () => {
    expect(calcularPila(9_000_000, leerParamsPila({}))).toBeNull();
  });
});
