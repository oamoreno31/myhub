/**
 * Esquemas Zod compartidos por formularios y server actions.
 * Los formularios envían FormData (todo texto); aquí se normaliza.
 */
import { z } from "zod";
import { parsearMontoCOP } from "@/lib/domain/dinero";
import { esPeriodoValido } from "@/lib/domain/periodos";

/** Campos ausentes del FormData o vacíos → null. */
const vacioANull = (v: unknown) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v);

export const uuid = z.uuid({ message: "Selección inválida" });
export const uuidOpcional = z.preprocess(vacioANull, z.uuid({ message: "Selección inválida" }).nullable());
export const textoOpcional = (max: number) =>
  z.preprocess(vacioANull, z.string().trim().max(max, `Máximo ${max} caracteres`).nullable());
export const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const fechaISO = z.string({ message: "Indica la fecha" }).regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

export const periodoId = z.string().refine(esPeriodoValido, "Periodo inválido");

/** Monto en pesos escrito por el usuario ("1.250.000", "$ 45.000"). */
export const monto = (opciones: { permitirCero?: boolean } = {}) =>
  z
    .string({ message: "Escribe el monto" })
    .transform((v, ctx) => {
      const n = parsearMontoCOP(v);
      if (n === null) {
        ctx.addIssue({ code: "custom", message: "Escribe un monto válido" });
        return z.NEVER;
      }
      return n;
    })
    .refine(
      (n) => (opciones.permitirCero ? n >= 0 : n > 0),
      opciones.permitirCero ? "No puede ser negativo" : "Debe ser mayor a cero",
    )
    .refine((n) => n < 1_000_000_000_000, "Monto demasiado grande");

export const TIPOS_CUENTA_F1 = ["ahorros", "corriente", "efectivo", "billetera", "cooperativa", "inversion"] as const;
export const FRECUENCIAS = ["mensual", "bimestral", "trimestral", "semestral", "anual"] as const;
export const TIPOS_OBLIGACION = [
  "servicio",
  "arriendo",
  "telecom",
  "tarjeta",
  "deuda",
  "cooperativa",
  "seguridad_social",
  "ingreso_esperado",
  "ahorro",
  "otro",
] as const;

export const movimientoSchema = z
  .object({
    id: uuidOpcional,
    tipo: z.enum(["ingreso", "gasto", "transferencia"], { message: "Tipo inválido" }),
    fecha: fechaISO,
    monto: monto(),
    cuenta_id: uuid,
    cuenta_destino_id: uuidOpcional,
    categoria_id: uuidOpcional,
    obligacion_periodo_id: uuidOpcional,
    descripcion: textoOpcional(200),
    comercio: textoOpcional(80),
    reembolsable: checkbox,
  })
  .superRefine((m, ctx) => {
    if (m.tipo === "transferencia") {
      if (!m.cuenta_destino_id)
        ctx.addIssue({ code: "custom", path: ["cuenta_destino_id"], message: "Elige la cuenta destino" });
      else if (m.cuenta_destino_id === m.cuenta_id)
        ctx.addIssue({ code: "custom", path: ["cuenta_destino_id"], message: "Debe ser distinta a la de origen" });
    } else if (!m.categoria_id) {
      ctx.addIssue({ code: "custom", path: ["categoria_id"], message: "Elige una categoría" });
    }
  });

export const cuentaSchema = z.object({
  id: uuidOpcional,
  nombre: z.string().trim().min(1, "Escribe un nombre").max(60),
  tipo: z.enum(TIPOS_CUENTA_F1, { message: "Tipo inválido" }),
  entidad: textoOpcional(60),
  saldo_inicial: monto({ permitirCero: true }),
  fecha_saldo_inicial: z.preprocess(vacioANull, fechaISO.nullable()),
});

export const categoriaSchema = z.object({
  id: uuidOpcional,
  tipo: z.enum(["ingreso", "gasto"]),
  nombre: z.string().trim().min(1, "Escribe un nombre").max(60),
  grupo: z.string().trim().min(1, "Escribe el grupo").max(40),
  padre_id: uuidOpcional,
  bolsa: z.enum(["necesidad", "deseo", "ahorro_deuda", "no_aplica"]),
  requiere_descripcion: checkbox,
  es_fija: checkbox,
});

