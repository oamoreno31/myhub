import { describe, expect, it } from "vitest";
import {
  aliasATexto,
  aliasDeTexto,
  CLASIFICAR_DESPUES,
  desempaquetarClave,
  empaquetarClave,
  diccionario,
  diccionarioCategorias,
  diccionarioOrigenes,
  estadoToken,
  etiquetaOrigen,
  fuenteDeRegistro,
  haceCuanto,
  idDeOrigen,
  mensajeRegistro,
  textoDuplicado,
  type OrigenAtajo,
} from "./atajos";

const VISA: OrigenAtajo = {
  id: "11111111-1111-4111-8111-111111111111",
  nombre: "Visa",
  tipo: "tarjeta_credito",
  tarjeta: true,
  ultimos4: "1234",
  sugerido: true,
};
const NEQUI: OrigenAtajo = {
  id: "22222222-2222-4222-8222-222222222222",
  nombre: "Nequi",
  tipo: "billetera",
  tarjeta: false,
  ultimos4: null,
  sugerido: false,
};

describe("orígenes", () => {
  it("etiqueta con ícono y últimos 4; valor con prefijo t:/c:", () => {
    expect(etiquetaOrigen(VISA)).toBe("💳 Visa ·1234");
    const d = diccionarioOrigenes([VISA, NEQUI], "gasto");
    expect(d.lista).toEqual(["💳 Visa ·1234", "📱 Nequi"]);
    expect(d.mapa["💳 Visa ·1234"]).toBe(`t:${VISA.id}`);
    expect(d.mapa["📱 Nequi"]).toBe(`c:${NEQUI.id}`);
    expect(idDeOrigen(`t:${VISA.id}`)).toBe(VISA.id);
    expect(idDeOrigen(NEQUI.id)).toBe(NEQUI.id);
  });

  it("ingresos y retiros no ofrecen tarjetas de crédito", () => {
    expect(diccionarioOrigenes([VISA, NEQUI], "ingreso").lista).toEqual(["📱 Nequi"]);
    expect(diccionarioOrigenes([VISA, NEQUI], "transferencia").lista).toEqual(["📱 Nequi"]);
  });

  it("las etiquetas repetidas se numeran y se conserva el orden", () => {
    const d = diccionario([
      ["A", "1"],
      ["B", "2"],
      ["A", "3"],
    ]);
    expect(d.lista).toEqual(["A", "B", "A (2)"]);
    expect(JSON.stringify(d.mapa)).toBe('{"A":"1","B":"2","A (2)":"3"}');
  });
});

describe("categorías", () => {
  const cats = [
    { id: "m", nombre: "Mercado", padre: "Otros gastos" },
    { id: "r", nombre: "Regalos", padre: "Otros gastos" },
    { id: "r2", nombre: "Regalos", padre: null },
  ];

  it("la sugerida va primero con su id y al final 'Clasificar después' = auto", () => {
    const d = diccionarioCategorias(cats, { id: "m", nombre: "Mercado", confiable: false });
    expect(d.lista).toEqual(["✨ Mercado (sugerida)", "Regalos · Otros gastos", "Regalos", CLASIFICAR_DESPUES]);
    expect(d.mapa["✨ Mercado (sugerida)"]).toBe("m");
    expect(d.mapa[CLASIFICAR_DESPUES]).toBe("auto");
  });

  it("sin sugerencia, solo la lista", () => {
    expect(diccionarioCategorias(cats.slice(0, 1), null).lista).toEqual(["Mercado", CLASIFICAR_DESPUES]);
  });
});

