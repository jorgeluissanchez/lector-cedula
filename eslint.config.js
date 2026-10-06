import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "coverage/**", ".specify/**", ".claude/**", "openspec/**"] },
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
