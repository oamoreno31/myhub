import { describe, expect, it } from "vitest";
import { aCSV, rangoExportacion } from "./exportacion";

describe("exportación CSV", () => {
  it("separador ;, coma decimal, BOM, comillas y sin fórmulas", () => {
    const csv = aCSV({
      nombre: "x",
      columnas: [
        { clave: "a", titulo: "Descripción" },
        { clave: "b", titulo: "Monto", tipo: "pesos" },
        { clave: "c", titulo: "Reembolsable" },
      ],
      filas: [
        { a: 'Mercado; "Éxito"', b: 1250000.5, c: true },
        { a: "=HYPERLINK(1)", b: -3000, c: false },
        { a: null, b: null, c: null },
      ],
    });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual([
      "Descripción;Monto;Reembolsable",
      '"Mercado; ""Éxito""";1250000,5;Sí',
      "'=HYPERLINK(1);-3000;No",
      ";;",
      "",
    ]);
  });

  it("rango por defecto: año en curso; se ordena y se limita a 36 meses", () => {
    expect(rangoExportacion(null, null, "2026-09")).toEqual({ desde: "2026-01", hasta: "2026-09" });
    expect(rangoExportacion("2026-08", "2026-02", "2026-09")).toEqual({ desde: "2026-02", hasta: "2026-08" });
    expect(rangoExportacion("2020-01", "2026-09", "2026-09")).toEqual({ desde: "2023-10", hasta: "2026-09" });
  });
});
