// Localización de la franja MRZ TD1 en una imagen (spec lectura-mrz-imagen, LMI-01 y LMI-01b; design.md, decisión 2).
// Pura y total: no lanza, no modifica la entrada y no guarda nada. La validación final la dan los dígitos de control.

export interface CajaMrz {
  readonly x: number;
  readonly y: number;
  readonly ancho: number;
  readonly alto: number;
}

export type MetodoLocalizacion = "proyeccion" | "recorte-inferior";

export interface CandidatoMrz {
  readonly metodo: MetodoLocalizacion;
  readonly caja: CajaMrz;
}

/** Píxeles RGBA con la forma de `ImageData`; `data` puede ser `Uint8Array` o `Uint8ClampedArray`. */
export interface PixelesRgba {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
}

/** Fracción inferior que se usa como respaldo (LMI-01). */
const FRACCION_INFERIOR = 0.4;
/** Tolerancias de LMI-01b. */
const TOLERANCIA_ALTURA = 0.35;
const TOLERANCIA_SEPARACION = 0.25;
/** Una fila es de texto si tiene al menos esta fracción del ancho en tinta (y al menos 1 píxel). */
const FRACCION_TINTA_FILA = 0.005;

/** `true` si `x` tiene la forma de píxeles RGBA coherentes con lados enteros positivos. */
export function esPixelesRgba(x: unknown): x is PixelesRgba {
  if (typeof x !== "object" || x === null) return false;
  const { width, height, data } = x as Record<string, unknown>;
  if (!Number.isInteger(width) || !Number.isInteger(height)) return false;
  const w = width as number;
  const h = height as number;
  if (w <= 0 || h <= 0) return false;
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray)) return false;
  return data.length === w * h * 4;
}

/** Luminancia entera 0-255 de cada píxel (BT.601 aproximada: (306 R + 601 G + 117 B) / 1024). */
export function luminancias(p: PixelesRgba): Uint8Array {
  const n = p.width * p.height;
  const l = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    l[i] = (306 * (p.data[o] as number) + 601 * (p.data[o + 1] as number) + 117 * (p.data[o + 2] as number)) >> 10;
  }
  return l;
}

/**
 * Umbral de Otsu: devuelve `t` tal que la tinta es `luma <= t`, o `null` si la imagen tiene un solo nivel
 * (varianza entre clases nula: no hay tinta que separar).
 */
export function umbralOtsu(luma: Uint8Array): number | null {
  const hist = new Array<number>(256).fill(0);
  for (const v of luma) hist[v] = (hist[v] as number) + 1;
  const total = luma.length;
  let sumaTotal = 0;
  for (let i = 0; i < 256; i++) sumaTotal += i * (hist[i] as number);
  let pesoFondo = 0;
  let sumaFondo = 0;
  let mejor = 0;
  let umbral: number | null = null;
  for (let t = 0; t < 256; t++) {
    pesoFondo += hist[t] as number;
    if (pesoFondo === 0) continue;
    const pesoFrente = total - pesoFondo;
    if (pesoFrente === 0) break;
    sumaFondo += t * (hist[t] as number);
    const m0 = sumaFondo / pesoFondo;
    const m1 = (sumaTotal - sumaFondo) / pesoFrente;
    const entre = pesoFondo * pesoFrente * (m0 - m1) * (m0 - m1);
    if (entre > mejor) {
      mejor = entre;
      umbral = t;
    }
  }
  return umbral;
}

export interface Banda {
  readonly inicio: number;
  /** Fila final inclusiva. */
  readonly fin: number;
}

/** Bandas de filas consecutivas con tinta en `[desde, alto)`. Una fila fuera del array no tiene tinta. */
function bandas(conteos: Uint32Array, desde: number, minimo: number): Banda[] {
  const r: Banda[] = [];
  let inicio: number | null = null;
  for (let y = desde; y <= conteos.length; y++) {
    const tinta = (conteos[y] ?? 0) >= minimo;
    if (tinta && inicio === null) inicio = y;
    if (!tinta && inicio !== null) {
      r.push({ inicio, fin: y - 1 });
      inicio = null;
    }
  }
  return r;
}

const alto = (b: Banda): number => b.fin - b.inicio + 1;
/** Doble del centro: el criterio solo compara separaciones entre sí, así que el factor 2 se cancela. */
const dobleCentro = (b: Banda): number => b.inicio + b.fin;

/** `true` si 3 bandas consecutivas cumplen el criterio de regularidad de LMI-01b. */
export function bandasRegulares(a: Banda, b: Banda, c: Banda): boolean {
  const altos = [alto(a), alto(b), alto(c)];
  const media = (alto(a) + alto(b) + alto(c)) / 3;
  if (Math.max(...altos) - Math.min(...altos) >= TOLERANCIA_ALTURA * media) return false;
  const s1 = (dobleCentro(b) - dobleCentro(a)) / 2;
  const s2 = (dobleCentro(c) - dobleCentro(b)) / 2;
  return Math.abs(s1 - s2) < (TOLERANCIA_SEPARACION * (s1 + s2)) / 2;
}

function candidatoProyeccion(p: PixelesRgba): CandidatoMrz | null {
  const luma = luminancias(p);
  // Sin umbral (un solo nivel) no hay tinta: -1 no lo alcanza ninguna luminancia.
  const t = umbralOtsu(luma) ?? -1;
  const { width: w, height: h } = p;
  const conteos = new Uint32Array(h);
  const desde = Math.floor(h / 2);
  for (let y = desde; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if ((luma[y * w + x] as number) <= t) n++;
    conteos[y] = n;
  }
  const encontradas = bandas(conteos, desde, Math.max(1, Math.ceil(FRACCION_TINTA_FILA * w)));
  // Desde abajo: la MRZ ocupa el pie del reverso; se toma el último trío regular.
  for (let i = encontradas.length - 3; i >= 0; i--) {
    const [a, b, c] = encontradas.slice(i, i + 3) as [Banda, Banda, Banda];
    if (!bandasRegulares(a, b, c)) continue;
    let x0 = w;
    let x1 = -1;
    for (let y = a.inicio; y <= c.fin; y++) {
      for (let x = 0; x < w; x++) {
        if ((luma[y * w + x] as number) <= t) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
        }
      }
    }
    const margen = Math.round(((alto(a) + alto(b) + alto(c)) / 3) * 0.5);
    const izq = Math.max(0, x0 - margen);
    const der = Math.min(w, x1 + 1 + margen);
    const arriba = Math.max(0, a.inicio - margen);
    const abajo = Math.min(h, c.fin + 1 + margen);
    return { metodo: "proyeccion", caja: { x: izq, y: arriba, ancho: der - izq, alto: abajo - arriba } };
  }
  return null;
}

/**
 * Candidatos de la franja MRZ en orden de prueba (LMI-01): `"proyeccion"` si hay 3 bandas regulares en la mitad
 * inferior y siempre `"recorte-inferior"` (el 40 % inferior). `[]` solo si la entrada no tiene forma de píxeles.
 */
export function localizarFranjaMrz(pixeles: unknown): CandidatoMrz[] {
  if (!esPixelesRgba(pixeles)) return [];
  const { width: w, height: h } = pixeles;
  const y = Math.round((1 - FRACCION_INFERIOR) * h);
  const inferior: CandidatoMrz = { metodo: "recorte-inferior", caja: { x: 0, y, ancho: w, alto: h - y } };
  const proyeccion = candidatoProyeccion(pixeles);
  return proyeccion === null ? [inferior] : [proyeccion, inferior];
}
