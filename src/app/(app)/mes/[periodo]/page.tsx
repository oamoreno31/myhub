import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PantallaMes } from "@/components/mes/pantalla-mes";
import { asegurarPeriodo, obtenerCatalogos, obtenerObligacionesMes } from "@/lib/datos";
import { hoyISO } from "@/lib/domain/obligaciones";
import { desplazarPeriodo, esPeriodoValido, nombrePeriodo, primerDiaDelPeriodo } from "@/lib/domain/periodos";
import { serverEnv } from "@/lib/env.server";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: PageProps<"/mes/[periodo]">): Promise<Metadata> {
  const { periodo } = await params;
  return { title: esPeriodoValido(periodo) ? nombrePeriodo(periodo) : "Mes" };
}

export default async function MesPeriodoPage({ params, searchParams }: PageProps<"/mes/[periodo]">) {
  const { periodo } = await params;
  if (!esPeriodoValido(periodo)) notFound();
  const { bienvenida } = await searchParams;

  const fila = await asegurarPeriodo(periodo);
  const supabase = await createClient();
  const [obligaciones, catalogos, resumen] = await Promise.all([
    obtenerObligacionesMes(fila.id),
    obtenerCatalogos(),
    supabase.from("v_resumen_periodo").select("ingresos, gastos").eq("periodo_id", fila.id).maybeSingle(),
  ]);
  const hoy = hoyISO(new Date(), serverEnv().APP_TIMEZONE);
  const siguiente = desplazarPeriodo(periodo, 1);

  return (
    <PantallaMes
      periodo={{
        id: fila.id,
        clave: periodo,
        nombre: nombrePeriodo(periodo),
        nombreSiguiente: nombrePeriodo(siguiente).split(" ")[0].toLowerCase(),
        primerDia: primerDiaDelPeriodo(periodo),
        estado: fila.estado,
        cerradoEn: fila.cerrado_en,
        terminado: hoy >= primerDiaDelPeriodo(siguiente),
      }}
      obligaciones={obligaciones}
      cuentas={catalogos.cuentas}
      categorias={catalogos.categorias}
      hoy={hoy}
      resumenMovimientos={{
        ingresos: Number(resumen.data?.ingresos ?? 0),
        gastos: Number(resumen.data?.gastos ?? 0),
      }}
      bienvenida={bienvenida === "1"}
    />
  );
}
