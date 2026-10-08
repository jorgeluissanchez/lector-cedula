/**
 * Presencia de documento antes de `listo` (pwa-lectura-offline, OFF-22). Puro y rápido (frame de análisis de 640 px):
 * 1. Tarjeta: líneas rectas largas (bordes) alrededor de la guía cuyo rectángulo exterior tiene proporción ID-1,
 *    horizontal o vertical.
 * 2. Contenido: patrón PDF417 (muchas columnas con bordes verticales largos) o franja MRZ (evidencia de LMI-14 con
 *    `localizarConEvidencia`, también girada 90 y 270 si la tarjeta está vertical).
 * Sin las dos señales el frame no puede pasar a `listo`: la calidad se limita por debajo del umbral con motivo `acerca`.
 */
import { PROPORCION_ID1 } from "../flujo/guia.js";
import { girar, localizarConEvidencia, type PixelesRgba } from "../mrz/localizar.js";
import type { Cuadrilatero, FrameAnalisis, ResultadoCalidad } from "./tipos.js";

/** Salto de luminancia que cuenta como borde. */
const UMBRAL_BORDE = 24;
/** Fracción del lado del recorte que debe cubrir una línea para contar como borde de tarjeta. */
const FRACCION_LINEA = 0.3;
/** Tolerancia relativa de la proporción ID-1. */
const TOLERANCIA_PROPORCION = 0.2;
/** Margen alrededor de la guía (fracción de su lado). */
const MARGEN = 0.06;
/** PDF417 (calibrado con la amarilla sintética: 20 % de bloques; texto 7 %, MRZ 4 %, hoja lisa 2 %). */
const BLOQUE = 8;
const BORDE_MEDIO_PDF417 = 12;
const RELACION_DX_DY = 3;
const FRACCION_BLOQUES_PDF417 = 0.12;
/** MRZ: la franja inferior es un único trío de líneas (1 a 6 ventanas con trío); una hoja de texto da decenas. */
const MAX_VENTANAS_MRZ = 6;
const EVIDENCIA_MINIMA_MRZ = 0.6;
/**
 * PDF417 suave (OFF-22 tras el reporte del 2026-10-07): con desenfoque, ruido y JPEG las barras pierden contraste y
 * los bloques ya no cumplen el patrón nítido. Un bloque cuenta si su borde vertical medio es >= 1,5, la energía
 * horizontal es 1,5 veces la vertical y todas sus filas de píxeles tienen al menos la mitad de la energía horizontal
 * media (las barras cruzan todas las filas; los renglones de texto dejan filas vacías). Calibrado con las sintéticas
 * degradadas: amarilla 17 a 28 % de bloques, texto y hoja 1,5 a 2,2 %, digital 3 a 14 % (solo se mira sin MRZ).
 */
const BORDE_MEDIO_SUAVE = 1.5;
const RELACION_DX_DY_SUAVE = 1.5;
const ENERGIA_FILA_SUAVE = 0.5;
const FRACCION_BLOQUES_SUAVE = 0.08;
/** Distancia en píxeles de la diferencia que detecta los bordes de la tarjeta: tolera un borde desenfocado. */
const PASO_BORDE = 2;
/**
 * OFF-25: varianza del Laplaciano por debajo de la cual el frame se descarta aunque haya cédula (desenfoque extremo o
 * movimiento). Calibración en docs/decisiones/2026-10-07-captura-guiada-nitidez.md.
 */
export const LAPLACIANO_MINIMO_GUIADO = 12;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly ancho: number;
  readonly alto: number;
}

export interface Presencia {
  readonly tarjeta: Rect | null;
  readonly contenido: "pdf417" | "mrz" | null;
  readonly presente: boolean;
}

function lumas(f: FrameAnalisis, r: Rect): Uint8Array {
  const l = new Uint8Array(r.ancho * r.alto);
  for (let y = 0; y < r.alto; y++) {
    for (let x = 0; x < r.ancho; x++) {
      const i = ((r.y + y) * f.ancho + r.x + x) * 4;
      l[y * r.ancho + x] = ((f.pixeles[i] as number) * 77 + (f.pixeles[i + 1] as number) * 150 + (f.pixeles[i + 2] as number) * 29) >> 8;
    }
  }
  return l;
}

