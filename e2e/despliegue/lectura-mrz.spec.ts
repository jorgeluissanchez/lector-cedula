// despliegue-produccion, DP-07: la PWA servida con exactamente las cabeceras de vercel.json
// (tools/despliegue/servir-vercel.mjs en el puerto 4180) carga, registra el service worker y lee cédulas sintéticas
// sin violaciones de CSP. Vídeos sintéticos de `npm run e2e:videos`.
import { expect, test } from "@playwright/test";
import { conVideo, contenedor, fijarFecha, leer } from "../lectura/ayudas";
import { vigilarCsp } from "./csp";

test.use(conVideo("digital-1080p"));

test.describe("DP-07 Lectura bajo CSP: digital-1080p", { timeout: 300_000 }, () => {
  test.describe.configure({ timeout: 300_000 });
  test("DP-07 Lectura bajo CSP (mrz)", async ({ page }) => {
    const violaciones = await vigilarCsp(page);
    await fijarFecha(page);
    await page.goto("/");
    await leer(page, 240_000);
    await expect(contenedor(page)).toHaveAttribute("data-tipo", "mrz");
    expect(await violaciones()).toStrictEqual([]);
  });
});
