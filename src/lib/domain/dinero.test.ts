import { describe, expect, it } from "vitest";
import { aCentavos, aPesos, formatearCOP, parsearMontoCOP, sumar } from "./dinero";

describe("dinero", () => {
  it("formatea COP sin decimales y con punto de miles", () => {
    expect(formatearCOP(1250000)).toBe("$ 1.250.000");
    expect(formatearCOP("2948500.00")).toBe("$ 2.948.500");
    expect(formatearCOP(0)).toBe("$ 0");
  });

  it("muestra signos", () => {
    expect(formatearCOP(-48500)).toBe("−$ 48.500");
    expect(formatearCOP(300000, { signo: true })).toBe("+ $ 300.000");
  });

  it("opera en centavos enteros sin errores de coma flotante", () => {
    const total = sumar(aCentavos(0.1), aCentavos(0.2));
    expect(total).toBe(30);
    expect(aPesos(total)).toBe(0.3);
    expect(aPesos(sumar(aCentavos("2900000.00"), aCentavos(48500)))).toBe(2948500);
  });

  it("interpreta montos escritos por el usuario", () => {
    expect(parsearMontoCOP("1.250.000")).toBe(1250000);
    expect(parsearMontoCOP("$ 45.000")).toBe(45000);
    expect(parsearMontoCOP("1250000,50")).toBe(1250000.5);
    expect(parsearMontoCOP("")).toBeNull();
    expect(parsearMontoCOP("abc")).toBeNull();
  });

  it("rechaza montos inválidos", () => {
    expect(() => aCentavos("abc")).toThrow(/inválido/);
  });
});