function recorteGuia(f: FrameAnalisis, guia: Cuadrilatero): Rect {
  const xs = guia.map((p) => p[0]);
  const ys = guia.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0;
  const h = Math.max(...ys) - y0;
  const x = Math.max(0, Math.floor(x0 - MARGEN * w));
  const y = Math.max(0, Math.floor(y0 - MARGEN * h));
  const x1 = Math.min(f.ancho, Math.ceil(x0 + w + MARGEN * w));
  const y1 = Math.min(f.alto, Math.ceil(y0 + h + MARGEN * h));
  return { x, y, ancho: x1 - x, alto: y1 - y };
}

/** Rectángulo exterior de las líneas rectas largas del recorte, si tiene proporción ID-1. */
export function buscarTarjeta(l: Uint8Array, w: number, h: number): Rect | null {
  const col = new Uint32Array(w);
  const fila = new Uint32Array(h);
  for (let y = 0; y + PASO_BORDE < h; y++) {
    for (let x = 0; x + PASO_BORDE < w; x++) {
      const v = l[y * w + x] as number;
      if (Math.abs(v - (l[y * w + x + PASO_BORDE] as number)) >= UMBRAL_BORDE) col[x] = (col[x] as number) + 1;
      if (Math.abs(v - (l[(y + PASO_BORDE) * w + x] as number)) >= UMBRAL_BORDE) fila[y] = (fila[y] as number) + 1;
    }
  }
  const cols: number[] = [];
  const filas: number[] = [];
  col.forEach((n, x) => {
    if (n >= FRACCION_LINEA * h) cols.push(x);
  });
  fila.forEach((n, y) => {
    if (n >= FRACCION_LINEA * w) filas.push(y);
  });
  if (cols.length < 2 || filas.length < 2) return null;
  // Con PASO_BORDE, un borde nítido marca PASO_BORDE posiciones: la primera se corrige para dar el mismo rectángulo.
  const x0 = (cols[0] as number) + PASO_BORDE - 1;
  const x1 = cols[cols.length - 1] as number;
  const y0 = (filas[0] as number) + PASO_BORDE - 1;
  const y1 = filas[filas.length - 1] as number;
  const ancho = x1 - x0;
  const alto = y1 - y0;
  if (ancho < FRACCION_LINEA * w || alto < FRACCION_LINEA * h) return null;
  const p = ancho / alto;
  const id1 = (objetivo: number) => Math.abs(p - objetivo) / objetivo <= TOLERANCIA_PROPORCION;
  return id1(PROPORCION_ID1) || id1(1 / PROPORCION_ID1) ? { x: x0, y: y0, ancho, alto } : null;
}

/**
 * PDF417: fracción de bloques de 8x8 de la tarjeta con bordes verticales fuertes y casi sin bordes horizontales (las
 * barras del código). El texto y la MRZ tienen bordes en las dos direcciones; una hoja lisa, casi ninguno.
 */
export function hayPdf417(l: Uint8Array, w: number, r: Rect): boolean {
  let fuertes = 0;
  let total = 0;
  for (let by = r.y; by + BLOQUE < r.y + r.alto; by += BLOQUE) {
    for (let bx = r.x; bx + BLOQUE < r.x + r.ancho; bx += BLOQUE) {
      let sx = 0;
      let sy = 0;
      for (let y = by; y < by + BLOQUE; y++) {
        for (let x = bx; x < bx + BLOQUE; x++) {
          const i = y * w + x;
          sx += Math.abs((l[i] as number) - (l[i + 1] as number));
          sy += Math.abs((l[i] as number) - (l[i + w] as number));
        }
      }
      total++;
      if (sx > BLOQUE * BLOQUE * BORDE_MEDIO_PDF417 && sx > RELACION_DX_DY * sy) fuertes++;
    }
  }
  return total > 0 && fuertes >= FRACCION_BLOQUES_PDF417 * total;
}