export const plantillaSchema = z
  .object({
    id: uuidOpcional,
    nombre: z.string().trim().min(1, "Escribe un nombre").max(80),
    tipo: z.enum(TIPOS_OBLIGACION).refine((t) => t !== "tarjeta", "Las tarjetas generan su pago desde el extracto"),
    categoria_id: uuid,
    monto_estimado: monto({ permitirCero: true }),
    es_variable: checkbox,
    estimar_con_promedio: checkbox,
    dia_vencimiento: z.coerce.number({ message: "Día inválido" }).int().min(1, "Entre 1 y 31").max(31, "Entre 1 y 31"),
    frecuencia: z.enum(FRECUENCIAS),
    fecha_inicio: periodoId,
    mes_ancla: z.preprocess(vacioANull, periodoId.nullable()),
    fecha_fin: z.preprocess(vacioANull, periodoId.nullable()),
    cuenta_default_id: uuidOpcional,
    referencia_pago: textoOpcional(80),
    notas: textoOpcional(300),
    aplicar_mes_actual: checkbox,
  })
  .superRefine((p, ctx) => {
    if (p.fecha_fin && p.fecha_fin < p.fecha_inicio)
      ctx.addIssue({ code: "custom", path: ["fecha_fin"], message: "Debe ser posterior al inicio" });
  });

export const obligacionPuntualSchema = z.object({
  periodo_id: uuid,
  nombre: z.string().trim().min(1, "Escribe un nombre").max(80),
  es_ingreso: checkbox,
  categoria_id: uuid,
  monto_esperado: monto({ permitirCero: true }),
  fecha_vencimiento: fechaISO,
  cuenta_default_id: uuidOpcional,
  nota: textoOpcional(200),
});

export const ajusteObligacionSchema = z.object({
  id: uuid,
  monto_esperado: monto({ permitirCero: true }),
  fecha_vencimiento: fechaISO,
  nota: textoOpcional(200),
});

export const omitirSchema = z.object({
  id: uuid,
  motivo: z.string().trim().min(3, "Cuéntale a tu yo del futuro por qué").max(200),
});

export const decisionesCierreSchema = z.array(
  z.object({ id: uuid, accion: z.enum(["arrastrar", "omitir"]), motivo: z.string().trim().max(200).optional() }),
);

export const reabrirSchema = z.object({
  periodo_id: uuid,
  motivo: z.string().trim().min(3, "Indica el motivo").max(200),
});

export const parametrosSchema = z.object({
  meta_ahorro_pct: z.coerce.number({ message: "Porcentaje inválido" }).min(0).max(100),
  recordatorios_email: checkbox,
});

// ── Tarjetas de crédito (F2) ─────────────────────────────────────────────

const diaDelMes = (mensaje: string) =>
  z.coerce.number({ message: mensaje }).int(mensaje).min(1, "Entre 1 y 31").max(31, "Entre 1 y 31");

/** Porcentaje escrito por el usuario ("26,82") → fracción (0.2682). */
const porcentajeOpcional = z
  .preprocess(
    (v) => {
      const limpio = vacioANull(v);
      return typeof limpio === "string" ? Number(limpio.replace(",", ".")) : limpio;
    },
    z.number({ message: "Porcentaje inválido" }).min(0, "No puede ser negativo").max(200, "Máximo 200 %").nullable(),
  )
  .transform((v) => (v === null ? null : Math.round(v * 100) / 10000));

const montoOpcional = z.preprocess(vacioANull, monto({ permitirCero: true }).nullable());

export const FRANQUICIAS = ["visa", "mastercard", "amex", "diners", "otra"] as const;

export const tarjetaSchema = z.object({
  id: uuidOpcional,
  nombre: z.string().trim().min(1, "Escribe un nombre").max(60),
  entidad: textoOpcional(60),
  franquicia: z.enum(FRANQUICIAS, { message: "Franquicia inválida" }),
  ultimos4: z.preprocess(
    vacioANull,
    z
      .string()
      .regex(/^\d{4}$/, "Deben ser 4 dígitos")
      .nullable(),
  ),
  cupo: monto({ permitirCero: true }),
  dia_corte: diaDelMes("Día de corte inválido"),
  dia_limite_pago: diaDelMes("Día de pago inválido"),
  tasa_ea_ref: porcentajeOpcional,
  cuota_manejo_ref: montoOpcional,
  cuenta_pago_default_id: uuidOpcional,
});

