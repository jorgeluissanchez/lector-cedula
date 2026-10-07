// Decodificación del PDF417 de la cédula amarilla desde una imagen (spec lectura-pdf417-imagen, LPI-01 a LPI-08).
// Devuelve los bytes crudos del símbolo, nunca el texto. No escribe en consola ni a disco; la imagen vive en memoria.
import { decodificarPixeles, esPixeles, girar, type DecodificadorPixeles, type Pixeles, reescalar } from "./pixeles.js";

export type { DecodificadorPixeles, Pixeles } from "./pixeles.js";

export type IntentoPdf417 = "original" | "escala-0.75" | "escala-0.5" | "giro+2" | "giro-2";
export type ErrorPdf417Imagen = "entrada-invalida" | "imagen-ilegible" | "pdf417-no-encontrado";
export type ResultadoPdf417Imagen = { ok: true; bytes: Uint8Array; intento: IntentoPdf417 } | { ok: false; error: ErrorPdf417Imagen };

/** Opciones que se envían a `readBarcodes` en cada intento (LPI-02). */
export interface OpcionesLector {
  readonly formats: ["PDF417"];
  readonly tryHarder: true;
  readonly tryRotate: true;
  readonly maxNumberOfSymbols: 1;
}

/** Subconjunto de `readBarcodes` de zxing-wasm que usa el decodificador; inyectable en pruebas (design.md, decisión 4). */
export type DecodificadorPdf417 = (imagen: Pixeles, opciones: OpcionesLector) => Promise<readonly { readonly bytes: Uint8Array; readonly isValid: boolean }[]>;

export interface DependenciasDecodificador {
  readonly readBarcodes?: DecodificadorPdf417;
  readonly decodificarPixeles?: DecodificadorPixeles;
}

/** Intentos en orden (LPI-02): imagen original, reducciones y giros de ±2° que compensan la tolerancia de zxing-cpp. */
const INTENTOS: readonly (readonly [IntentoPdf417, (p: Pixeles) => Pixeles])[] = [
  ["original", (p) => p],
  ["escala-0.75", (p) => reescalar(p, 0.75)],
  ["escala-0.5", (p) => reescalar(p, 0.5)],
  ["giro+2", (p) => girar(p, 2)],
  ["giro-2", (p) => girar(p, -2)],
];

function opcionesLector(): OpcionesLector {
  return { formats: ["PDF417"], tryHarder: true, tryRotate: true, maxNumberOfSymbols: 1 };
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
    for (const [intento, transformar] of INTENTOS) {
      let resultados;
      try {
        resultados = await leer(transformar(pixeles), opcionesLector());
      } catch {
        return { ok: false, error: "imagen-ilegible" };
      }
      const valido = resultados.find((r) => r.isValid && r.bytes instanceof Uint8Array && r.bytes.length > 0);
      if (valido !== undefined) return { ok: true, bytes: Uint8Array.from(valido.bytes), intento };
    }
    return { ok: false, error: "pdf417-no-encontrado" };
  };
}

/**
 * Decodifica el PDF417 de una imagen: bytes PNG/JPEG (`Uint8Array`) o `ImageData`. Nunca lanza.
 * Intenta en el tamaño original, reducida a 0,75 y 0,5 y girada ±2°; devuelve los bytes crudos del primer símbolo válido.
 */
export const decodificarPdf417Imagen: (imagen: unknown) => Promise<ResultadoPdf417Imagen> = crearDecodificador();
