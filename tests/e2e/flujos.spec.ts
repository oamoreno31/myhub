import { expect, test } from "@playwright/test";
import { desplazarMes, elegirCategoria, escribirMonto, esperarAviso, hoja, hoyBogota, SUFIJO } from "./utilidades";

/**
 * Flujos clave de la app (docs/06 F6): pagar una obligación, compra con tarjeta → extracto →
 * pago, y cierre (y reapertura) de mes. Cada prueba crea sus propios datos con un sufijo único.
 */
test.describe.configure({ mode: "serial" });

const hoy = hoyBogota();
const mesActual = hoy.slice(0, 7);
const mesAnterior = desplazarMes(mesActual, -1);

test("pagar una obligación del mes", async ({ page }) => {
  const nombre = `Streaming ${SUFIJO}`;
  await page.goto("/configuracion?seccion=obligaciones");
  await page.getByRole("button", { name: "Nueva", exact: true }).click();
  await hoja(page).locator('input[name="nombre"]').fill(nombre);
  await hoja(page).locator('select[name="tipo"]').selectOption("otro");
  await elegirCategoria(page, "Ocio y suscripciones");
  await escribirMonto(page, 'input[name="monto_estimado"]', "26900");
  await hoja(page).locator('input[name="dia_vencimiento"]').fill("28");
  await hoja(page).getByRole("button", { name: "Crear obligación" }).click();
  await esperarAviso(page, /creada|guardada/i);

  await page.goto(`/mes/${mesActual}`);
  const fila = page.locator("li", { has: page.getByText(nombre, { exact: true }) }).first();
  await expect(fila).toBeVisible();
  await fila.getByRole("button", { name: "Pagar" }).click();
  await expect(hoja(page).getByText("Quedará pagada")).toBeVisible();
  await hoja(page).getByRole("button", { name: "Registrar pago" }).click();
  await expect(hoja(page)).toBeHidden();
  await expect(fila.getByText("✓ Pagada").first()).toBeVisible();
});

test("compra con tarjeta → extracto → pago total", async ({ page }) => {
  const nombre = `Visa ${SUFIJO}`;
  // Todo en el mes en curso (los meses anteriores pueden estar cerrados): la tarjeta corta hoy,
  // la compra es de hoy y el extracto es el de este corte.
  const diaCorte = String(Number(hoy.slice(8)));
  const fechaCompra = hoy;
  const fechaCorte = hoy;

  await page.goto("/tarjetas");
  await page.getByRole("button", { name: "Nueva tarjeta" }).click();
  await hoja(page).locator('input[name="nombre"]').fill(nombre);
  await escribirMonto(page, 'input[name="cupo"]', "5000000");
  await hoja(page).locator('input[name="dia_corte"]').fill(diaCorte);
  await hoja(page).locator('input[name="dia_limite_pago"]').fill("5");
  await hoja(page).locator('input[name="tasa_ea_ref"]').fill("28");
  await hoja(page).getByRole("button", { name: "Crear tarjeta" }).click();
  await page.waitForURL(/\/tarjetas\/[0-9a-f-]{36}$/);

  // Compra de contado
  await page.getByRole("button", { name: "Compra", exact: true }).click();
  await escribirMonto(page, 'input[name="monto"]', "450000");
  await hoja(page).locator('input[name="fecha"]').fill(fechaCompra);
  await elegirCategoria(page, "Mercado");
  await hoja(page).locator('input[name="descripcion"]').fill("Mercado e2e");
  await hoja(page).getByRole("button", { name: "Registrar" }).click();
  await expect(hoja(page)).toBeHidden();

  // Extracto: total 462.300 → 12.300 de otros cargos sobre 450.000 de capital
  await page.getByRole("button", { name: "Extracto", exact: true }).click();
  await hoja(page).locator('input[name="fecha_corte"]').fill(fechaCorte);
  await escribirMonto(page, 'input[name="pago_total_banco"]', "462300");
  await escribirMonto(page, 'input[name="pago_minimo_banco"]', "60000");
  await expect(hoja(page).locator('[aria-live="polite"]').getByText("$ 12.300").first()).toBeVisible();
  await hoja(page).getByRole("button", { name: "Registrar extracto" }).click();
  await expect(hoja(page)).toBeHidden();

  // Pago total hoy: primero a otros cargos, luego a capital; la deuda queda en cero
  await page.getByRole("button", { name: "Pagar", exact: true }).first().click();
  await hoja(page).locator('input[name="fecha"]').fill(hoy);
  await hoja(page).getByRole("radio", { name: /Total/ }).click();
  const previa = hoja(page).locator('[aria-live="polite"]');
  await expect(previa.getByText("Pago total")).toBeVisible();
  await expect(previa.getByText("$ 12.300").first()).toBeVisible();
  await hoja(page).getByRole("button", { name: "Registrar pago" }).click();
  await expect(hoja(page)).toBeHidden();
  await expect(page.getByText("Pagado total").first()).toBeVisible();
});

test("cerrar y reabrir el mes anterior", async ({ page }) => {
  await page.goto(`/mes/${mesAnterior}`);
  const reabrir = page.getByRole("button", { name: "Reabrir" });
  if (await reabrir.isVisible()) {
    // Quedó cerrado de una corrida anterior: se reabre primero.
    await reabrir.click();
    await hoja(page).locator('input[name="motivo"]').fill("Prueba e2e");
    await hoja(page).getByRole("button", { name: "Reabrir mes" }).click();
    await expect(hoja(page)).toBeHidden();
  }

  await page.getByRole("button", { name: "Cerrar mes" }).click();
  // Si quedan pendientes, se omiten con motivo.
  const omitir = hoja(page).getByRole("radio", { name: "— Omitir" });
  for (let i = 0; i < (await omitir.count()); i++) await omitir.nth(i).click();
  const motivos = hoja(page).getByPlaceholder("Motivo (obligatorio)");
  for (let i = 0; i < (await motivos.count()); i++) await motivos.nth(i).fill("Prueba e2e");
  await hoja(page)
    .getByRole("button", { name: /^Cerrar / })
    .click();
  await expect(hoja(page)).toBeHidden();
  await expect(page.getByText("Solo lectura", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Pagar" })).toHaveCount(0);

  // Se reabre para dejar el mes como estaba
  await page.getByRole("button", { name: "Reabrir" }).click();
  await hoja(page).locator('input[name="motivo"]').fill("Prueba e2e");
  await hoja(page).getByRole("button", { name: "Reabrir mes" }).click();
  await expect(hoja(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "Cerrar mes" })).toBeVisible();
});

test("exportar a Excel y descargar respaldo", async ({ page }) => {
  await page.goto("/configuracion?seccion=datos");
  const [excel] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Descargar Excel" }).click(),
  ]);
  expect(excel.suggestedFilename()).toMatch(/\.xlsx$/);
  const [respaldo] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Descargar respaldo ahora" }).click(),
  ]);
  expect(respaldo.suggestedFilename()).toMatch(/\.json$/);
});
