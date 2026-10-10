// Ejemplo React (sdk-integracion, motor-backend-embebido, tarea 1.2). JSX con el transformador de Vite (sin plugin adicional).
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  esbuild: { jsx: "automatic" },
  build: { target: "es2022", outDir: "dist", emptyOutDir: true },
});
