import { describe, expect, it } from "vitest";
import {
  compararPeriodos,
  desplazarPeriodo,
  esPeriodoValido,
  nombreCortoPeriodo,
  nombrePeriodo,
  periodoActual,
  periodoDeFechaISO,
  primerDiaDelPeriodo,
} from "./periodos";

describe("periodos", () => {
  it("valida el formato YYYY-MM", () => {
    expect(esPeriodoValido("2026-09")).toBe(true);
    expect(esPeriodoValido("2026-13")).toBe(false);
    expect(esPeriodoValido("2026-9")).toBe(false);
    expect(esPeriodoValido(null)).toBe(false);
  });

  it("usa la hora de Bogotá para decidir el mes actual", () => {
    // 1 de octubre 03:00 UTC = 30 de septiembre 22:00 en Bogotá
    expect(periodoActual(new Date("2026-10-01T03:00:00Z"))).toBe("2026-09");
    expect(periodoActual(new Date("2026-10-01T05:00:00Z"))).toBe("2026-10");
  });

  it("se desplaza entre meses y años", () => {
    expect(desplazarPeriodo("2026-12", 1)).toBe("2027-01");
    expect(desplazarPeriodo("2026-01", -1)).toBe("2025-12");
    expect(desplazarPeriodo("2026-09", 0)).toBe("2026-09");
    expect(desplazarPeriodo("2026-09", 15)).toBe("2027-12");
  });

  it("convierte a la fecha que se guarda en la BD y de vuelta", () => {
    expect(primerDiaDelPeriodo("2026-09")).toBe("2026-09-01");
    expect(periodoDeFechaISO("2026-09-25")).toBe("2026-09");
    expect(() => primerDiaDelPeriodo("2026-00")).toThrow(/inválido/);
  });

  it("nombra los periodos en español", () => {
    expect(nombrePeriodo("2026-09")).toBe("Septiembre 2026");
    expect(nombreCortoPeriodo("2026-09")).toBe("Sep 2026");
    expect(nombrePeriodo("2027-01")).toBe("Enero 2027");
  });

  it("compara periodos", () => {
    expect(compararPeriodos("2026-09", "2026-10")).toBeLessThan(0);
    expect(compararPeriodos("2027-01", "2026-12")).toBeGreaterThan(0);
  });
});
