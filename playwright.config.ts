import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas de extremo a extremo (docs/06 F6): flujos clave y accesibilidad.
 *
 * Requisitos: Supabase local con datos de prueba recién sembrados (`pnpm db:reset`) y
 * `pnpm exec playwright install chromium` una vez. Luego `pnpm e2e` levanta la app (o usa
 * E2E_BASE_URL si ya está corriendo). Las pruebas escriben datos: no apuntes a producción.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "tests/e2e/.reporte" }]],
  outputDir: "tests/e2e/.resultados",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    locale: "es-CO",
    timezoneId: "America/Bogota",
    storageState: "tests/e2e/.auth/omar.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
  },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    {
      name: "movil",
      use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } },
      testMatch: /accesibilidad\.spec\.ts/,
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
