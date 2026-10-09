// Ejemplo Next (sdk-integracion, tarea 3b.4). Sin telemetría ni imágenes optimizadas (no se usan).
/** @type {import("next").NextConfig} */
export default {
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
};
