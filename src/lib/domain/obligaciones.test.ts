import { describe, expect, it } from "vitest";
import {
  agruparObligaciones,
  aplicaEnMes,
  diasHasta,
  estadoObligacion,
  etiquetaRelativa,
  fechaEnMes,
  hoyISO,
  type ObligacionMes,
  pendienteDe,
  proximosMeses,
  resumirObligaciones,
  vistaPreviaPago,
} from "./obligaciones";

const HOY = "2026-09-25";

function ob(p: Partial<ObligacionMes> & { nombre: string }): ObligacionMes {
  return {
    id: p.nombre,
    es_ingreso: false,
    monto_esperado: 100000,
    pagado: 0,
    fecha_vencimiento: "2026-09-30",
    resolucion: null,
    ...p,
  };
}

describe("estado de una obligación", () => {
  it("pagada, parcial, vencida, vence pronto y pendiente", () => {
    expect(estadoObligacion(ob({ nombre: "a", pagado: 100000 }), HOY)).toBe("pagada");
    expect(estadoObligacion(ob({ nombre: "a", pagado: "120000.00" }), HOY)).toBe("pagada");
    expect(estadoObligacion(ob({ nombre: "a", pagado: 1 }), HOY)).toBe("parcial");
    expect(estadoObligacion(ob({ nombre: "a", fecha_vencimiento: "2026-09-24" }), HOY)).toBe("vencida");
    expect(estadoObligacion(ob({ nombre: "a", fecha_vencimiento: "2026-09-28" }), HOY)).toBe("vence_pronto");
    expect(estadoObligacion(ob({ nombre: "a", fecha_vencimiento: "2026-09-25" }), HOY)).toBe("vence_pronto");
    expect(estadoObligacion(ob({ nombre: "a", fecha_vencimiento: "2026-09-29" }), HOY)).toBe("pendiente");
  });

  it("la resolución manda sobre todo lo demás", () => {
    expect(estadoObligacion(ob({ nombre: "a", resolucion: "omitida", fecha_vencimiento: "2026-01-01" }), HOY)).toBe(
      "omitida",
    );
    expect(estadoObligacion(ob({ nombre: "a", resolucion: "arrastrada" }), HOY)).toBe("arrastrada");
  });

  it("una obligación en cero sin pagos queda pendiente", () => {
    expect(estadoObligacion(ob({ nombre: "a", monto_esperado: 0, fecha_vencimiento: "2026-10-30" }), HOY)).toBe(
      "pendiente",
    );
    expect(estadoObligacion(ob({ nombre: "a", monto_esperado: 0, pagado: 5000 }), HOY)).toBe("pagada");
  });

  it("calcula el pendiente", () => {
    expect(pendienteDe(ob({ nombre: "a", pagado: 58000 }))).toBe(42000);
    expect(pendienteDe(ob({ nombre: "a", pagado: 150000 }))).toBe(0);
    expect(pendienteDe(ob({ nombre: "a", resolucion: "omitida" }))).toBe(0);
  });
});

describe("fechas relativas", () => {
  it("describe la distancia al vencimiento", () => {
    expect(diasHasta("2026-10-01", HOY)).toBe(6);
    expect(etiquetaRelativa("2026-09-25", HOY)).toBe("hoy");
    expect(etiquetaRelativa("2026-09-26", HOY)).toBe("mañana");
    expect(etiquetaRelativa("2026-09-24", HOY)).toBe("ayer");
    expect(etiquetaRelativa("2026-09-30", HOY)).toBe("en 5 días");
    expect(etiquetaRelativa("2026-09-20", HOY)).toBe("hace 5 días");
  });

  it("hoy se calcula en Bogotá", () => {
    expect(hoyISO(new Date("2026-10-01T04:30:00Z"))).toBe("2026-09-30");
  });
});

