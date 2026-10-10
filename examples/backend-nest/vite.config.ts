// Ejemplo React con backend Nest (sdk-integracion, motor-backend-embebido, tarea 1.3). El front va a dist/publico y el
// servidor compilado a dist/servidor (fuera de la carpeta estática). JSX con el transformador de Vite.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { salidaConChunksSdk } from "../vite-chunks-sdk.mjs";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  esbuild: { jsx: "automatic" },
  build: { target: "es2022", outDir: "dist/publico", emptyOutDir: true, rollupOptions: { output: salidaConChunksSdk() } },
});
