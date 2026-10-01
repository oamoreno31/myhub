/**
 * Pruebas mínimas del doc 03 §9 (definición de terminado del módulo de tarjetas).
 */
import { describe, expect, it } from "vitest";
import {
  type CompraTC,
  clasificarPago,
  corteDeCompra,
  cuotasDeCompra,
  type ExtractoTC,
  extractoPendiente,
  fechaLimiteDeCorte,
  libroMayor,
  mejorDiaDeCompra,
  nivelUtilizacion,
  type PagoTC,
  proximoCorte,
  simularExtracto,
  simularPago,
  tasaMensual,
  ultimoCorte,
} from "./tarjetas";

const OPC = { diaCorte: 15 };

// Ejemplo del doc 03 §4: Visa, corte día 15, pago día 30.
const COMPRAS: CompraTC[] = [
  { id: "c1", fecha: "2026-09-20", tipo: "compra", monto: 320000, num_cuotas: 1 },
  { id: "c2", fecha: "2026-09-28", tipo: "compra", monto: 2400000, num_cuotas: 12 },
  { id: "c3", fecha: "2026-10-03", tipo: "compra", monto: 180000, num_cuotas: 1 },
];
const EXTRACTO_OCT: ExtractoTC = {
  id: "e1",
  fecha_corte: "2026-10-15",
  fecha_limite_pago: "2026-10-30",
  pago_total_banco: 2948500,
  pago_minimo_banco: 748500,
};

describe("§9.1 ejemplo del doc 03 y sus tres escenarios", () => {
  it("calcula otros cargos, capital facturado y mínimo estimado", () => {
    const r = libroMayor(COMPRAS, [EXTRACTO_OCT], [], OPC);
    expect(r.extractos.e1).toMatchObject({
      saldo_sistema_al_corte: 2900000,
      otros_generados: 48500,
      capital_facturado: 700000,
      minimo_estimado: 748500,
      alerta: null,
      estado: "pendiente",
    });
  });

  it.each([
    ["A · total", 2948500, "total", 48500, 2900000, 0],
    ["B · mínimo", 748500, "minimo", 48500, 700000, 2200000],
    ["C · otro valor", 1500000, "otro", 48500, 1451500, 1448500],
  ])("escenario %s", (_n, monto, tipo, aOtros, aCapital, capitalRestante) => {
    const r = libroMayor(COMPRAS, [EXTRACTO_OCT], [{ id: "p1", fecha: "2026-10-25", monto }], OPC);
    expect(r.pagos.p1).toEqual({
      extracto_id: "e1",
      tipo_calculado: tipo,
      imputado_otros: aOtros,
      imputado_capital: aCapital,
      saldo_a_favor: 0,
    });
    expect(r.capital).toBe(capitalRestante);
    expect(r.otros).toBe(0);
  });

  it("siguiente corte del escenario B: aparecen los intereses", () => {
    const r = libroMayor(
      [...COMPRAS, { id: "c4", fecha: "2026-11-01", tipo: "compra", monto: 450000, num_cuotas: 1 }],
      [
        EXTRACTO_OCT,
        {
          id: "e2",
          fecha_corte: "2026-11-15",
          fecha_limite_pago: "2026-11-30",
          pago_total_banco: 2711300,
          pago_minimo_banco: 711300,
        },
      ],
      [{ id: "p1", fecha: "2026-10-25", monto: 748500 }],
      OPC,
    );
    expect(r.extractos.e2.saldo_sistema_al_corte).toBe(2650000);
    expect(r.extractos.e2.otros_generados).toBe(61300);
    expect(r.extractos.e2.capital_facturado).toBe(650000);
    expect(r.extractos.e1.estado).toBe("minimo_cubierto");
  });
});

describe("§9.2 pago registrado antes que el extracto", () => {
  it("el libro se recalcula igual sin importar el orden de registro", () => {
    const pago: PagoTC = { id: "p0", fecha: "2026-10-10", monto: 100000 };
    const extracto = { ...EXTRACTO_OCT, pago_total_banco: 2848500 };
    const r = libroMayor(COMPRAS, [extracto], [pago], OPC);
    // Antes del corte no hay cargos: todo a capital; no hay extracto vigente → "otro".
    expect(r.pagos.p0).toMatchObject({ extracto_id: null, tipo_calculado: "otro", imputado_capital: 100000 });
    expect(r.extractos.e1.saldo_sistema_al_corte).toBe(2800000);
    expect(r.extractos.e1.otros_generados).toBe(48500);
  });
});

