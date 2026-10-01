"use client";

import { FileTextIcon, Loader2Icon, PaperclipIcon, XIcon } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";

const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};
const MAX = 5 * 1024 * 1024;

/** Reduce fotos grandes del celular a JPEG de 1600 px (si el navegador puede leerlas). */
async function comprimir(archivo: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(archivo.type) || archivo.size < 800 * 1024) return archivo;
  try {
    const img = await createImageBitmap(archivo);
    const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.82));
    return blob && blob.size < archivo.size ? blob : archivo;
  } catch {
    return archivo;
  }
}

/**
 * Comprobante (foto o PDF) de un movimiento o compra. Se sube directo a Storage privado
 * ({user_id}/{uuid}.ext) y el formulario solo envía la ruta.
 */
/** El cliente de Supabase (y su peso) solo se descarga cuando de verdad se sube o quita un archivo. */
const clienteNavegador = async () => (await import("@/lib/supabase/client")).createClient();

export function CampoComprobante({ inicial }: { inicial?: string | null }) {
  const id = useId();
  const [ruta, setRuta] = useState<string | null>(inicial ?? null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subir = async (archivo: File) => {
    setError(null);
    if (!TIPOS.includes(archivo.type)) return setError("Solo fotos (JPG, PNG, WEBP, HEIC) o PDF.");
    setSubiendo(true);
    try {
      const cuerpo = await comprimir(archivo);
      if (cuerpo.size > MAX) throw new Error("El archivo pesa más de 5 MB.");
      const supabase = await clienteNavegador();
      const { data } = await supabase.auth.getClaims();
      const uid = data?.claims.sub;
      if (!uid) throw new Error("Tu sesión venció. Vuelve a entrar.");
      const tipo = cuerpo.type || archivo.type;
      const nueva = `${uid}/${crypto.randomUUID()}.${EXT[tipo] ?? "jpg"}`;
      const { error: e } = await supabase.storage.from("comprobantes").upload(nueva, cuerpo, { contentType: tipo });
      if (e) throw new Error(e.message);
      // Si reemplaza a uno recién subido (aún sin guardar), ese ya no se usa.
      if (ruta && ruta !== inicial) await supabase.storage.from("comprobantes").remove([ruta]);
      setRuta(nueva);
    } catch (e) {
      setError((e as Error).message || "No se pudo subir el comprobante.");
    } finally {
      setSubiendo(false);
    }
  };

  const quitar = async () => {
    if (ruta && ruta !== inicial) await (await clienteNavegador()).storage.from("comprobantes").remove([ruta]);
    setRuta(null);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <input type="hidden" name="adjunto_path" value={ruta ?? ""} />
      <input type="hidden" name="adjunto_anterior" value={inicial ?? ""} />
      {ruta ? (
        <div className="flex min-h-11 items-center gap-2 rounded-lg border bg-card px-3 text-sm">
          {ruta.endsWith(".pdf") ? (
            <FileTextIcon className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <PaperclipIcon className="size-4 shrink-0" aria-hidden="true" />
          )}
          <span className="flex-1 font-semibold">{ruta === inicial ? "Comprobante adjunto" : "Comprobante listo"}</span>
          {ruta === inicial ? (
            <a
              href={`/api/comprobante?ruta=${encodeURIComponent(ruta)}`}
              target="_blank"
              rel="noopener"
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              Ver
            </a>
          ) : null}
          <Button type="button" variant="ghost" size="icon-sm" onClick={quitar} aria-label="Quitar comprobante">
            <XIcon />
          </Button>
        </div>
      ) : (
        <label
          htmlFor={id}
          className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 text-sm font-semibold text-muted-foreground hover:bg-muted/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
        >
          {subiendo ? (
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <PaperclipIcon className="size-4" aria-hidden="true" />
          )}
          {subiendo ? "Subiendo…" : "Adjuntar comprobante (foto o PDF, opcional)"}
          <input
            id={id}
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            disabled={subiendo}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void subir(f);
            }}
          />
        </label>
      )}
      {error ? <p className="text-xs font-semibold text-destructive">{error}</p> : null}
    </div>
  );
}
