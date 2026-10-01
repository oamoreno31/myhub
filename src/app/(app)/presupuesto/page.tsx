import type { Metadata } from "next";
import { PantallaPresupuesto } from "@/components/presupuesto/pantalla-presupuesto";
import {
  obtenerCategoriasGasto,
  obtenerConsumo,
  obtenerLineasDeMes,
  obtenerPresupuesto,
  obtenerResumenes,
} from "@/lib/analisis";
import { asegurarPeriodo } from "@/lib/datos";
import {
  filtrarConsumo,
  promediosPorCategoria,
  propuesta503020,
  totalesPorCategoria,
  ventanaPeriodos,
} from "@/lib/domain/analisis";
import { desplazarPeriodo } from "@/lib/domain/periodos";
import { obtenerPeriodoSeleccionado } from "@/lib/periodo-seleccionado";

export const metadata: Metadata = { title: "Presupuesto" };

export default async function PresupuestoPage() {
  const periodo = await obtenerPeriodoSeleccionado();
  const fila = await asegurarPeriodo(periodo);
  const ventana = ventanaPeriodos(periodo, 4);
  const [presupuesto, categorias, consumoTodo, resumenes, mesAnterior] = await Promise.all([
    obtenerPresupuesto(fila.id),
    obtenerCategoriasGasto(),
    obtenerConsumo(ventana[0], periodo),
    obtenerResumenes(ventana[0], periodo),
    obtenerLineasDeMes(desplazarPeriodo(periodo, -1)),
  ]);

  // El presupuesto se compara con el consumo propio: sin gastos que Devtopia te devuelve.
  const consumo = filtrarConsumo(consumoTodo, { excluirReembolsables: true });
  const delMes = consumo.filter((f) => f.periodo === periodo);
  const gastoPorCategoria: Record<string, number> = {};
  for (const t of totalesPorCategoria(delMes, periodo)) gastoPorCategoria[t.id] = t.total;
  const gastoTotal = delMes.reduce((a, f) => a + f.total, 0);

  const ingresoDe = (p: string) => resumenes.find((r) => r.periodo === p)?.ingresos ?? 0;
  const previos = ventana.slice(0, -1);
  const conIngreso = previos.map(ingresoDe).filter((v) => v > 0);
  const ingresoPromedio = conIngreso.length
    ? Math.round(conIngreso.reduce((a, v) => a + v, 0) / conIngreso.length)
    : ingresoDe(periodo);
  const ahorro = categorias.find((c) => c.bolsa === "ahorro_deuda" && c.padre_id === null && c.activa);
  const propuesta =
    ingresoPromedio > 0
      ? propuesta503020({
          ingresoPromedio,
          promedios: promediosPorCategoria(consumo, periodo),
          categoriaAhorroId: ahorro?.id ?? null,
        })
      : null;

  return (
    <PantallaPresupuesto
      key={periodo}
      periodo={periodo}
      periodoId={fila.id}
      cerrado={fila.estado === "cerrado"}
      categorias={categorias}
      lineas={presupuesto.lineas}
      origen={presupuesto.origen}
      plantilla={presupuesto.plantilla}
      mesAnterior={mesAnterior}
      gastoPorCategoria={gastoPorCategoria}
      gastoTotal={Math.round(gastoTotal * 100) / 100}
      ingresoMes={ingresoDe(periodo)}
      ingresoPromedio={ingresoPromedio}
      propuesta={propuesta}
    />
  );
}
