import type { Metadata } from "next";
import { FormularioBienvenida } from "@/components/bienvenida/formulario";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { necesitaBienvenida, obtenerCatalogos } from "@/lib/datos";
import { nombrePeriodo } from "@/lib/domain/periodos";
import { obtenerPeriodoActual } from "@/lib/periodo-seleccionado";

export const metadata: Metadata = { title: "Bienvenida" };

export default async function BienvenidaPage() {
  const [primeraVez, catalogos] = await Promise.all([necesitaBienvenida(), obtenerCatalogos()]);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <EncabezadoPagina
        titulo="Configura tu mes"
        descripcion={`Marca lo que aplica y ajusta montos. Con esto se arma el checklist de ${nombrePeriodo(obtenerPeriodoActual())}. Todo se puede editar después.`}
      />
      {!primeraVez ? (
        <p className="rounded-xl bg-info-soft px-4 py-3 text-sm font-semibold text-info">
          Ya tienes obligaciones configuradas. Lo que marques aquí se agregará a las existentes.
        </p>
      ) : null}
      <FormularioBienvenida cuentasExistentes={catalogos.cuentas.map((c) => c.nombre)} />
    </div>
  );
}
