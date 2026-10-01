import { expect, test } from "@playwright/test";
import { CREDENCIALES } from "./utilidades";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("inicio de sesión", () => {
  test("sin sesión, las páginas llevan al login", async ({ page }) => {
    await page.goto("/movimientos");
    await expect(page).toHaveURL(/\/login/);
  });

  test("contraseña incorrecta muestra el error y no entra", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", CREDENCIALES.email);
    await page.fill("#password", "no-es-la-clave");
    await page.click("button[type=submit]");
    await expect(page.getByRole("alert").filter({ hasText: "incorrect" })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("con la clave correcta entra a Inicio", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", CREDENCIALES.email);
    await page.fill("#password", CREDENCIALES.password);
    await page.click("button[type=submit]");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
  });
});
