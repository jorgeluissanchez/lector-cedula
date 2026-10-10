import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: [".stryker-tmp*/**", "reports/**", "test-results/**", "**/dist/**", "native/**/build/**", "**/dist-demo/**", "**/node_modules/**", "coverage/**", ".specify/**", ".claude/**", "openspec/**", "**/.next/**", "**/.angular/**", "examples/*/public/lector-cedula/**", "**/next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      // Principio III: nada de console en código de producto (puede filtrar PII).
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["tools/**", "evals/**", ".claude/hooks/**"],
    rules: { "no-console": "off" },
  },
);
