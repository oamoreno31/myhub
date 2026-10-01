"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type EstadoAccion, falla } from "@/lib/acciones";
import { CUENTAS_SUGERIDAS, OBLIGACIONES_SUGERIDAS } from "@/lib/bienvenida";
import { parsearMontoCOP } from "@/lib/domain/dinero";
import { hoyISO } from "@/lib/domain/obligaciones";
import { primerDiaDelPeriodo } from "@/lib/domain/periodos";
import { serverEnv } from "@/lib/env.server";
import { obtenerPeriodoActual } from "@/lib/periodo-seleccionado";
import { createClient } from "@/lib/supabase/server";

function dia(valor: FormDataEntryValue | null, porDefecto: number) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : porDefecto;
}

/** Crea cuentas, obligaciones e ingreso esperado de una vez y genera el mes actual. */
export async function completarBienvenida(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const supabase = await createClient();
  const hoy = hoyISO(new Date(), serverEnv().APP_TIMEZONE);
  const periodo = obtenerPeriodoActual();
  const inicio = primerDiaDelPeriodo(periodo);

  // 1. Cuentas
  const nuevasCuentas = CUENTAS_SUGERIDAS.filter((c) => formData.get(`cuenta_${c.clave}`) === "on").map((c) => {
    const saldo = parsearMontoCOP(String(formData.get(`saldo_${c.clave}`) ?? "")) ?? 0;
    return {
      nombre: c.nombre,
      tipo: c.tipo,
      entidad: c.entidad ?? null,
      saldo_inicial: saldo,
      fecha_saldo_inicial: hoy,
    };
  });
  if (nuevasCuentas.length > 0) {
    const { error } = await supabase.from("cuentas").upsert(nuevasCuentas, { onConflict: "user_id,nombre" });
    if (error) return falla(error);
  }

  const { data: cuentas, error: eC } = await supabase.from("cuentas").select("id, nombre");
  if (eC) return falla(eC);
  const nombreCuentaPago = String(formData.get("cuenta_pago") ?? "");
  const cuentaPago = cuentas.find((c) => c.nombre === nombreCuentaPago)?.id ?? null;

  const { data: categorias, error: eCat } = await supabase
    .from("categorias")
    .select("id, nombre, tipo")
    .is("padre_id", null);
  if (eCat) return falla(eCat);
  const categoria = (nombre: string, tipo: "ingreso" | "gasto") =>
    categorias.find((c) => c.nombre === nombre && c.tipo === tipo)?.id;

  // 2. Obligaciones
  const plantillas = [];
  for (const o of OBLIGACIONES_SUGERIDAS) {
    if (formData.get(`ob_${o.clave}`) !== "on") continue;
    const categoriaId = categoria(o.categoria, "gasto");
    if (!categoriaId) return falla(`No se encontró la categoría "${o.categoria}"`);
    const monto = parsearMontoCOP(String(formData.get(`monto_${o.clave}`) ?? "")) ?? 0;
    plantillas.push({
      nombre: o.nombre,
      tipo: o.tipo,
      categoria_id: categoriaId,
      monto_estimado: monto,
      es_variable: o.variable,
      estimar_con_promedio: o.variable,
      dia_vencimiento: dia(formData.get(`dia_${o.clave}`), o.dia),
      frecuencia: o.frecuencia,
      fecha_inicio: inicio,
      cuenta_default_id: cuentaPago,
    });
  }

  // 3. Ingreso esperado
  const sueldo = parsearMontoCOP(String(formData.get("sueldo_monto") ?? "")) ?? 0;
  if (sueldo > 0) {
    const categoriaId = categoria("Sueldo / honorarios", "ingreso");
    if (!categoriaId) return falla('No se encontró la categoría "Sueldo / honorarios"');
    plantillas.push({
      nombre: String(formData.get("sueldo_nombre") || "Sueldo / honorarios").slice(0, 80),
      tipo: "ingreso_esperado" as const,
      categoria_id: categoriaId,
      monto_estimado: sueldo,
      es_variable: false,
      estimar_con_promedio: false,
      dia_vencimiento: dia(formData.get("sueldo_dia"), 1),
      frecuencia: "mensual" as const,
      fecha_inicio: inicio,
      cuenta_default_id: cuentaPago,
    });
  }

  if (plantillas.length === 0) {
    return falla("Marca al menos una obligación o escribe tu ingreso mensual.");
  }
  const { error: eP } = await supabase.from("obligaciones").insert(plantillas);
  if (eP) return falla(eP);

  const { error: eG } = await supabase.rpc("generar_periodo", { p_mes: inicio });
  if (eG) return falla(eG);

  revalidatePath("/", "layout");
  redirect(`/mes/${periodo}?bienvenida=1`);
}
