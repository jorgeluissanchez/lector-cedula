/**
 * Medidas de imagen para los detectores `pantalla`, `fotocopia`, `recorte` y `edicion` (FRA-07 a FRA-10).
 * Cada medida es un número crudo; la conversión a puntaje está en `detectores/puntajes.ts`.
 */
import { REGION_HOLOGRAMA_RELATIVA } from "../hipotesis.js";
import { tablaLuma } from "../imagen/jpeg.js";
import { dct8x8, fft1d as fft1dLocal, type ImagenRgb, ladosCuadrilatero, magnitudFft2d, rectificar, rgbAHsv } from "../imagen/primitivas.js";
import type { FrameRGBA, Punto } from "../tipos.js";

export const ANCHO_RECTIFICADO = 1024;
const N = 256;

export interface MedidasImagen {
  /** Pico de la diferencia cromática R-B en el eje horizontal (rejilla de subpíxeles). */
  subpixeles: number;
  /** Frecuencia horizontal del pico cromático, en ciclos por tesela de 256 px. */
  frecuenciaSubpixeles: number;
  /** Fracción de la tarjeta saturada (> 245 en los tres canales). */
  reflejo: number;
  /** Luminancia media del anillo exterior al cuadrilátero. */
  luzExterior: number;
  /** Pico periódico de la diferencia de perfiles de filas entre frames (null con un frame). */
  banding: number | null;
  /** Saturación media de la tarjeta. */
  saturacion: number;
  /** Percentil 20 de la desviación de bloques 8x8 (textura en zonas planas). */
  texturaPlana: number;
  /** Variación máxima del color medio de la región del holograma entre frames (null con menos de 3 frames). */
  holograma: number | null;
  /** Relación de aspecto del cuadrilátero. */
  aspecto: number;
  /** Esquinas rectas detectadas y esquinas decidibles. */
  esquinasRectas: number;
  esquinasDecidibles: number;
  /** Mayor grupo conexo de bloques 8x8 con firma de doble cuantización. */
  dobleCompresion: number;
}

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Pico relativo: máximo de `mag` en la zona `zona(fx, fy)` dividido por la mediana de la zona. */
function picoRelativo(mag: Float64Array, zona: (fx: number, fy: number) => boolean): { relativo: number; fx: number } {
  const vals: number[] = [];
  let max = 0;
  let enX = 0;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const fx = x < N / 2 ? x : x - N;
      const fy = y < N / 2 ? y : y - N;
      if (fy < 0 || !zona(fx, fy)) continue;
      const v = mag[y * N + x] as number;
      vals.push(v);
      if (v > max) {
        max = v;
        enX = Math.abs(fx);
      }
    }
  vals.sort((a, b) => a - b);
  const med = vals[vals.length >> 1] ?? 0;
  return { relativo: med > 0 ? max / med : 0, fx: enX };
}

function ventanaHann(): Float64Array {
  const w = new Float64Array(N);
  for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  return w;
}
const HANN = ventanaHann();

/** Recorte central `N x N` de un canal derivado, sin media y con ventana de Hann. */
function tesela(img: ImagenRgb, canal: (r: number, g: number, b: number) => number): Float64Array {
  const x0 = Math.max(0, (img.ancho >> 1) - N / 2);
  const y0 = Math.max(0, (img.alto >> 1) - N / 2);
  const t = new Float64Array(N * N);
  let s = 0;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const yy = Math.min(img.alto - 1, y0 + y);
      const xx = Math.min(img.ancho - 1, x0 + x);
      const i = yy * img.ancho + xx;
      const v = canal(img.r[i] as number, img.g[i] as number, img.b[i] as number);
      t[y * N + x] = v;
      s += v;
    }
  const media = s / (N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) t[y * N + x] = ((t[y * N + x] as number) - media) * (HANN[x] as number) * (HANN[y] as number);
  return t;
}

/** Saturación media y fracción saturada sobre el interior de la tarjeta (margen del 6 %). */
function color(img: ImagenRgb): { saturacion: number; reflejo: number } {
  let s = 0;
  let n = 0;
  let brillo = 0;
  const mx = Math.floor(img.ancho * 0.06);
  const my = Math.floor(img.alto * 0.06);
  for (let y = my; y < img.alto - my; y += 2)
    for (let x = mx; x < img.ancho - mx; x += 2) {
      const i = y * img.ancho + x;
      const r = img.r[i] as number;
      const g = img.g[i] as number;
      const b = img.b[i] as number;
      s += rgbAHsv(r, g, b)[1];
      if (r > 245 && g > 245 && b > 245) brillo++;
      n++;
    }
  return { saturacion: n > 0 ? s / n : 0, reflejo: n > 0 ? brillo / n : 0 };
}

