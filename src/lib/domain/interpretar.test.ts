import { describe, expect, it } from "vitest";
import {
  claveTexto,
  enmascararTexto,
  interpretarDictado,
  interpretarSMS,
  montoATexto,
  nombreBonito,
  normalizarMonto,
} from "./interpretar";

describe("normalizarMonto", () => {
  it.each([
    ["45900", 45900],
    ["45.900", 45900],
    ["$ 45.900", 45900],
    ["$45.900,00", 45900],
    ["45,900.00", 45900],
    ["45,900", 45900],
    ["1.250.000", 1250000],
    ["1,250,000.50", 1250000.5],
    ["45 900", 45900],
    ["COP 45.900", 45900],
    ["45900,5", 45900.5],
    ["12.5", 12.5],
    ["45k", 45000],
    ["45 mil", 45000],
    ["25 lucas", 25000],
    ["1,5 millones", 1500000],
    ["2 millones", 2000000],
    ["1.5m", 1500000],
    ["3 palos", 3000000],
    ["1'500.000", 1500000],
  ])("%s → %d", (entrada, esperado) => {
    expect(normalizarMonto(entrada)).toBe(esperado);
  });

  it("acepta números y rechaza lo inválido", () => {
    expect(normalizarMonto(45900)).toBe(45900);
    expect(normalizarMonto(45900.123)).toBe(45900.12);
    for (const malo of ["", "abc", "0", "-5", null, undefined, 0, -1, Number.NaN, 1e13, {}]) {
      expect(normalizarMonto(malo)).toBeNull();
    }
  });

  it("no toma cifras pegadas a letras", () => {
    expect(normalizarMonto("D1 25 mil")).toBe(25000);
  });

  it("formatea para prellenar", () => {
    expect(montoATexto(45900)).toBe("45.900");
    expect(montoATexto(null)).toBe("");
  });
});

describe("claveTexto", () => {
  it("es el espejo de clave_texto en SQL", () => {
    expect(claveTexto("  Éxito   CHAPINERO ")).toBe("exito chapinero");
    expect(claveTexto("Panadería Ñapa")).toBe("panaderia ñapa");
    expect(claveTexto("   ")).toBeNull();
    expect(claveTexto(null)).toBeNull();
  });

  it("embellece nombres en mayúsculas", () => {
    expect(nombreBonito("EXITO CHAPINERO")).toBe("Exito Chapinero");
    expect(nombreBonito("Juan Pérez")).toBe("Juan Pérez");
    expect(nombreBonito("TIENDA D1 S.A.S")).toBe("Tienda D1 S.A.S");
  });
});

describe("enmascararTexto", () => {
  it("quita saldos y enmascara números largos", () => {
    const t = enmascararTexto("Compra por $10.000. Saldo disponible $1.234.567. Llama al 018000912345");
    expect(t).not.toContain("1.234.567");
    expect(t).toContain("saldo [omitido]");
    expect(t).toContain("••••2345");
    expect(t).toContain("$10.000");
  });
});

/**
 * Los textos de estos casos son ilustrativos (redacción típica de bancos colombianos), no copias
 * de SMS reales. En F8.0 se agregan los SMS reales anonimizados como casos adicionales.
 */
