// despliegue-produccion, DP-07: la PWA servida con exactamente las cabeceras de vercel.json
// (tools/despliegue/servir-vercel.mjs en el puerto 4180) carga, registra el service worker y lee cédulas sintéticas
// sin violaciones de CSP. Vídeos sintéticos de `npm run e2e:videos`.
import { expect, test } from "@playwright/test";
import { contenedor, esperarServiceWorker } from "../lectura/ayudas";
import { CSP, vigilarCsp } from "./csp";

test.describe("DP-07 La app funciona con las cabeceras de producción", { timeout: 60_000 }, () => {
  test("DP-07 Carga y service worker", async ({ page }) => {
    const violaciones = await vigilarCsp(page);
    const respuesta = await page.goto("/");
    expect(respuesta?.headers()["content-security-policy"]).toBe(CSP);
    expect(respuesta?.headers()["cache-control"]).toBe("no-cache");
    await expect(contenedor(page)).toBeVisible();
    await esperarServiceWorker(page);
    const sw = await page.request.get("/sw.js");
    expect(sw.headers()["cache-control"]).toBe("no-cache");
    expect(await violaciones()).toStrictEqual([]);
  });
});