function texturaPlana(img: ImagenRgb): number {
  const stds: number[] = [];
  for (let by = 16; by + 8 < img.alto - 16; by += 8)
    for (let bx = 16; bx + 8 < img.ancho - 16; bx += 8) {
      let s = 0;
      let s2 = 0;
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          const i = (by + y) * img.ancho + bx + x;
          const v = luma(img.r[i] as number, img.g[i] as number, img.b[i] as number);
          s += v;
          s2 += v * v;
        }
      stds.push(Math.sqrt(Math.max(0, s2 / 64 - (s / 64) ** 2)));
    }
  stds.sort((a, b) => a - b);
  return stds[Math.floor(stds.length * 0.2)] ?? 0;
}

/** Punto del frame para coordenadas relativas (s, t) del cuadrilátero, con extrapolación bilineal. */
function puntoRelativo(q: readonly Punto[], s: number, t: number): Punto {
  const [a, b, c, d] = q as [Punto, Punto, Punto, Punto];
  const top = { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s };
  const bot = { x: d.x + (c.x - d.x) * s, y: d.y + (c.y - d.y) * s };
  return { x: top.x + (bot.x - top.x) * t, y: top.y + (bot.y - top.y) * t };
}

function muestra(f: FrameRGBA, p: Punto): [number, number, number] | null {
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  if (x < 0 || y < 0 || x >= f.width || y >= f.height) return null;
  const i = (y * f.width + x) * 4;
  return [f.data[i] as number, f.data[i + 1] as number, f.data[i + 2] as number];
}

function luzExterior(f: FrameRGBA, q: readonly Punto[]): number {
  let s = 0;
  let n = 0;
  for (let k = 0; k < 40; k++) {
    const a = (k + 0.5) / 40;
    for (const [ss, tt] of [
      [a, -0.04],
      [a, 1.04],
      [-0.03, a],
      [1.03, a],
    ] as const) {
      const c = muestra(f, puntoRelativo(q, ss, tt));
      if (c !== null) {
        s += luma(...c);
        n++;
      }
    }
  }
  return n > 0 ? s / n : 128;
}

const media3 = (img: ImagenRgb, x0: number, y0: number, x1: number, y1: number): [number, number, number] => {
  const m: [number, number, number] = [0, 0, 0];
  let n = 0;
  for (let y = Math.max(0, y0); y < Math.min(img.alto, y1); y++)
    for (let x = Math.max(0, x0); x < Math.min(img.ancho, x1); x++) {
      const i = y * img.ancho + x;
      m[0] += img.r[i] as number;
      m[1] += img.g[i] as number;
      m[2] += img.b[i] as number;
      n++;
    }
  return n > 0 ? [m[0] / n, m[1] / n, m[2] / n] : m;
};
const dist3 = (a: readonly number[], b: readonly number[]) => Math.hypot((a[0] as number) - (b[0] as number), (a[1] as number) - (b[1] as number), (a[2] as number) - (b[2] as number));

/** Esquinas: el cuadrado de lado 0,2 r de cada esquina es fondo en una tarjeta ID-1 redondeada y tarjeta si está recortada. */
function esquinas(img: ImagenRgb, f: FrameRGBA, q: readonly Punto[]): { rectas: number; decidibles: number } {
  const r = (3.18 / 85.6) * img.ancho;
  const k = Math.max(2, Math.floor(0.2 * r));
  let rectas = 0;
  let decidibles = 0;
  const W = img.ancho;
  const H = img.alto;
  const defs = [
    { sx: 0, sy: 0, fs: -0.02, ft: -0.03 },
    { sx: 1, sy: 0, fs: 1.02, ft: -0.03 },
    { sx: 1, sy: 1, fs: 1.02, ft: 1.03 },
    { sx: 0, sy: 1, fs: -0.02, ft: 1.03 },
  ];
  for (const d of defs) {
    const cx0 = d.sx === 0 ? 1 : W - 1 - k;
    const cy0 = d.sy === 0 ? 1 : H - 1 - k;
    const esquina = media3(img, cx0, cy0, cx0 + k, cy0 + k);
    const bx0 = d.sx === 0 ? Math.ceil(1.3 * r) : W - Math.ceil(1.3 * r) - 2 * k;
    const borde = media3(img, bx0, cy0, bx0 + 2 * k, cy0 + k);
    const fuera = muestra(f, puntoRelativo(q, d.sx === 0 ? 0.02 : 0.98, d.ft));
    const fuera2 = muestra(f, puntoRelativo(q, d.fs, d.sy === 0 ? 0.03 : 0.97));
    if (fuera === null || fuera2 === null) continue;
    const fondo = [(fuera[0] + fuera2[0]) / 2, (fuera[1] + fuera2[1]) / 2, (fuera[2] + fuera2[2]) / 2];
    const separacion = dist3(borde, fondo);
    if (separacion < 25) continue;
    decidibles++;
    if (dist3(esquina, borde) < dist3(esquina, fondo)) rectas++;
  }
  return { rectas, decidibles };
}

