// OFF-17 Actualización sin romper el modo sin conexión (pwa-lectura-offline, tarea 6.2). La "versión B" es el mismo
// sw.js con otra versión, escrito en una copia de la compilación servida aparte (servidor-copia.ts), y su
// `mrz-*.traineddata` responde 404 (ruta de Playwright, que sí ve las peticiones del service worker).
import { expect, test } from "@playwright/test";
import { servirCopia } from "./servidor-copia";
import { clavesCache, conVideo, esperarOfflineLista, esperarServiceWorker, fijarFecha, leer, manifiesto } from "./ayudas";

test.use(conVideo("digital-1080p"));

test.describe("actualización", { timeout: 400_000 }, () => {
  test.describe.configure({ timeout: 400_000 });

  test("OFF-17 Actualización fallida", async ({ page, context }) => {
    const { version: a } = manifiesto();
    const b = "b".repeat(a.length);
    const copia = await servirCopia();
    try {
    await fijarFecha(page);
    await page.goto(copia.url);
    await esperarServiceWorker(page);
    await esperarOfflineLista(page);

    // Despliegue de B: sw.js con la versión B y el modelo MRZ con 404 en la red.
    copia.reescribir("sw.js", (t) => t.replaceAll(a, b));
    let intentosB = 0;
    await context.route("**/assets/mrz-*.traineddata*", (r) => {
      intentosB++;
      return r.fulfill({ status: 404, body: "" });
    });
    await page.reload();
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update().catch(() => undefined));
    await expect
      .poll(() => page.evaluate(async () => {
        const r = await navigator.serviceWorker.getRegistration();
        return r !== undefined && r.installing === null && r.waiting === null;
      }), { timeout: 120_000 })
      .toBe(true);

    // B sí intentó instalarse (pidió su modelo) y falló.
    expect(intentosB).toBeGreaterThan(0);
    const nombres = (await clavesCache(page)).nombres;
    expect(nombres).toContain(`lector-${a}`);
    expect(nombres.filter((n) => n.startsWith(`lector-${b}`))).toStrictEqual([]);

    await context.setOffline(true);
    await page.reload();
    expect(await leer(page, 240_000)).not.toBe("");
    } finally {
      await copia.cerrar();
    }
  });
});
