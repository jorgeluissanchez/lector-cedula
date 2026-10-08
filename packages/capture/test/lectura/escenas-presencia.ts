/**
 * Escenas sintéticas para OFF-22 (presencia de documento), en el frame de análisis de 640x360 que produce la PWA a
 * partir de 1920x1080: fondo gris 0x30, tarjeta escalada a la guía de CAM-08 (190, 54, 1541x972) con la luminancia
 * acotada a 40..200 (como e2e/videos/cedulas.mjs) y reducción 3x por promedio. Todo en memoria; datos de
 * @lector-cedula/fixtures (PERSONA_BASE). Nada de personas reales: la "cara" es un dibujo geométrico.
 */
import type { FrameAnalisis } from "../../src/calidad/tipos.js";

export interface Imagen {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

const W = 1920;
const H = 1080;
const GUIA = { x: 190, y: 54, ancho: 1541, alto: 972 };

function lienzo(fondo = 0x30): Uint8ClampedArray {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = fondo;
    d[i + 1] = fondo;
    d[i + 2] = fondo;
    d[i + 3] = 255;
  }
  return d;
}

/** Copia `img` escalada (vecino más cercano) en el rectángulo dado, con la luminancia acotada a 40..200. */
function pegar(d: Uint8ClampedArray, img: Imagen, r: { x: number; y: number; ancho: number; alto: number }): void {
  for (let y = 0; y < r.alto; y++) {
    const sy = Math.floor((y * img.height) / r.alto);
    for (let x = 0; x < r.ancho; x++) {
      const sx = Math.floor((x * img.width) / r.ancho);
      const o = (sy * img.width + sx) * 4;
      const i = ((r.y + y) * W + r.x + x) * 4;
      for (let c = 0; c < 3; c++) d[i + c] = 40 + ((img.data[o + c] as number) * 160) / 255;
    }
  }
}

/** Reducción 3x por promedio a 640x360 (frame de análisis). */
function reducir(d: Uint8ClampedArray): FrameAnalisis {
  const w = W / 3;
  const h = H / 3;
  const p = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        let s = 0;
        for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) s += d[((3 * y + dy) * W + 3 * x + dx) * 4 + c] as number;
        p[(y * w + x) * 4 + c] = Math.round(s / 9);
      }
    }
  }
  return { ancho: w, alto: h, pixeles: p, anchoOriginal: W, altoOriginal: H };
}

export function tarjetaEnGuia(img: Imagen): FrameAnalisis {
  const d = lienzo();
  pegar(d, img, GUIA);
  return reducir(d);
}

export function girar90(img: Imagen): Imagen {
  const { width: w, height: h } = img;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(img.data.subarray((y * w + x) * 4, (y * w + x) * 4 + 4), (x * h + (h - 1 - y)) * 4);
  return { data, width: h, height: w };
}

/** Tarjeta vertical centrada en la guía (alto de la guía), como `digital-girada-90-1080p`. */
export function tarjetaVerticalEnGuia(img: Imagen): FrameAnalisis {
  const d = lienzo();
  const ancho = Math.round((img.width * GUIA.alto) / img.height);
  pegar(d, img, { x: Math.round((W - ancho) / 2), y: GUIA.y, ancho, alto: GUIA.alto });
  return reducir(d);
}

function dibujar(fondo: number, f: (x: number, y: number) => number | null): FrameAnalisis {
  const d = lienzo(fondo);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = f(x, y);
      if (v === null) continue;
      const i = (y * W + x) * 4;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
    }
  }
  return reducir(d);
}

/** Ruido determinista (mulberry32). */
function prng(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** "Cara": óvalo de piel con ojos, cejas, nariz, boca y pelo, sobre fondo medio. Dibujo geométrico, no una persona. */
export function cara(): FrameAnalisis {
  return dibujar(110, (x, y) => {
    const cx = 960;
    const cy = 560;
    const e = ((x - cx) / 330) ** 2 + ((y - cy) / 430) ** 2;
    if (e > 1) return y < 300 && ((x - cx) / 420) ** 2 + ((y - 380) / 330) ** 2 < 1 ? 40 : null;
    const ojo = (ox: number) => ((x - ox) / 55) ** 2 + ((y - 470) / 28) ** 2 < 1;
    if (ojo(840) || ojo(1080)) return 30;
    if (Math.abs(y - 410) < 10 && ((x > 780 && x < 900) || (x > 1020 && x < 1140))) return 50;
    if (((x - cx) / 120) ** 2 + ((y - 760) / 30) ** 2 < 1) return 90;
    if (Math.abs(x - cx) < 18 && y > 500 && y < 650) return 150;
    return 170;
  });
}

/** "Pared": textura de ruido suave y nítida, con una esquina de marco de puerta. */
export function pared(): FrameAnalisis {
  const r = prng(7);
  return dibujar(0, (x) => (x > 1500 && x < 1530 ? 60 : 140 + Math.round((r() - 0.5) * 50)));
}

/** "Hoja en blanco": rectángulo blanco con proporción ID-1 llenando la guía, sin contenido. */
export function hojaEnBlanco(): FrameAnalisis {
  return dibujar(0x30, (x, y) => (x >= GUIA.x && x < GUIA.x + GUIA.ancho && y >= GUIA.y && y < GUIA.y + GUIA.alto ? 200 : null));
}

/** "Texto cualquiera": hoja con renglones de palabras (rectángulos oscuros cortos), en la guía. */
export function texto(): FrameAnalisis {
  const r = prng(3);
  const palabras: [number, number, number][] = [];
  for (let fila = 0; fila < 18; fila++) {
    let x = GUIA.x + 60;
    while (x < GUIA.x + GUIA.ancho - 200) {
      const ancho = 40 + Math.floor(r() * 140);
      palabras.push([x, GUIA.y + 60 + fila * 48, ancho]);
      x += ancho + 25;
    }
  }
  return dibujar(0x30, (x, y) => {
    if (!(x >= GUIA.x && x < GUIA.x + GUIA.ancho && y >= GUIA.y && y < GUIA.y + GUIA.alto)) return null;
    for (const [px, py, pw] of palabras) if (x >= px && x < px + pw && y >= py && y < py + 22 && (x - px) % 14 < 10) return 50;
    return 200;
  });
}
