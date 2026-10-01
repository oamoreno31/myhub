import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { FiltrosMovimientos } from "@/components/movimientos/filtros";
import { ListaMovimientos, type MovimientoUI } from "@/components/movimientos/lista";
import { Card } from "@/components/ui/card";
import { obtenerCatalogos } from "@/lib/datos";
import { formatearCOP } from "@/lib/domain/dinero";
import { hoyISO } from "@/lib/domain/obligaciones";
import { esPeriodoValido, nombrePeriodo, primerDiaDelPeriodo } from "@/lib/domain/periodos";
import { serverEnv } from "@/lib/env.server";
import { obtenerPeriodoSeleccionado } from "@/lib/periodo-seleccionado";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Movimientos" };

const TIPOS = ["ingreso", "gasto", "transferencia"] as const;
const LIMITE = 500;

function texto(v: string | string[] | undefined) {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Solo UUID válidos llegan a los filtros de PostgREST. */
function id(v: string | string[] | undefined) {
  const t = texto(v);
  return t && UUID_RE.test(t) ? t : undefined;
}

export default async function MovimientosPage({ searchParams }: PageProps<"/movimientos">) {
  const sp = await searchParams;
  const seleccionado = await obtenerPeriodoSeleccionado();
  const periodo = esPeriodoValido(texto(sp.periodo)) ? texto(sp.periodo)! : seleccionado;
  const tipo = TIPOS.find((t) => t === texto(sp.tipo));
  const categoria = id(sp.categoria);
  const cuenta = id(sp.cuenta);
  const q = texto(sp.q)?.slice(0, 60);
  const obligacion = id(sp.obligacion);

  const supabase = await createClient();
  let consulta = supabase
    .from("v_movimientos")
    .select("*")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(LIMITE);

  if (obligacion) consulta = consulta.eq("obligacion_periodo_id", obligacion);
  else consulta = consulta.eq("mes", primerDiaDelPeriodo(periodo));
  if (tipo) consulta = consulta.eq("tipo", tipo);
  if (categoria) consulta = consulta.or(`categoria_id.eq.${categoria},categoria_padre_id.eq.${categoria}`);
  if (cuenta) consulta = consulta.or(`cuenta_id.eq.${cuenta},cuenta_destino_id.eq.${cuenta}`);
  if (q) {
    const patron = `%${q.replace(/[%_,()."\\]/g, " ")}%`;
    consulta = consulta.or(
      `descripcion.ilike.${patron},comercio.ilike.${patron},categoria_nombre.ilike.${patron},obligacion_nombre.ilike.${patron}`,
    );
  }

  // Compras con tarjeta del mes (gasto de consumo): se mezclan en la lista, se editan en su tarjeta.
  const incluirCompras = !obligacion && (!tipo || tipo === "gasto");
  let consultaCompras = supabase
    .from("v_compras_tc")
    .select("*")
    .in("tipo", ["compra", "devolucion"])
    .eq("mes", primerDiaDelPeriodo(periodo))
    .order("fecha", { ascending: false })
    .limit(LIMITE);
  if (categoria)
    consultaCompras = consultaCompras.or(`categoria_id.eq.${categoria},categoria_padre_id.eq.${categoria}`);
  if (q) {
    const patron = `%${q.replace(/[%_,()."\\]/g, " ")}%`;
    consultaCompras = consultaCompras.or(
      `descripcion.ilike.${patron},comercio.ilike.${patron},categoria_nombre.ilike.${patron}`,
    );
  }

  const [{ data, error }, catalogos, compras, tarjetas] = await Promise.all([
    consulta,
    obtenerCatalogos(),
    incluirCompras ? consultaCompras : null,
    supabase.from("tarjetas_credito").select("id, cuenta_id"),
  ]);
  const tarjetaDeCuenta = new Map((tarjetas.data ?? []).map((t) => [t.cuenta_id, t.id]));
  const cuentaDeTarjeta = new Map((tarjetas.data ?? []).map((t) => [t.id, t.cuenta_id]));

  const movimientos: MovimientoUI[] = (data ?? []).map((m) => ({
    id: m.id!,
    tipo: m.tipo as MovimientoUI["tipo"],
    fecha: m.fecha!,
    monto: Number(m.monto ?? 0),
    cuenta_id: m.cuenta_id!,
    cuenta_nombre: m.cuenta_nombre ?? "",
    cuenta_destino_id: m.cuenta_destino_id,
    cuenta_destino_nombre: m.cuenta_destino_nombre,
    categoria_id: m.categoria_id,
    categoria_nombre: m.categoria_nombre,
    categoria_padre_nombre: m.categoria_padre_nombre,
    obligacion_periodo_id: m.obligacion_periodo_id,
    obligacion_nombre: m.obligacion_nombre,
    descripcion: m.descripcion,
    comercio: m.comercio,
    reembolsable: Boolean(m.reembolsable),
    es_recuperacion: Boolean(m.es_recuperacion),
    cerrado: m.estado_periodo === "cerrado",
    tarjeta_id: m.tipo === "pago_tc" && m.cuenta_destino_id ? (tarjetaDeCuenta.get(m.cuenta_destino_id) ?? null) : null,
    deuda_id: m.deuda_id,
    prestamo_id: m.prestamo_id,
    reembolsado: Boolean(m.reembolsado_por_id),
    created_at: m.created_at ?? "",
  }));

  for (const c of compras?.data ?? []) {
    // Filtro por cuenta: una compra "pertenece" a la cuenta de su tarjeta.
    if (cuenta && cuentaDeTarjeta.get(c.tarjeta_id!) !== cuenta) continue;
    movimientos.push({
      id: c.id!,
      tipo: "compra_tc",
      fecha: c.fecha!,
      monto: c.tipo === "devolucion" ? -Number(c.monto) : Number(c.monto),
      cuenta_id: cuentaDeTarjeta.get(c.tarjeta_id!) ?? "",
      cuenta_nombre: c.tarjeta_nombre ?? "",
      cuenta_destino_id: null,
      cuenta_destino_nombre: null,
      categoria_id: c.categoria_id,
      categoria_nombre: c.categoria_nombre,
      categoria_padre_nombre: c.categoria_padre_nombre,
      obligacion_periodo_id: null,
      obligacion_nombre: null,
      descripcion: c.descripcion ?? (c.tipo === "devolucion" ? "Devolución" : null),
      comercio: c.comercio,
      reembolsable: Boolean(c.reembolsable),
      es_recuperacion: false,
      cerrado: c.estado_periodo === "cerrado",
      tarjeta_id: c.tarjeta_id,
      reembolsado: Boolean(c.reembolsado_por_id),
      num_cuotas: c.num_cuotas ?? 1,
      created_at: c.created_at ?? "",
    });
  }
  movimientos.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at));

  const ingresos = movimientos
    .filter((m) => m.tipo === "ingreso" && !m.es_recuperacion)
    .reduce((a, m) => a + m.monto, 0);
  const recuperaciones = movimientos
    .filter((m) => (m.tipo === "ingreso" || m.tipo === "recuperacion_prestamo") && m.es_recuperacion)
    .reduce((a, m) => a + m.monto, 0);
  const gastos = movimientos
    .filter((m) => m.tipo === "gasto" || m.tipo === "compra_tc")
    .reduce((a, m) => a + m.monto, 0);
  const neto = ingresos + recuperaciones - gastos;

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        titulo="Movimientos"
        descripcion={
          obligacion
            ? `Pagos de "${movimientos[0]?.obligacion_nombre ?? "la obligación"}"`
            : `Ingresos, gastos, compras con tarjeta y transferencias de ${nombrePeriodo(periodo)}`
        }
      />

      <FiltrosMovimientos
        periodo={periodo}
        tipo={tipo}
        categoria={categoria}
        cuenta={cuenta}
        q={q}
        obligacion={obligacion}
        cuentas={catalogos.todasLasCuentas.map((c) => ({ id: c.id, nombre: c.nombre }))}
        categorias={catalogos.categorias}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { t: "Ingresos", v: ingresos, c: "text-success" },
          { t: "Recuperaciones", v: recuperaciones, c: "text-info" },
          { t: "Gastos", v: gastos, c: "" },
          { t: "Neto", v: neto, c: neto < 0 ? "text-destructive" : "" },
        ].map((k) => (
          <Card key={k.t} className="gap-1 p-4">
            <span className="text-xs font-semibold text-muted-foreground">{k.t}</span>
            <span className={cn("text-lg font-bold", k.c)}>{formatearCOP(k.v, { signo: k.t === "Neto" })}</span>
          </Card>
        ))}
      </div>

      {error ? (
        <p className="rounded-xl bg-destructive-soft px-4 py-3 text-sm text-destructive">{error.message}</p>
      ) : (
        <ListaMovimientos
          movimientos={movimientos}
          cuentas={catalogos.cuentas}
          categorias={catalogos.categorias}
          hoy={hoyISO(new Date(), serverEnv().APP_TIMEZONE)}
          truncado={(data ?? []).length === LIMITE}
        />
      )}
    </div>
  );
}