export const TIPOS_COMPRA_TC = ["compra", "avance", "devolucion", "ajuste"] as const;

export const compraTCSchema = z
  .object({
    id: uuidOpcional,
    tarjeta_id: uuid,
    tipo: z.enum(TIPOS_COMPRA_TC, { message: "Tipo inválido" }),
    fecha: fechaISO,
    monto: monto(),
    /** Solo en ajustes: "+" aumenta el capital, "-" lo reduce. */
    signo: z.preprocess(vacioANull, z.enum(["+", "-"]).nullable()),
    num_cuotas: z.coerce.number({ message: "Cuotas inválidas" }).int().min(1, "Mínimo 1").max(48, "Máximo 48"),
    categoria_id: uuidOpcional,
    cuenta_destino_id: uuidOpcional,
    descripcion: textoOpcional(200),
    comercio: textoOpcional(80),
    moneda: z.enum(["COP", "USD"]).default("COP"),
    monto_origen: montoOpcional,
    trm: montoOpcional,
    reembolsable: checkbox,
  })
  .superRefine((c, ctx) => {
    if ((c.tipo === "compra" || c.tipo === "devolucion") && !c.categoria_id)
      ctx.addIssue({ code: "custom", path: ["categoria_id"], message: "Elige una categoría" });
    if (c.tipo === "ajuste" && !c.descripcion)
      ctx.addIssue({ code: "custom", path: ["descripcion"], message: "Describe el motivo del ajuste" });
    if (c.moneda === "USD" && (!c.monto_origen || !c.trm))
      ctx.addIssue({ code: "custom", path: ["monto_origen"], message: "Indica el valor en dólares y la TRM" });
  });

export const extractoSchema = z
  .object({
    id: uuidOpcional,
    tarjeta_id: uuid,
    fecha_corte: fechaISO,
    fecha_limite_pago: fechaISO,
    pago_total_banco: monto({ permitirCero: true }),
    pago_minimo_banco: monto({ permitirCero: true }),
    intereses: montoOpcional,
    cuota_manejo: montoOpcional,
    seguros: montoOpcional,
    otros_declarados: montoOpcional,
  })
  .superRefine((e, ctx) => {
    if (e.pago_minimo_banco > e.pago_total_banco)
      ctx.addIssue({ code: "custom", path: ["pago_minimo_banco"], message: "No puede ser mayor al pago total" });
    if (e.fecha_limite_pago < e.fecha_corte)
      ctx.addIssue({ code: "custom", path: ["fecha_limite_pago"], message: "Debe ser posterior al corte" });
  });

export const TIPOS_PAGO_TC = ["total", "minimo", "otro"] as const;

export const pagoTCSchema = z.object({
  id: uuidOpcional,
  tarjeta_id: uuid,
  fecha: fechaISO,
  monto: monto(),
  cuenta_origen_id: uuid,
  tipo_elegido: z.enum(TIPOS_PAGO_TC).default("otro"),
  nota: textoOpcional(200),
});

// ── Deudas, préstamos otorgados y reembolsos (F3) ────────────────────────

export const TIPOS_DEUDA = ["banco", "libranza", "cooperativa", "persona", "otro"] as const;
const centavos = (v: number) => Math.round(v * 100);
const fechaOpcional = z.preprocess(vacioANull, fechaISO.nullable());