describe("mensajes", () => {
  it("compra con tarjeta", () => {
    expect(
      mensajeRegistro({
        ok: true,
        registro: "compra_tc",
        tipo: "gasto",
        monto: 45900,
        origen: "Visa",
        ultimos4: "1234",
        categoria: "Mercado",
        cuotas: 3,
        por_revisar: false,
      }),
    ).toBe("✓ Compra de $ 45.900 · Visa ·1234 · Mercado · 3 cuotas");
  });

  it("gasto por revisar, ingreso, transferencia, repetido y error", () => {
    expect(
      mensajeRegistro({
        ok: true,
        registro: "movimiento",
        tipo: "gasto",
        monto: "25000.00",
        origen: "Nequi",
        categoria: "Por clasificar",
        por_revisar: true,
      }),
    ).toBe("✓ Gasto de $ 25.000 · Nequi · Por clasificar · 📥 por revisar");
    expect(
      mensajeRegistro({
        ok: true,
        registro: "movimiento",
        tipo: "ingreso",
        monto: 5000000,
        origen: "Ahorros",
        categoria: "Sueldo",
      }),
    ).toBe("✓ Ingreso de $ 5.000.000 · Ahorros · Sueldo");
    expect(
      mensajeRegistro({
        ok: true,
        registro: "movimiento",
        tipo: "transferencia",
        monto: 200000,
        origen: "Ahorros",
        destino: "Efectivo",
      }),
    ).toBe("✓ $ 200.000 de Ahorros a Efectivo");
    expect(
      mensajeRegistro({
        ok: true,
        repetido: true,
        registro: "movimiento",
        tipo: "gasto",
        monto: 1000,
        origen: "Nequi",
        categoria: "Mercado",
      }),
    ).toBe("Ya estaba registrado: Gasto de $ 1.000 · Nequi · Mercado");
    expect(mensajeRegistro({ ok: false, mensaje: "Origen no encontrado" })).toBe("⚠️ Origen no encontrado");
  });

  it("pregunta de duplicado", () => {
    expect(textoDuplicado({ hace_min: 3, descripcion: "Exito Chapinero", origen: "Visa", monto: 45900 })).toBe(
      "¿Ya registraste $ 45.900 en Exito Chapinero (Visa) hace 3 min?",
    );
    expect(textoDuplicado({ hace_min: 0, descripcion: null, origen: "Nequi", monto: "1000" })).toBe(
      "¿Ya registraste $ 1.000 con Nequi (Nequi) hace un momento?",
    );
  });
});

describe("pantalla de atajos", () => {
  const ahora = new Date("2026-11-24T12:00:00Z");

  it("estado del token", () => {
    expect(estadoToken({ revocado_en: null, expira_en: null }, ahora)).toBe("activo");
    expect(estadoToken({ revocado_en: "2026-11-01T00:00:00Z", expira_en: null }, ahora)).toBe("revocado");
    expect(estadoToken({ revocado_en: null, expira_en: "2026-11-24T11:59:00Z" }, ahora)).toBe("vencido");
    expect(estadoToken({ revocado_en: null, expira_en: "2026-12-24T00:00:00Z" }, ahora)).toBe("activo");
  });

  it("hace cuánto", () => {
    expect(haceCuanto(null, ahora)).toBe("nunca");
    expect(haceCuanto("2026-11-24T11:59:40Z", ahora)).toBe("hace un momento");
    expect(haceCuanto("2026-11-24T11:55:00Z", ahora)).toBe("hace 5 min");
    expect(haceCuanto("2026-11-24T09:00:00Z", ahora)).toBe("hace 3 h");
    expect(haceCuanto("2026-11-23T10:00:00Z", ahora)).toBe("hace 1 día");
    expect(haceCuanto("2026-11-20T10:00:00Z", ahora)).toBe("hace 4 días");
  });

  it("fuente de un registro", () => {
    expect(fuenteDeRegistro("atajo_wallet")).toBe("Wallet");
    expect(fuenteDeRegistro("atajo_sms")).toBe("SMS");
    expect(fuenteDeRegistro("app")).toBeNull();
    expect(fuenteDeRegistro(null)).toBeNull();
  });
});

describe("formato amable para Atajos", () => {
  it("alias como texto, ida y vuelta", () => {
    const alias = [
      { tipo: "wallet_tarjeta" as const, valor: "Visa Bancolombia" },
      { tipo: "sms_ultimos4" as const, valor: "1234" },
    ];
    expect(aliasATexto(alias)).toBe("wallet_tarjeta:Visa Bancolombia|sms_ultimos4:1234");
    expect(aliasDeTexto(aliasATexto(alias))).toEqual(alias);
    expect(aliasDeTexto("otro:x|sms_ultimos4:|nombre_dictado:nequi|basura")).toEqual([
      { tipo: "nombre_dictado", valor: "nequi" },
    ]);
    expect(aliasDeTexto("")).toEqual([]);
  });

  it("clave empaquetada (con tildes) y clave simple", () => {
    const k = empaquetarClave("44444444-4444-4444-8444-444444444444", {
      fuente: "wallet",
      tipo: "gasto",
      comercio: "Panadería Ñapa",
      alias: "",
    });
    expect(k).toMatch(/^44444444-4444-4444-8444-444444444444\.[A-Za-z0-9_-]+$/);
    expect(desempaquetarClave(k)).toEqual({
      clave: "44444444-4444-4444-8444-444444444444",
      paquete: { fuente: "wallet", tipo: "gasto", comercio: "Panadería Ñapa" },
    });
    expect(empaquetarClave("abc12345", {})).toBe("abc12345");
    expect(desempaquetarClave("prueba-0001-clave")).toEqual({ clave: "prueba-0001-clave", paquete: {} });
    expect(desempaquetarClave("abc12345.%%%")).toEqual({ clave: "abc12345", paquete: {} });
  });
});
