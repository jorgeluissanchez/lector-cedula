// Decodificación del PDF417 de la cédula amarilla desde una imagen (spec lectura-pdf417-imagen, LPI-01 a LPI-08).
// Devuelve los bytes crudos del símbolo, nunca el texto. No escribe en consola ni a disco; la imagen vive en memoria.
import { parsearPdf417Amarilla } from "@lector-cedula/parsers";
import { aGris, cajaBanda, recortar, TAMANOS_VENTANA, ventanas } from "./localizar.js";
import { decodificarPixeles, esPixeles, girar, type DecodificadorPixeles, type Pixeles, reescalar } from "./pixeles.js";

export type { DecodificadorPixeles, Pixeles } from "./pixeles.js";

export type IntentoBase = "original" | "escala-0.75" | "escala-0.5" | "giro+2" | "giro-2";
/** Intentos de localización (LPI-14). */
export type IntentoBanda = `banda${"" | "-global"}${"" | "-giro+2" | "-giro-2"}`;
export type IntentoPdf417 = IntentoBase | IntentoBanda | `ventana-${(typeof TAMANOS_VENTANA)[number]}`;
export type ErrorPdf417Imagen = "entrada-invalida" | "imagen-ilegible" | "pdf417-no-encontrado";
export type ResultadoPdf417Imagen = { ok: true; bytes: Uint8Array; intento: IntentoPdf417 } | { ok: false; error: ErrorPdf417Imagen };

/** Opciones que se envían a `readBarcodes` en cada intento (LPI-02). */
export interface OpcionesLector {
  readonly formats: ["PDF417"];
  readonly tryHarder: true;
  readonly tryRotate: true;
  readonly maxNumberOfSymbols: 1;
  /** Solo en los intentos de localización (LPI-14). */
  readonly tryDownscale?: true;
  readonly binarizer?: "LocalAverage" | "GlobalHistogram";
}

/** Subconjunto de `readBarcodes` de zxing-wasm que usa el decodificador; inyectable en pruebas (design.md, decisión 4). */
export type DecodificadorPdf417 = (imagen: Pixeles, opciones: OpcionesLector) => Promise<readonly { readonly bytes: Uint8Array; readonly isValid: boolean }[]>;

export interface DependenciasDecodificador {
  readonly readBarcodes?: DecodificadorPdf417;
  readonly decodificarPixeles?: DecodificadorPixeles;
  /** Límite de tiempo total en ms (LPI-12); por defecto 15 000. */
  readonly limiteMs?: number;
  /** Reloj en ms (LPI-12); por defecto `performance.now`. */
  readonly ahora?: () => number;
  /** Acepta los bytes de un intento de localización (LPI-11); por defecto el parser de la amarilla. */
  readonly aceptar?: (bytes: Uint8Array) => boolean;
  /** `false` desactiva banda y rejilla (LPI-11). */
  readonly localizar?: boolean;
}

export const LIMITE_MS_POR_DEFECTO = 15_000;
/** Por encima de este número de píxeles la banda va antes de los intentos de LPI-02 (LPI-11). */
const PIXELES_FOTO_GRANDE = 4_000_000;

/** Intentos en orden (LPI-02): imagen original, reducciones y giros de ±2° que compensan la tolerancia de zxing-cpp. */
const INTENTOS: readonly (readonly [IntentoBase, (p: Pixeles) => Pixeles])[] = [
  ["original", (p) => p],
  ["escala-0.75", (p) => reescalar(p, 0.75)],
  ["escala-0.5", (p) => reescalar(p, 0.5)],
  ["giro+2", (p) => girar(p, 2)],
  ["giro-2", (p) => girar(p, -2)],
];

function opcionesLector(binarizer?: "LocalAverage" | "GlobalHistogram"): OpcionesLector {
  const base: OpcionesLector = { formats: ["PDF417"], tryHarder: true, tryRotate: true, maxNumberOfSymbols: 1 };
  return binarizer === undefined ? base : { ...base, tryDownscale: true, binarizer };
}

/** Un intento: nombre, imagen (perezosa), opciones y si exige que el parser acepte los bytes. */
interface Intento {
  readonly nombre: IntentoPdf417;
  readonly imagen: () => Pixeles;
  readonly opciones: OpcionesLector;
  readonly exigeAceptar: boolean;
}

function* intentosBase(p: Pixeles): Generator<Intento> {
  for (const [nombre, transformar] of INTENTOS) yield { nombre, imagen: () => transformar(p), opciones: opcionesLector(), exigeAceptar: false };
}

function* intentosBanda(p: Pixeles): Generator<Intento> {
  const caja = cajaBanda(p);
  if (caja === null) return;
  const recorte = recortar(p, caja);
  for (const [giro, sufijo] of [[0, ""], [2, "-giro+2"], [-2, "-giro-2"]] as const) {
    const imagen = () => (giro === 0 ? recorte : girar(recorte, giro));
    yield { nombre: `banda${sufijo}`, imagen, opciones: opcionesLector("LocalAverage"), exigeAceptar: true };
    yield { nombre: `banda-global${sufijo}`, imagen, opciones: opcionesLector("GlobalHistogram"), exigeAceptar: true };
  }
}

