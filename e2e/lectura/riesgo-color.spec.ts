// FRA-17 Auténtico en E2E (cambio deteccion-fraude, tarea 5.1b) con el vídeo amarilla-color-1080p de e2e/videos/fraude.mjs (reverso a color de la
// amarilla sintética). Un vídeo por archivo: la cámara simulada se fija al lanzar Chromium. Señal activada con ?debug=1.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ARGS_CAMARA, campo, fijarFecha, leer } from "./ayudas";

test.use({ launchOptions: { args: [...ARGS_CAMARA, "--use-file-for-fake-video-capture=e2e/videos/sinteticos/amarilla-color-1080p.y4m"] } });

const seccion = (page: import("@playwright/test").Page) => page.locator("section.resultado");

test("FRA-17 Auténtico en E2E", { timeout: 300_000 }, async ({ page }) => {
  await fijarFecha(page);
  await page.goto("/?debug=1");
  await leer(page);
  await expect(campo(page, "Número de documento")).toHaveText("9999123456");
  await expect(seccion(page)).toHaveAttribute("data-riesgo-nivel", "bajo");
  await expect(seccion(page)).toHaveAttribute("data-riesgo-motivos", "");
  await expect(page.getByRole("heading", { name: "Riesgo bajo" })).toBeVisible();
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toStrictEqual([]);
});
