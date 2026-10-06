import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts", "tools/test/**/*.test.mjs"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**"],
      thresholds: { lines: 90, branches: 85, functions: 90, statements: 90 },
    },
  },
});