export const deudaSchema = z
  .object({
    id: uuidOpcional,
    nombre: z.string().trim().min(1, "Escribe un nombre").max(80),
    acreedor: textoOpcional(80),
    tipo: z.enum(TIPOS_DEUDA, { message: "Tipo inválido" }),
    monto_original: monto(),
    fecha_desembolso: fechaISO,
    tasa_ea: porcentajeOpcional,
    plazo_meses: z.coerce
      .number({ message: "Plazo inválido" })
      .int()
      .min(1, "Mínimo 1 mes")
      .max(480, "Máximo 480 meses"),
    cuota: monto({ permitirCero: true }),
    seguro_mensual: montoOpcional,
    aporte_mensual: montoOpcional,
    cuenta_aportes_id: uuidOpcional,
    dia_pago: diaDelMes("Día de pago inválido"),
    cuenta_pago_default_id: uuidOpcional,
    saldo_inicial: monto({ permitirCero: true }),
    fecha_saldo_inicial: fechaISO,
    registrar_desembolso: checkbox,
    cuenta_desembolso_id: uuidOpcional,
    crear_obligacion: checkbox,
    notas: textoOpcional(300),
  })
  .superRefine((d, ctx) => {
    if (d.saldo_inicial > d.monto_original)
      ctx.addIssue({ code: "custom", path: ["saldo_inicial"], message: "No puede ser mayor al monto prestado" });
    if (d.fecha_saldo_inicial < d.fecha_desembolso)
      ctx.addIssue({ code: "custom", path: ["fecha_saldo_inicial"], message: "Debe ser posterior al desembolso" });
    if ((d.aporte_mensual ?? 0) > 0 && !d.cuenta_aportes_id)
      ctx.addIssue({
        code: "custom",
        path: ["cuenta_aportes_id"],
        message: "Elige la cuenta donde se acumulan los aportes",
      });
    if (d.registrar_desembolso && !d.cuenta_desembolso_id)
      ctx.addIssue({ code: "custom", path: ["cuenta_desembolso_id"], message: "Elige a qué cuenta llegó el dinero" });
  });

export const pagoDeudaSchema = z
  .object({
    id: uuidOpcional,
    deuda_id: uuid,
    fecha: fechaISO,
    monto: monto(),
    cuenta_origen_id: uuid,
    a_capital: monto({ permitirCero: true }),
    a_intereses: monto({ permitirCero: true }),
    a_seguros: monto({ permitirCero: true }),
    a_aporte: monto({ permitirCero: true }),
    obligacion_periodo_id: uuidOpcional,
    nota: textoOpcional(200),
  })
  .superRefine((p, ctx) => {
    const suma = centavos(p.a_capital) + centavos(p.a_intereses) + centavos(p.a_seguros) + centavos(p.a_aporte);
    if (suma !== centavos(p.monto))
      ctx.addIssue({ code: "custom", path: ["a_capital"], message: "El desglose debe sumar el monto pagado" });
    if (p.a_aporte >= p.monto)
      ctx.addIssue({
        code: "custom",
        path: ["a_aporte"],
        message: "El aporte solo no es una cuota: regístralo como transferencia",
      });
  });

export const prestamoSchema = z
  .object({
    id: uuidOpcional,
    deudor: z.string().trim().min(1, "¿A quién le prestaste?").max(80),
    monto: monto(),
    fecha: fechaISO,
    fecha_esperada: fechaOpcional,
    cuenta_origen_id: uuid,
    notas: textoOpcional(300),
  })
  .superRefine((p, ctx) => {
    if (p.fecha_esperada && p.fecha_esperada < p.fecha)
      ctx.addIssue({ code: "custom", path: ["fecha_esperada"], message: "Debe ser posterior a la fecha del préstamo" });
  });

export const abonoSchema = z.object({
  id: uuidOpcional,
  prestamo_otorgado_id: uuid,
  fecha: fechaISO,
  monto: monto(),
  cuenta_id: uuid,
  descripcion: textoOpcional(200),
});

export const castigoSchema = z.object({
  id: uuid,
  motivo_castigo: z.string().trim().min(3, "Cuéntale a tu yo del futuro por qué").max(200),
});

export const reembolsoSchema = z.object({
  cuenta_id: uuid,
  fecha: fechaISO,
  monto: monto(),
  descripcion: textoOpcional(200),
  movimientos: z.preprocess((v) => (typeof v === "string" && v ? v.split(",") : []), z.array(uuid)),
  compras: z.preprocess((v) => (typeof v === "string" && v ? v.split(",") : []), z.array(uuid)),
});

/** Presupuesto del mes: las líneas llegan como JSON [{categoria_id, monto}] (monto en pesos). */
export const presupuestoSchema = z.object({
  periodo_id: uuid,
  plantilla: checkbox,
  items: z.preprocess(
    (v) => {
      if (typeof v !== "string") return v;
      try {
        return JSON.parse(v);
      } catch {
        return null;
      }
    },
    z
      .array(
        z.object({
          categoria_id: uuid,
          monto: z.number().nonnegative("No puede ser negativo").lt(1_000_000_000_000, "Monto demasiado grande"),
        }),
        { message: "Presupuesto inválido" },
      )
      .max(300)
      .refine((items) => new Set(items.map((i) => i.categoria_id)).size === items.length, "Categoría repetida"),
  ),
});

