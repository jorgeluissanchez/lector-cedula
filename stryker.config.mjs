// Pruebas de mutación de packages/parsers, evals/runners/metricas.mjs y packages/capture/src/{calidad,flujo}
// (captura-calidad-pwa, design.md decisión 17; cambios nuip-endurecer-entradas,
// design.md decisiones 7 y 14, y pruebas-nuip-y-evals-robustas, design.md decisión 14).
// Se ejecuta con `npm run test:mutacion`; no forma parte de `npm run check` por su duración.
//
// Áreas (CI, .github/workflows/mutacion.yml): con STRYKER_AREA=<área> solo se mutan los archivos de esa área, con su
// propio umbral de break, informe y sandbox, para repartir la corrida en jobs paralelos de menos de 6 h. Sin
// STRYKER_AREA se muta la unión de todas las áreas con break 85, como antes.

/** Área -> archivos a mutar y umbral de break. La unión de todas es la lista completa de `npm run test:mutacion`. */
export const AREAS = {
  parsers: {
    mutate: ["packages/parsers/src/**/*.ts", "!packages/parsers/src/index.ts", "!packages/parsers/src/**/*.generated.ts", "tools/divipol/divipol-lib.mjs"],
    break: 85,
  },
  "fixtures-evals": {
    mutate: ["packages/fixtures/src/**/*.ts", "!packages/fixtures/src/index.ts", "evals/runners/metricas.mjs", "evals/runners/adaptadores/**/*.mjs", "evals/runners/mrz-imagen.mjs", "tools/modelos/descargar-mrz.mjs", "evals/runners/fraude/metricas-fraude.mjs"],
    break: 85,
  },
  "capture-pdf417": { mutate: ["packages/capture/src/pdf417/**/*.ts", "packages/capture/src/flujo/**/*.ts"], break: 85 },
  "capture-calidad": { mutate: ["packages/capture/src/calidad/**/*.ts", "apps/pwa/src/precache/**/*.ts"], break: 85 },
  "capture-mrz": { mutate: ["packages/capture/src/mrz/**/*.ts"], break: 85 },
  "capture-lectura": { mutate: ["packages/capture/src/lectura/**/*.ts"], break: 85 },
  "servidor-web": {
    mutate: ["packages/servidor/src/**/*.ts", "!packages/servidor/src/index.ts", "packages/web/src/{maquina,estado,controlador,cargador,integridad,envio,opciones,reintentos}.ts", "packages/nucleo-js/src/{nucleo,base64,url}.ts"],
    break: 85,
  },
  fraude: { mutate: ["packages/fraud/src/**/*.ts", "!packages/fraud/src/index.ts", "!packages/fraud/src/sintetico/**"], break: 85 },
};

const area = process.env.STRYKER_AREA;
if (area !== undefined && !(area in AREAS)) throw new Error(`STRYKER_AREA desconocida: ${area} (${Object.keys(AREAS).join(", ")})`);

/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  vitest: { configFile: "vitest.stryker.config.ts" },
  mutate: area ? AREAS[area].mutate : Object.values(AREAS).flatMap((a) => a.mutate),
  coverageAnalysis: "perTest",
  thresholds: { high: 95, low: 85, break: area ? AREAS[area].break : 85 },
  reporters: ["clear-text", "progress", "html"],
  htmlReporter: { fileName: area ? `reports/mutation/${area}/index.html` : "reports/mutation/index.html" },
  tempDirName: area ? `.stryker-tmp-area-${area}` : ".stryker-tmp",
};
