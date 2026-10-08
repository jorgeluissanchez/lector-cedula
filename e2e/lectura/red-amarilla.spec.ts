// OFF-04 "Lectura servida desde caché" con la amarilla (pwa-lectura-offline, tarea 6.5).
import { test } from "@playwright/test";
import { comprobarLecturaDesdeCache, conVideo } from "./ayudas";

test.use(conVideo("amarilla-1080p"));

test.describe("red (amarilla)", () => {
  test.describe.configure({ timeout: 300_000 });

  test("OFF-04 Lectura servida desde caché (amarilla)", async ({ page }) => {
    await comprobarLecturaDesdeCache(page);
  });
});
