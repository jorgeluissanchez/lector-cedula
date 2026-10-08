/// <reference types="@vitest/browser/providers/playwright" />
// Vitest browser mode (cambio captura-calidad-pwa, design.md, decisión 13): pruebas de Workers, canvas y cámara
// en Chromium real. Stryker no soporta este modo; el núcleo puro se prueba y muta en Node (vitest.config.ts).
import { defineConfig } from "vitest/config";

export default defineConfig({
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
