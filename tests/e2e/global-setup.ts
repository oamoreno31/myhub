import { chromium, type FullConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { CREDENCIALES } from "./utilidades";

/** Inicia sesión una vez y guarda la sesión para el resto de las pruebas. */
export default async function globalSetup(config: FullConfig) {
  const { baseURL, storageState, launchOptions } = config.projects[0].use;
  mkdirSync("tests/e2e/.auth", { recursive: true });
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ locale: "es-CO" });
  await page.goto(`${baseURL}/login`);
  await page.fill("#email", CREDENCIALES.email);
  await page.fill("#password", CREDENCIALES.password);
  await page.click("button[type=submit]");
  await page.waitForURL(`${baseURL}/`);
  await page.context().storageState({ path: storageState as string });
  await browser.close();
}
