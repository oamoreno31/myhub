"use client";

import dynamic from "next/dynamic";

/**
 * Formularios pesados que se descargan al abrir su hoja (no con la página): así cada pantalla
 * carga menos JavaScript en el celular.
 */
function Cargando() {
  return <div className="h-64 animate-pulse rounded-xl bg-muted" aria-label="Cargando formulario" role="status" />;
}

export const MovimientoFormDiferido = dynamic(
  () => import("@/components/formularios/movimiento-form").then((m) => m.MovimientoForm),
  { loading: Cargando },
);
export const CompraFormDiferido = dynamic(() => import("@/components/tarjetas/formularios").then((m) => m.CompraForm), {
  loading: Cargando,
});
export const AbonoFormDiferido = dynamic(() => import("@/components/deudas/formularios").then((m) => m.AbonoForm), {
  loading: Cargando,
});
