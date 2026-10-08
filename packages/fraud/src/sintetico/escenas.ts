/**
 * Escenas sintéticas de presentación (FRA-13; design.md, decisión 7). Código propio en TypeScript, determinista por
 * semilla, sin datos de personas reales: la tarjeta es un dibujo abstracto (fondo, guilloche, recuadro de foto,
 * barras de texto) y los datos son los de la persona ficticia `PERSONA_BASE` (NUIP con prefijo 9999).
 * No forma parte del bundle de producto: se exporta en `@lector-cedula/fraud/sintetico`.
 */
import { dct8x8, idct8x8 } from "../imagen/primitivas.js";
import { tablaLuma } from "../imagen/jpeg.js";
import type { DatosDocumento, EntradaFraude, FrameRGBA, Punto } from "../tipos.js";

export const CLASES_SINTETICAS = ["autentica", "pantalla", "fotocopia-gris", "fotocopia-color", "impresion", "recortada", "editada"] as const;
export type ClaseSintetica = (typeof CLASES_SINTETICAS)[number];
export type TipoDocumento = "amarilla" | "digital";

/** Distorsiones metamórficas (skill estrategia-pruebas): rotación, blur, brillo y JPEG. */
export interface Distorsion {
  rotacion?: number;
  blur?: number;
  brillo?: number;
  jpeg?: number;
}

export interface OpcionesEscena {
  tipo: TipoDocumento;
  clase: ClaseSintetica;
  semilla: number;
  /** Número de frames (1 a 5); por defecto 3. */
  frames?: number;
  /** Bandas de refresco que avanzan 12 px por frame (solo con `pantalla`). */
  banding?: boolean;
  distorsion?: Distorsion;
}

export interface EscenaSintetica {
  id: string;
  sintetico: true;
  tipo: TipoDocumento;
  clase: ClaseSintetica;
  semilla: number;
  entrada: EntradaFraude;
}

/** Datos ficticios de `PERSONA_BASE` de `@lector-cedula/fixtures`. */
const NUIP = "9999123456";
const DATOS: Record<TipoDocumento, DatosDocumento> = {
  amarilla: { pdf417: { nuip: NUIP, fechaNacimiento: "1985-03-14", codigoLugar: "16001" }, visible: { nuip: NUIP } },
  digital: { visible: { nuip: NUIP, fechaNacimiento: "1985-03-14", fechaVencimiento: "2035-03-14" } },
};
const RELOJ = () => new Date("2026-10-08T12:00:00Z");

const ANCHO = 800;
const ALTO = 520;
const MM_W = 85.6;
const MM_H = 53.98;
const RADIO_MM = 3.18;
/** Región del holograma de la amarilla en mm (hipótesis H-FRA-1). */
export const REGION_HOLOGRAMA = { u0: 55, u1: 80, v0: 30, v1: 48 } as const;

/** mulberry32. */
export function prng(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
}

const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

/** Ruido suave (bilineal sobre una rejilla aleatoria de paso `paso`). */
function ruidoSuave(r: () => number, w: number, h: number, paso: number): Float32Array {
  const gw = Math.ceil(w / paso) + 2;
  const gh = Math.ceil(h / paso) + 2;
  const g = new Float32Array(gw * gh).map(() => gauss(r));
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const fx = x / paso;
      const fy = y / paso;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const ax = fx - x0;
      const ay = fy - y0;
      out[y * w + x] =
        (g[y0 * gw + x0] as number) * (1 - ax) * (1 - ay) +
        (g[y0 * gw + x0 + 1] as number) * ax * (1 - ay) +
        (g[(y0 + 1) * gw + x0] as number) * (1 - ax) * ay +
        (g[(y0 + 1) * gw + x0 + 1] as number) * ax * ay;
    }
  return out;
}

