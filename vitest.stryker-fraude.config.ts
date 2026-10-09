// Vitest acotado para la mutación de packages/fraud (cambio deteccion-fraude): solo las pruebas del paquete y de
// las métricas del corredor, para que Stryker no ejecute la suite completa. Uso:
// `npx stryker run stryker.fraude.config.mjs`.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@lector-cedula/fixtures": fileURLToPath(new URL("./packages/fixtures/src/index.ts", import.meta.url)) } },
  test: {
    pool: "forks",
    // FRAUDE_PRUEBAS la fija stryker.fraude.config.mjs: "escenas" solo corre evaluar.test.ts.
    include:
      process.env.FRAUDE_PRUEBAS === "escenas"
        ? ["packages/fraud/test/evaluar.test.ts", "packages/fraud/test/evaluar-entrada.test.ts"]
        : ["packages/fraud/test/{politica,inconsistencia,puntajes}.test.ts", "evals/test/fraude-metricas.test.mjs"],
  },
});
