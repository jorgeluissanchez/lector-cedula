// OFF-25 "Vídeos que no deben disparar en E2E" (pwa-lectura-offline, tarea 5.8): con los umbrales recalibrados de
// CAL-08 un vídeo desenfocado (varianza del Laplaciano < 8) con la tarjeta en la guía nunca llega a listo; la presencia
// de la cédula no eleva el score. La otra mitad del escenario (sin-documento-1080p) está en sin-documento.spec.ts.
import { expect, test } from "@playwright/test";
import { conVideo, historial, iniciarCamara, registrarHistorial } from "./ayudas";

test.use(conVideo("desenfocada-1080p"));

test.describe("desenfocada", () => {
  test.describe.configure({ timeout: 120_000 });

  test("OFF-25 Vídeos que no deben disparar en E2E (desenfocada-1080p)", async ({ page }) => {
    await registrarHistorial(page);
    await page.goto("/");
    await iniciarCamara(page);
    const analisis = () => page.evaluate(() => performance.getEntriesByName("calidad:frame", "measure").length);
    await expect.poll(analisis, { timeout: 60_000 }).toBeGreaterThanOrEqual(30);
    expect(await historial(page)).not.toContain("listo");
    await expect(page.getByRole("status").and(page.locator(".estado"))).toHaveText("Desenfocado, mantén la cámara quieta");
  });
});
