// FRA-17 Pantalla simulada en E2E (cambio deteccion-fraude, tarea 5.1b) con el vídeo amarilla-pantalla-1080p de e2e/videos/fraude.mjs (reverso a color de la
// amarilla sintética). Un vídeo por archivo: la cámara simulada se fija al lanzar Chromium. Señal activada con ?debug=1.
import { expect, test } from "@playwright/test";
import { ARGS_CAMARA, campo, fijarFecha, leer } from "./ayudas";

test.use({ launchOptions: { args: [...ARGS_CAMARA, "--use-file-for-fake-video-capture=e2e/videos/sinteticos/amarilla-pantalla-1080p.y4m"] } });

const seccion = (page: import("@playwright/test").Page) => page.locator("section.resultado");

test("FRA-17 Pantalla simulada en E2E", { timeout: 300_000 }, async ({ page }) => {
  await fijarFecha(page);
  await page.goto("/?debug=1");
  await leer(page);
  await expect(campo(page, "Número de documento")).toHaveText("9999123456");
  await expect(seccion(page)).toHaveAttribute("data-riesgo-nivel", "alto");
  await expect(seccion(page)).toHaveAttribute("data-riesgo-motivos", /(^| )pantalla( |$)/u);
  await expect(page.locator("[data-motivo=pantalla]")).toHaveText("Parece una foto de una pantalla");
});
