// OFF-12 Paridad con y sin conexión con la amarilla (pwa-lectura-offline, tarea 6.4); un vídeo por archivo.
import { expect, test } from "@playwright/test";
import { conVideo, esperarOfflineLista, esperarServiceWorker, fijarFecha, leer } from "./ayudas";

test.use(conVideo("amarilla-1080p"));

test.describe("sin conexión (amarilla)", { timeout: 300_000 }, () => {
  test.describe.configure({ timeout: 300_000 });
  test("OFF-12 Primera carga online, recarga offline y lectura (amarilla)", async ({ page, context }) => {
    await fijarFecha(page);
    await page.goto("/");
    await esperarServiceWorker(page);
    await esperarOfflineLista(page);
    const online = await leer(page);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("[data-offline]")).toHaveAttribute("data-offline", "lista", { timeout: 60_000 });
    expect(await leer(page)).toBe(online);
  });
});
