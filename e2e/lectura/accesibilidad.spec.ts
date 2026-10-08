// OFF-18 y OFF-20 "axe" (pwa-lectura-offline, tarea 6.6): leyendo, resultado, error-lectura y licencias.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { conVideo, esperarPantalla, iniciarCamara, leer } from "./ayudas";

test.use(conVideo("amarilla-1080p"));

const ETIQUETAS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function graves(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(ETIQUETAS).analyze();
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id);
}

test.describe("accesibilidad de la lectura", () => {
  test.describe.configure({ timeout: 180_000 });
  // Sin service worker: las rutas de Playwright deben ver las peticiones del Worker lector.
  test.use({ serviceWorkers: "block" });

  test("OFF-18 resultado y OFF-20 licencias", async ({ page }) => {
    await page.goto("/");
    await leer(page);
    expect(await graves(page)).toStrictEqual([]);
    // Cada campo tiene etiqueta visible asociada y el resultado está en una región aria-live.
    await expect(page.getByLabel("Número de documento", { exact: true })).toHaveText("9999123456");
    await expect(page.locator("section.resultado")).toHaveAttribute("aria-live", "polite");
    await page.getByRole("link", { name: "Fuentes: DANE y Registraduría (CC BY-SA 4.0)" }).click();
    await esperarPantalla(page, "licencias");
    expect(await graves(page)).toStrictEqual([]);
  });

  test("OFF-18 leyendo", async ({ page, context }) => {
    await context.route("**/assets/lector.worker-*.js", () => undefined);
    await page.goto("/");
    await iniciarCamara(page);
    await esperarPantalla(page, "leyendo");
    expect(await graves(page)).toStrictEqual([]);
  });

  test("OFF-18 error-lectura", async ({ page, context }) => {
    // El Worker lector no carga: error del motor, que se muestra en error-lectura.
    await context.route("**/assets/lector.worker-*.js", (r) => r.fulfill({ status: 404, body: "" }));
    await page.goto("/");
    await iniciarCamara(page);
    await esperarPantalla(page, "error-lectura", 60_000);
    await expect(page.locator("[data-pantalla]")).toHaveAttribute("data-error", "motor");
    expect(await graves(page)).toStrictEqual([]);
  });
});
