import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { pluginPwa } from "./plugin-pwa";

// design.md, decisión 1: JSX de Preact con el esbuild de Vite, sin @preact/preset-vite.
// El paquete de captura se importa desde su fuente (sin paso de compilación previo).
// Decisión 10: `src/sw.ts` es una segunda entrada que se emite como `dist/sw.js` (alcance `/`).
export default defineConfig({
  resolve: {
    alias: { "@lector-cedula/capture": fileURLToPath(new URL("../../packages/capture/src/index.ts", import.meta.url)) },
  },
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
  worker: { format: "es" },
  plugins: [pluginPwa()],
  build: {
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      input: { index: fileURLToPath(new URL("./index.html", import.meta.url)), sw: fileURLToPath(new URL("./src/sw.ts", import.meta.url)) },
      output: { entryFileNames: (c) => (c.name === "sw" ? "sw.js" : "assets/[name]-[hash].js") },
    },
  },
});
