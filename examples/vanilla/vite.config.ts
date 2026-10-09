// Ejemplo vanilla (sdk-integracion, tarea 3.4). Consume la compilación de @lector-cedula/web (`npm run build -w
// @lector-cedula/web`) y copia sus assets tal cual a `/lector-cedula/` (como haría un integrador en `public/`).
import { cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const web = (r: string): string => fileURLToPath(new URL(`../../packages/web/${r}`, import.meta.url));
const MARCA = "__PAGINA__";

function ejemplo(): Plugin {
  return {
    name: "ejemplo-vanilla",
    // El service worker recibe la lista de archivos de la página (sin el motor, que precachea precacheLector).
    generateBundle(_o, bundle) {
      const pagina = ["/index.html", ...Object.keys(bundle).filter((n) => n !== "sw.js" && n !== "index.html").map((n) => `/${n}`)];
      const sw = bundle["sw.js"];
      if (sw?.type === "chunk") sw.code = sw.code.replace(MARCA, JSON.stringify(pagina));
    },
    async closeBundle() {
      await cp(web("dist/assets"), fileURLToPath(new URL("./dist/lector-cedula/", import.meta.url)), { recursive: true });
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: [
      { find: "@lector-cedula/web/sw", replacement: web("dist/sw.js") },
      { find: "@lector-cedula/web", replacement: web("dist/index.js") },
    ],
  },
  plugins: [ejemplo()],
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: { index: fileURLToPath(new URL("./index.html", import.meta.url)), sw: fileURLToPath(new URL("./src/sw.ts", import.meta.url)) },
      output: { entryFileNames: "[name].js", chunkFileNames: "[name].js", assetFileNames: "[name][extname]" },
    },
  },
});
