import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Accesibilidad (docs/06 F6): sin violaciones graves ni críticas de WCAG 2.1 A/AA en las
 * pantallas principales, en escritorio y en móvil (proyecto "movil"), tema claro y oscuro.
 */
const PANTALLAS = [
  "/",
  "/mes",
  "/movimientos",
  "/tarjetas",
  "/deudas",
  "/analisis",
  "/presupuesto",
  "/salud",
  "/historico",
  "/configuracion",
  "/configuracion?seccion=datos",
];

for (const tema of ["light", "dark"] as const) {
  test.describe(`tema ${tema === "light" ? "claro" : "oscuro"}`, () => {
    test.use({ colorScheme: tema });
    for (const ruta of PANTALLAS) {
      test(`sin violaciones graves en ${ruta}`, async ({ page }) => {
        await page.goto(ruta);
        // /mes redirige al mes elegido: se espera a que termine antes de tocar la página.
        await page.waitForLoadState("networkidle");
        await page.locator("main").waitFor();
        await page.evaluate((t) => document.documentElement.classList.toggle("dark", t === "dark"), tema);
        const resultado = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        const graves = resultado.violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map(
            (v) =>
              `${v.id} (${v.impact}): ${v.help} → ${v.nodes
                .map((n) => n.target.join(" "))
                .slice(0, 3)
                .join(" | ")}`,
          );
        expect(graves, graves.join("\n")).toEqual([]);
      });
    }
  });
}
