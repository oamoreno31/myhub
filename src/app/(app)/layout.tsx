import { redirect } from "next/navigation";
import { BarraInferior } from "@/components/layout/barra-inferior";
import { BarraLateral } from "@/components/layout/barra-lateral";
import { MenuUsuario } from "@/components/layout/menu-usuario";
import { type PendienteRapido, RegistroRapido } from "@/components/layout/registro-rapido";
import { SelectorPeriodo } from "@/components/layout/selector-periodo";
import { asegurarPeriodo, obtenerCatalogos, obtenerObligacionesMes } from "@/lib/datos";
import { estaPagada, hoyISO } from "@/lib/domain/obligaciones";
import { nombrePeriodo } from "@/lib/domain/periodos";
import { serverEnv } from "@/lib/env.server";
import { obtenerPeriodoActual, obtenerPeriodoSeleccionado } from "@/lib/periodo-seleccionado";
import { createClient } from "@/lib/supabase/server";
import { obtenerPrestamos } from "@/lib/deudas";
import { obtenerTarjetas } from "@/lib/tarjetas";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  // El proxy ya protege las rutas; esto es defensa en profundidad.
  if (!data?.claims) redirect("/login");

  const email = (data.claims.email as string | undefined) ?? "";
  const metadatos = data.claims.user_metadata as { nombre?: string } | undefined;
  const nombre = metadatos?.nombre ?? email.split("@")[0] ?? "Usuario";

  const [periodo, actual] = [await obtenerPeriodoSeleccionado(), obtenerPeriodoActual()];
  const hoy = hoyISO(new Date(), serverEnv().APP_TIMEZONE);

  // Datos del registro rápido: siempre sobre el mes en curso.
  const [catalogos, periodoActual, tarjetas, prestamos] = await Promise.all([
    obtenerCatalogos(),
    asegurarPeriodo(actual),
    obtenerTarjetas(),
    obtenerPrestamos(),
  ]);
  const obligaciones = await obtenerObligacionesMes(periodoActual.id);
  const pendientes: PendienteRapido[] = obligaciones
    .filter((o) => !o.resolucion && !estaPagada(o))
    .map((o) => ({
      id: o.id,
      nombre: o.nombre,
      categoria_id: o.categoria_id,
      categoria_nombre: o.categoria_nombre,
      cuenta_default_id: o.cuenta_default_id,
      es_ingreso: o.es_ingreso,
      monto_esperado: o.monto_esperado,
      pagado: o.pagado,
      pendiente: o.pendiente,
      fecha_vencimiento: o.fecha_vencimiento,
      tarjeta_id: o.tarjeta_id,
      deuda_id: o.deuda_id,
    }));

  const registro = (variante: "encabezado" | "flotante") => (
    <RegistroRapido
      variante={variante}
      cuentas={catalogos.cuentas}
      categorias={catalogos.categorias}
      pendientes={pendientes}
      prestamos={prestamos
        .filter((p) => p.saldo > 0 && !p.castigado_en)
        .map((p) => ({ id: p.id, deudor: p.deudor, saldo: p.saldo }))}
      tarjetas={tarjetas
        .filter((t) => t.activa)
        .map((t) => ({
          id: t.id,
          nombre: t.nombre,
          dia_corte: t.dia_corte,
          dia_limite_pago: t.dia_limite_pago,
          cupo: t.cupo,
          cupo_disponible: t.cupo_disponible,
          cuenta_pago_default_id: t.cuenta_pago_default_id,
        }))}
      hoy={hoy}
    />
  );

  return (
    <div className="flex min-h-dvh">
      <BarraLateral
        nombre={nombre}
        periodo={`${nombrePeriodo(periodo)} · ${periodo === actual ? "mes en curso" : "consultando"}`}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-background/90 px-4 backdrop-blur sm:px-6 lg:h-19 lg:px-8">
          <SelectorPeriodo periodo={periodo} actual={actual} />
          <div className="flex items-center gap-3">
            {registro("encabezado")}
            <MenuUsuario nombre={nombre} email={email} />
          </div>
        </header>

        <main className="flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pb-12">{children}</main>
      </div>

      <BarraInferior registro={registro("flotante")} />
    </div>
  );
}