describe("interpretarSMS", () => {
  it("compra con tarjeta de crédito", () => {
    const r = interpretarSMS(
      "Bancolombia: Compraste $45.900,00 en EXITO CHAPINERO con tu T.Cred *1234, el 23/11/2026 a las 19:42. Si tienes dudas llama al 018000912345",
    );
    expect(r).toMatchObject({
      accion: "preguntar",
      operacion: "compra",
      tipo: "gasto",
      medio: "credito",
      monto: 45900,
      comercio: "Exito Chapinero",
      descripcion: "Exito Chapinero",
      ultimos4: "1234",
    });
    expect(r.textoEnmascarado).toContain("••••2345");
  });

  it("compra aprobada con saldo al final (el saldo no se confunde con el monto)", () => {
    const r = interpretarSMS(
      "Davivienda: Compra aprobada por $ 45.900 en RAPPI*COLOMBIA con tarjeta de credito terminada en 1234. Saldo disponible $1.200.000",
    );
    expect(r).toMatchObject({ operacion: "compra", monto: 45900, medio: "credito", ultimos4: "1234" });
    expect(r.comercio).toBe("Rappi*colombia");
    expect(r.textoEnmascarado).not.toContain("1.200.000");
  });

  it("comercio antes del monto", () => {
    const r = interpretarSMS("Compra en TIENDA D1 por $23.450 con tu tarjeta debito *4321");
    expect(r).toMatchObject({ monto: 23450, medio: "debito", ultimos4: "4321", comercio: "Tienda D1" });
  });

  it("pago PSE / de servicio", () => {
    const r = interpretarSMS("Pagaste $182.400 a ENEL CODENSA desde tu cuenta de ahorros *5678 por PSE.");
    expect(r).toMatchObject({
      operacion: "pago",
      tipo: "gasto",
      medio: "debito",
      monto: 182400,
      comercio: "Enel Codensa",
      ultimos4: "5678",
    });
  });

  it("transferencia enviada a una persona", () => {
    const r = interpretarSMS("Enviaste $20.000 a Juan Pérez desde Nequi. ¡Gracias por usar Nequi!");
    expect(r).toMatchObject({
      operacion: "transferencia_enviada",
      tipo: "gasto",
      monto: 20000,
      comercio: "Juan Pérez",
      descripcion: "Transferencia a Juan Pérez",
    });
  });

  it("transferencia enviada a una cuenta sin nombre", () => {
    const r = interpretarSMS(
      "Bancolombia: Transferiste $50.000 desde tu cuenta *5678 a la cuenta *9999 el 23/11/2026 a las 10:00.",
    );
    expect(r).toMatchObject({
      operacion: "transferencia_enviada",
      monto: 50000,
      ultimos4: "5678",
      comercio: null,
      descripcion: "Transferencia",
    });
  });

  it("transferencia recibida", () => {
    const r = interpretarSMS(
      "Recibiste una transferencia por $1.500.000 de DEVTOPIA WEB SERVICES SAS en tu cuenta **5678 el 23/11/2026.",
    );
    expect(r).toMatchObject({
      operacion: "transferencia_recibida",
      tipo: "ingreso",
      monto: 1500000,
      comercio: "Devtopia Web Services Sas",
      descripcion: "Transferencia de Devtopia Web Services Sas",
      ultimos4: "5678",
    });
  });

  it("retiro en cajero → transferencia a efectivo", () => {
    const r = interpretarSMS("Retiraste $200.000 en cajero de tu cuenta *5678.");
    expect(r).toMatchObject({
      operacion: "retiro",
      tipo: "transferencia",
      monto: 200000,
      descripcion: "Retiro en cajero",
    });
  });

  it.each([
    ["Tu clave dinámica es 482913. No la compartas con nadie.", "Código o clave"],
    ["Tu código de verificación para compra es 482913", "Código o clave"],
    ["¡Aprovecha! 20% de descuento en tu próxima compra con tarjeta.", "Publicidad"],
    ["Hola, tu extracto ya está disponible en la app.", "No parece un movimiento"],
  ])("ignora: %s", (sms, motivo) => {
    expect(interpretarSMS(sms)).toMatchObject({ accion: "ignorar", motivo, monto: null });
  });

  it("movimiento sin monto reconocible: pregunta igual", () => {
    expect(interpretarSMS("Compraste en EXITO con tu tarjeta *1234")).toMatchObject({
      accion: "preguntar",
      monto: null,
      ultimos4: "1234",
    });
  });
});

describe("interpretarDictado", () => {
  it.each([
    [
      "Gasté 25 mil en almuerzo con Nequi",
      { tipo: "gasto", monto: 25000, descripcion: "Almuerzo", origenTexto: "nequi" },
    ],
    [
      "Pagué 120.000 de la luz desde Bancolombia",
      { tipo: "gasto", monto: 120000, descripcion: "Luz", origenTexto: "bancolombia" },
    ],
    [
      "gaste 45k en mercado con la tarjeta Visa",
      { tipo: "gasto", monto: 45000, descripcion: "Mercado", origenTexto: "visa" },
    ],
    [
      "Recibí 2 millones de Devtopia en ahorros",
      { tipo: "ingreso", monto: 2000000, descripcion: "Devtopia", origenTexto: "ahorros" },
    ],
    [
      "Me pagaron 300 mil de la cuota de Pedro a Nequi",
      { tipo: "ingreso", monto: 300000, descripcion: "Cuota de Pedro", origenTexto: "nequi" },
    ],
    ["Taxi 18 mil", { tipo: "gasto", monto: 18000, descripcion: "Taxi", origenTexto: null }],
    ["$ 9.500 pan", { tipo: "gasto", monto: 9500, descripcion: "Pan", origenTexto: null }],
    ["almuerzo", { tipo: "gasto", monto: null, descripcion: "Almuerzo", origenTexto: null }],
  ])("%s", (frase, esperado) => {
    expect(interpretarDictado(frase)).toEqual(esperado);
  });
});
