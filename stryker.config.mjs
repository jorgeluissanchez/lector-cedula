// Pruebas de mutación de packages/parsers, evals/runners/metricas.mjs y packages/capture/src/{calidad,flujo}
// (captura-calidad-pwa, design.md decisión 17; cambios nuip-endurecer-entradas,
// design.md decisiones 7 y 14, y pruebas-nuip-y-evals-robustas, design.md decisión 14).
// Se ejecuta con `npm run test:mutacion`; no forma parte de `npm run check` por su duración.
/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  vitest: { configFile: "vitest.stryker.config.ts" },
  mutate: ["packages/parsers/src/**/*.ts", "!packages/parsers/src/index.ts", "!packages/parsers/src/**/*.generated.ts", "packages/fixtures/src/**/*.ts", "!packages/fixtures/src/index.ts", "evals/runners/metricas.mjs", "evals/runners/adaptadores/**/*.mjs", "tools/divipol/divipol-lib.mjs", "packages/capture/src/pdf417/**/*.ts", "packages/capture/src/calidad/**/*.ts", "packages/capture/src/flujo/**/*.ts", "packages/capture/src/mrz/**/*.ts", "packages/capture/src/lectura/**/*.ts", "apps/pwa/src/precache/**/*.ts", "evals/runners/mrz-imagen.mjs", "tools/modelos/descargar-mrz.mjs", "packages/servidor/src/**/*.ts", "!packages/servidor/src/index.ts", "packages/fraud/src/**/*.ts", "!packages/fraud/src/index.ts", "!packages/fraud/src/sintetico/**", "evals/runners/fraude/metricas-fraude.mjs", "packages/web/src/{maquina,estado,controlador,cargador,integridad,envio,opciones,reintentos}.ts", "packages/nucleo-js/src/{nucleo,base64,url}.ts"],
  coverageAnalysis: "perTest",
  thresholds: { high: 95, low: 85, break: 85 },
  reporters: ["clear-text", "progress", "html"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  tempDirName: ".stryker-tmp",
};
