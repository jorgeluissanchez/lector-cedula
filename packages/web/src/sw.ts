/**
 * `@lector-cedula/web/sw` (SDK-06): para el service worker del integrador. `precacheLector(recursos)` descarga y
 * verifica el motor en la misma caché que usa el núcleo (`lector-cedula-sdk-<version>`), de modo que la página recargada
 * sin red sigue leyendo. Llámalo en `install` (con `event.waitUntil`). No intercepta peticiones: el núcleo lee la caché.
 */
import { cargarMotor, type AlmacenMinimo } from "./cargador.js";

export { NOMBRE_CACHE } from "./cargador.js";

export async function precacheLector(recursos: string): Promise<void> {
  const g = globalThis as { caches?: AlmacenMinimo };
  // En el service worker no se crean URL blob: solo se verifica y cachea.
  await cargarMotor(recursos, { fetch: (u, i) => globalThis.fetch(u, i), caches: g.caches, crearUrl: () => "" });
}
