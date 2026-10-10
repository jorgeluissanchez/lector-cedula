// Vitest acotado para la mutación del manejador de servidor (stryker.servidor.config.mjs). Sin la prueba de proceso
// hijo (usa dist, que Stryker no muta).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    include: ["packages/servidor/test/lector/*.test.ts", "packages/protocolo/test/*.test.ts"],
    exclude: ["packages/servidor/test/lector/sin-red-ni-disco.test.ts"],
  },
});
