import { describe, expect, it } from "vitest";
import {
  cuotaFija,
  desgloseSugerido,
  efectoAbonoExtra,
  estadoPrestamo,
  proximaCuota,
  proyectarDeuda,
  saldoTrasCuotas,
} from "./deudas";

// 1 % mensual exacto ⇔ EA = 1,01^12 − 1
const EA_1PCT = 1.01 ** 12 - 1;

describe("cuota fija (sistema francés)", () => {
  it("1.000.000 al 1 % mensual en 12 meses → 88.849", () => {
    expect(cuotaFija(1_000_000, EA_1PCT, 12)).toBe(88_849);
  });

  it("sin intereses la cuota es capital / plazo", () => {
    expect(cuotaFija(1_200_000, 0, 12)).toBe(100_000);
  });

  it("10.000.000 a 26,82 % EA (≈2 % mensual) en 24 meses", () => {
    // 10M × 0,02 / (1 − 1,02^−24) = 528.711
    expect(cuotaFija(10_000_000, 1.02 ** 12 - 1, 24)).toBe(528_711);
  });
});

describe("proyección", () => {
  const base = { saldo: 1_000_000, tasaEA: EA_1PCT, cuota: 88_849, primerPeriodo: "2026-10", diaPago: 31 };

  it("termina en el plazo pactado y la última cuota ajusta el redondeo", () => {
    const p = proyectarDeuda(base);
    expect(p.termina).toBe(true);
    expect(p.meses).toBe(12);
    expect(p.filas[0]).toMatchObject({
      numero: 1,
      fecha: "2026-10-31",
      interes: 10_000,
      capital: 78_849,
      saldo: 921_151,
    });
    expect(p.filas[1].fecha).toBe("2026-11-30");
    expect(p.filas[11].saldo).toBe(0);
    expect(p.filas[11].cuota).toBeLessThanOrEqual(88_849);
    const capital = p.filas.reduce((a, f) => a + Math.round(f.capital * 100), 0);
    expect(capital).toBe(100_000_000);
    expect(p.interesesTotales).toBeCloseTo(66_185, -1);
    expect(p.fechaFin).toBe("2027-09-30");
  });

  it("detecta una cuota que no alcanza a cubrir los intereses", () => {
    const p = proyectarDeuda({ ...base, cuota: 9_000 });
    expect(p.termina).toBe(false);
    expect(p.fechaFin).toBeNull();
  });

  it("saldo teórico tras k cuotas coincide con la tabla", () => {
    const p = proyectarDeuda(base);
    expect(saldoTrasCuotas(1_000_000, EA_1PCT, 88_849, 5)).toBe(p.filas[4].saldo);
    expect(saldoTrasCuotas(1_000_000, EA_1PCT, 88_849, 40)).toBe(0);
  });

  it("un abono extra ahorra meses e intereses", () => {
    const e = efectoAbonoExtra({ ...base, extra: 300_000 });
    expect(e.mesesAhorrados).toBe(3);
    expect(e.interesesAhorrados).toBeGreaterThan(20_000);
    expect(e.despues.meses).toBe(9);
  });
});

describe("desglose sugerido de un pago", () => {
  it("aporte, seguro, intereses del mes y el resto a capital", () => {
    expect(desgloseSugerido({ monto: 294_000, saldo: 4_200_000, tasaEA: EA_1PCT, seguro: 0, aporte: 80_000 })).toEqual({
      a_aporte: 80_000,
      a_seguros: 0,
      a_intereses: 42_000,
      a_capital: 172_000,
      sobrante: 0,
    });
  });

  it("si el pago no alcanza, cubre primero aporte, seguro e intereses", () => {
    expect(
      desgloseSugerido({ monto: 50_000, saldo: 4_200_000, tasaEA: EA_1PCT, seguro: 12_000, aporte: 30_000 }),
    ).toEqual({
      a_aporte: 30_000,
      a_seguros: 12_000,
      a_intereses: 8_000,
      a_capital: 0,
      sobrante: 0,
    });
  });

  it("marca el sobrante cuando el abono supera la deuda", () => {
    expect(desgloseSugerido({ monto: 120_000, saldo: 100_000, tasaEA: 0 }).sobrante).toBe(20_000);
  });
});

describe("fechas y préstamos otorgados", () => {
  it("próxima cuota", () => {
    expect(proximaCuota("2026-09-26", 5)).toBe("2026-10-05");
    expect(proximaCuota("2026-09-26", 30)).toBe("2026-09-30");
    expect(proximaCuota("2026-02-10", 31)).toBe("2026-02-28");
  });

  it("estado de un préstamo que hiciste", () => {
    const hoy = "2026-09-26";
    expect(estadoPrestamo({ saldo: 0, fecha_esperada: "2026-01-01", castigado_en: null }, hoy)).toBe("pagado");
    expect(estadoPrestamo({ saldo: 10, fecha_esperada: null, castigado_en: "2026-09-01" }, hoy)).toBe("castigado");
    expect(estadoPrestamo({ saldo: 10, fecha_esperada: "2026-09-25", castigado_en: null }, hoy)).toBe("vencido");
    expect(estadoPrestamo({ saldo: 10, fecha_esperada: "2026-09-26", castigado_en: null }, hoy)).toBe("vigente");
  });
});
