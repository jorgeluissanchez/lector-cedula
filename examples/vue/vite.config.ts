// Ejemplo Vue (sdk-integracion, tarea 3b.4).
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [vue()],
  build: { target: "es2022", outDir: "dist", emptyOutDir: true },
});
