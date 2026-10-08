// CAM-01: manifiesto, shell sin conexión y caché limitada a recursos estáticos.
import { expect, test } from "@playwright/test";
import { contenedor, esperarPantalla, iniciarCamara, RUTA_PERMITIDA } from "./instrumentacion";

test.describe("PWA instalable", { timeout: 60_000 }, () => {
  test("CAM-01 Manifiesto @video:nitida-1080p", async ({ request }) => {
    const r = await request.get("/manifest.webmanifest");
    expect(r.status()).toBe(200);
    const m = JSON.parse(await r.text());
    expect(m).toMatchObject({ name: "Lector de cédula", short_name: "Cédula", lang: "es", start_url: "/", display: "standalone" });
    expect(m.icons).toContainEqual(expect.objectContaining({ sizes: "192x192", type: "image/png" }));
    expect(m.icons).toContainEqual(expect.objectContaining({ sizes: "512x512", type: "image/png" }));
    for (const i of m.icons) expect((await request.get(i.src)).status()).toBe(200);
  });

  test("CAM-01 Shell sin conexión @video:nitida-1080p", async ({ page, context }) => {
    await page.goto("/");
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 20_000 }).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("button", { name: "Iniciar cámara" })).toBeVisible();
    await expect(contenedor(page)).toHaveAttribute("data-pantalla", "inicio");
  });

  test("CAM-01 Análisis sin conexión @video:nitida-1080p", async ({ page, context }) => {
    await page.goto("/");
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 20_000 }).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await iniciarCamara(page);
    await esperarPantalla(page, "listo", 30_000);
  });

  test("CAM-01 Caché limitada a recursos estáticos @video:nitida-1080p", async ({ page, baseURL }) => {
    await page.goto("/");
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 20_000 }).toBe(true);
    await iniciarCamara(page);
    await esperarPantalla(page, "listo", 30_000);
    const claves = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) urls.push(r.url);
      return urls;
    });
    expect(claves.length).toBeGreaterThan(0);
    const origen = new URL(baseURL ?? "").origin;
    for (const u of claves) {
      const url = new URL(u);
      expect(url.origin).toBe(origen);
      expect(url.pathname).toMatch(RUTA_PERMITIDA);
    }
  });
});
