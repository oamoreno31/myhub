"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui/select";
import type { ObligacionPlantilla } from "@/lib/analisis";

export function SelectorObligacion({ obligaciones, valor }: { obligaciones: ObligacionPlantilla[]; valor: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendiente, startTransition] = useTransition();
  return (
    <label className="flex flex-col gap-1 sm:w-72">
      <span className="sr-only">Obligación</span>
      <Select
        value={valor}
        disabled={pendiente}
        onChange={(e) =>
          startTransition(() =>
            router.replace(`${pathname}?obligacion=${e.target.value}#obligacion`, { scroll: false }),
          )
        }
      >
        {obligaciones.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
            {o.activa ? "" : " (inactiva)"}
          </option>
        ))}
      </Select>
    </label>
  );
}
