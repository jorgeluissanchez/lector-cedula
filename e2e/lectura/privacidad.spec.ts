// OFF-05 y OFF-11 (pwa-lectura-offline, tarea 6.5) con la amarilla. Mutante manual de la tarea: guardar el resultado
// en sessionStorage (debe fallar "Almacenamiento vacío").
import { expect, test } from "@playwright/test";
import { comprobarNadaPersiste, conVideo, esperarOfflineLista, esperarPantalla, esperarServiceWorker, leer } from "./ayudas";

test.use(conVideo("amarilla-1080p"));

test.describe("privacidad (amarilla)", () => {
  test.describe.configure({ timeout: 300_000 });

  test("OFF-05 Claves tras leer y OFF-11 Almacenamiento vacío", async ({ page }) => {
    await page.goto("/");
    await esperarServiceWorker(page);
    await esperarOfflineLista(page);
    await leer(page);
    await comprobarNadaPersiste(page);
  });

  test("OFF-11 Página oculta", async ({ page }) => {
    await page.addInitScript(() => {
      let estado: "hidden" | "visible" = "visible";
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => estado });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => estado === "hidden" });
      (window as unknown as { __visibilidad: (e: "hidden" | "visible") => void }).__visibilidad = (e) => {
        estado = e;
        document.dispatchEvent(new Event("visibilitychange"));
      };
    });
    await page.goto("/");
    await leer(page);
    await expect(page.getByText("********56")).toBeVisible();
    await page.evaluate(() => (window as unknown as { __visibilidad: (e: string) => void }).__visibilidad("hidden"));
    await page.evaluate(() => (window as unknown as { __visibilidad: (e: string) => void }).__visibilidad("visible"));
    await esperarPantalla(page, "inicio");
    await expect(page.getByText("********56")).toHaveCount(0);
    await expect(page.locator("dd[data-campo]")).toHaveCount(0);
  });
});
