/**
 * Primitivas de imagen propias (design.md, decisión 2): FFT 2D radix-2, DCT 8x8 ortonormal, HSV y rectificación
 * por homografía. Sin dependencias.
 */
import type { FrameRGBA, Punto } from "../tipos.js";

/** FFT 1D in situ, radix-2 iterativa. `n` potencia de 2. */
export function fft1d(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] as number, re[i] as number];
      [im[i], im[j]] = [im[j] as number, im[i] as number];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = (re[b] as number) * cr - (im[b] as number) * ci;
        const xi = (re[b] as number) * ci + (im[b] as number) * cr;
        re[b] = (re[a] as number) - xr;
        im[b] = (im[a] as number) - xi;
        re[a] = (re[a] as number) + xr;
        im[a] = (im[a] as number) + xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** Magnitud de la FFT 2D de una imagen `n x n` (fila mayor). Devuelve un arreglo nuevo. */
export function magnitudFft2d(valores: Float64Array, n: number): Float64Array {
  const re = Float64Array.from(valores);
  const im = new Float64Array(n * n);
  const fr = new Float64Array(n);
  const fi = new Float64Array(n);
  for (let pase = 0; pase < 2; pase++) {
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const idx = pase === 0 ? a * n + b : b * n + a;
        fr[b] = re[idx] as number;
        fi[b] = im[idx] as number;
      }
      fft1d(fr, fi);
      for (let b = 0; b < n; b++) {
        const idx = pase === 0 ? a * n + b : b * n + a;
        re[idx] = fr[b] as number;
        im[idx] = fi[b] as number;
      }
    }
  }
  const mag = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) mag[i] = Math.hypot(re[i] as number, im[i] as number);
  return mag;
}

const C8 = (() => {
  const c = new Float64Array(64);
  for (let u = 0; u < 8; u++) {
    const a = u === 0 ? Math.SQRT1_2 : 1;
    for (let x = 0; x < 8; x++) c[u * 8 + x] = 0.5 * a * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  }
  return c;
})();

/** DCT-II 8x8 ortonormal (la de JPEG). Entrada y salida de 64 valores en fila mayor. */
export function dct8x8(bloque: ArrayLike<number>, salida = new Float64Array(64)): Float64Array {
  const tmp = new Float64Array(64);
  for (let y = 0; y < 8; y++)
    for (let u = 0; u < 8; u++) {
      let s = 0;
      for (let x = 0; x < 8; x++) s += (C8[u * 8 + x] as number) * (bloque[y * 8 + x] as number);
      tmp[y * 8 + u] = s;
    }
  for (let u = 0; u < 8; u++)
    for (let v = 0; v < 8; v++) {
      let s = 0;
      for (let y = 0; y < 8; y++) s += (C8[v * 8 + y] as number) * (tmp[y * 8 + u] as number);
      salida[v * 8 + u] = s;
    }
  return salida;
}

/** DCT-III 8x8 (inversa de `dct8x8`). */
export function idct8x8(coef: ArrayLike<number>, salida = new Float64Array(64)): Float64Array {
  const tmp = new Float64Array(64);
  for (let v = 0; v < 8; v++)
    for (let x = 0; x < 8; x++) {
      let s = 0;
      for (let u = 0; u < 8; u++) s += (C8[u * 8 + x] as number) * (coef[v * 8 + u] as number);
      tmp[v * 8 + x] = s;
    }
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      let s = 0;
      for (let v = 0; v < 8; v++) s += (C8[v * 8 + y] as number) * (tmp[v * 8 + x] as number);
      salida[y * 8 + x] = s;
    }
  return salida;
}

/** RGB 0-255 a HSV con h en [0,360), s y v en [0,1]. */
export function rgbAHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d + 6) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return [h, max === 0 ? 0 : d / max, max / 255];
}

/** Homografía que lleva el rectángulo [0,w]x[0,h] al cuadrilátero `q` (orden TL, TR, BR, BL). */
export function homografia(q: readonly Punto[], w: number, h: number): Float64Array {
  const src = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ] as const;
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i] as readonly [number, number];
    const { x: u, y: v } = q[i] as Punto;
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Eliminación gaussiana con pivoteo parcial.
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs((a[r] as number[])[c] as number) > Math.abs((a[p] as number[])[c] as number)) p = r;
    [a[c], a[p]] = [a[p] as number[], a[c] as number[]];
    const fila = a[c] as number[];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const otra = a[r] as number[];
      const f = (otra[c] as number) / (fila[c] as number);
      for (let k = c; k < 9; k++) otra[k] = (otra[k] as number) - f * (fila[k] as number);
    }
  }
  const hm = new Float64Array(9);
  for (let i = 0; i < 8; i++) hm[i] = ((a[i] as number[])[8] as number) / ((a[i] as number[])[i] as number);
  hm[8] = 1;
  return hm;
}

/** Imagen RGB en coma flotante, planos separados. */
export interface ImagenRgb {
  ancho: number;
  alto: number;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
}

/**
 * Rectifica el cuadrilátero a `ancho` px manteniendo la relación de aspecto medida (interpolación bilineal).
 * Los píxeles fuera del frame se replican del borde.
 */
export function rectificar(frame: FrameRGBA, q: readonly Punto[], ancho: number, alto: number): ImagenRgb {
  const hm = homografia(q, ancho, alto);
  const n = ancho * alto;
  const out: ImagenRgb = { ancho, alto, r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n) };
  const { data, width: W, height: H } = frame;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const d = (hm[6] as number) * px + (hm[7] as number) * py + 1;
      let u = ((hm[0] as number) * px + (hm[1] as number) * py + (hm[2] as number)) / d - 0.5;
      let v = ((hm[3] as number) * px + (hm[4] as number) * py + (hm[5] as number)) / d - 0.5;
      u = Math.min(Math.max(u, 0), W - 1);
      v = Math.min(Math.max(v, 0), H - 1);
      const x0 = Math.floor(u);
      const y0 = Math.floor(v);
      const x1 = Math.min(x0 + 1, W - 1);
      const y1 = Math.min(y0 + 1, H - 1);
      const fx = u - x0;
      const fy = v - y0;
      const i00 = (y0 * W + x0) * 4;
      const i10 = (y0 * W + x1) * 4;
      const i01 = (y1 * W + x0) * 4;
      const i11 = (y1 * W + x1) * 4;
      const o = y * ancho + x;
      for (let c = 0; c < 3; c++) {
        const val =
          (data[i00 + c] as number) * (1 - fx) * (1 - fy) +
          (data[i10 + c] as number) * fx * (1 - fy) +
          (data[i01 + c] as number) * (1 - fx) * fy +
          (data[i11 + c] as number) * fx * fy;
        (c === 0 ? out.r : c === 1 ? out.g : out.b)[o] = val;
      }
    }
  }
  return out;
}

/** Lado medio horizontal y vertical del cuadrilátero, en px del frame. */
export function ladosCuadrilatero(q: readonly Punto[]): { ancho: number; alto: number } {
  const d = (a: Punto, b: Punto) => Math.hypot(a.x - b.x, a.y - b.y);
  const [tl, tr, br, bl] = q as [Punto, Punto, Punto, Punto];
  return { ancho: (d(tl, tr) + d(bl, br)) / 2, alto: (d(tl, bl) + d(tr, br)) / 2 };
}
