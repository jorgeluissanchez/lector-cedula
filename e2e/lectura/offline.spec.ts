// OFF-12 Paridad con y sin conexión (pwa-lectura-offline, tarea 6.4). Mutante manual de la tarea: excluir
// `mrz-*.traineddata` de la precaché (debe fallar la digital sin conexión).
import { expect, test } from "@playwright/test";
import { conVideo, esperarOfflineLista, esperarServiceWorker, fijarFecha, leer } from "./ayudas";

test.use(conVideo("digital-1080p"));

test.describe("sin conexión", { timeout: 400_000 }, () => {
  test.describe.configure({ timeout: 400_000 });
  test("OFF-12 Primera carga online, recarga offline y lectura (digital)", async ({ page, context }) => {
    await fijarFecha(page);
    await page.goto("/");
    await esperarServiceWorker(page);
    await esperarOfflineLista(page);
    const online = await leer(page, 240_000);
    await context.setOffline(true);
    await page.reload();
    await esperarOfflineLista(page);
    const offline = await leer(page, 240_000);
    expect(offline).toBe(online);
  });

  test("OFF-12 Sin conexión desde el arranque del Worker", async ({ page, context }) => {
    const errores: string[] = [];
    await fijarFecha(page);
    await page.goto("/");
    await esperarServiceWorker(page);
    await esperarOfflineLista(page);
    const online = await leer(page, 240_000);
    await context.setOffline(true);
    await page.close();
    const nueva = await context.newPage();
    nueva.on("console", (m) => {
      if (m.type() === "error") errores.push(m.text());
    });
    await fijarFecha(nueva);
    await nueva.goto("/");
    expect(await leer(nueva, 240_000)).toBe(online);
    expect(errores.filter((e) => /net::|Failed to fetch|ERR_INTERNET/iu.test(e))).toStrictEqual([]);
  });
});