/** PDF417 con el patrón suave: bloques con bordes verticales dominantes presentes en todas sus filas. */
export function hayPdf417Suave(l: Uint8Array, w: number, r: Rect): boolean {
  let fuertes = 0;
  let total = 0;
  const filas = new Float64Array(BLOQUE);
  for (let by = r.y; by + BLOQUE < r.y + r.alto; by += BLOQUE) {
    for (let bx = r.x; bx + BLOQUE < r.x + r.ancho; bx += BLOQUE) {
      let sx = 0;
      let sy = 0;
      for (let y = by; y < by + BLOQUE; y++) {
        let e = 0;
        for (let x = bx; x < bx + BLOQUE; x++) {
          const i = y * w + x;
          e += Math.abs((l[i] as number) - (l[i + 1] as number));
          sy += Math.abs((l[i] as number) - (l[i + w] as number));
        }
        filas[y - by] = e;
        sx += e;
      }
      total++;
      const minimaFila = Math.min(...filas);
      if (sx > BLOQUE * BLOQUE * BORDE_MEDIO_SUAVE && sx > RELACION_DX_DY_SUAVE * sy && minimaFila >= (ENERGIA_FILA_SUAVE * sx) / BLOQUE) fuertes++;
    }
  }
  return total > 0 && fuertes >= FRACCION_BLOQUES_SUAVE * total;
}

function subimagen(f: FrameAnalisis, r: Rect): PixelesRgba {
  const data = new Uint8ClampedArray(r.ancho * r.alto * 4);
  for (let y = 0; y < r.alto; y++) data.set(f.pixeles.subarray(((r.y + y) * f.ancho + r.x) * 4, ((r.y + y) * f.ancho + r.x + r.ancho) * 4), y * r.ancho * 4);
  return { data, width: r.ancho, height: r.alto };
}

/** MRZ: evidencia de LMI-14 sobre la tarjeta (y girada si está vertical). */
export function hayMrz(p: PixelesRgba): boolean {
  const vistas = p.width >= p.height ? [p] : [girar(p, 90), girar(p, 270)];
  return vistas.some((v) => {
    const e = localizarConEvidencia(v);
    return e.ventanasMrz > 0 && e.ventanasMrz <= MAX_VENTANAS_MRZ && (e.evidencia ?? 0) >= EVIDENCIA_MINIMA_MRZ;
  });
}

export function detectarPresencia(frame: FrameAnalisis, guia: Cuadrilatero): Presencia {
  const recorte = recorteGuia(frame, guia);
  if (recorte.ancho < 8 || recorte.alto < 8) return { tarjeta: null, contenido: null, presente: false };
  const l = lumas(frame, recorte);
  const t = buscarTarjeta(l, recorte.ancho, recorte.alto);
  if (t === null) return { tarjeta: null, contenido: null, presente: false };
  const tarjeta = { x: recorte.x + t.x, y: recorte.y + t.y, ancho: t.ancho, alto: t.alto };
  if (hayPdf417(l, recorte.ancho, t)) return { tarjeta, contenido: "pdf417", presente: true };
  if (hayMrz(subimagen(frame, tarjeta))) return { tarjeta, contenido: "mrz", presente: true };
  if (hayPdf417Suave(l, recorte.ancho, t)) return { tarjeta, contenido: "pdf417", presente: true };
  return { tarjeta, contenido: null, presente: false };
}

/** Sin documento, la calidad nunca llega al umbral de `listo`: score por debajo y motivo `acerca`. */
export function aplicarPresencia(r: ResultadoCalidad, presente: boolean, umbralListo: number): ResultadoCalidad {
  if (presente || r.score < umbralListo) return r;
  return { ...r, score: umbralListo - 1, motivo: "acerca" };
}

/**
 * OFF-22 y OFF-25 en un resultado del Worker de calidad. `presencia` se invoca solo si hace falta (cuesta decenas de ms):
 * - score >= umbral: sin presencia, `aplicarPresencia` (score umbral - 1, motivo `acerca`).
 * - Solo la nitidez por debajo del umbral y varianza >= `minimo`: con presencia, score = umbral y motivo `null`
 *   (captura guiada); sin ella, motivo `acerca` con el mismo score.
 * - En otro caso (otra limitación o desenfoque extremo), el resultado no cambia.
 */
export function evaluarConPresencia(r: ResultadoCalidad, presencia: () => boolean, umbralListo: number, minimo = LAPLACIANO_MINIMO_GUIADO): ResultadoCalidad {
  if (r.score >= umbralListo) return aplicarPresencia(r, presencia(), umbralListo);
  const m = r.metricas;
  if (r.motivo !== "desenfocado" || m === null || m.nitidez.varianza < minimo) return r;
  const otros = [m.reflejo.subscore, m.exposicion.subscoreOscuro, m.exposicion.subscoreSobreexpuesto, m.tamano?.subscore ?? 100];
  if (otros.some((s) => s < umbralListo)) return r;
  return presencia() ? { ...r, score: umbralListo, motivo: null } : { ...r, motivo: "acerca" };
}
