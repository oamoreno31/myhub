"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/marca/logo";
import { estaActivo, NAVEGACION } from "@/lib/navegacion";
import { cn } from "@/lib/utils";

export function BarraLateral({ nombre, periodo }: { nombre: string; periodo: string }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-1 bg-sidebar px-4 py-6 text-sidebar-foreground lg:flex">
      <Link
        href="/"
        className="mb-5 flex items-center gap-2.5 rounded-lg px-2 outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Logo className="text-brand" />
        <span className="font-display text-[22px] font-semibold text-white">Plata Clara</span>
      </Link>

      <nav aria-label="Principal" className="flex flex-col gap-1">
        {NAVEGACION.map((item) => {
          const activo = estaActivo(item.href, pathname);
          const Icono = item.icono;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={activo ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand",
                activo
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-white/5",
              )}
            >
              <Icono className="size-[18px]" aria-hidden="true" />
              {item.etiqueta}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1 rounded-xl bg-white/5 px-3 py-3">
        <span className="text-sm font-bold text-white">{nombre}</span>
        <span className="text-xs text-sidebar-muted">{periodo}</span>
      </div>
    </aside>
  );
}