describe("§9.3 dos pagos parciales que suman el total", () => {
  it("el segundo se clasifica como pago total", () => {
    const r = libroMayor(
      COMPRAS,
      [EXTRACTO_OCT],
      [
        { id: "p1", fecha: "2026-10-20", monto: 1000000 },
        { id: "p2", fecha: "2026-10-28", monto: 1948500 },
      ],
      OPC,
    );
    expect(r.pagos.p1.tipo_calculado).toBe("otro");
    expect(r.pagos.p2.tipo_calculado).toBe("total");
    expect(r.extractos.e1.estado).toBe("pagado_total");
    expect(r.capital).toBe(0);
  });
});

describe("§9.4 pago inferior al mínimo", () => {
  it("se marca como inferior al mínimo", () => {
    const r = libroMayor(COMPRAS, [EXTRACTO_OCT], [{ id: "p1", fecha: "2026-10-25", monto: 300000 }], OPC);
    expect(r.pagos.p1.tipo_calculado).toBe("inferior_minimo");
    expect(r.extractos.e1.estado).toBe("parcial");
  });

  it("la tolerancia de $1.000 reconoce el pago mínimo redondeado", () => {
    expect(clasificarPago(748000, 2948500, 748500)).toBe("minimo");
    expect(clasificarPago(2948000, 2948500, 748500)).toBe("total");
    expect(clasificarPago(747000, 2948500, 748500)).toBe("inferior_minimo");
  });
});

describe("§9.5 saldo a favor", () => {
  it("un pago mayor a la deuda deja saldo a favor", () => {
    const r = libroMayor(COMPRAS, [EXTRACTO_OCT], [{ id: "p1", fecha: "2026-10-25", monto: 3000000 }], OPC);
    expect(r.pagos.p1).toMatchObject({
      tipo_calculado: "total",
      imputado_otros: 48500,
      imputado_capital: 2900000,
      saldo_a_favor: 51500,
    });
    expect(r.capital).toBe(-51500);
  });

  it("una devolución después de pagar todo deja saldo a favor", () => {
    const r = libroMayor(
      [...COMPRAS, { id: "d1", fecha: "2026-10-27", tipo: "devolucion", monto: 180000, num_cuotas: 1 }],
      [EXTRACTO_OCT],
      [{ id: "p1", fecha: "2026-10-25", monto: 2948500 }],
      OPC,
    );
    expect(r.capital).toBe(-180000);
  });
});

describe("§9.6 compra a 12 cuotas", () => {
  it("genera el calendario por corte y la última cuota absorbe el redondeo", () => {
    const q = cuotasDeCompra({ id: "x", fecha: "2026-09-28", tipo: "compra", monto: 1000000, num_cuotas: 12 }, 15);
    expect(q).toHaveLength(12);
    expect(q[0]).toEqual({ numero: 1, corte: "2026-10-15", valor: 83333.33 });
    expect(q[11]).toEqual({ numero: 12, corte: "2027-09-15", valor: 83333.37 });
    expect(q.reduce((a, c) => a + Math.round(c.valor * 100), 0)).toBe(100000000);
  });

  it("una compra el mismo día del corte entra en ese corte", () => {
    expect(corteDeCompra("2026-10-15", 15)).toBe("2026-10-15");
    expect(corteDeCompra("2026-10-16", 15)).toBe("2026-11-15");
    expect(corteDeCompra("2026-02-10", 30)).toBe("2026-02-28");
  });

  it("devoluciones se descuentan completas y los ajustes no se facturan", () => {
    expect(
      cuotasDeCompra({ id: "d", fecha: "2026-10-01", tipo: "devolucion", monto: 50000, num_cuotas: 3 }, 15),
    ).toEqual([{ numero: 1, corte: "2026-10-15", valor: -50000 }]);
    expect(cuotasDeCompra({ id: "a", fecha: "2026-10-01", tipo: "ajuste", monto: -1000, num_cuotas: 1 }, 15)).toEqual(
      [],
    );
  });
});

