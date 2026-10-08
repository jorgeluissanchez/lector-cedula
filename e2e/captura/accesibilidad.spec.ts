// CAM-09: axe en las cinco pantallas, región de estado única, botones >= 44 px, guía decorativa, idioma y título.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { esperarPantalla, iniciarCamara, instrumentar } from "./instrumentacion";

const ETIQUETAS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function graves(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(ETIQUETAS).analyze();
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id);
}

async function botonesPequenos(page: Page): Promise<string[]> {
  const pequenos: string[] = [];
  for (const b of await page.getByRole("button").all()) {
    const c = await b.boundingBox();
    if (c !== null && (c.width < 44 || c.height < 44)) pequenos.push(`${await b.textContent()} ${c.width}x${c.height}`);
  }
  return pequenos;
}

async function revisar(page: Page): Promise<void> {
  expect(await graves(page)).toStrictEqual([]);
  expect(await botonesPequenos(page)).toStrictEqual([]);
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page).toHaveTitle("Lector de cédula");
}

test.describe("accesibilidad", { timeout: 60_000 }, () => {
  test.describe.configure({ timeout: 60_000 });
  test("CAM-09 inicio, activo, pausado y listo @video:nitida-1080p", async ({ page }) => {
    await instrumentar(page);
    await page.goto("/");
    await revisar(page);
    await iniciarCamara(page);
    await esperarPantalla(page, "listo", 30_000);
    await revisar(page);
  });

  test("CAM-09 activo y pausado; región de estado única y guía decorativa @video:desenfocada-1080p", async ({ page }) => {
    await instrumentar(page);
    await page.goto("/");
    await iniciarCamara(page);
    await esperarPantalla(page, "activo");
    const estado = page.locator('[role="status"]');
    await expect(estado).toHaveCount(1);
    await expect(estado).toHaveAttribute("aria-live", "polite");
    await expect(estado).toHaveText("Desenfocado, mantén la cámara quieta");
    await expect(page.locator(".guia")).toHaveAttribute("aria-hidden", "true");
    await revisar(page);
    await page.evaluate(() => window.__visibilidad("hidden"));
    await esperarPantalla(page, "pausado");
    await revisar(page);
  });

  test("CAM-09 error permiso-denegado @video:nitida-1080p", async ({ page }) => {
    await instrumentar(page, { rechazarPrimera: true });
    await page.goto("/");
    await iniciarCamara(page);
    await esperarPantalla(page, "error");
    await revisar(page);
  });
});
