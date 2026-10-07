// Configuración de Vitest solo para Stryker (cambio pruebas-nuip-y-evals-robustas, design.md decisión 14).
// Extiende vitest.config.ts y excluye las pruebas de integración que lanzan procesos y tocan archivos:
// no están instrumentadas por Stryker y en su sandbox solo añaden tiempo. `npm test` las sigue ejecutando.
import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

export default mergeConfig(
  base,
  defineConfig({
    test: {
      exclude: [...configDefaults.exclude, "tools/test/eval-campo.test.mjs", "tools/test/hooks.test.mjs", "tools/test/divipol-cli.test.mjs", "tools/test/leer-foto.test.mjs", "packages/capture/test/mrz/lector-real.test.ts"],
    },
  }),
);
