// OFF-01, OFF-02, OFF-03 y OFF-16 (pwa-lectura-offline, tarea 6.2): precaché verificada, indicador y cuota.
// Mutante manual de la tarea: quitar la comparación de digest (debe fallar "Recurso alterado").
import { expect, test, type Page } from "@playwright/test";
import { clavesCache, conVideo, esperarPantalla, esperarServiceWorker, iniciarCamara, manifiesto } from "./ayudas";

test.use(conVideo("amarilla-1080p"));

const indicador = (page: Page) => page.locator("[data-offline]");

async function sinCachesLector(page: Page): Promise<string[]> {
  return (await clavesCache(page)).nombres.filter((n) => n.startsWith("lector-"));
}

/**
 * Espera a que el intento de instalación en curso termine: primero a que exista un worker instalando (la página lo
 * registra tras comprobar la cuota) y después a que deje de haberlo (instalado o descartado; un registro sin worker
 * activo desaparece al fallar).
 */
async function esperarFinInstalacion(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolver) => {
        const revisar = async () => {
          const r = await navigator.serviceWorker.getRegistration();
          const w = r?.installing;
          if (w === null || w === undefined) return void setTimeout(revisar, 50);
          w.addEventListener("statechange", () => {
            if (w.state === "installed" || w.state === "redundant" || w.state === "activated") resolver();
          });
          if (w.state === "redundant") resolver();
        };
        void revisar();
      }),
  );
}

test.describe("precaché", { timeout: 300_000 }, () => {
  test.describe.configure({ timeout: 300_000 });

  test("OFF-01 Todo en caché antes de la primera lectura y OFF-03 Primera visita completa", async ({ page }) => {
    const m = manifiesto();
    await page.goto("/");
    await esperarServiceWorker(page);
    await expect.poll(() => indicador(page).getAttribute("data-offline"), { timeout: 120_000 }).toBe("lista");
    await expect(indicador(page)).toHaveText("Lista para usar sin conexión");
    await expect(indicador(page)).toHaveAttribute("role", "status");
    const estados = await page.evaluate(
      async ({ version, rutas }) => {
        const c = await caches.open(`lector-${version}`);
        return Promise.all(rutas.map(async (r) => (await c.match(r))?.status ?? 0));
      },
      { version: m.version, rutas: m.entradas.map((e) => e.ruta) },
    );
    expect(estados.every((s) => s === 200)).toBe(true);
    expect(estados).toHaveLength(m.entradas.length);
  });

  test("OFF-01 Activación bloqueada si falta un recurso", async ({ page, context }) => {
    await context.route("**/assets/mrz-*.traineddata*", (r) => r.fulfill({ status: 404, body: "" }));
    await page.goto("/");
    await esperarFinInstalacion(page);
    for (let i = 0; i < 2; i++) {
      await page.reload();
      // Cada recarga reintenta el registro: se espera a que ese intento también falle.
      await esperarFinInstalacion(page);
    }
    expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
    expect(await sinCachesLector(page)).toStrictEqual([]);
    await expect(indicador(page)).toHaveAttribute("data-offline", "pendiente");
    await expect(indicador(page)).toHaveText("Sin conexión no disponible todavía");
  });

  test("OFF-02 Recurso alterado", async ({ page, context }) => {
    const consola: string[] = [];
    context.on("console", (m) => consola.push(m.text()));
    await context.route("**/assets/zxing_reader-*.wasm", async (r) => {
      const original = await r.fetch();
      const cuerpo = Buffer.from(await original.body());
      cuerpo[0] = (cuerpo[0] ?? 0) ^ 0xff;
      await r.fulfill({ response: original, body: cuerpo });
    });
    await page.goto("/");
    await esperarFinInstalacion(page);
    await page.reload();
    await esperarFinInstalacion(page);
    expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
    expect(await sinCachesLector(page)).toStrictEqual([]);
    // La consola del service worker solo llega cuando Playwright ya está enganchado a él: se reintenta la instalación
    // (cada recarga la repite) hasta ver el registro.
    await expect
      .poll(
        async () => {
          if (consola.some((t) => t.includes("integridad-fallida"))) return true;
          await page.reload();
          await esperarFinInstalacion(page);
          return consola.some((t) => t.includes("integridad-fallida"));
        },
        { timeout: 90_000 },
      )
      .toBe(true);
    expect(await sinCachesLector(page)).toStrictEqual([]);
    const linea = consola.find((t) => t.includes("integridad-fallida"));
    expect(linea).toMatch(/integridad-fallida \/assets\/zxing_reader-[^/\s]+\.wasm/u);
    expect(linea?.length ?? 0).toBeLessThan(200);
  });

  test("OFF-03 Navegador sin service worker", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "serviceWorker", { get: () => undefined, configurable: true });
      delete (Navigator.prototype as unknown as { serviceWorker?: unknown }).serviceWorker;
    });
    await page.goto("/");
    await expect(indicador(page)).toHaveAttribute("data-offline", "pendiente");
    await iniciarCamara(page);
    await esperarPantalla(page, "resultado", 120_000);
  });

  test("OFF-16 Cuota insuficiente", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(StorageManager.prototype, "estimate", { value: async () => ({ quota: 1_000_000, usage: 0 }), configurable: true });
    });
    await page.goto("/");
    await expect(indicador(page)).toHaveAttribute("data-offline", "pendiente");
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r === undefined))).toBe(true);
    expect(await sinCachesLector(page)).toStrictEqual([]);
  });
});
