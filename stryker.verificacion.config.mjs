// Mutación del cliente del protocolo en el front (sdk-integracion, tarea B.1, comando M): lector NDJSON incremental y
// verificación con el backend (packages/web/src/verificacion.ts). Uso: `npx stryker run stryker.verificacion.config.mjs`.
/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  vitest: { configFile: "vitest.stryker-verificacion.config.ts" },
  mutate: ["packages/web/src/verificacion.ts"],
  ignorePatterns: ["/.stryker-tmp*", "/reports", "/apps", "/server", "/e2e", "/models", "/evals", "/docs", "/test-results", "/examples/*/node_modules", "/examples/*/dist", "/examples/*/.next"],
  coverageAnalysis: "perTest",
  concurrency: 2,
  timeoutMS: 60000,
  thresholds: { high: 95, low: 85, break: 85 },
  reporters: ["clear-text", "json"],
  jsonReporter: { fileName: "reports/mutation/verificacion-sdk.json" },
  tempDirName: ".stryker-tmp-verificacion-sdk",
};
