import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { inyectarCspDemo, leerAdmitirTi, leerDemo } from "./config";
import { textosAutorizacionTi, textosLegales } from "./legal-paginas";
import { chunkDivipol, nombreRecurso, pluginPwa } from "./plugin-pwa";

// design.md, decisión 1: JSX de Preact con el esbuild de Vite, sin @preact/preset-vite.
// El paquete de captura se importa desde su fuente (sin paso de compilación previo).
// Decisión 10: `src/sw.ts` es una segunda entrada que se emite como `dist/sw.js` (alcance `/`).
// otros-documentos (OD-30): un valor distinto de "true" o "false" (en el entorno o en .env) hace fallar la compilación.
const ADMITIR_TI = leerAdmitirTi(process.env.VITE_ADMITIR_TI ?? loadEnv(process.env.NODE_ENV === "production" ? "production" : "development", fileURLToPath(new URL(".", import.meta.url)), "VITE_").VITE_ADMITIR_TI);
// mitigacion-autor (MA-01, MA-03): aviso de demostración y meta CSP connect-src 'self'.
const DEMO = leerDemo(process.env.VITE_DEMO ?? loadEnv(process.env.NODE_ENV === "production" ? "production" : "development", fileURLToPath(new URL(".", import.meta.url)), "VITE_").VITE_DEMO);

export default defineConfig({
  resolve: {
    alias: {
      "@lector-cedula/capture": fileURLToPath(new URL("../../packages/capture/src/index.ts", import.meta.url)),
      // deteccion-fraude (FRA-17): solo el índice del paquete; el generador sintético no entra en el bundle.
      "@lector-cedula/fraud": fileURLToPath(new URL("../../packages/fraud/src/index.ts", import.meta.url)),
    },
  },
  // OFF-21: aviso, autorización y descargo, extraídos en la compilación de docs/legal (sin duplicar el texto).
  // OD-30 y OD-35: el parámetro de la TI y, con él encendido, el texto de la autorización del representante.
  define: {
    __TEXTOS_LEGALES__: JSON.stringify(textosLegales()),
    __ADMITIR_TI__: JSON.stringify(ADMITIR_TI),
    __DEMO__: JSON.stringify(DEMO),
    __AUTORIZACION_TI__: JSON.stringify(textosAutorizacionTi(ADMITIR_TI)),
  },
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
  // pwa-lectura-offline (OFF-01): recursos de lectura con hash; la tabla DIVIPOL en su propio chunk del Worker lector.
  worker: { format: "es", plugins: () => [], rollupOptions: { output: { assetFileNames: nombreRecurso, chunkFileNames: "assets/[name]-[hash].js", manualChunks: chunkDivipol } } },
  plugins: [pluginPwa({ admitirTi: ADMITIR_TI }), { name: "csp-demo", transformIndexHtml: (html: string) => inyectarCspDemo(html, DEMO) }],
  build: {
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      input: { index: fileURLToPath(new URL("./index.html", import.meta.url)), sw: fileURLToPath(new URL("./src/sw.ts", import.meta.url)) },
      output: { entryFileNames: (c) => (c.name === "sw" ? "sw.js" : "assets/[name]-[hash].js"), assetFileNames: nombreRecurso },
    },
  },
});
