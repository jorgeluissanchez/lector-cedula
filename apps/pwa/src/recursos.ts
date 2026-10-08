/**
 * Lista de recursos estáticos que precarga el service worker (CAM-01; design.md, decisión 10). Pura: la usa el
 * plugin de `vite.config.ts` con los nombres que emite Rollup.
 */

/** Rutas que puede tener una clave de caché (escenario "Caché limitada a recursos estáticos"). */
export const RUTA_PERMITIDA = /^\/(index\.html|manifest\.webmanifest|sw\.js|iconos\/[^/]+\.png|assets\/[^/]+)?$/;

const PRECARGABLE = /^\/(index\.html|manifest\.webmanifest|iconos\/[^/]+\.png|assets\/[^/]+)?$/;
const FIJOS = ["/", "/index.html", "/manifest.webmanifest"];

export function listaRecursos(emitidos: readonly string[]): string[] {
  const rutas = new Set(FIJOS);
  for (const n of emitidos) {
    const ruta = n.startsWith("/") ? n : `/${n}`;
    // CAM-01 "Worker de calidad precacheado": todo assets/, incluido el Worker, para el análisis sin conexión.
    if (PRECARGABLE.test(ruta)) rutas.add(ruta);
  }
  return [...rutas].sort();
}
