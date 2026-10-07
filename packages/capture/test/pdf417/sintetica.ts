// Imagen sintética S (spec lectura-pdf417-imagen, Convenciones): PDF417 escrito con el writer de zxing-wasm 3.1.5
// desde bytes de `generarPdf417`, escalado sin suavizado a 1200 px de ancho y centrado en un lienzo blanco de
// 1920x1080. Todo se genera en memoria dentro de la prueba; ninguna imagen se guarda en el repositorio.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { prepareZXingModule as prepararLector, readBarcodes } from "zxing-wasm/reader";
import { prepareZXingModule as prepararEscritor, writeBarcode } from "zxing-wasm/writer";

const requerir = createRequire(import.meta.url);

export const ANCHO_LIENZO = 1920;
export const ALTO_LIENZO = 1080;
export const ANCHO_CODIGO = 1200;

export interface PixelesRgba {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

let preparado: Promise<unknown> | null = null;

/** Carga los WASM del lector y del escritor desde node_modules (sin red). */
export function prepararZxing(): Promise<unknown> {
  preparado ??= Promise.all([
    prepararEscritor({ overrides: { wasmBinary: leerWasm("zxing-wasm/writer/zxing_writer.wasm") }, fireImmediately: true }),
    prepararLector({ overrides: { wasmBinary: leerWasm("zxing-wasm/reader/zxing_reader.wasm") }, fireImmediately: true }),
  ]);
  return preparado;
}

function leerWasm(especificador: string): ArrayBuffer {
  const b = readFileSync(requerir.resolve(especificador));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

/** Lector real de zxing-wasm, preparado sin red, para inyectarlo o para pruebas de humo. */
export async function lectorReal(): Promise<typeof readBarcodes> {
  await prepararZxing();
  return readBarcodes;
}

/** Píxeles RGBA de la imagen S para un payload dado. */
export async function pixelesSinteticos(payload: Uint8Array): Promise<PixelesRgba> {
  await prepararZxing();
  const escrito = await writeBarcode(payload, { format: "PDF417" });
  if (escrito.image === null) throw new Error(`writer: ${escrito.error}`);
  const codigo = PNG.sync.read(Buffer.from(await escrito.image.arrayBuffer()));
  const anchoCodigo = ANCHO_CODIGO;
  const altoCodigo = Math.round((codigo.height * ANCHO_CODIGO) / codigo.width);
  const data = new Uint8ClampedArray(ANCHO_LIENZO * ALTO_LIENZO * 4).fill(255);
  const x0 = Math.floor((ANCHO_LIENZO - anchoCodigo) / 2);
  const y0 = Math.floor((ALTO_LIENZO - altoCodigo) / 2);
  for (let y = 0; y < altoCodigo; y++) {
    const sy = Math.floor((y * codigo.height) / altoCodigo);
    for (let x = 0; x < anchoCodigo; x++) {
      const sx = Math.floor((x * codigo.width) / anchoCodigo);
      const o = (sy * codigo.width + sx) * 4;
      const d = ((y0 + y) * ANCHO_LIENZO + x0 + x) * 4;
      data[d] = codigo.data[o] ?? 255;
      data[d + 1] = codigo.data[o + 1] ?? 255;
      data[d + 2] = codigo.data[o + 2] ?? 255;
    }
  }
  return { data, width: ANCHO_LIENZO, height: ALTO_LIENZO };
}

export function codificarPng(p: PixelesRgba): Uint8Array {
  const png = new PNG({ width: p.width, height: p.height });
  png.data = Buffer.from(p.data.buffer, p.data.byteOffset, p.data.byteLength);
  return new Uint8Array(PNG.sync.write(png));
}

export function codificarJpeg(p: PixelesRgba, calidad: number): Uint8Array {
  return new Uint8Array(jpeg.encode({ data: Buffer.from(p.data), width: p.width, height: p.height }, calidad).data);
}

/** Imagen sintética S como bytes PNG. */
export async function imagenSintetica(payload: Uint8Array): Promise<Uint8Array> {
  return codificarPng(await pixelesSinteticos(payload));
}

/** PNG blanco de `ancho` x `alto`. */
export function pngBlanco(ancho: number, alto: number): Uint8Array {
  return codificarPng({ data: new Uint8ClampedArray(ancho * alto * 4).fill(255), width: ancho, height: alto });
}
