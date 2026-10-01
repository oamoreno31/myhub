import type { Metadata } from "next";
import { PantallaSalud, type PestanaSalud } from "@/components/salud/pantalla-salud";
import { obtenerConsumo, obtenerResumenes } from "@/lib/analisis";
import { asegurarPeriodo, obtenerCatalogos } from "@/lib/datos";
import { compararConPromedio, filtrarConsumo, ventanaPeriodos } from "@/lib/domain/analisis";
import { desplazarPeriodo } from "@/lib/domain/periodos";
import { accionesSugeridas, calcularIndicadores, calcularScore } from "@/lib/domain/salud";
import { obtenerPeriodoActual, obtenerPeriodoSeleccionado } from "@/lib/periodo-seleccionado";
import {
  obtenerCargosTarjetasMes,
  obtenerDeudasPlan,
  obtenerFotosSalud,
  obtenerInsumos,
  obtenerMetas,
  obtenerParametrosSalud,
} from "@/lib/salud";

export const metadata: Metadata = { title: "Salud financiera" };

const PESTANAS: PestanaSalud[] = ["resumen", "metas", "deudas", "seguridad-social"];

export default async function SaludPage({ searchParams }: PageProps<"/salud">) {
  const sp = await searchParams;
  const periodo = await obtenerPeriodoSeleccionado();
  const actual = obtenerPeriodoActual();
  const fila = await asegurarPeriodo(periodo);
  const ventana = ventanaPeriodos(periodo, 4);

  const [params, { insumos, origen }, fotos, metas, deudasPlan, cargos, consumo, catalogos, resumenes, consumoActual] =
    await Promise.all([
      obtenerParametrosSalud(),
      obtenerInsumos(fila.id, fila.estado, fila.snapshot),
      obtenerFotosSalud(desplazarPeriodo(periodo, -11), periodo),
      obtenerMetas(),
      obtenerDeudasPlan(),
      obtenerCargosTarjetasMes(fila.id),
      obtenerConsumo(ventana[0], periodo),
      obtenerCatalogos(),
      obtenerResumenes(desplazarPeriodo(actual, -3), actual),
      obtenerConsumo(actual, actual),
    ]);

  const indicadores = insumos ? calcularIndicadores(insumos, params.umbrales) : [];
  const score = calcularScore(indicadores);
  const subida = compararConPromedio(filtrarConsumo(consumo, { excluirReembolsables: true }), periodo)
    .filter((c) => c.diferencia > 0 && c.variacion !== null)
    .sort((a, b) => b.diferencia - a.diferencia)[0];
  const acciones =
    insumos && score.valor !== null
      ? accionesSugeridas(indicadores, insumos, {
          tarjetas: cargos,
          deudas: deudasPlan
            .filter((d) => d.clase === "prestamo" && d.tasaEA !== null)
            .map((d) => ({ id: d.id, nombre: d.nombre, saldo: d.saldo, tasaEA: d.tasaEA as number })),
          categoriaQueMasSubio: subida ? { nombre: subida.nombre, diferencia: subida.diferencia } : null,
          tieneMetaFondo: metas.some((m) => m.activa && m.tipo === "fondo_emergencia"),
          usuraEA: params.usuraEA,
        })
      : [];

  // Evolución: fotos de los meses cerrados + el mes elegido si sigue abierto (calculado hoy).
  const historial = fotos
    .map((f) => {
      const ins = f.periodo === periodo && f.estado !== "cerrado" ? insumos : f.insumos;
      const s = ins ? calcularScore(calcularIndicadores(ins, params.umbrales)).valor : null;
      return { periodo: f.periodo, score: s };
    })
    .filter((h): h is { periodo: string; score: number } => h.score !== null);

  const previos = resumenes.filter((r) => r.periodo < actual && r.ingresos > 0);
  const ingresoPromedio = previos.length
    ? Math.round(previos.reduce((a, r) => a + r.ingresos, 0) / previos.length)
    : (resumenes.find((r) => r.periodo === actual)?.ingresos ?? 0);
  const pilaPagadaMes = consumoActual
    .filter((c) => c.categoria_nombre === "Seguridad social (PILA)")
    .reduce((a, c) => a + c.total, 0);

  return (
    <PantallaSalud
      key={periodo}
      inicial={PESTANAS.find((p) => p === sp.tab) ?? "resumen"}
      periodo={periodo}
      periodoActual={actual}
      origen={origen}
      score={score}
      indicadores={indicadores}
      acciones={acciones}
      historial={historial}
      umbrales={params.umbrales}
      usuraEA={params.usuraEA}
      metas={metas}
      cuentas={catalogos.cuentas.map((c) => ({ id: c.id, nombre: c.nombre, saldo: c.saldo }))}
      deudasMeta={deudasPlan
        .filter((d) => d.clase === "prestamo")
        .map((d) => ({ id: d.id, nombre: d.nombre, saldo: d.saldo }))}
      gastoEsencial={insumos?.gasto_esencial ?? 0}
      deudasPlan={deudasPlan}
      pila={params.pila}
      ingresoPromedio={ingresoPromedio}
      pilaPagadaMes={pilaPagadaMes}
    />
  );
}