/** Perfil de filas (media de luminancia de la mitad izquierda) por frame a resolución reducida. */
function banding(frames: readonly FrameRGBA[], q: readonly Punto[], ancho: number, alto: number): number | null {
  if (frames.length < 2) return null;
  const perfiles = frames.map((f) => {
    const img = rectificar(f, q, ancho, alto);
    const p = new Float64Array(alto);
    const x1 = Math.floor(ancho * 0.55);
    for (let y = 0; y < alto; y++) {
      let s = 0;
      for (let x = 0; x < x1; x++) {
        const i = y * ancho + x;
        s += luma(img.r[i] as number, img.g[i] as number, img.b[i] as number);
      }
      p[y] = s / x1;
    }
    return p;
  });
  let mejor = 0;
  const L = 256;
  for (let k = 1; k < perfiles.length; k++) {
    const re = new Float64Array(L);
    const im = new Float64Array(L);
    for (let y = 0; y < Math.min(alto, L); y++) re[y] = ((perfiles[k] as Float64Array)[y] as number) - ((perfiles[k - 1] as Float64Array)[y] as number);
    let s = 0;
    for (let y = 0; y < Math.min(alto, L); y++) s += re[y] as number;
    const media = s / Math.min(alto, L);
    for (let y = 0; y < Math.min(alto, L); y++) re[y] = ((re[y] as number) - media) * (0.5 - 0.5 * Math.cos((2 * Math.PI * y) / (Math.min(alto, L) - 1)));
    fft1dLocal(re, im);
    const mags: number[] = [];
    let max = 0;
    for (let i = 4; i < L / 2; i++) {
      const m = Math.hypot(re[i] as number, im[i] as number);
      mags.push(m);
      if (m > max) max = m;
    }
    mags.sort((a, b) => a - b);
    const med = mags[mags.length >> 1] ?? 0;
    // Exige amplitud absoluta (al menos ~1 nivel de gris) además del pico relativo.
    const rel = med > 0 ? max / med : 0;
    if (max > 40) mejor = Math.max(mejor, rel);
  }
  return mejor;
}


function holograma(frames: readonly FrameRGBA[], q: readonly Punto[]): number | null {
  if (frames.length < 3) return null;
  const R = REGION_HOLOGRAMA_RELATIVA;
  const medias = frames.map((f) => {
    const m: [number, number, number] = [0, 0, 0];
    let n = 0;
    for (let a = 0; a < 12; a++)
      for (let b = 0; b < 8; b++) {
        const c = muestra(f, puntoRelativo(q, R.s0 + ((R.s1 - R.s0) * (a + 0.5)) / 12, R.t0 + ((R.t1 - R.t0) * (b + 0.5)) / 8));
        if (c === null) continue;
        m[0] += c[0];
        m[1] += c[1];
        m[2] += c[2];
        n++;
      }
    return n > 0 ? m.map((x) => x / n) : m;
  });
  let max = 0;
  for (let i = 0; i < medias.length; i++) for (let j = i + 1; j < medias.length; j++) max = Math.max(max, dist3(medias[i] as number[], medias[j] as number[]));
  return max;
}

