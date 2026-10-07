// Imagen sintética difícil D y D-EXIF6 (cambio localizar-pdf417-en-foto, Convenciones): foto grande de 4096x1842 con
// textura de madera sintética, tarjeta amarilla y un PDF417 pequeño girado 4°. Todo en memoria; nada se guarda.
import { PNG } from "pngjs";
import { writeBarcode } from "zxing-wasm/writer";
import { codificarJpeg, prepararZxing, type PixelesRgba } from "./sintetica.js";

export const ANCHO_D = 4096;
export const ALTO_D = 1842;
const ANCHO_CODIGO_D = 1650;
const GIRO_CODIGO = 4;
const X0 = 1100;
const Y0 = 1000;

/** Generador congruencial con semilla fija (textura reproducible). */
function aleatorio(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
}

export interface ImagenDificil extends PixelesRgba {
  /** Fracción del área ocupada por el código (sin girar). */
  readonly fraccionCodigo: number;
}

export async function pixelesDificiles(payload: Uint8Array): Promise<ImagenDificil> {
  await prepararZxing();
  const escrito = await writeBarcode(payload, { format: "PDF417" });
  if (escrito.image === null) throw new Error(`writer: ${escrito.error}`);
  const c = PNG.sync.read(Buffer.from(await escrito.image.arrayBuffer()));
  const cw = ANCHO_CODIGO_D;
  const ch = Math.round((c.height * cw) / c.width);
  const rnd = aleatorio(12345);
  const g = new Float32Array(ANCHO_D * ALTO_D);
  // Vetas de madera: senoide deformada más ruido.
  for (let y = 0; y < ALTO_D; y++) {
    for (let x = 0; x < ANCHO_D; x++) g[y * ANCHO_D + x] = 80 + (Math.sin(x * 0.05 + Math.sin(y * 0.011) * 9) * 0.5 + 0.5) * 90 + rnd() * 50;
  }
  // Tarjeta clara alrededor del código.
  const m = 70;
  for (let y = Y0 - m; y < Y0 + ch + m; y++) for (let x = X0 - m; x < X0 + cw + 4 * m; x++) g[y * ANCHO_D + x] = 200 + rnd() * 20;
  // Código girado GIRO_CODIGO grados sobre su centro (mapeo inverso, vecino más próximo).
  const rad = (GIRO_CODIGO * Math.PI) / 180;
  const cx = X0 + cw / 2;
  const cy = Y0 + ch / 2;
  for (let y = Y0 - m; y < Y0 + ch + m; y++) {
    for (let x = X0 - m; x < X0 + cw + m; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const u = dx * Math.cos(rad) + dy * Math.sin(rad) + cw / 2;
      const v = -dx * Math.sin(rad) + dy * Math.cos(rad) + ch / 2;
      if (u < 0 || v < 0 || u >= cw || v >= ch) continue;
      const sx = Math.floor((u * c.width) / cw);
      const sy = Math.floor((v * c.height) / ch);
      if ((c.data[(sy * c.width + sx) * 4] as number) < 128) g[y * ANCHO_D + x] = 50;
    }
  }
  const data = new Uint8ClampedArray(ANCHO_D * ALTO_D * 4);
  for (let i = 0; i < g.length; i++) {
    const v = g[i] as number;
    data[i * 4] = v * 1.1;
    data[i * 4 + 1] = v * 0.95;
    data[i * 4 + 2] = v * 0.6;
    data[i * 4 + 3] = 255;
  }
  return { data, width: ANCHO_D, height: ALTO_D, fraccionCodigo: (cw * ch) / (ANCHO_D * ALTO_D) };
}

/** Gira 90° en sentido antihorario (lo que la cámara guarda cuando la etiqueta EXIF dice 6). */
export function girarAntihorario(p: PixelesRgba): PixelesRgba {
  const w = p.height;
  const h = p.width;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Destino (x, y) <- origen (W-1-y, x) con W = p.width.
      const o = (x * p.width + (p.width - 1 - y)) * 4;
      const d = (y * w + x) * 4;
      data[d] = p.data[o] as number;
      data[d + 1] = p.data[o + 1] as number;
      data[d + 2] = p.data[o + 2] as number;
      data[d + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

/** Inserta un segmento APP1 Exif con la etiqueta Orientation tras el SOI de un JPEG. */
export function conOrientacionExif(jpeg: Uint8Array, orientacion: number): Uint8Array {
  const tiff = [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientacion, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const cuerpo = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const largo = cuerpo.length + 2;
  const app1 = [0xff, 0xe1, largo >> 8, largo & 0xff, ...cuerpo];
  const salida = new Uint8Array(jpeg.length + app1.length);
  salida.set(jpeg.subarray(0, 2), 0);
  salida.set(app1, 2);
  salida.set(jpeg.subarray(2), 2 + app1.length);
  return salida;
}

/** D-EXIF6: D guardada girada 90° antihorario como JPEG con Orientation = 6. */
export async function jpegDificilExif6(payload: Uint8Array): Promise<Uint8Array> {
  return conOrientacionExif(codificarJpeg(girarAntihorario(await pixelesDificiles(payload)), 92), 6);
}
