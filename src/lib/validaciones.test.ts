import { describe, expect, it } from "vitest";
import { erroresPorCampo, monto, movimientoSchema, plantillaSchema, presupuestoSchema } from "./validaciones";

const CUENTA = "00000000-0000-4000-8000-00000000000a";
const CAT = "00000000-0000-4000-8000-00000000000b";

describe("validaciones de formularios", () => {
  it("interpreta montos escritos en formato colombiano", () => {
    expect(monto().parse("1.250.000")).toBe(1250000);
    expect(monto({ permitirCero: true }).parse("0")).toBe(0);
    expect(monto().safeParse("0").success).toBe(false);
    expect(monto().safeParse("abc").success).toBe(false);
  });

  it("acepta un gasto aunque falten campos opcionales en el FormData", () => {
    const r = movimientoSchema.safeParse({
      tipo: "gasto",
      fecha: "2026-09-26",
      monto: "45.000",
      cuenta_id: CUENTA,
      categoria_id: CAT,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.id).toBeNull();
      expect(r.data.cuenta_destino_id).toBeNull();
      expect(r.data.descripcion).toBeNull();
      expect(r.data.reembolsable).toBe(false);
    }
  });

  it("exige categoría en gastos y destino distinto en transferencias", () => {
    const sinCategoria = movimientoSchema.safeParse({
      tipo: "gasto",
      fecha: "2026-09-26",
      monto: "1",
      cuenta_id: CUENTA,
    });
    expect(sinCategoria.success).toBe(false);
    if (!sinCategoria.success) expect(erroresPorCampo(sinCategoria.error).categoria_id).toBe("Elige una categoría");

    const mismaCuenta = movimientoSchema.safeParse({
      tipo: "transferencia",
      fecha: "2026-09-26",
      monto: "1",
      cuenta_id: CUENTA,
      cuenta_destino_id: CUENTA,
    });
    expect(mismaCuenta.success).toBe(false);
  });

  it("valida plantillas: día 1–31 y fin posterior al inicio", () => {
    const base = {
      nombre: "Luz",
      tipo: "servicio",
      categoria_id: CAT,
      monto_estimado: "142.000",
      dia_vencimiento: "15",
      frecuencia: "mensual",
      fecha_inicio: "2026-09",
    };
    expect(plantillaSchema.safeParse(base).success).toBe(true);
    expect(plantillaSchema.safeParse({ ...base, dia_vencimiento: "32" }).success).toBe(false);
    expect(plantillaSchema.safeParse({ ...base, fecha_fin: "2026-08" }).success).toBe(false);
  });

  it("valida el presupuesto enviado como JSON", () => {
    const base = { periodo_id: CUENTA, plantilla: "true" };
    const ok = presupuestoSchema.safeParse({ ...base, items: JSON.stringify([{ categoria_id: CAT, monto: 450000 }]) });
    expect(ok.success && ok.data.plantilla && ok.data.items[0].monto).toBe(450000);
    expect(presupuestoSchema.safeParse({ ...base, items: "no-es-json" }).success).toBe(false);
    expect(
      presupuestoSchema.safeParse({ ...base, items: JSON.stringify([{ categoria_id: CAT, monto: -1 }]) }).success,
    ).toBe(false);
    const repetida = JSON.stringify([
      { categoria_id: CAT, monto: 1 },
      { categoria_id: CAT, monto: 2 },
    ]);
    expect(presupuestoSchema.safeParse({ ...base, items: repetida }).success).toBe(false);
  });
});
