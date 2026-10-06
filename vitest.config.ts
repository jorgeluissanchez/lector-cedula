import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Cambio generador-fixtures-sinteticos (design.md, decisión 10): las pruebas importan el generador desde su fuente.
    alias: { "@lector-cedula/fixtures": fileURLToPath(new URL("./packages/fixtures/src/index.ts", import.meta.url)) },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts", "tools/test/**/*.test.mjs"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**"],
      thresholds: { lines: 90, branches: 85, functions: 90, statements: 90 },
    },
  },
});
