// Mutación de los adaptadores del SDK (sdk-integracion, tareas 3b.1 y 3b.3; Angular también por completitud) y de los
// ajustes del núcleo (maquina.ts, envio.ts, copias.ts). Uso: `npx stryker run stryker.adaptadores.config.mjs`.
/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  vitest: { configFile: "vitest.stryker-adaptadores.config.ts" },
  mutate: ["packages/react/src/index.ts", "packages/vue/src/index.ts", "packages/angular/src/index.ts", "packages/web/src/maquina.ts", "packages/web/src/envio.ts", "packages/web/src/copias.ts", "packages/web/src/secuencia.ts"],
  ignorePatterns: ["/.stryker-tmp*", "/reports", "/apps", "/server", "/e2e", "/models", "/evals", "/docs", "/test-results", "/examples/*/node_modules", "/examples/*/dist", "/examples/next/.next"],
  coverageAnalysis: "perTest",
  concurrency: 2,
  timeoutMS: 60000,
  thresholds: { high: 95, low: 85, break: 85 },
  reporters: ["clear-text", "json"],
  jsonReporter: { fileName: "reports/mutation/adaptadores-sdk.json" },
  tempDirName: ".stryker-tmp-adaptadores-sdk",
};
