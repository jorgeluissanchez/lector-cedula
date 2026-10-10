/**
 * Cargador del motor (SDK-04, SDK-06, SDK-07, SDK-39). Descarga `manifest.json` y cada recurso desde `recursos`,
 * verifica su SHA-256 antes de usarlo o cachearlo, lo guarda en la Cache Storage `lector-cedula-sdk-<version>` (nunca
 * imágenes ni resultados), borra las cachés de otras versiones y entrega URL `blob:` de los bytes verificados para los
 * Workers. Sin red, usa la caché (verificada de nuevo). Nada se carga hasta que se llama.
 */
import { leerManifiesto, verificarRecurso, type EntradaRecurso, type ManifiestoRecursos } from "./integridad.js";
import { VERSION } from "./version.js";

export const PREFIJO_CACHE = "lector-cedula-sdk-";
export const NOMBRE_CACHE = `${PREFIJO_CACHE}${VERSION}`;

export interface CacheMinima {
  match(url: string): Promise<Response | undefined>;
  put(url: string, r: Response): Promise<void>;
}

export interface AlmacenMinimo {
  open(nombre: string): Promise<CacheMinima>;
  keys(): Promise<readonly string[]>;
  delete(nombre: string): Promise<boolean>;
}

export interface EntornoCargador {
  readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
  readonly caches?: AlmacenMinimo | undefined;
  readonly crearUrl: (b: Blob) => string;
}

export interface MotorCargado {
  readonly manifiesto: ManifiestoRecursos;
  /** URL `blob:` por nombre de archivo. */
  readonly urls: Readonly<Record<string, string>>;
}

export class ErrorMotor extends Error {
  readonly codigo = "motor-no-disponible" as const;
  constructor(readonly motivo: string) {
    super("motor-no-disponible");
  }
}

/** Base con barra final; relativa al documento si hay `location`. */
export function baseRecursos(recursos: string): string {
  const loc = (globalThis as { location?: { href?: string } }).location?.href;
  const abs = new URL(recursos, loc ?? "http://localhost/").href;
  return abs.endsWith("/") ? abs : `${abs}/`;
}

/** Recursos por omisión: la carpeta `assets/` junto al módulo, resuelta en tiempo de ejecución (sin análisis del bundler). */
export function recursosPorOmision(): string {
  // Sin `new URL(...)`: Turbopack y webpack lo analizan como un asset y fallan con una carpeta (SDK-12, Next). Se
  // resuelve en tiempo de ejecución; con bundlers, el integrador pasa `recursos`.
  return import.meta.url.replace(/[^/]*$/u, "assets/");
}

async function leerCache(cache: CacheMinima | null, url: string): Promise<ArrayBuffer | null> {
  if (cache === null) return null;
  try {
    const r = await cache.match(url);
    return r === undefined ? null : await r.arrayBuffer();
  } catch {
    return null;
  }
}

async function descargar(entorno: EntornoCargador, url: string): Promise<Response | null> {
  try {
    // Sin caché HTTP: la copia verificada vive en Cache Storage (y Chromium falla al escribir en disco los recursos
    // grandes pedidos en paralelo, ERR_CACHE_WRITE_FAILURE).
    return await entorno.fetch(url, { credentials: "same-origin", cache: "no-store" });
  } catch {
    return null;
  }
}

async function abrirCache(entorno: EntornoCargador): Promise<CacheMinima | null> {
  const almacen = entorno.caches;
  if (almacen === undefined) return null;
  try {
    for (const n of await almacen.keys()) if (n.startsWith(PREFIJO_CACHE) && n !== NOMBRE_CACHE) await almacen.delete(n);
    return await almacen.open(NOMBRE_CACHE);
  } catch {
    return null;
  }
}

