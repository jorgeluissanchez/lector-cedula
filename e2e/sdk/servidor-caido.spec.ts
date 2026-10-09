// SDK-44 "Servidor 503 sin rastro" (revisor-privacidad): con servidor y sesión, el servidor responde 503 a todo; el
// resultado local se muestra, envio es servidor-no-disponible y no queda nada de la lectura en caché ni almacenamiento.
import { expect, test } from "@playwright/test";
import { conVideo, fijarFecha, leer } from "./ayudas";

test.use(conVideo("amarilla-1080p"));

const SRV = "https://api.lector-cedula.example";

test.describe("SDK-44 servidor caído", { timeout: 300_000 }, () => {
  test.describe.configure({ timeout: 300_000 });
  test("SDK-44 Servidor 503 sin rastro", async ({ page }) => {
    const alServidor: string[] = [];
    await page.route(`${SRV}/**`, async (r) => {
      alServidor.push(`${r.request().method()} ${new URL(r.request().url()).pathname}`);
      await r.fulfill({ status: 503, contentType: "application/problem+json", body: JSON.stringify({ type: "about:blank", status: 503 }) });
    });
    await fijarFecha(page);
    await page.goto(`/?servidor=${encodeURIComponent(SRV)}&sesion=tok_sintetico_1`);
    expect(await leer(page)).toBe("resultado");
    await expect(page.locator('[data-prueba="nuip"]')).toHaveText("9999123456");
    await expect(page.locator('[data-prueba="envio"]')).toHaveText("fallido:servidor-no-disponible", { timeout: 30_000 });
    expect(alServidor).toStrictEqual(["POST /v/tok_sintetico_1/inicio"]);
    const rastro = await page.evaluate(async () => {
      const otras: string[] = [];
      let conDatos = false;
      for (const n of await caches.keys()) {
        if (!n.startsWith("lector-cedula-sdk-") && !n.startsWith("ejemplo-vanilla-")) otras.push(n);
        const c = await caches.open(n);
        for (const p of await c.keys()) {
          if (p.url.includes("api.lector-cedula.example")) conDatos = true;
          const r = await c.match(p);
          if (r !== undefined && (r.headers.get("content-type") ?? "").startsWith("image/")) conDatos = true;
          if (r !== undefined && /9999123456|FICTICIA/u.test(await r.clone().text())) conDatos = true;
        }
      }
      return { otras, conDatos, local: localStorage.length, sesion: sessionStorage.length, idb: await indexedDB.databases() };
    });
    expect(rastro).toStrictEqual({ otras: [], conDatos: false, local: 0, sesion: 0, idb: [] });
  });
});
