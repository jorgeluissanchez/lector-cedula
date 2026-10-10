// Mutación del motor (motor-backend-embebido, tareas 0.4 a 0.6, comando MU de design.md): pool, cabeceras y recursos con
// pruebas rápidas (worker falso, cabeceras sintéticas, modelo en temporales). leer.ts y motor.ts los cubren las pruebas
// con OCR real (motor.test.ts, privacidad.test.ts y el contrato), demasiado lentas para mutar en esta máquina.
// Uso: `npx stryker run stryker.motor.config.mjs`.
/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  vitest: { configFile: "vitest.stryker-motor.config.ts" },
  mutate: ["packages/motor/src/pool.ts", "packages/motor/src/cabeceras.ts", "packages/motor/src/recursos.ts", "packages/motor/src/webhook.ts"],
  ignorePatterns: ["/.stryker-tmp*", "/reports", "/apps", "/server", "/e2e", "/evals", "/docs", "/test-results", "/examples/*/node_modules", "/examples/*/dist", "/examples/next/.next", "/examples/*/.next"],
  coverageAnalysis: "perTest",
  concurrency: 2,
  timeoutMS: 60000,
  thresholds: { high: 95, low: 85, break: 85 },
  reporters: ["clear-text", "json"],
  jsonReporter: { fileName: "reports/mutation/motor.json" },
  tempDirName: ".stryker-tmp-motor",
};
