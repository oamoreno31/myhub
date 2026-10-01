import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { aCSV, rangoExportacion, type Tabla } from "@/lib/domain/exportacion";
import { hoyISO } from "@/lib/domain/obligaciones";
import { periodoActual } from "@/lib/domain/periodos";
import { serverEnv } from "@/lib/env.server";
import { tablasExportacion } from "@/lib/exportacion";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function libro(tablas: Tabla[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Plata Clara";
  wb.created = new Date();
  for (const t of tablas) {
    const ws = wb.addWorksheet(t.nombre, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = t.columnas.map((c) => ({
      header: c.titulo,
      key: c.clave,
      width: c.tipo === "pesos" ? 16 : c.tipo === "fecha" ? 12 : Math.min(Math.max(c.titulo.length + 4, 12), 40),
      style:
        c.tipo === "pesos"
          ? { numFmt: '"$" #,##0;[Red]-"$" #,##0' }
          : c.tipo === "fecha"
            ? { numFmt: "dd/mm/yyyy" }
            : {},
    }));
    for (const f of t.filas) {
      const fila: Record<string, unknown> = { ...f };
      for (const c of t.columnas) {
        const v = f[c.clave];
        if (c.tipo === "fecha" && typeof v === "string") fila[c.clave] = new Date(`${v}T00:00:00Z`);
        if (typeof v === "boolean") fila[c.clave] = v ? "Sí" : "No";
      }
      ws.addRow(fila);
    }
    ws.getRow(1).font = { bold: true };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: t.columnas.length } };
  }
  return wb.xlsx.writeBuffer();
}

/** Exportación por rango de meses: CSV (movimientos) o Excel (movimientos, obligaciones, resumen). */
export async function GET(request: Request, { params }: RouteContext<"/api/export/[formato]">) {
  const { formato } = await params;
  if (formato !== "csv" && formato !== "xlsx") return NextResponse.json({ error: "Formato inválido" }, { status: 400 });
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const env = serverEnv();
  const url = new URL(request.url);
  const { desde, hasta } = rangoExportacion(
    url.searchParams.get("desde"),
    url.searchParams.get("hasta"),
    periodoActual(new Date(), env.APP_TIMEZONE),
  );
  const tablas = await tablasExportacion(desde, hasta, hoyISO(new Date(), env.APP_TIMEZONE));
  const nombre = `plata-clara_${desde}_${hasta}`;
  const cabeceras = { "cache-control": "no-store" };

  if (formato === "csv") {
    return new NextResponse(aCSV(tablas[0]), {
      headers: {
        ...cabeceras,
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${nombre}_movimientos.csv"`,
      },
    });
  }
  const buffer = await libro(tablas);
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      ...cabeceras,
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${nombre}.xlsx"`,
    },
  });
}
