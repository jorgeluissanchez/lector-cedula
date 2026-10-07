// TEMPORAL (se borra al terminar la mutación de leer-mrz-desde-imagen).
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@lector-cedula/fixtures": fileURLToPath(new URL("./packages/fixtures/src/index.ts", import.meta.url)) } },
  test: {
    include: ["packages/capture/test/mrz/**/*.test.ts", "tools/test/modelos-mrz.test.mjs", "evals/test/mrz-imagen.test.mjs"],
    exclude: ["**/node_modules/**", "packages/capture/test/mrz/lector-real.test.ts"],
  },
});