// ── Salud financiera (F5) ─────────────────────────────────────────────────

export const TIPOS_META = ["fondo_emergencia", "ahorro", "compra", "pagar_deuda"] as const;

export const metaSchema = z
  .object({
    id: uuidOpcional,
    nombre: z.string().trim().min(1, "Ponle un nombre").max(80, "Máximo 80 caracteres"),
    tipo: z.enum(TIPOS_META, { message: "Elige el tipo de meta" }),
    monto_objetivo: monto(),
    fecha_objetivo: fechaOpcional,
    cuenta_id: uuidOpcional,
    deuda_id: uuidOpcional,
    aporte_mensual: montoOpcional,
    notas: textoOpcional(300),
  })
  .superRefine((m, ctx) => {
    if (m.tipo === "pagar_deuda" && !m.deuda_id)
      ctx.addIssue({ code: "custom", path: ["deuda_id"], message: "Elige la deuda" });
    if (m.tipo !== "pagar_deuda" && !m.cuenta_id)
      ctx.addIssue({ code: "custom", path: ["cuenta_id"], message: "Elige dónde guardas la plata" });
  })
  .transform((m) => ({
    ...m,
    cuenta_id: m.tipo === "pagar_deuda" ? null : m.cuenta_id,
    deuda_id: m.tipo === "pagar_deuda" ? m.deuda_id : null,
  }));

/** Porcentaje obligatorio ("20" → 0.2). */
const porcentaje = porcentajeOpcional.refine((v) => v !== null, "Escribe el porcentaje");
const meses = z.preprocess(
  (v) => (typeof v === "string" ? Number(v.replace(",", ".")) : v),
  z.number({ message: "Número de meses inválido" }).min(0, "No puede ser negativo").max(36, "Máximo 36 meses"),
);

const par = <T extends z.ZodType>(esquema: T) => ({ sano: esquema, riesgo: esquema });

export const umbralesSchema = z
  .object({
    tasa_ahorro: z.object(par(porcentaje)),
    carga_deuda: z.object(par(porcentaje)),
    utilizacion_tc: z.object(par(porcentaje)),
    costo_financiero: z.object(par(porcentaje)),
    gastos_fijos: z.object(par(porcentaje)),
    fondo_emergencia: z.object(par(meses)),
    puntualidad: z.object(par(porcentaje)),
    tasa_usura_ea: porcentajeOpcional,
  })
  .superRefine((u, ctx) => {
    const mayorEsMejor = ["tasa_ahorro", "fondo_emergencia", "puntualidad"];
    for (const [k, v] of Object.entries(u)) {
      if (!v || typeof v !== "object" || !("sano" in v)) continue;
      const { sano, riesgo } = v as { sano: number; riesgo: number };
      if (mayorEsMejor.includes(k) ? sano < riesgo : sano > riesgo)
        ctx.addIssue({
          code: "custom",
          path: [k, "riesgo"],
          message: mayorEsMejor.includes(k)
            ? "Debe ser menor o igual al umbral sano"
            : "Debe ser mayor o igual al umbral sano",
        });
    }
  });

/** Los umbrales llegan como campos planos "tasa_ahorro.sano" desde el formulario. */
export function anidarCampos(datos: Record<string, unknown>) {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(datos)) {
    const [a, b] = k.split(".");
    if (b) r[a] = { ...((r[a] as object) ?? {}), [b]: v };
    else r[a] = v;
  }
  return r;
}

export const pilaSchema = z.object({
  ibc_pct: porcentaje,
  salud_pct: porcentaje,
  pension_pct: porcentaje,
  arl_clase: z.coerce.number().int().min(1, "Clase I a V").max(5, "Clase I a V"),
  smmlv: monto(),
});

export type ErroresCampo = Record<string, string>;

/** Primer mensaje por campo, listo para pintar bajo cada input. */
export function erroresPorCampo(error: z.ZodError): ErroresCampo {
  const errores: ErroresCampo = {};
  for (const issue of error.issues) {
    const clave = issue.path.join(".") || "_";
    errores[clave] ??= issue.message;
  }
  return errores;
}