/** Color de la tarjeta en (u, v) mm. `fase` mueve el holograma. */
function colorTarjeta(tipo: TipoDocumento, u: number, v: number, fase: number, variante: number): [number, number, number] {
  let r: number, g: number, b: number;
  if (tipo === "amarilla") {
    r = 236 - v * 0.2;
    g = 206 - u * 0.15;
    b = 92 + v * 0.3;
  } else {
    const t = u / MM_W;
    r = 196 + 44 * t;
    g = 218 - 6 * t;
    b = 246 - 18 * t;
  }
  // Guilloche curvo (sin periodicidad recta).
  const gl = Math.abs(Math.sin(u * 0.9 + 2.5 * Math.sin(v * 0.35 + variante) + v * 0.2));
  if (gl < 0.06) {
    r -= 30;
    g -= 30;
    b -= 20;
  }
  // Recuadro de foto con un óvalo.
  if (u > 5 && u < 26 && v > 12 && v < 44) {
    const dx = (u - 15.5) / 7;
    const dy = (v - 26) / 10;
    const dentro = dx * dx + dy * dy < 1;
    r = dentro ? 170 : 205;
    g = dentro ? 140 : 200;
    b = dentro ? 120 : 195;
  }
  // Barras de texto.
  if (u > 30 && u < 82 && v > 8 && v < 28) {
    const fila = Math.floor((v - 8) / 4);
    const enFila = (v - 8) % 4 < 2.2;
    const largo = 40 + ((fila * 7 + variante * 3) % 12);
    if (enFila && u < 30 + largo && Math.sin(u * 3.1 + fila) > -0.6) {
      r = 40;
      g = 40;
      b = 50;
    }
  }
  if (tipo === "amarilla" && u > REGION_HOLOGRAMA.u0 && u < REGION_HOLOGRAMA.u1 && v > REGION_HOLOGRAMA.v0 && v < REGION_HOLOGRAMA.v1) {
    r += 28 * Math.cos(fase);
    g += 28 * Math.cos(fase + 2.1);
    b += 28 * Math.cos(fase + 4.2);
  }
  return [r, g, b];
}

function dentroRedondeado(u: number, v: number, radio: number): boolean {
  if (u < 0 || v < 0 || u > MM_W || v > MM_H) return false;
  if (radio <= 0) return true;
  const cx = Math.min(Math.max(u, radio), MM_W - radio);
  const cy = Math.min(Math.max(v, radio), MM_H - radio);
  return (u - cx) ** 2 + (v - cy) ** 2 <= radio * radio;
}

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Cuantiza la luminancia de los bloques 8x8 de `rect` (o de todo el frame) con la calidad dada. */
export function recomprimirLuma(f: FrameRGBA, calidad: number, rect?: { x0: number; y0: number; x1: number; y1: number }): void {
  const q = tablaLuma(calidad);
  const bloque = new Float64Array(64);
  const c = new Float64Array(64);
  const rec = new Float64Array(64);
  const x0 = rect?.x0 ?? 0;
  const y0 = rect?.y0 ?? 0;
  const x1 = rect?.x1 ?? Math.floor(f.width / 8) * 8;
  const y1 = rect?.y1 ?? Math.floor(f.height / 8) * 8;
  for (let by = y0; by < y1; by += 8)
    for (let bx = x0; bx < x1; bx += 8) {
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          const i = ((by + y) * f.width + bx + x) * 4;
          bloque[y * 8 + x] = luma(f.data[i] as number, f.data[i + 1] as number, f.data[i + 2] as number) - 128;
        }
      dct8x8(bloque, c);
      for (let k = 0; k < 64; k++) c[k] = Math.round((c[k] as number) / (q[k] as number)) * (q[k] as number);
      idct8x8(c, rec);
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          const i = ((by + y) * f.width + bx + x) * 4;
          const d = (rec[y * 8 + x] as number) - (bloque[y * 8 + x] as number);
          for (let k = 0; k < 3; k++) f.data[i + k] = (f.data[i + k] as number) + d;
        }
    }
}

function desenfocar(f: FrameRGBA, sigma: number): void {
  const rad = Math.ceil(sigma * 3);
  const k: number[] = [];
  let s = 0;
  for (let i = -rad; i <= rad; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k.push(v);
    s += v;
  }
  const kn = k.map((v) => v / s);
  const { width: w, height: h } = f;
  const tmp = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let i = -rad; i <= rad; i++) acc += (kn[i + rad] as number) * (f.data[(y * w + Math.min(w - 1, Math.max(0, x + i))) * 4 + c] as number);
        tmp[(y * w + x) * 3 + c] = acc;
      }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let i = -rad; i <= rad; i++) acc += (kn[i + rad] as number) * (tmp[(Math.min(h - 1, Math.max(0, y + i)) * w + x) * 3 + c] as number);
        f.data[(y * w + x) * 4 + c] = acc;
      }
}

