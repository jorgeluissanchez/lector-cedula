// Vitest acotado para la mutación de los adaptadores del SDK y los ajustes del núcleo (stryker.adaptadores.config.mjs).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    include: ["packages/{react,vue,angular}/test/sdk-3[123]-*.test.ts", "packages/web/test/sdk-{27,38,44}-*.test.ts", "packages/web/test/off-27c-*.test.ts"],
  },
});
