// OFF-04 Sin red durante la lectura y sin terceros (pwa-lectura-offline, tarea 6.5), con la digital.
import { expect, test } from "@playwright/test";
import { comprobarLecturaDesdeCache, conVideo, leer } from "./ayudas";

test.use(conVideo("digital-1080p"));

test.describe("red", () => {
  test.describe.configure({ timeout: 300_000 });

  test("OFF-04 Sin terceros", async ({ page, context, baseURL }) => {
    const urls: string[] = [];
    context.on("request", (r) => urls.push(r.url()));
    await page.goto("/");
    await leer(page, 240_000);
    const origen = new URL(baseURL ?? "").origin;
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((u) => new URL(u).origin !== origen)).toStrictEqual([]);
    expect(urls.filter((u) => /jsdelivr|unpkg|cdn|tessdata/iu.test(u))).toStrictEqual([]);
  });

  test("OFF-04 Lectura servida desde caché (digital)", async ({ page }) => {
    await comprobarLecturaDesdeCache(page);
  });
});
