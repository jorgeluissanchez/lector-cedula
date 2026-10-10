// Vitest acotado para la mutación del cliente del protocolo (stryker.verificacion.config.mjs).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    include: ["packages/web/test/backend/sdk-48-verificacion.test.ts", "packages/web/test/backend/sdk-45-58-controlador.test.ts"],
  },
});
