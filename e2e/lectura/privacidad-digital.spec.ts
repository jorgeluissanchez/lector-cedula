// OFF-05 y OFF-11 (pwa-lectura-offline, tarea 6.5) con la digital; un vídeo por archivo.
import { test } from "@playwright/test";
import { comprobarNadaPersiste, conVideo, esperarOfflineLista, esperarServiceWorker, leer } from "./ayudas";

test.use(conVideo("digital-1080p"));

test.describe("privacidad (digital)", () => {
  test.describe.configure({ timeout: 300_000 });

  test("OFF-05 Claves tras leer y OFF-11 Almacenamiento vacío (digital)", async ({ page }) => {
    await page.goto("/");
    await esperarServiceWorker(page);
    await esperarOfflineLista(page);
    await leer(page, 240_000);
    await comprobarNadaPersiste(page);
  });
});
