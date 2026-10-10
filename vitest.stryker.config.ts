// Configuración de Vitest solo para Stryker (cambio pruebas-nuip-y-evals-robustas, design.md decisión 14).
// Extiende vitest.config.ts y excluye las pruebas de integración que lanzan procesos y tocan archivos:
// no están instrumentadas por Stryker y en su sandbox solo añaden tiempo. `npm test` las sigue ejecutando.
import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

export default mergeConfig(
  base,
  defineConfig({
    test: {
      exclude: [
        ...configDefaults.exclude,
        "tools/test/eval-campo.test.mjs",
        "tools/test/hooks.test.mjs",
        "tools/test/divipol-cli.test.mjs",
        "tools/test/divipol-cli-consulados-2018.test.mjs",
        "tools/test/leer-foto.test.mjs",
        "packages/capture/test/mrz/lector-real.test.ts",
        "packages/capture/test/lectura/off-08-diferencial.test.ts",
        "apps/pwa/test/off-01-02-16-manifiesto.test.ts",
        "packages/web/test/sdk-29-04-paquete.test.ts",
        // docs/decisiones/2026-10-10-mutacion-ci.md: lanzan Chromium o un Worker y, con el código instrumentado, superan su
        // timeout o su presupuesto de reloj en el runner de CI (LMI-02 > 60 s, OD-20 > 250 ms). OCR real: igual que lector-real.
        "packages/capture/test/mrz/lector.test.ts",
        "packages/capture/test/mrz/td3-real.test.ts",
        "packages/capture/test/lectura/od-20-presencia-td3.test.ts",
      ],
    },
  }),
);
