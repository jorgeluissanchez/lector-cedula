// Pruebas de mutación de packages/parsers y de evals/runners/metricas.mjs (cambios nuip-endurecer-entradas,
// design.md decisiones 7 y 14, y pruebas-nuip-y-evals-robustas, design.md decisión 14).
// Se ejecuta con `npm run test:mutacion`; no forma parte de `npm run check` por su duración.
/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  vitest: { configFile: "vitest.stryker.config.ts" },
  mutate: ["packages/parsers/src/**/*.ts", "!packages/parsers/src/index.ts", "evals/runners/metricas.mjs"],
  coverageAnalysis: "perTest",
  thresholds: { high: 95, low: 85, break: 85 },
  reporters: ["clear-text", "progress", "html"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  tempDirName: ".stryker-tmp",
};
