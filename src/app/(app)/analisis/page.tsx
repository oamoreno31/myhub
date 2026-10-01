import type { Metadata } from "next";
import { PantallaAnalisis } from "@/components/analisis/pantalla-analisis";
import { obtenerCaja, obtenerComercios, obtenerConsumo, obtenerResumenes } from "@/lib/analisis";
import { ventanaPeriodos } from "@/lib/domain/analisis";
import { obtenerPeriodoSeleccionado } from "@/lib/periodo-seleccionado";

export const metadata: Metadata = { title: "Análisis" };

export default async function AnalisisPage({ searchParams }: PageProps<"/analisis">) {
  const sp = await searchParams;
  const periodo = await obtenerPeriodoSeleccionado();
  const periodos = ventanaPeriodos(periodo, 12);
  const [consumo, caja, resumenes, comercios] = await Promise.all([
    obtenerConsumo(periodos[0], periodo),
    obtenerCaja(periodos[0], periodo),
    obtenerResumenes(periodos[0], periodo),
    obtenerComercios(periodo),
  ]);
  return (
    <PantallaAnalisis
      key={periodo}
      periodo={periodo}
      periodos={periodos}
      consumo={consumo}
      caja={caja}
      resumenes={resumenes}
      comercios={comercios}
      inicial={{ vista: sp.vista === "caja" ? "caja" : "consumo", sinReembolsables: sp.reembolsables === "excluir" }}
    />
  );
}
