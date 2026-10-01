import "server-only";
import { ETIQUETA_TIPO_MOVIMIENTO, type Tabla } from "@/lib/domain/exportacion";
import { ESTADOS, estadoObligacion, type ObligacionMes } from "@/lib/domain/obligaciones";
import { primerDiaDelPeriodo, type PeriodoId } from "@/lib/domain/periodos";
import { ETIQUETA_TIPO_COMPRA, type TipoCompra } from "@/lib/domain/tarjetas";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
const PAGINA = 1000;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

async function todas<T>(
  consulta: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const filas: T[] = [];
  for (let a = 0; ; a += PAGINA) {
    const { data, error } = await consulta(a, a + PAGINA - 1);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return filas;
  }
}

const categoria = (padre: string | null | undefined, hoja: string | null | undefined) =>
  padre ? `${padre} › ${hoja ?? ""}` : (hoja ?? null);

/** Movimientos de cuenta y compras con tarjeta del rango, en tablas listas para CSV o Excel. */
export async function tablasExportacion(desde: PeriodoId, hasta: PeriodoId, hoy: string): Promise<Tabla[]> {
  const supabase: Supabase = await createClient();
  const d = primerDiaDelPeriodo(desde);
  const h = primerDiaDelPeriodo(hasta);
  const [movs, compras, oblig, resumen] = await Promise.all([
    todas((a, b) =>
      supabase
        .from("v_movimientos")
        .select("*")
        .gte("mes", d)
        .lte("mes", h)
        .order("fecha")
        .order("created_at")
        .range(a, b),
    ),
    todas((a, b) =>
      supabase
        .from("v_compras_tc")
        .select("*")
        .gte("mes", d)
        .lte("mes", h)
        .order("fecha")
        .order("created_at")
        .range(a, b),
    ),
    todas((a, b) =>
      supabase
        .from("v_obligaciones_mes")
        .select("*")
        .gte("mes", d)
        .lte("mes", h)
        .order("mes")
        .order("fecha_vencimiento")
        .range(a, b),
    ),
    supabase.from("v_resumen_periodo").select("*").gte("mes", d).lte("mes", h).order("mes"),
  ]);
  if (resumen.error) throw new Error(resumen.error.message);

  const movimientos: Tabla = {
    nombre: "Movimientos",
    columnas: [
      { clave: "fecha", titulo: "Fecha", tipo: "fecha" },
      { clave: "origen", titulo: "Origen" },
      { clave: "tipo", titulo: "Tipo" },
      { clave: "cuenta", titulo: "Cuenta o tarjeta" },
      { clave: "destino", titulo: "Cuenta destino" },
      { clave: "categoria", titulo: "Categoría" },
      { clave: "descripcion", titulo: "Descripción" },
      { clave: "comercio", titulo: "Comercio" },
      { clave: "obligacion", titulo: "Obligación" },
      { clave: "monto", titulo: "Monto", tipo: "pesos" },
      { clave: "cuotas", titulo: "Cuotas", tipo: "numero" },
      { clave: "reembolsable", titulo: "Reembolsable Devtopia" },
      { clave: "comprobante", titulo: "Comprobante" },
    ],
    filas: [
      ...movs.map((m) => ({
        fecha: m.fecha,
        origen: "Cuenta",
        tipo: ETIQUETA_TIPO_MOVIMIENTO[m.tipo ?? ""] ?? m.tipo,
        cuenta: m.cuenta_nombre,
        destino: m.cuenta_destino_nombre,
        categoria: categoria(m.categoria_padre_nombre, m.categoria_nombre),
        descripcion: m.descripcion,
        comercio: m.comercio,
        obligacion: m.obligacion_nombre,
        monto: num(m.monto),
        cuotas: null,
        reembolsable: Boolean(m.reembolsable),
        comprobante: Boolean(m.adjunto_path),
      })),
      ...compras.map((c) => ({
        fecha: c.fecha,
        origen: "Tarjeta",
        tipo: ETIQUETA_TIPO_COMPRA[c.tipo as TipoCompra] ?? c.tipo,
        cuenta: c.tarjeta_nombre,
        destino: c.cuenta_destino_nombre,
        categoria: categoria(c.categoria_padre_nombre, c.categoria_nombre),
        descripcion: c.descripcion,
        comercio: c.comercio,
        obligacion: null,
        monto: c.tipo === "devolucion" ? -Number(c.monto) : num(c.monto),
        cuotas: c.num_cuotas,
        reembolsable: Boolean(c.reembolsable),
        comprobante: Boolean(c.adjunto_path),
      })),
    ].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))),
  };

  const obligaciones: Tabla = {
    nombre: "Obligaciones",
    columnas: [
      { clave: "mes", titulo: "Mes" },
      { clave: "nombre", titulo: "Obligación" },
      { clave: "categoria", titulo: "Categoría" },
      { clave: "vence", titulo: "Vence", tipo: "fecha" },
      { clave: "esperado", titulo: "Esperado", tipo: "pesos" },
      { clave: "pagado", titulo: "Pagado", tipo: "pesos" },
      { clave: "estado", titulo: "Estado" },
      { clave: "ultimo_pago", titulo: "Último pago", tipo: "fecha" },
    ],
    filas: oblig.map((o) => ({
      mes: o.mes?.slice(0, 7) ?? null,
      nombre: o.nombre,
      categoria: o.categoria_nombre,
      vence: o.fecha_vencimiento,
      esperado: num(o.monto_esperado),
      pagado: num(o.pagado),
      estado:
        ESTADOS[
          estadoObligacion(
            {
              id: o.id!,
              nombre: o.nombre!,
              es_ingreso: Boolean(o.es_ingreso),
              pagado: Number(o.pagado ?? 0),
              monto_esperado: Number(o.monto_esperado ?? 0),
              fecha_vencimiento: o.fecha_vencimiento!,
              resolucion: o.resolucion as ObligacionMes["resolucion"],
            },
            hoy,
          )
        ].etiqueta,
      ultimo_pago: o.ultimo_pago,
    })),
  };

  const meses: Tabla = {
    nombre: "Resumen mensual",
    columnas: [
      { clave: "mes", titulo: "Mes" },
      { clave: "estado", titulo: "Estado" },
      { clave: "ingresos", titulo: "Ingresos", tipo: "pesos" },
      { clave: "gastos", titulo: "Gastos (consumo)", tipo: "pesos" },
      { clave: "salidas", titulo: "Salidas de caja", tipo: "pesos" },
      { clave: "balance", titulo: "Ingresos − gastos", tipo: "pesos" },
      { clave: "reembolsables", titulo: "Gastos reembolsables", tipo: "pesos" },
      { clave: "oblig", titulo: "Obligaciones pagadas" },
    ],
    filas: (resumen.data ?? []).map((r) => ({
      mes: r.mes?.slice(0, 7) ?? null,
      estado: r.estado === "cerrado" ? "Cerrado" : "Abierto",
      ingresos: num(r.ingresos),
      gastos: num(r.gastos),
      salidas: num(r.salidas_caja),
      balance: Number(r.ingresos ?? 0) - Number(r.gastos ?? 0),
      reembolsables: num(r.gastos_reembolsables),
      oblig: `${r.obligaciones_pagadas ?? 0}/${r.obligaciones_total ?? 0}`,
    })),
  };

  return [movimientos, obligaciones, meses];
}