async function obtenerManifiesto(entorno: EntornoCargador, cache: CacheMinima | null, url: string): Promise<{ m: ManifiestoRecursos; datos: ArrayBuffer }> {
  const r = await descargar(entorno, url);
  let datos: ArrayBuffer | null = null;
  if (r === null) datos = await leerCache(cache, url);
  else if (r.ok) datos = await r.arrayBuffer();
  if (datos === null) throw new ErrorMotor(r === null ? "sin-red" : `manifiesto-${r.status}`);
  let m: ManifiestoRecursos | null = null;
  try {
    m = leerManifiesto(JSON.parse(new TextDecoder().decode(datos)));
  } catch {
    m = null;
  }
  if (m === null) throw new ErrorMotor("manifiesto-invalido");
  return { m, datos };
}

async function obtenerRecurso(entorno: EntornoCargador, cache: CacheMinima | null, url: string, e: EntradaRecurso): Promise<{ datos: ArrayBuffer; nuevo: boolean }> {
  const enCache = await leerCache(cache, url);
  if (enCache !== null && (await verificarRecurso(e, enCache))) return { datos: enCache, nuevo: false };
  const r = await descargar(entorno, url);
  if (r === null || !r.ok) throw new ErrorMotor("descarga-fallida");
  const datos = await r.arrayBuffer();
  if (!(await verificarRecurso(e, datos))) throw new ErrorMotor("integridad-fallida");
  return { datos, nuevo: true };
}

/** SDK-56: `soloLigeros` omite los recursos marcados `pesado` (modo back ligero). Los avisos legales (`aviso`) no se piden nunca. */
export interface OpcionesCarga {
  readonly soloLigeros?: boolean;
}

export async function cargarMotor(recursos: string, entorno: EntornoCargador, o: OpcionesCarga = {}): Promise<MotorCargado> {
  const base = baseRecursos(recursos);
  const cache = await abrirCache(entorno);
  const urlManifiesto = `${base}manifest.json`;
  const { m, datos: datosManifiesto } = await obtenerManifiesto(entorno, cache, urlManifiesto);
  const verificados: { e: EntradaRecurso; url: string; datos: ArrayBuffer; nuevo: boolean }[] = [];
  for (const e of m.recursos) {
    if (e.aviso === true) continue;
    if (o.soloLigeros === true && e.pesado === true) continue;
    const url = `${base}${e.archivo}`;
    verificados.push({ e, url, ...(await obtenerRecurso(entorno, cache, url, e)) });
  }
  // Solo tras verificar todo se cachea (un recurso alterado no deja nada nuevo en la caché).
  if (cache !== null) {
    try {
      for (const v of verificados) if (v.nuevo) await cache.put(v.url, new Response(v.datos, { headers: { "content-type": v.e.tipo } }));
      await cache.put(urlManifiesto, new Response(datosManifiesto, { headers: { "content-type": "application/json" } }));
    } catch {
      // Cuota llena o caché no disponible: se lee igual con red.
    }
  }
  const urls: Record<string, string> = {};
  for (const v of verificados) urls[v.e.archivo] = entorno.crearUrl(new Blob([v.datos], { type: v.e.tipo }));
  return { manifiesto: m, urls };
}

const memoria = new Map<string, Promise<MotorCargado>>();

/** Carga memorizada por URL base: tras resolver, ninguna lectura vuelve a pedir recursos (SDK-07). */
export function motorMemorizado(recursos: string, entorno: EntornoCargador, o: OpcionesCarga = {}): Promise<MotorCargado> {
  const base = baseRecursos(recursos);
  const clave = o.soloLigeros === true ? `${base}#ligero` : base;
  let p = memoria.get(clave);
  if (p === undefined) {
    p = cargarMotor(base, entorno, o);
    memoria.set(clave, p);
    p.catch(() => memoria.delete(clave));
  }
  return p;
}

export function entornoNavegador(): EntornoCargador {
  const g = globalThis as { caches?: AlmacenMinimo };
  return { fetch: (u, i) => globalThis.fetch(u, i), caches: g.caches, crearUrl: (b) => URL.createObjectURL(b) };
}

/** SDK-07: descarga, verifica y deja listo el motor sin pedir la cámara. Rechaza con `codigo` `motor-no-disponible`. */
export async function precargarMotor(o: { recursos?: string } = {}): Promise<void> {
  await motorMemorizado(o.recursos ?? recursosPorOmision(), entornoNavegador());
}
