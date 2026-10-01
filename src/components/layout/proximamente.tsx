import { HammerIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EncabezadoPagina } from "./encabezado-pagina";

/** Pantalla reservada: indica en qué fase del plan se construye y qué traerá. */
export function Proximamente({
  titulo,
  fase,
  descripcion,
  incluye,
}: {
  titulo: string;
  fase: number;
  descripcion: string;
  incluye: string[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo={titulo} descripcion={descripcion} />
      <Card className="max-w-2xl">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <HammerIcon className="size-5" aria-hidden="true" />
          </span>
          <div className="flex flex-col">
            <span className="font-bold">En construcción</span>
            <span className="text-sm text-muted-foreground">Esta pantalla se desarrolla en la Fase {fase}.</span>
          </div>
          <Badge variant="info" className="ml-auto">
            Fase {fase}
          </Badge>
        </div>
        <ul className="flex flex-col gap-2 border-t pt-4 text-sm">
          {incluye.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden="true" className="text-primary">
                •
              </span>
              {item}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