/** Firma de doble cuantización por bloque sobre la rejilla del frame (FRA-10). */
function dobleCompresion(f: FrameRGBA, q: readonly Punto[]): number {
  const xs = q.map((p) => p.x);
  const ys = q.map((p) => p.y);
  const x0 = Math.max(0, Math.ceil(Math.min(...xs) / 8) * 8 + 16);
  const y0 = Math.max(0, Math.ceil(Math.min(...ys) / 8) * 8 + 16);
  const x1 = Math.min(f.width - 8, Math.floor(Math.max(...xs) / 8) * 8 - 16);
  const y1 = Math.min(f.height - 8, Math.floor(Math.max(...ys) / 8) * 8 - 16);
  if (x1 <= x0 || y1 <= y0) return 0;
  const bw = (x1 - x0) / 8;
  const bh = (y1 - y0) / 8;
  const coefs: Float64Array[] = [];
  const bloque = new Float64Array(64);
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          const i = ((y0 + by * 8 + y) * f.width + x0 + bx * 8 + x) * 4;
          bloque[y * 8 + x] = luma(f.data[i] as number, f.data[i + 1] as number, f.data[i + 2] as number) - 128;
        }
      coefs.push(dct8x8(bloque));
    }
  const K: number[] = [];
  for (let v = 0; v < 4; v++) for (let u = 0; u < 4; u++) if (u + v > 0 && u + v <= 3) K.push(v * 8 + u);
  let mejor = 0;
  for (let calidad = 50; calidad <= 85; calidad += 5) {
    const t = tablaLuma(calidad);
    const marcado = new Uint8Array(coefs.length);
    let total = 0;
    let evaluables = 0;
    coefs.forEach((c, idx) => {
      let s = 0;
      let n = 0;
      for (const k of K) {
        const paso = t[k] as number;
        const val = (c[k] as number) / paso;
        if (Math.abs(val) < 0.5) continue;
        s += Math.abs(val - Math.round(val));
        n++;
      }
      if (n >= 5) {
        evaluables++;
        if (s / n < 0.12) {
          marcado[idx] = 1;
          total++;
        }
      }
    });
    if (evaluables === 0 || total / evaluables > 0.5) continue;
    // Mayor componente conexa (vecindad 4).
    const visto = new Uint8Array(coefs.length);
    for (let i = 0; i < coefs.length; i++) {
      if (marcado[i] !== 1 || visto[i] === 1) continue;
      let tam = 0;
      const pila = [i];
      visto[i] = 1;
      while (pila.length > 0) {
        const j = pila.pop() as number;
        tam++;
        const jx = j % bw;
        const jy = (j - jx) / bw;
        for (const [nx, ny] of [
          [jx + 1, jy],
          [jx - 1, jy],
          [jx, jy + 1],
          [jx, jy - 1],
        ] as const) {
          if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
          const n = ny * bw + nx;
          if (marcado[n] === 1 && visto[n] === 0) {
            visto[n] = 1;
            pila.push(n);
          }
        }
      }
      mejor = Math.max(mejor, tam);
    }
  }
  return mejor;
}

/** Calcula todas las medidas. Lanza solo ante entradas incoherentes que el llamador ya validó. */
export function medirImagen(frames: readonly FrameRGBA[], q: readonly Punto[], conHolograma: boolean): MedidasImagen {
  const f0 = frames[0] as FrameRGBA;
  const lados = ladosCuadrilatero(q);
  const aspecto = lados.alto > 0 ? lados.ancho / lados.alto : 0;
  const altoRect = Math.max(N, Math.round(ANCHO_RECTIFICADO / Math.max(aspecto, 0.5)));
  const img = rectificar(f0, q, ANCHO_RECTIFICADO, Math.min(altoRect, 2048));
  const magC = magnitudFft2d(tesela(img, (r, _g, b) => r - b), N);
  const pico = picoRelativo(magC, (fx, fy) => Math.abs(fy) <= 4 && Math.abs(fx) >= N / 8);
  const { saturacion, reflejo } = color(img);
  const esq = esquinas(img, f0, q);
  return {
    subpixeles: pico.relativo,
    frecuenciaSubpixeles: pico.fx,
    reflejo,
    luzExterior: luzExterior(f0, q),
    banding: banding(frames, q, 256, Math.max(64, Math.round(256 / Math.max(aspecto, 0.5)))),
    saturacion,
    texturaPlana: texturaPlana(img),
    holograma: conHolograma ? holograma(frames, q) : null,
    aspecto,
    esquinasRectas: esq.rectas,
    esquinasDecidibles: esq.decidibles,
    dobleCompresion: dobleCompresion(f0, q),
  };
}
