// Mutación acotada del cambio deteccion-fraude (tareas 1.4, 2.2, 3.1, 4.4), en dos tandas porque las pruebas con
// escenas sintéticas son lentas: `FRAUDE_TANDA=ligera` (por defecto: config, puntajes, inconsistencia y métricas,
// sin las pruebas de escenas) y `FRAUDE_TANDA=evaluar` (evaluar.ts y worker.ts con las de escenas).
// Uso: `npx stryker run stryker.fraude.config.mjs`. `npm run test:mutacion` sigue mutando todo packages/fraud/src.
const evaluar = process.env.FRAUDE_TANDA === "evaluar";
process.env.FRAUDE_PRUEBAS = evaluar ? "escenas" : "ligeras";

/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  vitest: { configFile: "vitest.stryker-fraude.config.ts" },
  mutate: evaluar
    ? ["packages/fraud/src/evaluar.ts", "packages/fraud/src/worker.ts"]
    : [
        "packages/fraud/src/config.ts",
        "packages/fraud/src/detectores/inconsistencia.ts",
        "packages/fraud/src/detectores/puntajes.ts",
        "evals/runners/fraude/metricas-fraude.mjs",
      ],
  // Otros frentes crean y borran sus sandboxes en paralelo: no se copian a la sandbox propia.
  ignorePatterns: ["/.stryker-tmp*", "/reports", "/apps", "/server", "/e2e", "/models", "/evals/sinteticos", "/evals/real", "/docs", "/test-results"],
  coverageAnalysis: "perTest",
  concurrency: 2,
  timeoutMS: 60000,
  thresholds: { high: 95, low: 85, break: 85 },
  reporters: ["clear-text", "dots", "json"],
  jsonReporter: { fileName: `reports/mutation/fraude-${evaluar ? "evaluar" : "ligera"}.json` },
  tempDirName: `.stryker-tmp-fraude-${evaluar ? "evaluar" : "ligera"}`,
};
