"use client";

import { EllipsisIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { estaActivo, NAVEGACION } from "@/lib/navegacion";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const claseItem =
  "flex h-full flex-col items-center justify-center gap-1 text-[11px] font-bold outline-none focus-visible:text-primary";

export function BarraInferior({ registro }: { registro: ReactNode }) {
  const pathname = usePathname();
  const principales = NAVEGACION.filter((i) => i.enBarraMovil);
  const [izquierda, derecha] = [principales.slice(0, 2), principales.slice(2)];
  const secundarios = NAVEGACION.filter((i) => !i.enBarraMovil);
  const masActivo = secundarios.some((i) => estaActivo(i.href, pathname));

  const renderItem = (item: (typeof NAVEGACION)[number]) => {
    const activo = estaActivo(item.href, pathname);
    const Icono = item.icono;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={activo ? "page" : undefined}
        className={cn(claseItem, activo ? "text-primary" : "text-muted-foreground")}
      >
        <Icono className="size-[22px]" aria-hidden="true" />
        {item.etiqueta === "Tarjetas de crédito" ? "Tarjetas" : item.etiqueta === "Mes actual" ? "Mes" : item.etiqueta}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-40 grid h-[calc(4.5rem+env(safe-area-inset-bottom))] grid-cols-5 border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {izquierda.map(renderItem)}
      {registro}
      {derecha.map(renderItem)}
      <Sheet>
        <SheetTrigger className={cn(claseItem, masActivo ? "text-primary" : "text-muted-foreground")}>
          <EllipsisIcon className="size-[22px]" aria-hidden="true" />
          Más
        </SheetTrigger>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Más secciones</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-2">
            {secundarios.map((item) => {
              const Icono = item.icono;
              const activo = estaActivo(item.href, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex min-h-14 items-center gap-3 rounded-xl border px-4 text-sm font-bold",
                    activo ? "border-primary bg-accent text-accent-foreground" : "bg-card",
                  )}
                >
                  <Icono className="size-5" aria-hidden="true" />
                  {item.etiqueta}
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