describe("§9.7 diferencia negativa", () => {
  it("alerta sin imputar cargos negativos a los pagos", () => {
    const extracto = { ...EXTRACTO_OCT, pago_total_banco: 2700000 };
    const r = libroMayor(COMPRAS, [extracto], [{ id: "p1", fecha: "2026-10-25", monto: 500000 }], OPC);
    expect(r.extractos.e1.otros_generados).toBe(-200000);
    expect(r.extractos.e1.alerta).toBe("conciliacion_negativa");
    expect(r.pagos.p1.imputado_otros).toBe(0);
    expect(r.pagos.p1.imputado_capital).toBe(500000);
  });

  it("alerta cuando el desglose no explica los otros cargos", () => {
    const conDesglose = { ...EXTRACTO_OCT, cuota_manejo: 32900, seguros: 15600 };
    expect(libroMayor(COMPRAS, [conDesglose], [], OPC).extractos.e1).toMatchObject({
      diferencia_no_explicada: 0,
      alerta: null,
    });
    const incompleto = { ...EXTRACTO_OCT, pago_total_banco: 3048500, cuota_manejo: 32900, seguros: 15600 };
    expect(libroMayor(COMPRAS, [incompleto], [], OPC).extractos.e1).toMatchObject({
      diferencia_no_explicada: 100000,
      alerta: "diferencia_no_explicada",
    });
  });
});

describe("§9.8 idempotencia", () => {
  it("recalcular con los datos en otro orden da el mismo resultado", () => {
    const pagos: PagoTC[] = [
      { id: "p1", fecha: "2026-10-20", monto: 1000000 },
      { id: "p2", fecha: "2026-10-28", monto: 500000 },
    ];
    const a = libroMayor(COMPRAS, [EXTRACTO_OCT], pagos, OPC);
    const b = libroMayor([...COMPRAS].reverse(), [EXTRACTO_OCT], [...pagos].reverse(), OPC);
    expect(b).toEqual(a);
    expect(libroMayor(COMPRAS, [EXTRACTO_OCT], pagos, OPC)).toEqual(a);
  });
});

describe("vistas previas y utilidades", () => {
  it("simula un pago con su imputación y lo que queda del extracto", () => {
    const v = simularPago(COMPRAS, [EXTRACTO_OCT], [], { fecha: "2026-10-25", monto: 1500000 }, OPC);
    expect(v).toMatchObject({
      tipo_calculado: "otro",
      imputado_otros: 48500,
      imputado_capital: 1451500,
      capital_restante: 1448500,
    });
    expect(v.pct_otros).toBeCloseTo(0.0323, 4);
    expect(v.extracto).toMatchObject({ pendiente_total: 2948500, pendiente_minimo: 748500 });
  });

  it("simula un extracto antes de guardarlo", () => {
    const v = simularExtracto(
      COMPRAS,
      [],
      [],
      {
        fecha_corte: "2026-10-15",
        fecha_limite_pago: "2026-10-30",
        pago_total_banco: 2948500,
        pago_minimo_banco: 748500,
      },
      OPC,
    );
    expect(v.otros_generados).toBe(48500);
    expect(v.minimo_estimado).toBe(748500);
  });

  it("calcula cortes, mejor día de compra y extracto pendiente", () => {
    expect(ultimoCorte("2026-10-20", 15)).toBe("2026-10-15");
    expect(ultimoCorte("2026-10-10", 15)).toBe("2026-09-15");
    expect(proximoCorte("2026-10-15", 15)).toBe("2026-11-15");
    expect(mejorDiaDeCompra(15)).toBe(16);
    expect(fechaLimiteDeCorte("2026-10-15", 30)).toBe("2026-10-30");
    expect(fechaLimiteDeCorte("2026-10-25", 5)).toBe("2026-11-05");
    expect(fechaLimiteDeCorte("2026-01-31", 28)).toBe("2026-02-28");
    expect(extractoPendiente("2026-10-20", 15, [], "2026-09-20")).toBe("2026-10-15");
    expect(extractoPendiente("2026-10-20", 15, [{ fecha_corte: "2026-10-16" }], "2026-09-20")).toBeNull();
    expect(extractoPendiente("2026-10-20", 15, [], "2026-10-18")).toBeNull();
  });

  it("clasifica la utilización del cupo", () => {
    expect([0.1, 0.3, 0.6, 0.61].map(nivelUtilizacion)).toEqual(["sano", "atencion", "atencion", "alto"]);
  });

  it("convierte tasa efectiva anual a mensual", () => {
    expect(tasaMensual(0.2682)).toBeCloseTo(0.02, 3);
  });
});
