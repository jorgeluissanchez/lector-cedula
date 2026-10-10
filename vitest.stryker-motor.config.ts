// Vitest acotado para la mutación del motor (stryker.motor.config.mjs).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    include: ["packages/motor/test/{pool,cabeceras,recursos,recursos-cero}.test.ts"],
  },
});