describe("agrupación y resumen", () => {
  const lista = [
    ob({ nombre: "Gas", fecha_vencimiento: "2026-09-24", monto_esperado: 58400 }),
    ob({ nombre: "Visa", fecha_vencimiento: "2026-09-30", monto_esperado: 2948500 }),
    ob({ nombre: "Cooperativa", fecha_vencimiento: "2026-09-26", monto_esperado: 450000, pagado: 100000 }),
    ob({ nombre: "Arriendo", fecha_vencimiento: "2026-09-05", monto_esperado: 1800000, pagado: 1800000 }),
    ob({ nombre: "Agua", resolucion: "omitida", monto_esperado: 96300 }),
    ob({ nombre: "Luz vieja", resolucion: "arrastrada", monto_esperado: 42000 }),
    ob({ nombre: "Predial", fecha_vencimiento: "2026-10-15", monto_esperado: 500000 }),
    ob({ nombre: "Sueldo", es_ingreso: true, monto_esperado: 9000000, fecha_vencimiento: "2026-09-01" }),
  ];

  it("agrupa por urgencia y ordena por fecha", () => {
    const g = agruparObligaciones(lista, HOY);
    expect(g.vencidas.map((o) => o.nombre)).toEqual(["Sueldo", "Gas"]);
    expect(g.proximas.map((o) => o.nombre)).toEqual(["Cooperativa", "Visa"]);
    expect(g.resto.map((o) => o.nombre)).toEqual(["Predial"]);
    expect(g.pagadas.map((o) => o.nombre)).toEqual(["Arriendo"]);
    expect(g.cerradas.map((o) => o.nombre).sort()).toEqual(["Agua", "Luz vieja"]);
  });

  it("resume solo egresos, sin contar las arrastradas", () => {
    const r = resumirObligaciones(lista, HOY);
    expect(r.total).toBe(6);
    expect(r.pagadas).toBe(1);
    expect(r.pendientes).toBe(4);
    expect(r.vencidas).toBe(1);
    expect(r.montoEsperado).toBe(58400 + 2948500 + 450000 + 1800000 + 500000);
    expect(r.montoPagado).toBe(1900000);
    expect(r.montoPendiente).toBe(58400 + 2948500 + 350000 + 500000);
    expect(r.avance).toBeCloseTo(1 / 5);
  });
});

describe("vista previa de un pago", () => {
  it("indica si queda pagada o cuánto falta", () => {
    expect(vistaPreviaPago(142000, 0, 138750)).toEqual({ estado: "parcial", faltante: 3250, excedente: 0 });
    expect(vistaPreviaPago(142000, 100000, 42000)).toEqual({ estado: "pagada", faltante: 0, excedente: 0 });
    expect(vistaPreviaPago("142000.00", 0, 150000)).toEqual({ estado: "pagada", faltante: 0, excedente: 8000 });
    expect(vistaPreviaPago(0, 0, 50000)).toEqual({ estado: "pagada", faltante: 0, excedente: 50000 });
  });
});

describe("plantillas", () => {
  it("aplica frecuencias como en SQL", () => {
    expect(aplicaEnMes("bimestral", "2026-09", "2026-09", null, "2026-11")).toBe(true);
    expect(aplicaEnMes("bimestral", "2026-09", "2026-09", null, "2026-10")).toBe(false);
    expect(aplicaEnMes("mensual", "2026-09", "2026-09", null, "2026-08")).toBe(false);
    expect(aplicaEnMes("anual", "2025-03", "2025-03", null, "2027-03")).toBe(true);
    expect(aplicaEnMes("mensual", "2026-01", "2026-01", "2026-06", "2026-07")).toBe(false);
  });

  it("recorta el día al final del mes", () => {
    expect(fechaEnMes("2026-09", 31)).toBe("2026-09-30");
    expect(fechaEnMes("2028-02", 30)).toBe("2028-02-29");
    expect(fechaEnMes("2026-10", 5)).toBe("2026-10-05");
  });

  it("lista los próximos meses de una plantilla", () => {
    expect(
      proximosMeses({ frecuencia: "bimestral", ancla: "2026-09", inicio: "2026-09", fin: null }, "2026-10", 3),
    ).toEqual(["2026-11", "2027-01", "2027-03"]);
    expect(
      proximosMeses({ frecuencia: "mensual", ancla: "2026-09", inicio: "2026-09", fin: "2026-10" }, "2026-09"),
    ).toEqual(["2026-09", "2026-10"]);
  });
});
