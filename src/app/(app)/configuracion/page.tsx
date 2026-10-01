import type { Metadata } from "next";
import Link from "next/link";
import { PreferenciasForm } from "@/components/configuracion/formularios";
import {
  type CuentaFila,
  type PlantillaFila,
  SeccionCategorias,
  SeccionCuentas,
  SeccionObligaciones,
} from "@/components/configuracion/secciones";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { Card } from "@/components/ui/card";
import { obtenerCatalogos } from "@/lib/datos";
import { type Frecuencia, hoyISO } from "@/lib/domain/obligaciones";
import { serverEnv } from "@/lib/env.server";
import { obtenerPeriodoActual } from "@/lib/periodo-seleccionado";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Configuración" };

const SECCIONES = [
  { clave: "obligaciones", etiqueta: "Obligaciones recurrentes" },
  { clave: "cuentas", etiqueta: "Cuentas" },
  { clave: "categorias", etiqueta: "Categorías" },
  { clave: "preferencias", etiqueta: "Preferencias" },
] as const;

type Seccion = (typeof SECCIONES)[number]["clave"];

export default async function ConfiguracionPage({ searchParams }: PageProps<"/configuracion">) {
  const { seccion: s } = await searchParams;
  const seccion: Seccion = SECCIONES.find((x) => x.clave === s)?.clave ?? "obligaciones";
  const supabase = await createClient();
  const hoy = hoyISO(new Date(), serverEnv().APP_TIMEZONE);
  const periodoActual = obtenerPeriodoActual();
  const catalogos = await obtenerCatalogos();

  let contenido: React.ReactNode = null;

  if (seccion === "cuentas") {
    const { data, error } = await supabase
      .from("v_saldos_cuentas")
      .select("*")
      .order("activa", { ascending: false })
      .order("orden")
      .order("nombre");
    if (error) throw new Error(error.message);
    const cuentas: CuentaFila[] = (data ?? []).map((c) => ({
      id: c.id!,
      nombre: c.nombre!,
      tipo: c.tipo!,
      entidad: c.entidad,
      saldo_inicial: Number(c.saldo_inicial ?? 0),
      fecha_saldo_inicial: c.fecha_saldo_inicial,
      saldo: Number(c.saldo ?? 0),
      activa: Boolean(c.activa),
      n_movimientos: c.n_movimientos ?? 0,
    }));
    contenido = <SeccionCuentas cuentas={cuentas} hoy={hoy} />;
  } else if (seccion === "categorias") {
    const { data, error } = await supabase.from("categorias").select("*").order("orden").order("nombre");
    if (error) throw new Error(error.message);
    contenido = <SeccionCategorias categorias={data ?? []} />;
  } else if (seccion === "obligaciones") {
    const { data, error } = await supabase
      .from("obligaciones")
      .select("*, categoria:categorias(nombre), cuenta:cuentas(nombre)")
      .order("activa", { ascending: false })
      .order("dia_vencimiento")
      .order("nombre");
    if (error) throw new Error(error.message);
    const plantillas: PlantillaFila[] = (data ?? []).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      tipo: p.tipo,
      categoria_id: p.categoria_id,
      monto_estimado: Number(p.monto_estimado),
      es_variable: p.es_variable,
      estimar_con_promedio: p.estimar_con_promedio,
      dia_vencimiento: p.dia_vencimiento,
      frecuencia: p.frecuencia as Frecuencia,
      fecha_inicio: p.fecha_inicio,
      mes_ancla: p.mes_ancla,
      fecha_fin: p.fecha_fin,
      cuenta_default_id: p.cuenta_default_id,
      referencia_pago: p.referencia_pago,
      notas: p.notas,
      activa: p.activa,
      es_ingreso: Boolean(p.es_ingreso),
      categoria_nombre: p.categoria?.nombre ?? "",
      cuenta_nombre: p.cuenta?.nombre ?? null,
    }));
    contenido = (
      <SeccionObligaciones
        plantillas={plantillas}
        categorias={catalogos.categorias}
        cuentas={catalogos.cuentas.map((c) => ({ id: c.id, nombre: c.nombre, tipo: c.tipo }))}
        periodoActual={periodoActual}
      />
    );
  } else {
    const { data } = await supabase.from("parametros").select("meta_ahorro_pct, recordatorios_email").maybeSingle();
    contenido = (
      <Card>
        <PreferenciasForm
          metaAhorro={Number(data?.meta_ahorro_pct ?? 0.2)}
          recordatorios={data?.recordatorios_email ?? true}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        titulo="Configuración"
        descripcion="Tus obligaciones recurrentes, cuentas, categorías y preferencias."
      />
      <nav aria-label="Secciones de configuración" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex w-max gap-1 rounded-xl bg-secondary p-1">
          {SECCIONES.map((x) => (
            <li key={x.clave}>
              <Link
                href={`/configuracion?seccion=${x.clave}`}
                aria-current={seccion === x.clave ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center rounded-lg px-4 text-sm font-bold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  seccion === x.clave ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {x.etiqueta}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {contenido}
    </div>
  );
}
