import { redirect } from "next/navigation";
import { obtenerPeriodoSeleccionado } from "@/lib/periodo-seleccionado";

/** /mes siempre lleva al periodo elegido en el selector global. */
export default async function MesPage() {
  redirect(`/mes/${await obtenerPeriodoSeleccionado()}`);
}
