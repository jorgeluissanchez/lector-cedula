// Código de entorno del lector MRZ (cambio leer-mrz-desde-imagen, LMI-02, LMI-05, LMI-07 y LMI-09): Node frente a
// navegador, codificación PNG y worker real de Tesseract.js. Lo cubren las pruebas de integración con el modelo real
// (packages/capture/test/mrz/lector-real.test.ts), la de navegador (test-browser/mrz) y la CLI; Stryker no puede
// ejecutarlas a un coste razonable (OCR real de segundos por mutante, navegador no soportado), así que este archivo se
// excluye de la mutación con el comentario siguiente. La lógica pura está en lector.ts, localizar.ts, extraer.ts y
// enderezar.ts, que sí se mutan.
// Stryker disable all
import type { Pixeles } from "../pdf417/pixeles.js";
import type { CrearWorkerOcr, OpcionesLectorMrz } from "./lector.js";

export function enNode(): boolean {
  const p = (globalThis as { process?: { versions?: { node?: string } } }).process;
  return typeof p?.versions?.node === "string" && !("window" in globalThis);
}

// Especificadores en variables: módulos solo de Node que el empaquetador del navegador no debe resolver.
const MODULO_PNG = "pngjs";
const MODULO_URL = "node:url";
const MODULO_FS = "node:fs/promises";

/** Codifica a PNG en memoria (pngjs en Node, OffscreenCanvas en el navegador). */
export async function codificarPng(p: Pixeles): Promise<Uint8Array> {
  if (enNode()) {
    const { PNG } = (await import(/* @vite-ignore */ MODULO_PNG)) as typeof import("pngjs");
    const png = PNG.sync.write({ width: p.width, height: p.height, data: Buffer.from(p.data.buffer, p.data.byteOffset, p.data.byteLength) } as never);
    return new Uint8Array(png.buffer, png.byteOffset, png.byteLength);
  }
  const lienzo = new OffscreenCanvas(p.width, p.height);
  const ctx = lienzo.getContext("2d");
  if (ctx === null) throw new Error("sin contexto 2d");
  ctx.putImageData(new ImageData(p.data as Uint8ClampedArray<ArrayBuffer>, p.width, p.height), 0, 0);
  return new Uint8Array(await (await lienzo.convertToBlob({ type: "image/png" })).arrayBuffer());
}

/** Worker real: import() diferido de Tesseract.js (LMI-09). */
export const crearWorkerTesseract: CrearWorkerOcr = async (idioma, oem, opciones) => {
  const modulo = (await import("tesseract.js")) as unknown as { default?: { createWorker: CrearWorkerOcr }; createWorker?: CrearWorkerOcr };
  const crear = modulo.default?.createWorker ?? modulo.createWorker;
  if (crear === undefined) throw new Error("tesseract.js sin createWorker");
  // Sin `errorHandler`, Tesseract.js lanza fuera de toda promesa si falla la carga del modelo; con él, createWorker no
  // se resuelve nunca. Se compite con el primer error para devolver `modelo-no-disponible`.
  let fallar: (e: unknown) => void = () => undefined;
  const error = new Promise<never>((_, rechazar) => {
    fallar = rechazar;
  });
  return Promise.race([crear(idioma, oem, { ...opciones, errorHandler: (e: unknown) => fallar(e) }), error]);
};

export async function opcionesWorker(o: OpcionesLectorMrz): Promise<Record<string, unknown> | null> {
  const base = { langPath: o.rutaModelo, gzip: false, cacheMethod: "none" };
  if (enNode()) {
    const { fileURLToPath } = (await import(/* @vite-ignore */ MODULO_URL)) as typeof import("node:url");
    const { access } = (await import(/* @vite-ignore */ MODULO_FS)) as typeof import("node:fs/promises");
    // Comprobación de solo lectura: el worker de Tesseract.js queda vivo si la carga del modelo falla.
    try {
      await access(`${o.rutaModelo}/mrz.traineddata`);
    } catch {
      return null;
    }
    return { ...base, workerPath: fileURLToPath(new URL("../../worker/tesseract-node.cjs", import.meta.url)) };
  }
  if (o.rutaWorker === undefined || o.rutaCore === undefined) return null;
  return { ...base, workerPath: o.rutaWorker, corePath: o.rutaCore, workerBlobURL: false };
}
