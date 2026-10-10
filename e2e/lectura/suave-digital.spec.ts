// OFF-25 "Vídeos suaves en E2E" (pwa-lectura-offline): una cédula bien encuadrada con la nitidez de la cámara de un
// celular real (varianza del Laplaciano entre 27 y 152) supera los umbrales recalibrados de CAL-08 y llega a listo y a
// resultado sin ninguna elevación del score (tarea 5.8).
import { expect, test } from "@playwright/test";
import { conVideo, esperarPantalla, historial, iniciarCamara, registrarHistorial } from "./ayudas";

test.use(conVideo("digital-suave-1080p"));

test.describe("digital suave", () => {
  test.describe.configure({ timeout: 180_000 });

  test("OFF-25 Vídeos suaves en E2E (digital-suave-1080p)", async ({ page }) => {
    await registrarHistorial(page);
    await page.goto("/");
    await iniciarCamara(page);
    await esperarPantalla(page, "resultado", 150_000);
    expect(await historial(page)).toContain("listo");
  });
});