function* intentosRejilla(p: Pixeles): Generator<Intento> {
  for (const tamano of TAMANOS_VENTANA) {
    for (const caja of ventanas(p.width, p.height, tamano)) {
      yield { nombre: `ventana-${tamano}`, imagen: () => recortar(p, caja), opciones: opcionesLector("LocalAverage"), exigeAceptar: true };
    }
  }
}

/** Orden de intentos (LPI-02, LPI-11): en fotos grandes la banda va primero. */
function* intentos(p: Pixeles, localizar: boolean): Generator<Intento> {
  if (!localizar) return yield* intentosBase(p);
  if (p.width * p.height > PIXELES_FOTO_GRANDE) {
    yield* intentosBanda(p);
    yield* intentosBase(p);
  } else {
    yield* intentosBase(p);
    yield* intentosBanda(p);
  }
  yield* intentosRejilla(p);
}

function aceptarPorDefecto(bytes: Uint8Array): boolean {
  return parsearPdf417Amarilla(bytes).ok;
}

// Especificador en variable: módulo solo de Node, que el empaquetador del navegador no debe resolver.
const MODULO_NODE = "node:module";
const MODULO_FS = "node:fs/promises";

let lectorPorDefecto: Promise<DecodificadorPdf417> | null = null;

/** Carga diferida de zxing-wasm/reader (LPI-08). En Node el WASM se lee de node_modules, sin red. */
async function cargarLector(): Promise<DecodificadorPdf417> {
  const zxing = await import("zxing-wasm/reader");
  const p = (globalThis as { process?: { versions?: { node?: string } } }).process;
  if (typeof p?.versions?.node === "string" && !("window" in globalThis)) {
    const { createRequire } = (await import(/* @vite-ignore */ MODULO_NODE)) as typeof import("node:module");
    const { readFile } = (await import(/* @vite-ignore */ MODULO_FS)) as typeof import("node:fs/promises");
    const b = await readFile(createRequire(import.meta.url).resolve("zxing-wasm/reader/zxing_reader.wasm"));
    const wasmBinary = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    await zxing.prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
  }
  return (imagen, opciones) => zxing.readBarcodes(imagen as unknown as ImageData, opciones);
}

function lectorDiferido(): DecodificadorPdf417 {
  return async (imagen, opciones) => {
    lectorPorDefecto ??= cargarLector().catch((e: unknown) => {
      lectorPorDefecto = null;
      throw e;
    });
    return (await lectorPorDefecto)(imagen, opciones);
  };
}

/** Crea un decodificador con dependencias inyectables (pruebas de LPI-02). */
export function crearDecodificador(dependencias: DependenciasDecodificador = {}): (imagen: unknown) => Promise<ResultadoPdf417Imagen> {
  const leer = dependencias.readBarcodes ?? lectorDiferido();
  const aPixeles = dependencias.decodificarPixeles ?? decodificarPixeles;
  const limiteMs = dependencias.limiteMs ?? LIMITE_MS_POR_DEFECTO;
  const ahora = dependencias.ahora ?? (() => performance.now());
  const aceptar = dependencias.aceptar ?? aceptarPorDefecto;
  const localizar = dependencias.localizar ?? true;
  return async (imagen) => {
    let pixeles: Pixeles | null;
    try {
      if (imagen instanceof Uint8Array) pixeles = await aPixeles(imagen);
      else if (esPixeles(imagen)) pixeles = imagen;
      else return { ok: false, error: "entrada-invalida" };
    } catch {
      pixeles = null;
    }
    if (pixeles === null) return { ok: false, error: "imagen-ilegible" };
    const inicio = ahora();
    let primero = true;
    for (const intento of intentos(aGris(pixeles), localizar)) {
      if (!primero && ahora() - inicio >= limiteMs) break;
      primero = false;
      let resultados;
      try {
        resultados = await leer(intento.imagen(), intento.opciones);
      } catch {
        return { ok: false, error: "imagen-ilegible" };
      }
      const valido = resultados.find(
        (r) => r.isValid && r.bytes instanceof Uint8Array && r.bytes.length > 0 && (!intento.exigeAceptar || aceptar(r.bytes)),
      );
      if (valido !== undefined) return { ok: true, bytes: Uint8Array.from(valido.bytes), intento: intento.nombre };
    }
    return { ok: false, error: "pdf417-no-encontrado" };
  };
}

/**
 * Decodifica el PDF417 de una imagen: bytes PNG/JPEG (`Uint8Array`) o `ImageData`. Nunca lanza.
 * Convierte a gris, intenta en el tamaño original, reducida a 0,75 y 0,5 y girada ±2° y después localiza el código por
 * banda de bordes y rejilla de ventanas (LPI-11), con un límite de 15 s; devuelve los bytes crudos del primer símbolo válido.
 */
export const decodificarPdf417Imagen: (imagen: unknown) => Promise<ResultadoPdf417Imagen> = crearDecodificador();
