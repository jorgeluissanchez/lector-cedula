// SDK-06 caché offline y recarga con el service worker del paquete; SDK-39 recurso alterado (E(offline)).
import { expect, test } from "@playwright/test";
import { conVideo, fase, fijarFecha, leer } from "./ayudas";

test.use(conVideo("amarilla-1080p"));

const cacheSdk = (page: import("@playwright/test").Page) =>
  page.evaluate(async () => {
    const nombres = await caches.keys();
    const sdk = nombres.filter((n) => n.startsWith("lector-cedula-sdk-"));
    const urls: string[] = [];
    for (const n of sdk) for (const p of await (await caches.open(n)).keys()) urls.push(p.url);
    return { sdk, urls };
  });

test.describe("SDK-06 y SDK-39", { timeout: 300_000 }, () => {
  test.describe.configure({ timeout: 300_000 });
  test("SDK-06 Segunda lectura sin red y contenido de la caché", async ({ page, context, baseURL }) => {
    await fijarFecha(page);
    await page.goto("/");
    expect(await leer(page)).toBe("resultado");
    await context.setOffline(true);
    await page.locator('[data-prueba="reintentar"]').click();
    await expect(fase(page)).toHaveText("resultado", { timeout: 120_000 });
    await expect(page.locator('[data-prueba="nuip"]')).toHaveText("9999123456");
    const { sdk, urls } = await cacheSdk(page);
    expect(sdk).toStrictEqual(["lector-cedula-sdk-0.1.0"]);
    for (const u of urls) expect(u.startsWith(`${baseURL}/lector-cedula/`)).toBe(true);
  });

  test("SDK-06 Recarga sin red con el service worker del paquete (precacheLector)", async ({ page, context }) => {
    await fijarFecha(page);
    await page.goto("/");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect.poll(async () => (await cacheSdk(page)).urls.length, { timeout: 120_000 }).toBeGreaterThan(5);
    await context.setOffline(true);
    await page.reload();
    await expect(fase(page)).toHaveText("inicio");
    expect(await leer(page)).toBe("resultado");
    await expect(page.locator('[data-prueba="nuip"]')).toHaveText("9999123456");
  });

  test("SDK-39 Recurso alterado: error motor-no-disponible y la caché no contiene esa URL", async ({ page, context }) => {
    await context.route("**/lector-cedula/zxing_reader.wasm", async (route) => {
      const r = await route.fetch();
      const cuerpo = Buffer.from(await r.body());
      cuerpo[100] = (cuerpo[100] ?? 0) ^ 0xff;
      await route.fulfill({ response: r, body: cuerpo });
    });
    await page.goto("/");
    expect(await leer(page)).toBe("error");
    await expect(page.locator('[data-prueba="error"]')).toHaveText("motor-no-disponible");
    const { urls } = await cacheSdk(page);
    expect(urls.some((u) => u.endsWith("/zxing_reader.wasm"))).toBe(false);
  });
});
