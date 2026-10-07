import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Cambio generador-fixtures-sinteticos (design.md, decisión 10): las pruebas importan el generador desde su fuente.
    alias: { "@lector-cedula/fixtures": fileURLToPath(new URL("./packages/fixtures/src/index.ts", import.meta.url)) },
  },
  test: {
    // Contrato de tipos (captura-calidad-pwa, design.md, decisión 13): `npx vitest run --typecheck.only packages/capture`.
    // El tsconfig raíz no incluye archivos (`files: []`), así que se usa uno que sí incluye los *.test-d.ts.
    typecheck: { tsconfig: "packages/capture/tsconfig.typecheck.json", include: ["packages/*/test/**/*.test-d.ts"] },
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts", "tools/test/**/*.test.mjs", "evals/test/**/*.test.mjs"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**"],
      // Código solo-navegador (captura-calidad-pwa, decisión 13): lo cubre vitest.browser.config.ts.
      exclude: ["packages/capture/src/navegador/**"],
      thresholds: { lines: 90, branches: 85, functions: 90, statements: 90 },
    },
  },
});
