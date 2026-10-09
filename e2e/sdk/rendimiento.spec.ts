// SDK-09 Tiempos de lectura en caliente (E(rendimiento)) sobre examples/vanilla: 20 lecturas de la amarilla tras
// precargarMotor, CPU 4x, medida `lector-cedula:tiempo` (de `leyendo` a `resultado`, como la PWA). La descarga en frío
// del motor (~20 MB, Fast 4G) se mide aparte y se anota sin umbral bloqueante (design.md, tercera ronda, decisión 1). Solo en el proyecto sdk-pixel7 (Pixel 7 emulado).
import { expect, test } from "@playwright/test";
import { conVideo, fase, leer, precargar } from "./ayudas";

test.use(conVideo("amarilla-1080p"));

const p95 = (v: number[]): number => {
  const o = [...v].sort((a, b) => a - b);
  return o[Math.ceil(0.95 * o.length) - 1] ?? Number.POSITIVE_INFINITY;
};

test.describe("SDK-09 rendimiento", { timeout: 900_000 }, () => {
  test.describe.configure({ timeout: 900_000 });
  test("SDK-09 Amarilla en caliente: p95 <= 1500 ms en 20 lecturas", async ({ page, context }, info) => {
    test.skip(info.project.name !== "sdk-pixel7", "Pixel 7 emulado con CPU 4x");
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.goto("/");
    await precargar(page);
    for (let i = 0; i < 20; i++) {
      if (i === 0) expect(await leer(page)).toBe("resultado");
      else {
        await page.locator('[data-prueba="reintentar"]').click();
        await expect(fase(page)).toHaveText("resultado", { timeout: 120_000 });
      }
    }
    const tiempos = await page.evaluate(() => performance.getEntriesByName("lector-cedula:tiempo", "measure").map((m) => m.duration));
    expect(tiempos).toHaveLength(20);
    info.annotations.push({ type: "p95-ms", description: String(Math.round(p95(tiempos))) });
    expect(p95(tiempos)).toBeLessThanOrEqual(1500);
  });

  test("SDK-09 Descarga en frío informada (Fast 4G, sin umbral)", async ({ page, context }, info) => {
    test.skip(info.project.name !== "sdk-pixel7", "Pixel 7 emulado");
    const cdp = await context.newCDPSession(page);
    await page.goto("/");
    await page.evaluate(async () => {
      for (const n of await caches.keys()) await caches.delete(n);
    });
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    // Fast 4G de Lighthouse/DevTools: 9 Mbps de bajada, 1.5 Mbps de subida, 60 ms de latencia (con factor 0.85).
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 60 * 3.75, downloadThroughput: (9 * 1024 * 1024 * 0.9) / 8, uploadThroughput: (1.5 * 1024 * 1024 * 0.9) / 8 });
    const t0 = Date.now();
    await precargar(page);
    const ms = Date.now() - t0;
    info.annotations.push({ type: "descarga-fria-ms", description: String(ms) });
    expect(ms).toBeGreaterThan(0);
  });
});
