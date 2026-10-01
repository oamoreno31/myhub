"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { type CategoriaBasica, opcionesCategorias } from "@/lib/categorias";
import { desplazarPeriodo, nombrePeriodo } from "@/lib/domain/periodos";
import { cn } from "@/lib/utils";

export function FiltrosMovimientos({
  periodo,
  tipo,
  categoria,
  cuenta,
  q,
  obligacion,
  cuentas,
  categorias,
}: {
  periodo: string;
  tipo?: string;
  categoria?: string;
  cuenta?: string;
  q?: string;
  obligacion?: string;
  cuentas: { id: string; nombre: string }[];
  categorias: CategoriaBasica[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendiente, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState(q ?? "");

  const grupos = useMemo(
    () => [
      ...opcionesCategorias(categorias, "gasto").map((g) => ({ ...g, grupo: `Gasto · ${g.grupo}` })),
      ...opcionesCategorias(categorias, "ingreso").map((g) => ({ ...g, grupo: `Ingreso · ${g.grupo}` })),
    ],
    [categorias],
  );
  const meses = useMemo(() => Array.from({ length: 13 }, (_, i) => desplazarPeriodo(periodo, 6 - i)), [periodo]);

  const aplicar = (cambios: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const actual = { periodo, tipo, categoria, cuenta, q: busqueda || undefined, ...cambios };
    for (const [k, v] of Object.entries(actual)) if (v) params.set(k, v);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  };

  const hayFiltros = Boolean(tipo || categoria || cuenta || q || obligacion);

  if (obligacion) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Mostrando solo los pagos de una obligación.</span>
        <Button variant="link" onClick={() => startTransition(() => router.replace(pathname))}>
          Ver todos
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-col gap-3 rounded-2xl border bg-card p-4 transition-opacity", pendiente && "opacity-70")}
    >
      <form
        role="search"
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          aplicar({ q: busqueda || undefined });
        }}
      >
        <div className="relative flex-1">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label="Buscar por descripción, comercio o categoría"
            placeholder="Buscar descripción, comercio o categoría"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="pl-9"
            maxLength={60}
          />
        </div>
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Select aria-label="Mes" value={periodo} onChange={(e) => aplicar({ periodo: e.target.value })}>
          {meses.map((m) => (
            <option key={m} value={m}>
              {nombrePeriodo(m)}
            </option>
          ))}
        </Select>
        <Select aria-label="Tipo" value={tipo ?? ""} onChange={(e) => aplicar({ tipo: e.target.value || undefined })}>
          <option value="">Todos los tipos</option>
          <option value="ingreso">Ingresos</option>
          <option value="gasto">Gastos</option>
          <option value="transferencia">Transferencias</option>
        </Select>
        <Select
          aria-label="Categoría"
          value={categoria ?? ""}
          onChange={(e) => aplicar({ categoria: e.target.value || undefined })}
        >
          <option value="">Todas las categorías</option>
          {grupos.map((g) => (
            <optgroup key={g.grupo} label={g.grupo}>
              {g.opciones.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.etiqueta}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <Select
          aria-label="Cuenta"
          value={cuenta ?? ""}
          onChange={(e) => aplicar({ cuenta: e.target.value || undefined })}
        >
          <option value="">Todas las cuentas</option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Select>
      </div>
      {hayFiltros ? (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => {
            setBusqueda("");
            startTransition(() => router.replace(`${pathname}?periodo=${periodo}`, { scroll: false }));
          }}
        >
          <XIcon /> Quitar filtros
        </Button>
      ) : null}
    </div>
  );
}
