// Mutación del manejador de servidor (motor-backend-embebido, tareas A.1 a A.3, comando MU de design.md).
// Uso: `npx stryker run stryker.servidor.config.mjs`.
/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  vitest: { configFile: "vitest.stryker-servidor.config.ts" },
  mutate: ["packages/servidor/src/lector/**/*.ts", "packages/protocolo/src/**/*.ts"],
  ignorePatterns: ["/.stryker-tmp*", "/reports", "/apps", "/server", "/e2e", "/models", "/evals", "/docs", "/test-results", "/examples/*/node_modules", "/examples/*/dist", "/examples/next/.next"],
  coverageAnalysis: "perTest",
  concurrency: 2,
  timeoutMS: 60000,
  thresholds: { high: 95, low: 85, break: 85 },
  reporters: ["clear-text", "json"],
  jsonReporter: { fileName: "reports/mutation/servidor-manejador.json" },
  tempDirName: ".stryker-tmp-servidor-manejador",
};