/** Genera una escena sintética determinista. */
export function generarEscena(o: OpcionesEscena): EscenaSintetica {
  const { tipo, clase, semilla } = o;
  const nFrames = Math.min(5, Math.max(1, Math.floor(o.frames ?? (o.banding === true ? 5 : 3))));
  const r = prng(hash(`${tipo}|${clase}|${semilla}|${o.banding === true ? "b" : ""}`));
  const dist = o.distorsion ?? {};
  const escalaPx = 560 + r() * 80; // ancho de la tarjeta en px
  const pxmm = escalaPx / MM_W;
  const ang = (((r() - 0.5) * 4 + (dist.rotacion ?? 0)) * Math.PI) / 180;
  const cx = ANCHO / 2 + (r() - 0.5) * 40;
  const cy = ALTO / 2 + (r() - 0.5) * 30;
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  const aFrame = (u: number, v: number): Punto => {
    const x = (u - MM_W / 2) * pxmm;
    const y = (v - MM_H / 2) * pxmm;
    return { x: cx + x * cos - y * sin, y: cy + x * sin + y * cos };
  };
  const cuadrilatero: [Punto, Punto, Punto, Punto] = [aFrame(0, 0), aFrame(MM_W, 0), aFrame(MM_W, MM_H), aFrame(0, MM_H)];
  const variante = r() * 6;
  const radio = clase === "recortada" ? 0 : RADIO_MM;
  const pantalla = clase === "pantalla";
  const holoVaria = clase === "autentica" || clase === "editada" || pantalla;
  const fase0 = r() * 6.28;
  const fondoRuido = ruidoSuave(r, ANCHO, ALTO, 24);
  const papel = clase.startsWith("fotocopia") || clase === "impresion" || clase === "recortada" ? ruidoSuave(r, ANCHO, ALTO, 2.5) : null;
  const angMoire = 0.5 + r() * 0.6;
  const periodoMoire = 13 + r() * 4;
  const periodoTrama = 4 + r() * 0.6;
  const frames: FrameRGBA[] = [];
  for (let f = 0; f < nFrames; f++) {
    const data = new Uint8ClampedArray(ANCHO * ALTO * 4);
    const fase = holoVaria ? fase0 + f * 1.3 : fase0;
    for (let y = 0; y < ALTO; y++)
      for (let x = 0; x < ANCHO; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const u = (dx * cos + dy * sin) / pxmm + MM_W / 2;
        const v = (-dx * sin + dy * cos) / pxmm + MM_H / 2;
        const fn = fondoRuido[y * ANCHO + x] as number;
        let rr = 122 + 10 * fn;
        let gg = 100 + 8 * fn;
        let bb = 80 + 6 * fn;
        const enTarjeta = dentroRedondeado(u, v, radio);
        if (pantalla) {
          const margen = 9;
          if (u > -margen && v > -margen && u < MM_W + margen && v < MM_H + margen) {
            [rr, gg, bb] = u > -margen + 3 && v > -margen + 3 && u < MM_W + margen - 3 && v < MM_H + margen - 3 ? [24, 24, 30] : [8, 8, 10];
          }
        }
        if (enTarjeta) {
          [rr, gg, bb] = colorTarjeta(tipo, u, v, fase, variante);
          if (clase === "fotocopia-gris") {
            const l = luma(rr, gg, bb);
            const c = Math.min(255, 1.15 * l + 10);
            [rr, gg, bb] = [c, c, c];
          } else if (clase === "fotocopia-color" || clase === "recortada") {
            const l = luma(rr, gg, bb);
            const k = clase === "recortada" ? 0.75 : 0.4;
            [rr, gg, bb] = [l + (rr - l) * k, l + (gg - l) * k, l + (bb - l) * k];
          }
          if (papel !== null) {
            const p = 7 * (papel[y * ANCHO + x] as number);
            rr += p;
            gg += p;
            bb += p;
          }
          if (clase === "impresion") {
            const cmy = [255 - rr, 255 - gg, 255 - bb];
            const angs = [0.26, 1.31, 0];
            const out = cmy.map((c, k) => {
              const a = angs[k] as number;
              const pu = (x * Math.cos(a) + y * Math.sin(a)) / periodoTrama;
              const pv = (-x * Math.sin(a) + y * Math.cos(a)) / periodoTrama;
              const celda = (Math.cos(2 * Math.PI * pu) * Math.cos(2 * Math.PI * pv) + 1) / 2;
              return 255 - (c / 255 > celda ? 230 : 0);
            });
            [rr, gg, bb] = [out[0] as number, out[1] as number, out[2] as number];
          }
        }
        if (pantalla && u > -6 && v > -6 && u < MM_W + 6 && v < MM_H + 6) {
          // Rejilla de subpíxeles RGB alineada con la pantalla, moiré por remuestreo y gamma.
          const sub = Math.floor(((u + 6) * pxmm) % 3);
          const m = [0.55, 0.55, 0.55];
          m[sub] = 1.35;
          const pm = (x * Math.cos(angMoire) + y * Math.sin(angMoire)) / periodoMoire;
          const moire = 14 * Math.sin(2 * Math.PI * pm);
          const banda = o.banding === true ? 12 * Math.sin((2 * Math.PI * (y - 12 * f)) / 48) : 0;
          rr = 255 * ((rr * (m[0] as number)) / 255) ** 0.9 + moire + banda;
          gg = 255 * ((gg * (m[1] as number)) / 255) ** 0.9 + moire + banda;
          bb = 255 * ((bb * (m[2] as number)) / 255) ** 0.9 + moire + banda;
        }
        const brillo = 1 + (dist.brillo ?? 0);
        const i = (y * ANCHO + x) * 4;
        data[i] = rr * brillo + 3 * gauss(r);
        data[i + 1] = gg * brillo + 3 * gauss(r);
        data[i + 2] = bb * brillo + 3 * gauss(r);
        data[i + 3] = 255;
      }
    const frame: FrameRGBA = { data, width: ANCHO, height: ALTO };
    if (dist.blur !== undefined && dist.blur > 0) desenfocar(frame, dist.blur);
    if (clase === "editada") {
      // Región del NUIP reemplazada (barras distintas) y recomprimida a JPEG 60; luego todo a JPEG 92.
      const p0 = aFrame(32, 22);
      const x0 = Math.floor(p0.x / 8) * 8;
      const y0 = Math.floor(p0.y / 8) * 8;
      const rect = { x0, y0, x1: x0 + 160, y1: y0 + 40 };
      for (let y = rect.y0; y < rect.y1; y++)
        for (let x = rect.x0; x < rect.x1; x++) {
          const i = (y * ANCHO + x) * 4;
          const tinta = (y - rect.y0) % 20 < 11 && Math.sin((x - rect.x0) * 0.45) > -0.4;
          const base = colorTarjeta(tipo, 31, 30, fase0, variante);
          const c = tinta ? [35, 35, 45] : base;
          for (let k = 0; k < 3; k++) data[i + k] = (c[k] as number) + 2 * gauss(r);
        }
      recomprimirLuma(frame, 60, rect);
      recomprimirLuma(frame, 92);
    }
    if (dist.jpeg !== undefined) recomprimirLuma(frame, dist.jpeg);
    frames.push(frame);
  }
  const nombreClase = o.banding === true ? `${clase}-banding` : clase;
  return {
    id: `${tipo}-${nombreClase}-semilla-${semilla}`,
    sintetico: true,
    tipo,
    clase,
    semilla,
    entrada: { frames, cuadrilatero, tipo, datos: structuredClone(DATOS[tipo]), reloj: RELOJ },
  };
}

/**
 * Escena por nombre `<tipo>-<clase>-semilla-<n>`; admite `pantalla-banding` e `impresion-color` (alias de
 * `impresion`) como en los escenarios de la spec.
 */
export function escenaPorNombre(nombre: string, extra?: Omit<OpcionesEscena, "tipo" | "clase" | "semilla">): EscenaSintetica {
  const m = /^(amarilla|digital)-([a-z-]+)-semilla-([0-9]+)$/.exec(nombre);
  if (m === null) throw new Error(`escena-desconocida: ${nombre}`);
  let clase = m[2] as string;
  let banding = false;
  if (clase === "pantalla-banding") {
    clase = "pantalla";
    banding = true;
  }
  if (clase === "impresion-color") clase = "impresion";
  if (!(CLASES_SINTETICAS as readonly string[]).includes(clase)) throw new Error(`escena-desconocida: ${nombre}`);
  return generarEscena({ ...extra, tipo: m[1] as TipoDocumento, clase: clase as ClaseSintetica, semilla: Number(m[3]), banding });
}
