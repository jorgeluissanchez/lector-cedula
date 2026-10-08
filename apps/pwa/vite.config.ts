import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { textosLegales } from "./legal-paginas";
import { chunkDivipol, nombreRecurso, pluginPwa } from "./plugin-pwa";

// design.md, decisión 1: JSX de Preact con el esbuild de Vite, sin @preact/preset-vite.
// El paquete de captura se importa desde su fuente (sin paso de compilación previo).
// Decisión 10: `src/sw.ts` es una segunda entrada que se emite como `dist/sw.js` (alcance `/`).
export default defineConfig({
  resolve: {
    alias: { "@lector-cedula/capture": fileURLToPath(new URL("../../packages/capture/src/index.ts", import.meta.url)) },
  },
  // OFF-21: aviso, autorización y descargo, extraídos en la compilación de docs/legal (sin duplicar el texto).
  define: { __TEXTOS_LEGALES__: JSON.stringify(textosLegales()) },
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
  // pwa-lectura-offline (OFF-01): recursos de lectura con hash; la tabla DIVIPOL en su propio chunk del Worker lector.
  worker: { format: "es", plugins: () => [], rollupOptions: { output: { assetFileNames: nombreRecurso, chunkFileNames: "assets/[name]-[hash].js", manualChunks: chunkDivipol } } },
  plugins: [pluginPwa()],
  build: {
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      input: { index: fileURLToPath(new URL("./index.html", import.meta.url)), sw: fileURLToPath(new URL("./src/sw.ts", import.meta.url)) },
      output: { entryFileNames: (c) => (c.name === "sw" ? "sw.js" : "assets/[name]-[hash].js"), assetFileNames: nombreRecurso },
    },
  },
});
