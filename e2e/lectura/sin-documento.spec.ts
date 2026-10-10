// OFF-22 "Vídeo sin cédula en E2E" y OFF-25 "Vídeos que no deben disparar en E2E" (sin-documento-1080p; pwa-lectura-offline):
// una cara dibujada y una pared nítidas nunca llevan a listo, aunque superen los umbrales recalibrados de CAL-08.
import { expect, test } from "@playwright/test";
import { conVideo, historial, iniciarCamara, registrarHistorial } from "./ayudas";

test.use(conVideo("sin-documento-1080p"));

test.describe("sin documento", () => {
  test.describe.configure({ timeout: 120_000 });

  test("OFF-22 Vídeo sin cédula en E2E", async ({ page }) => {
    await registrarHistorial(page);
    await page.goto("/");
    await iniciarCamara(page);
    const analisis = () => page.evaluate(() => performance.getEntriesByName("calidad:frame", "measure").length);
    await expect.poll(analisis, { timeout: 60_000 }).toBeGreaterThanOrEqual(30);
    expect(await historial(page)).not.toContain("listo");
    await expect(page.getByRole("status").and(page.locator(".estado"))).toHaveText("Acerca la cédula");
  });
});
