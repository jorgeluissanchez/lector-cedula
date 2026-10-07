import { defineConfig } from "vite";

// design.md, decisión 1: JSX de Preact con el esbuild de Vite, sin @preact/preset-vite.
export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
  build: { target: "es2022", sourcemap: false },
});
