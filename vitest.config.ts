import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Cambio generador-fixtures-sinteticos (design.md, decisión 10): las pruebas importan el generador desde su fuente.
    alias: { "@lector-cedula/fixtures": fileURLToPath(new URL("./packages/fixtures/src/index.ts", import.meta.url)) },
  },
  test: {
    // Backlog F1 (docs/decisiones/backlog-harness-pruebas.md): "Timeout calling onTaskUpdate" es el RPC worker->principal de
    // Vitest (birpc, 60 s) que expira cuando el proceso principal no recibe CPU: por defecto Vitest abre núcleos-1 workers y
    // varias suites lanzan a su vez procesos pesados (CLI con Tesseract, tsc, Chromium), y a la vez pueden correr Playwright
    // u otros agentes. Con la mitad de los núcleos el principal conserva margen; forks aísla los procesos hijo por worker y
    // teardownTimeout da tiempo a cerrar esos hijos sin que Vitest aborte el cierre.
    pool: "forks",
    maxWorkers: "50%",
    minWorkers: 1,
    teardownTimeout: 30_000,
    // Contrato de tipos (captura-calidad-pwa, design.md, decisión 13): `npx vitest run --typecheck.only packages/capture`.
    // El tsconfig raíz no incluye archivos (`files: []`), así que se usa uno que sí incluye los *.test-d.ts.
    typecheck: { tsconfig: "packages/capture/tsconfig.typecheck.json", include: ["packages/*/test/**/*.test-d.ts"] },
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts", "examples/backend-*/test/**/*.test.ts", "tools/test/**/*.test.mjs", "evals/test/**/*.test.mjs"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**"],
      // Código solo-navegador (captura-calidad-pwa, decisión 13): lo cubre vitest.browser.config.ts.
      exclude: ["packages/capture/src/navegador/**", "packages/capture/src/lectura/worker-lector.ts"],
      thresholds: { lines: 90, branches: 85, functions: 90, statements: 90 },
    },
  },
});
