import { describe, expect, it } from "vitest";
import { correoPermitido, rutaSegura } from "./lista-blanca";

describe("lista blanca", () => {
  const permitidos = ["oamoreno31@gmail.com"];

  it("acepta el correo autorizado sin importar mayúsculas o espacios", () => {
    expect(correoPermitido("oamoreno31@gmail.com", permitidos)).toBe(true);
    expect(correoPermitido("  OAMoreno31@Gmail.com ", permitidos)).toBe(true);
  });

  it("rechaza otros correos o vacíos", () => {
    expect(correoPermitido("otro@gmail.com", permitidos)).toBe(false);
    expect(correoPermitido(undefined, permitidos)).toBe(false);
    expect(correoPermitido("", permitidos)).toBe(false);
  });
});

describe("rutaSegura", () => {
  it("permite rutas internas", () => {
    expect(rutaSegura("/tarjetas?x=1")).toBe("/tarjetas?x=1");
  });

  it("bloquea redirecciones externas y bucles de login", () => {
    expect(rutaSegura("https://malo.com")).toBe("/");
    expect(rutaSegura("//malo.com")).toBe("/");
    expect(rutaSegura("/\\malo.com")).toBe("/");
    expect(rutaSegura("/login")).toBe("/");
    expect(rutaSegura(null)).toBe("/");
  });
});
