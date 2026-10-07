// Paso de bytes PNG/JPEG o ImageData a píxeles RGBA y reescalado por promedio de área (spec lectura-pdf417-imagen,
// LPI-02 y LPI-03). Todo en memoria: nada se escribe a disco. Aplica la orientación EXIF del JPEG (LPI-10).
import { aplicarOrientacion, orientacionExif } from "./orientacion.js";

/** Píxeles RGBA con la forma de `ImageData` (sirve también en Node, donde `ImageData` no existe). */
export interface Pixeles {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/** Decodificador de bytes de imagen a píxeles; devuelve `null` si los bytes no son una imagen legible. */
export type DecodificadorPixeles = (bytes: Uint8Array) => Promise<Pixeles | null>;

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const FIRMA_JPEG = [0xff, 0xd8, 0xff];

function empiezaPor(bytes: Uint8Array, firma: readonly number[]): boolean {
  return bytes.length >= firma.length && firma.every((b, i) => bytes[i] === b);
}

export function tipoImagen(bytes: Uint8Array): "png" | "jpeg" | null {
  if (empiezaPor(bytes, FIRMA_PNG)) return "png";
  if (empiezaPor(bytes, FIRMA_JPEG)) return "jpeg";
  return null;
}

/** `true` si `x` tiene la forma de un `ImageData` RGBA coherente. */
export function esPixeles(x: unknown): x is Pixeles {
  if (typeof x !== "object" || x === null) return false;
  const { data, width, height } = x as Record<string, unknown>;
  return (
    data instanceof Uint8ClampedArray &&
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    (width as number) > 0 &&
    (height as number) > 0 &&
    data.length === (width as number) * (height as number) * 4
  );
}

function enNode(): boolean {
  const p = (globalThis as { process?: { versions?: { node?: string } } }).process;
  return typeof p?.versions?.node === "string" && !("window" in globalThis);
}

// Especificadores en variables para que el empaquetador del navegador no intente resolver módulos solo de Node.
const MODULO_PNG = "pngjs";
const MODULO_JPEG = "jpeg-js";

async function decodificarEnNode(bytes: Uint8Array, tipo: "png" | "jpeg"): Promise<Pixeles> {
  if (tipo === "png") {
    const { PNG } = (await import(/* @vite-ignore */ MODULO_PNG)) as typeof import("pngjs");
    const png = PNG.sync.read(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    return { data: new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.byteLength), width: png.width, height: png.height };
  }
  const jpeg = ((await import(/* @vite-ignore */ MODULO_JPEG)) as { default: typeof import("jpeg-js") }).default;
  const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  const p = { data: new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength), width: img.width, height: img.height };
  return aplicarOrientacion(p, orientacionExif(bytes));
}

async function decodificarEnNavegador(bytes: Uint8Array): Promise<Pixeles> {
  const mapa = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>]), { imageOrientation: "from-image" });
  const lienzo = new OffscreenCanvas(mapa.width, mapa.height);
  const ctx = lienzo.getContext("2d");
  if (ctx === null) throw new Error("sin contexto 2d");
  ctx.drawImage(mapa, 0, 0);
  mapa.close();
  return ctx.getImageData(0, 0, lienzo.width, lienzo.height);
}

/** Decodificador por defecto: pngjs/jpeg-js en Node, `createImageBitmap` en el navegador. */
export const decodificarPixeles: DecodificadorPixeles = async (bytes) => {
  const tipo = tipoImagen(bytes);
  if (tipo === null) return null;
  try {
    const p = enNode() ? await decodificarEnNode(bytes, tipo) : await decodificarEnNavegador(bytes);
    return esPixeles(p) ? p : null;
  } catch {
    return null;
  }
};

/** Reescala `p` por `factor` (lados con `Math.round`) promediando el área de origen de cada píxel destino. */
export function reescalar(p: Pixeles, factor: number): Pixeles {
  const w = Math.max(1, Math.round(p.width * factor));
  const h = Math.max(1, Math.round(p.height * factor));
  const data = new Uint8ClampedArray(w * h * 4);
  const fx = p.width / w;
  const fy = p.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * fy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * fx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const o = (sy * p.width + sx) * 4;
          r += p.data[o] as number;
          g += p.data[o + 1] as number;
          b += p.data[o + 2] as number;
          a += p.data[o + 3] as number;
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      const d = (y * w + x) * 4;
      data[d] = r / n;
      data[d + 1] = g / n;
      data[d + 2] = b / n;
      data[d + 3] = a / n;
    }
  }
  return { data, width: w, height: h };
}

/**
 * Gira `p` `grados` sobre su centro (positivo en sentido horario con el eje y hacia abajo, como canvas 2D), con el
 * mismo tamaño, interpolación bilineal y fondo blanco fuera de la imagen original. Devuelve gris opaco (la luminancia
 * que zxing-cpp usaría de todos modos), lo que reduce a una sola interpolación por pixel.
 */
export function girar(p: Pixeles, grados: number): Pixeles {
  const { width: w, height: h } = p;
  const luma = new Float32Array(w * h);
  for (let i = 0; i < luma.length; i++) {
    const o = i * 4;
    luma[i] = (306 * (p.data[o] as number) + 601 * (p.data[o + 1] as number) + 117 * (p.data[o + 2] as number)) / 1024;
  }
  const data = new Uint8ClampedArray(w * h * 4);
  const rad = (grados * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) {
    const dy = y - cy;
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const sx = cx + dx * cos + dy * sin;
      const sy = cy - dx * sin + dy * cos;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const dentroX0 = x0 >= 0 && x0 < w;
      const dentroX1 = x0 + 1 >= 0 && x0 + 1 < w;
      const dentroY0 = y0 >= 0 && y0 < h;
      const dentroY1 = y0 + 1 >= 0 && y0 + 1 < h;
      const a = dentroX0 && dentroY0 ? (luma[y0 * w + x0] as number) : 255;
      const b = dentroX1 && dentroY0 ? (luma[y0 * w + x0 + 1] as number) : 255;
      const c = dentroX0 && dentroY1 ? (luma[(y0 + 1) * w + x0] as number) : 255;
      const d = dentroX1 && dentroY1 ? (luma[(y0 + 1) * w + x0 + 1] as number) : 255;
      const v = Math.round((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy);
      const o = (y * w + x) * 4;
      data[o] = v;
      data[o + 1] = v;
      data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}
