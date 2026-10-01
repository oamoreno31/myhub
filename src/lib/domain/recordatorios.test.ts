import { describe, expect, it } from "vitest";
import { armarCorreoRecordatorio, esDomingo, respaldosParaBorrar } from "./recordatorios";

describe("correo de recordatorios", () => {
  const obligaciones = [
    { nombre: "Internet <Claro>", vence: "2026-09-28", pendiente: 95000, esperado: 95000, tarjeta: false },
    { nombre: "Pago Visa", vence: "2026-09-30", pendiente: 240000, esperado: 240000, tarjeta: true },
    { nombre: "Agua", vence: "2026-10-02", pendiente: 0, esperado: 0, tarjeta: false },
  ];

  it("resume vencidas, hoy y próximas con el total pendiente", () => {
    const c = armarCorreoRecordatorio({ obligaciones, hoy: "2026-09-30", urlApp: "https://plata.example.com" })!;
    expect(c.asunto).toBe("Plata Clara: 1 vencida, 1 vence hoy, 1 en los próximos días · $ 335.000");
    expect(c.html).toContain("Internet &lt;Claro&gt;");
    expect(c.html).toContain("! Vencida hace 2 días");
    expect(c.html).toContain("(pago mínimo)");
    expect(c.html).toContain("https://plata.example.com/mes");
    expect(c.texto).toContain("- Agua: monto por definir · vence en 2 días");
  });

  it("sin nada que avisar no hay correo; sin URL no hay botón", () => {
    expect(armarCorreoRecordatorio({ obligaciones: [], hoy: "2026-09-30", urlApp: null })).toBeNull();
    const c = armarCorreoRecordatorio({ obligaciones: obligaciones.slice(1, 2), hoy: "2026-09-30", urlApp: null })!;
    expect(c.html).not.toContain("<a href");
    expect(c.asunto).toBe("Plata Clara: 1 vence hoy · $ 240.000");
  });
});

describe("respaldos semanales", () => {
  it("retención de 8 semanas y detección de domingo", () => {
    expect(
      respaldosParaBorrar(["2026-07-26.json", "2026-08-09.json", "otro.txt", "2026-09-27.json"], "2026-10-04"),
    ).toEqual(["2026-07-26.json"]);
    expect(esDomingo("2026-10-04")).toBe(true);
    expect(esDomingo("2026-09-30")).toBe(false);
  });
});
