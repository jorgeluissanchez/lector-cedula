// Configuración de Vitest solo para Stryker (cambio pruebas-nuip-y-evals-robustas, design.md decisión 14).
// Extiende vitest.config.ts y excluye las pruebas de integración que lanzan procesos y tocan archivos:
// no están instrumentadas por Stryker y en su sandbox solo añaden tiempo. `npm test` las sigue ejecutando.
// Además (docs/decisiones/2026-10-10-mutacion-ci.md): el código instrumentado es de 10 a 50 veces más lento en los bucles
// por píxel, así que aquí, y solo aquí, los timeouts se multiplican por 10 y las pruebas de rendimiento (aserciones de
// reloj) se omiten por nombre, con la fachada tools/stryker/vitest-instrumentado.mjs como alias exacto de "vitest".
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

const FACTOR_TIMEOUT = 10;

export default mergeConfig(
  base,
  defineConfig({
    resolve: {
      alias: [{ find: /^vitest$/u, replacement: fileURLToPath(new URL("./tools/stryker/vitest-instrumentado.mjs", import.meta.url)) }],
    },
    test: {
      testTimeout: 5_000 * FACTOR_TIMEOUT,
      hookTimeout: 10_000 * FACTOR_TIMEOUT,
      exclude: [
        ...configDefaults.exclude,
        "tools/test/eval-campo.test.mjs",
        "tools/test/hooks.test.mjs",
        "tools/test/divipol-cli.test.mjs",
        "tools/test/divipol-cli-consulados-2018.test.mjs",
        "tools/test/leer-foto.test.mjs",
        "packages/capture/test/mrz/lector-real.test.ts",
        // OCR real con el modelo de Tesseract, como lector-real.
        "packages/capture/test/mrz/td3-real.test.ts",
        "packages/capture/test/lectura/off-08-diferencial.test.ts",
        "apps/pwa/test/off-01-02-16-manifiesto.test.ts",
        "packages/web/test/sdk-29-04-paquete.test.ts",
      ],
    },
  }),
);
