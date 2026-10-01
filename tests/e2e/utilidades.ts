import { expect, type Page } from "@playwright/test";

/** Usuario del seed local (supabase/seed.sql). */
export const CREDENCIALES = {
  email: process.env.E2E_EMAIL ?? "oamoreno31@gmail.com",
  password: process.env.E2E_PASSWORD ?? "plata-clara-local",
};

/** Sufijo único por corrida: las pruebas se pueden repetir sin reiniciar la BD. */
export const SUFIJO = Date.now().toString(36).slice(-5);

/** Fecha de hoy en Bogotá (YYYY-MM-DD) y utilidades de periodo. */
export function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}
export function desplazarMes(periodo: string, meses: number): string {
  const [y, m] = periodo.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + meses, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const hoja = (page: Page) => page.locator('[data-slot="sheet-content"]');

/** Escribe un monto en un MontoInput y sale del campo (lo formatea). */
export async function escribirMonto(page: Page, selector: string, valor: string | number) {
  const campo = hoja(page).locator(selector);
  await campo.fill(String(valor));
  await campo.blur();
}

/** Espera el aviso (toast) de éxito con ese texto. */
export async function esperarAviso(page: Page, texto: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: texto }).first()).toBeVisible();
}

/** Elige una categoría por el final de su etiqueta ("Otros gastos › Mercado" → "Mercado"). */
export async function elegirCategoria(page: Page, texto: string) {
  const select = hoja(page).locator('select[name="categoria_id"]');
  const valor = await select
    .locator("option")
    .evaluateAll((ops, t) => (ops as HTMLOptionElement[]).find((o) => o.textContent?.trim().endsWith(t))?.value, texto);
  if (!valor) throw new Error(`No existe la categoría ${texto}`);
  await select.selectOption(valor);
}
