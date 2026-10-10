// Ejemplo Next con backend propio (motor-backend-embebido, tarea 1.4). El motor usa worker_threads, WASM y el modelo
// desde node_modules: no se empaqueta (serverExternalPackages) y el route handler corre en runtime nodejs. Se compila con
// webpack (`next build --webpack`): Turbopack empaqueta los paquetes enlazados del monorepo pese a serverExternalPackages.
/** @type {import("next").NextConfig} */
export default {
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["@lector-cedula/motor", "@lector-cedula/servidor", "@lector-cedula/capture", "@lector-cedula/fraud", "tesseract.js", "zxing-wasm"],
};
