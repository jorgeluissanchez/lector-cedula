/**
 * Lógica pura del service worker (pwa-lectura-offline; design.md, decisiones 7, 9 y 10), con cachés y red inyectadas.
 * - `instalar` (OFF-01, OFF-02, OFF-17): descarga cada ruta del manifiesto sin caché HTTP, verifica tamaño y SHA-256 y
 *   la guarda en `lector-<version>-pendiente`; si todo cuadra, copia a `lector-<version>` y borra la pendiente. Ante
 *   cualquier fallo borra la pendiente, registra el motivo y la ruta (nunca el contenido) y rechaza.
 * - `activar` (OFF-05, OFF-17): borra todas las cachés salvo la de la versión activa.
 * - `estadoPrecache` (OFF-03): `lista` solo si todas las rutas están en la caché activa.
 * - `responderFetch` (OFF-04, OFF-05): solo GET del mismo origen con ruta del manifiesto; lo demás no pasa por el
 *   service worker. Nunca guarda respuestas en tiempo de ejecución.
 */
import type { ManifiestoPrecache } from "./manifiesto";
import { verificarEntrada } from "./verificar";

export interface CacheSimple {
  put(ruta: string, respuesta: Response): Promise<void>;
  match(ruta: string): Promise<Response | undefined>;
  keys(): Promise<readonly unknown[]>;
}

export interface AlmacenCaches {
  open(nombre: string): Promise<CacheSimple>;
  keys(): Promise<readonly string[]>;
  delete(nombre: string): Promise<boolean>;
}

export type MotivoFallo = "integridad-fallida" | "descarga-fallida";

export interface DependenciasInstalacion {
  readonly almacen: AlmacenCaches;
  readonly descargar: (ruta: string, opciones: RequestInit) => Promise<Response>;
  readonly registrar: (motivo: MotivoFallo, ruta: string) => void;
}

export const nombreCache = (version: string): string => `lector-${version}`;

class FalloInstalacion extends Error {}

async function descargar(ruta: string, deps: DependenciasInstalacion): Promise<Response> {
  const r = await deps.descargar(ruta, { cache: "no-store" }).catch(() => null);
  if (r?.status !== 200) {
    deps.registrar("descarga-fallida", ruta);
    throw new FalloInstalacion("descarga-fallida");
  }
  return r;
}

export async function instalar(manifiesto: ManifiestoPrecache, deps: DependenciasInstalacion): Promise<void> {
  const final = nombreCache(manifiesto.version);
  const pendiente = `${final}-pendiente`;
  try {
    const cache = await deps.almacen.open(pendiente);
    for (const entrada of manifiesto.entradas) {
      const r = await descargar(entrada.ruta, deps);
      const datos = await r.arrayBuffer();
      const v = await verificarEntrada(entrada, datos);
      if (!v.ok) {
        deps.registrar(v.motivo, v.ruta);
        throw new FalloInstalacion(v.motivo);
      }
      await cache.put(entrada.ruta, new Response(datos, { status: 200, headers: r.headers }));
    }
    const activa = await deps.almacen.open(final);
    for (const entrada of manifiesto.entradas) await activa.put(entrada.ruta, (await cache.match(entrada.ruta)) as Response);
  } catch (e) {
    await deps.almacen.delete(final);
    throw e;
  } finally {
    await deps.almacen.delete(pendiente);
  }
}

export async function activar(manifiesto: ManifiestoPrecache, almacen: AlmacenCaches): Promise<void> {
  const activa = nombreCache(manifiesto.version);
  for (const n of await almacen.keys()) if (n !== activa) await almacen.delete(n);
}

export async function estadoPrecache(manifiesto: ManifiestoPrecache, almacen: AlmacenCaches): Promise<"lista" | "pendiente"> {
  const activa = nombreCache(manifiesto.version);
  if (!(await almacen.keys()).includes(activa)) return "pendiente";
  const cache = await almacen.open(activa);
  for (const e of manifiesto.entradas) if ((await cache.match(e.ruta)) === undefined) return "pendiente";
  return "lista";
}

export function rutaPrecacheada(peticion: { readonly url: string; readonly method: string }, origen: string, rutas: ReadonlySet<string>): string | null {
  const url = new URL(peticion.url);
  if (peticion.method !== "GET" || url.origin !== origen || !rutas.has(url.pathname)) return null;
  return url.pathname;
}

/** `null`: la petición no pasa por `respondWith`. Si la ruta del manifiesto falta en caché, solo esa va a la red. */
export function responderFetch(
  peticion: { readonly url: string; readonly method: string },
  origen: string,
  rutas: ReadonlySet<string>,
  almacen: AlmacenCaches,
  version: string,
  red: (ruta: string) => Promise<Response>,
): Promise<Response> | null {
  const ruta = rutaPrecacheada(peticion, origen, rutas);
  if (ruta === null) return null;
  return almacen.open(nombreCache(version)).then(async (c) => (await c.match(ruta)) ?? red(ruta));
}
