/// <reference types="@vitest/browser/providers/playwright" />
// Vitest browser mode (cambio captura-calidad-pwa, design.md, decisión 13): pruebas de Workers, canvas y cámara
// en Chromium real. Stryker no soporta este modo; el núcleo puro se prueba y muta en Node (vitest.config.ts).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";

// sdk-integracion (SDK-06, SDK-08, SDK-39): `@lector-cedula/web/assets` servidos tal cual (Vite transformaría los .js y
// su SHA-256 dejaría de coincidir con el manifiesto). Solo nombres planos de dist/assets.
const ASSETS_SDK = fileURLToPath(new URL("./packages/web/dist/assets/", import.meta.url));
const TIPOS_SDK: Record<string, string> = { js: "text/javascript", wasm: "application/wasm", json: "application/json" };
function assetsSdk(): Plugin {
  return {
    name: "assets-sdk-crudos",
    configureServer(servidor) {
      servidor.middlewares.use("/__assets_sdk__/", (req, res, siguiente) => {
        const nombre = (req.url ?? "").split("?")[0]?.replace(/^\//u, "") ?? "";
        if (!/^[A-Za-z0-9._-]+$/u.test(nombre)) return siguiente();
        readFile(join(ASSETS_SDK, nombre)).then(
          (datos) => {
            res.setHeader("content-type", TIPOS_SDK[nombre.split(".").pop() ?? ""] ?? "application/octet-stream");
            res.end(datos);
          },
          () => {
            res.statusCode = 404;
            res.end();
          },
        );
      });
    },
  };
}

export default defineConfig({
  plugins: [assetsSdk()],
  test: {
    include: ["packages/*/test-browser/**/*.browser.test.ts", "apps/*/test-browser/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      screenshotFailures: false,
      instances: [
        {
          browser: "chromium",
          // Cámara simulada con el patrón por defecto de Chromium (opción `launch` por instancia en 3.2.7).
          launch: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
        },
      ],
    },
    coverage: {
      provider: "v8",
      include: ["packages/capture/src/navegador/**", "packages/capture/src/lectura/worker-lector.ts"],
      thresholds: { lines: 90, branches: 85, functions: 90, statements: 90 },
      reportsDirectory: "coverage/browser",
    },
  },
});
