// Frame sintético "de video real" de la cédula amarilla (pwa-lectura-offline, OFF-28): 1920x1080, tarjeta amarilla en
// la guía con el PDF417 en la mitad inferior a ~2 px por módulo, contraste reducido, giro leve, desenfoque gaussiano y
// compresión JPEG, como un frame de una cámara de celular. Datos SINTÉTICOS (generarPdf417); todo en memoria.
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { writeBarcode } from "zxing-wasm/writer";
import { prepararZxing, type PixelesRgba } from "./sintetica.js";

export interface OpcionesVideo {
  /** Píxeles por módulo del PDF417 (ancho de la barra más fina). */
  readonly modulo: number;
  /** Desviación del desenfoque gaussiano en píxeles; 0 sin desenfoque. */
  readonly sigma: number;
  /** Calidad JPEG 1..100; `null` sin compresión. */
  readonly calidadJpeg: number | null;
  /** Giro del código en grados. */
  readonly giro?: number;
  /** Desplazamiento de la tarjeta en x (simula la variación entre frames consecutivos). */
  readonly desplazamiento?: number;
  /** Barras verticales aleatorias del mismo tamaño en lugar del PDF417 (no forman un símbolo). */
  readonly barrasFalsas?: boolean;
}

export const ANCHO_VIDEO = 1920;
export const ALTO_VIDEO = 1080;

function desenfocar(g: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const r = Math.ceil(3 * sigma);
  const k: number[] = [];
  let total = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k.push(v);
    total += v;
  }
  const pasada = (src: Float32Array, horizontal: boolean): Float32Array => {
    const out = new Float32Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let i = -r; i <= r; i++) {
          const xx = horizontal ? Math.min(w - 1, Math.max(0, x + i)) : x;
          const yy = horizontal ? y : Math.min(h - 1, Math.max(0, y + i));
          s += (k[i + r] as number) * (src[yy * w + xx] as number);
        }
        out[y * w + x] = s / total;
      }
    }
    return out;
  };
  return pasada(pasada(g, true), false);
}

/** Frame RGBA de 1920x1080 con la amarilla sintética degradada como un frame de video. */
export async function frameVideoAmarilla(payload: Uint8Array, o: OpcionesVideo): Promise<PixelesRgba> {
  await prepararZxing();
  const escrito = await writeBarcode(payload, { format: "PDF417" });
  if (escrito.image === null) throw new Error(`writer: ${escrito.error}`);
  const c = PNG.sync.read(Buffer.from(await escrito.image.arrayBuffer()));
  // Módulo del writer: ancho de la primera barra negra de la fila central.
  const fila = Math.floor(c.height / 2);
  let x = 0;
  while (x < c.width && (c.data[(fila * c.width + x) * 4] as number) >= 128) x++;
  let n = 0;
  while (x + n < c.width && (c.data[(fila * c.width + x + n) * 4] as number) < 128) n++;
  const moduloWriter = n / 8; // patrón de inicio: barra de 8 módulos
  const f = o.modulo / moduloWriter;
  const cw = Math.round(c.width * f);
  const ch = Math.round(c.height * f);
  const w = ANCHO_VIDEO;
  const h = ALTO_VIDEO;
  const g = new Float32Array(w * h);
  // Fondo de mesa con gradiente.
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) g[y * w + xx] = 60 + (xx / w) * 40;
  const dx0 = o.desplazamiento ?? 0;
  const tx = Math.round((w - Math.max(cw + 120, 1100)) / 2) + dx0;
  const tw = Math.max(cw + 120, 1100);
  const th = Math.round(tw / 1.585);
  const ty = Math.round((h - th) / 2);
  for (let y = ty; y < ty + th; y++) for (let xx = tx; xx < tx + tw; xx++) g[y * w + xx] = 190 + ((xx - tx) / tw) * 25;
  const cx0 = tx + Math.round((tw - cw) / 2);
  const cy0 = ty + th - ch - 40;
  const rad = ((o.giro ?? 0) * Math.PI) / 180;
  const ccx = cx0 + cw / 2;
  const ccy = cy0 + ch / 2;
  // Módulos aleatorios reproducibles (generador congruencial, semilla fija).
  let semilla = 7;
  const falsas = Array.from({ length: Math.ceil(cw / o.modulo) + 1 }, () => ((semilla = (Math.imul(semilla, 1103515245) + 12345) >>> 0) >>> 16) & 1);
  for (let y = cy0 - 20; y < cy0 + ch + 20; y++) {
    for (let xx = cx0 - 20; xx < cx0 + cw + 20; xx++) {
      const ddx = xx - ccx;
      const ddy = y - ccy;
      const u = ddx * Math.cos(rad) + ddy * Math.sin(rad) + cw / 2;
      const v = -ddx * Math.sin(rad) + ddy * Math.cos(rad) + ch / 2;
      if (u < 0 || v < 0 || u >= cw || v >= ch) continue;
      const sx = Math.min(c.width - 1, Math.floor(u / f));
      const sy = Math.min(c.height - 1, Math.floor(v / f));
      const negro = o.barrasFalsas === true ? falsas[Math.floor(u / o.modulo)] === 1 : (c.data[(sy * c.width + sx) * 4] as number) < 128;
      if (negro) g[y * w + xx] = 75;
    }
  }
  const s = o.sigma > 0 ? desenfocar(g, w, h, o.sigma) : g;
  let data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < s.length; i++) {
    const v = s[i] as number;
    data[i * 4] = v * 1.08;
    data[i * 4 + 1] = v * 0.98;
    data[i * 4 + 2] = v * 0.62;
    data[i * 4 + 3] = 255;
  }
  if (o.calidadJpeg !== null) {
    const codificado = jpeg.encode({ data: Buffer.from(data.buffer), width: w, height: h }, o.calidadJpeg);
    data = new Uint8ClampedArray(jpeg.decode(codificado.data, { useTArray: true, formatAsRGBA: true }).data);
  }
  return { data, width: w, height: h };
}
