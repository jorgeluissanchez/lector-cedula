// Localización del PDF417 en fotos grandes (cambio localizar-pdf417-en-foto, LPI-09, LPI-11 y LPI-14):
// luminancia, recortes, banda de mayor densidad de bordes verticales y rejilla de ventanas. Todo en memoria.
import { reescalar, type Pixeles } from "./pixeles.js";

export interface Caja {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Luminancia BT.601 entera (R = G = B, A = 255). */
export function aGris(p: Pixeles): Pixeles {
  const data = new Uint8ClampedArray(p.data.length);
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.round((299 * (p.data[i] as number) + 587 * (p.data[i + 1] as number) + 114 * (p.data[i + 2] as number)) / 1000);
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  return { data, width: p.width, height: p.height };
}

export function recortar(p: Pixeles, c: Caja): Pixeles {
  const data = new Uint8ClampedArray(c.w * c.h * 4);
  for (let y = 0; y < c.h; y++) {
    const o = ((c.y + y) * p.width + c.x) * 4;
    data.set(p.data.subarray(o, o + c.w * 4), y * c.w * 4);
  }
  return { data, width: c.w, height: c.h };
}

const LADO_REDUCIDO = 1024;
const CELDA = 16;
const UMBRAL_BORDE = 32;

/**
 * Caja (en coordenadas de `p`) de la región conectada con mayor densidad de bordes verticales, con margen del 10 %
 * por lado (mínimo 2 celdas). `null` si la imagen no tiene bordes.
 */
export function cajaBanda(p: Pixeles): Caja | null {
  const f = Math.min(1, LADO_REDUCIDO / Math.max(p.width, p.height));
  const r = f < 1 ? reescalar(p, f) : p;
  const cw = Math.ceil(r.width / CELDA);
  const chh = Math.ceil(r.height / CELDA);
  const densidad = new Float64Array(cw * chh);
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x + 1 < r.width; x++) {
      const o = (y * r.width + x) * 4;
      if (Math.abs((r.data[o + 4] as number) - (r.data[o] as number)) >= UMBRAL_BORDE) {
        const k = Math.floor(y / CELDA) * cw + Math.floor(x / CELDA);
        densidad[k] = (densidad[k] as number) + 1;
      }
    }
  }
  let max = 0;
  let inicio = -1;
  for (let k = 0; k < densidad.length; k++) {
    if ((densidad[k] as number) > max) {
      max = densidad[k] as number;
      inicio = k;
    }
  }
  if (inicio < 0) return null;
  // Crecimiento 4-conexo sobre celdas con al menos la mitad de la densidad máxima.
  const visto = new Uint8Array(densidad.length);
  const pila = [inicio];
  visto[inicio] = 1;
  let [x0, y0, x1, y1] = [inicio % cw, Math.floor(inicio / cw), inicio % cw, Math.floor(inicio / cw)];
  while (pila.length > 0) {
    const k = pila.pop() as number;
    const cx = k % cw;
    const cy = Math.floor(k / cw);
    x0 = Math.min(x0, cx);
    x1 = Math.max(x1, cx);
    y0 = Math.min(y0, cy);
    y1 = Math.max(y1, cy);
    for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]] as const) {
      if (nx < 0 || ny < 0 || nx >= cw || ny >= chh) continue;
      const n = ny * cw + nx;
      if (visto[n] === 0 && (densidad[n] as number) >= max / 2) {
        visto[n] = 1;
        pila.push(n);
      }
    }
  }
  const mx = Math.max(2, Math.ceil((x1 - x0 + 1) * 0.1));
  const my = Math.max(2, Math.ceil((y1 - y0 + 1) * 0.1));
  const a = Math.max(0, Math.floor(((x0 - mx) * CELDA) / f));
  const b = Math.max(0, Math.floor(((y0 - my) * CELDA) / f));
  const c = Math.min(p.width, Math.ceil(((x1 + 1 + mx) * CELDA) / f));
  const d = Math.min(p.height, Math.ceil(((y1 + 1 + my) * CELDA) / f));
  return { x: a, y: b, w: c - a, h: d - b };
}

/** Posiciones de inicio con paso de media ventana; la última alineada al borde. */
function posiciones(total: number, lado: number): number[] {
  const r: number[] = [];
  const paso = Math.max(1, Math.round(lado / 2));
  for (let v = 0; v + lado < total; v += paso) r.push(v);
  if (r[r.length - 1] !== total - lado) r.push(total - lado);
  return r;
}

export const TAMANOS_VENTANA = [0.7, 0.5, 0.35] as const;

/** Ventanas de la rejilla para un tamaño relativo, por filas y luego columnas. */
export function ventanas(ancho: number, alto: number, tamano: number): Caja[] {
  const w = Math.max(1, Math.round(ancho * tamano));
  const h = Math.max(1, Math.round(alto * tamano));
  const r: Caja[] = [];
  for (const y of posiciones(alto, h)) for (const x of posiciones(ancho, w)) r.push({ x, y, w, h });
  return r;
}
