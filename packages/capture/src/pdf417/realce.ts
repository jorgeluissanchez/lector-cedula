// Realce del PDF417 en frames de video (pwa-lectura-offline, OFF-28): ampliación bilineal del recorte y estiramiento
// de contraste por percentiles con enfoque (unsharp mask). Entrada y salida en gris RGBA; todo en memoria.
import type { Pixeles } from "./pixeles.js";

function luma(p: Pixeles): Float32Array {
  const l = new Float32Array(p.width * p.height);
  for (let i = 0; i < l.length; i++) l[i] = p.data[i * 4] as number;
  return l;
}

function aRgba(l: Float32Array, width: number, height: number): Pixeles {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < l.length; i++) {
    const v = l[i] as number;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

/** Amplía una imagen gris por `factor` (>= 1) con interpolación bilineal. */
export function ampliar(p: Pixeles, factor: number): Pixeles {
  const w = Math.max(1, Math.round(p.width * factor));
  const h = Math.max(1, Math.round(p.height * factor));
  const l = luma(p);
  const out = new Float32Array(w * h);
  const fx = p.width / w;
  const fy = p.height / h;
  for (let y = 0; y < h; y++) {
    const sy = Math.max(0, Math.min(p.height - 1, (y + 0.5) * fy - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(p.height - 1, y0 + 1);
    const ty = sy - y0;
    for (let x = 0; x < w; x++) {
      const sx = Math.max(0, Math.min(p.width - 1, (x + 0.5) * fx - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(p.width - 1, x0 + 1);
      const tx = sx - x0;
      const a = l[y0 * p.width + x0] as number;
      const b = l[y0 * p.width + x1] as number;
      const c = l[y1 * p.width + x0] as number;
      const d = l[y1 * p.width + x1] as number;
      out[y * w + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return aRgba(out, w, h);
}

/**
 * Estira el contraste entre los percentiles 2 y 98 y aplica un enfoque horizontal (las barras del PDF417 son
 * verticales): v + k (v - media de 2 radio + 1 píxeles en x). Devuelve una imagen gris nueva.
 */
export function realzar(p: Pixeles, k = 1, radio = 1): Pixeles {
  const l = luma(p);
  const hist = new Uint32Array(256);
  for (const v of l) hist[Math.round(v)] = (hist[Math.round(v)] as number) + 1;
  const total = l.length;
  let acum = 0;
  let bajo = -1;
  let alto = -1;
  for (let i = 0; i < 256; i++) {
    acum += hist[i] as number;
    if (bajo < 0 && acum > total * 0.02) bajo = i;
    if (alto < 0 && acum >= total * 0.98) alto = i;
  }
  const rango = Math.max(1, alto - bajo);
  const w = p.width;
  const out = new Float32Array(l.length);
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = l[i] as number;
      let suma = 0;
      for (let j = -radio; j <= radio; j++) suma += l[y * w + Math.min(w - 1, Math.max(0, x + j))] as number;
      const media = suma / (2 * radio + 1);
      out[i] = (((v + k * (v - media)) - bajo) * 255) / rango;
    }
  }
  return aRgba(out, w, p.height);
}
