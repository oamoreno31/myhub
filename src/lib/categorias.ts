/** Utilidades de categorías para selects y listas (sin dependencias de servidor). */

export type CategoriaBasica = {
  id: string;
  nombre: string;
  tipo: "ingreso" | "gasto";
  grupo: string;
  padre_id: string | null;
  requiere_descripcion: boolean;
  es_sistema: boolean;
  activa: boolean;
  orden: number;
  color: string | null;
};

export type OpcionCategoria = { id: string; etiqueta: string; requiereDescripcion: boolean };
export type GrupoOpciones = { grupo: string; opciones: OpcionCategoria[] };

/** Categorías que el usuario no elige a mano (las usa el sistema en otras fases). */
const SOLO_SISTEMA = new Set(["Tarjetas de crédito", "Costos financieros TC", "Intereses de préstamos"]);

/**
 * Opciones agrupadas para un <select>: cada grupo con su categoría padre y,
 * debajo, sus subcategorías ("Otros › Mercado").
 */
export function opcionesCategorias(categorias: CategoriaBasica[], tipo: "ingreso" | "gasto"): GrupoOpciones[] {
  const activas = categorias.filter(
    (c) => c.activa && c.tipo === tipo && !(c.es_sistema && SOLO_SISTEMA.has(c.nombre)),
  );
  const padres = activas
    .filter((c) => !c.padre_id)
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
  const grupos = new Map<string, OpcionCategoria[]>();
  for (const p of padres) {
    const lista = grupos.get(p.grupo) ?? [];
    lista.push({ id: p.id, etiqueta: p.nombre, requiereDescripcion: p.requiere_descripcion });
    const hijas = activas
      .filter((h) => h.padre_id === p.id)
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
    for (const h of hijas) {
      lista.push({ id: h.id, etiqueta: `${p.nombre} › ${h.nombre}`, requiereDescripcion: h.requiere_descripcion });
    }
    grupos.set(p.grupo, lista);
  }
  return [...grupos.entries()].map(([grupo, opciones]) => ({ grupo, opciones }));
}

export function buscarOpcion(grupos: GrupoOpciones[], id: string | null | undefined): OpcionCategoria | undefined {
  if (!id) return undefined;
  for (const g of grupos) {
    const o = g.opciones.find((x) => x.id === id);
    if (o) return o;
  }
  return undefined;
}
