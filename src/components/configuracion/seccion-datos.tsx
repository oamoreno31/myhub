"use client";

import { DatabaseBackupIcon, DownloadIcon, FileSpreadsheetIcon, Loader2Icon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Linea, VistaPrevia } from "@/components/formularios/vista-previa";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const ETIQUETAS: Record<string, string> = {
  cuentas: "Cuentas",
  categorias: "Categorías",
  periodos: "Meses",
  obligaciones: "Obligaciones recurrentes",
  movimientos: "Movimientos",
  compras_tc: "Compras con tarjeta",
  extractos_tc: "Extractos",
  pagos_tc: "Pagos de tarjeta",
  deudas: "Deudas",
  prestamos_otorgados: "Préstamos hechos",
  presupuestos: "Líneas de presupuesto",
  metas: "Metas",
};

type Respaldo = { app?: string; version?: number; exportado_en?: string; tablas?: Record<string, unknown[]> };

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short", timeZone: "America/Bogota" });

export function SeccionDatos({
  periodoActual,
  semanales,
}: {
  periodoActual: string;
  /** Respaldos automáticos del cron: "AAAA-MM-DD.json". */
  semanales: string[];
}) {
  const router = useRouter();
  const idArchivo = useId();
  const [desde, setDesde] = useState(`${periodoActual.slice(0, 4)}-01`);
  const [hasta, setHasta] = useState(periodoActual);
  const [archivo, setArchivo] = useState<{ nombre: string; texto: string; datos: Respaldo } | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const rango = `desde=${desde}&hasta=${hasta}`;

  const leer = async (f: File) => {
    setErrorArchivo(null);
    setArchivo(null);
    try {
      const texto = await f.text();
      const datos = JSON.parse(texto) as Respaldo;
      if (datos.app !== "plata-clara" || datos.version !== 1 || !datos.tablas) throw new Error();
      setArchivo({ nombre: f.name, texto, datos });
    } catch {
      setErrorArchivo("Ese archivo no es un respaldo de Plata Clara.");
    }
  };

  const restaurar = async () => {
    if (!archivo) return;
    setRestaurando(true);
    try {
      const res = await fetch("/api/respaldo", {
        method: "POST",
        headers: { "content-type": "application/json", "x-confirmar": "reemplazar-todo" },
        body: archivo.texto,
      });
      const r = (await res.json()) as { ok?: boolean; error?: string; filas?: Record<string, number> };
      if (!res.ok || !r.ok) throw new Error(r.error ?? "No se pudo restaurar");
      toast.success(`Respaldo restaurado: ${r.filas?.movimientos ?? 0} movimientos.`);
      setArchivo(null);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRestaurando(false);
      setConfirmar(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="gap-4">
        <div className="flex items-start gap-3">
          <FileSpreadsheetIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <h2 className="font-bold">Exportar a Excel o CSV</h2>
            <p className="text-sm text-muted-foreground">
              Excel trae tres hojas: movimientos (cuentas y tarjetas), obligaciones y resumen mensual. El CSV trae los
              movimientos, separado por punto y coma para abrirlo directo en Excel.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Desde
            <Input type="month" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Hasta
            <Input type="month" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href={`/api/export/xlsx?${rango}`} download>
              <DownloadIcon /> Descargar Excel
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`/api/export/csv?${rango}`} download>
              <DownloadIcon /> Descargar CSV
            </a>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Hasta 36 meses por archivo.</p>
      </Card>

      <Card className="gap-4">
        <div className="flex items-start gap-3">
          <DatabaseBackupIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <h2 className="font-bold">Respaldo completo</h2>
            <p className="text-sm text-muted-foreground">
              Todos tus datos en un archivo JSON. Además, cada domingo se guarda uno automático (se conservan 8
              semanas). Los comprobantes adjuntos no van en el archivo.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="self-start">
          <a href="/api/respaldo" download>
            <DownloadIcon /> Descargar respaldo ahora
          </a>
        </Button>
        {semanales.length > 0 ? (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold">Respaldos automáticos ({semanales.length})</summary>
            <ul className="mt-2 flex flex-col divide-y">
              {semanales.map((n) => (
                <li key={n} className="flex items-center justify-between py-2">
                  <span>
                    {new Date(`${n.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-CO", {
                      dateStyle: "long",
                      timeZone: "UTC",
                    })}
                  </span>
                  <a
                    href={`/api/respaldo?semanal=${n}`}
                    className="font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    Descargar
                  </a>
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <p className="text-xs text-muted-foreground">
            Aún no hay respaldos automáticos (el primero se hace el domingo).
          </p>
        )}

        <div className="flex flex-col gap-2 border-t pt-4">
          <h3 className="font-semibold">Restaurar un respaldo</h3>
          <p className="text-sm text-muted-foreground">
            Reemplaza <strong>todos</strong> tus datos actuales por los del archivo. Descarga antes un respaldo de lo
            que tienes hoy.
          </p>
          <label
            htmlFor={idArchivo}
            className="flex min-h-11 cursor-pointer items-center gap-2 self-start rounded-lg border border-dashed px-3 text-sm font-semibold text-muted-foreground hover:bg-muted/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
          >
            <UploadIcon className="size-4" aria-hidden="true" /> Elegir archivo .json
            <input
              id={idArchivo}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void leer(f);
              }}
            />
          </label>
          {errorArchivo ? <p className="text-sm font-semibold text-destructive">! {errorArchivo}</p> : null}
          {archivo ? (
            <VistaPrevia tono="alerta">
              <Linea etiqueta="Archivo" valor={archivo.nombre} />
              {archivo.datos.exportado_en ? (
                <Linea etiqueta="Respaldo del" valor={fechaHora(archivo.datos.exportado_en)} />
              ) : null}
              {Object.entries(ETIQUETAS).map(([clave, etiqueta]) =>
                archivo.datos.tablas?.[clave]?.length ? (
                  <Linea
                    key={clave}
                    etiqueta={etiqueta}
                    valor={archivo.datos.tablas[clave].length.toLocaleString("es-CO")}
                  />
                ) : null,
              )}
              <Button
                variant="destructive"
                className="mt-2 self-start"
                onClick={() => setConfirmar(true)}
                disabled={restaurando}
              >
                {restaurando ? <Loader2Icon className="animate-spin" /> : <UploadIcon />} Restaurar este respaldo
              </Button>
            </VistaPrevia>
          ) : null}
        </div>
      </Card>

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogTitle>¿Reemplazar todos tus datos?</AlertDialogTitle>
          <AlertDialogDescription>
            Se borran tus cuentas, movimientos, tarjetas, deudas, metas y meses actuales y quedan exactamente como en el
            respaldo. No se puede deshacer (salvo restaurando otro respaldo).
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction destructivo onClick={restaurar}>
              Sí, reemplazar todo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
