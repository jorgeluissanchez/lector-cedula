// Localización de la franja MRZ TD1 en una imagen (spec lectura-mrz-imagen, LMI-01, LMI-01b y LMI-10; design.md, decisión 2).
// Pura y total: no lanza, no modifica la entrada y no guarda nada. La validación final la dan los dígitos de control.

export interface CajaMrz {
  readonly x: number;
  readonly y: number;
  readonly ancho: number;
  readonly alto: number;
}

export type MetodoLocalizacion = "proyeccion" | "recorte-inferior" | "imagen-completa" | "franja";

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
 * inferior, siempre `"recorte-inferior"` (el 40 % inferior) y, al final, `"imagen-completa"` (LMI-10: la foto ya es el
 * recorte de la MRZ). `[]` solo si la entrada no tiene forma de píxeles.
 */
export function localizarFranjaMrz(pixeles: unknown): CandidatoMrz[] {
  return localizarConEvidencia(pixeles).candidatos;
}

/** LMI-14: medidas de un trío ajustado (tramos por línea, alto medio de línea y ancho de los bordes). */
export interface MedidasTrio {
  readonly tramos: readonly [number, number, number];
  readonly altoMedio: number;
  readonly ancho: number;
}

/** LMI-14: mínimo de tramos por línea y rango de t * a / w. */
const TRAMOS_MINIMOS = 20;
const RELACION_MINIMA = 0.5;
const RELACION_MAXIMA = 2.5;

/** LMI-14: true si el trío tiene forma de MRZ horizontal (muchos tramos cortos por línea, no vetas altas). */
export function esTrioMrzHorizontal(m: MedidasTrio): boolean {
  const t = Math.min(...m.tramos);
  if (t < TRAMOS_MINIMOS) return false;
  const relacion = (t * m.altoMedio) / m.ancho;
  return relacion >= RELACION_MINIMA && relacion <= RELACION_MAXIMA;
}

/**
 * LMI-14a: candidatos de localizarFranjaMrz y evidencia de orientación: el mayor centro vertical relativo de las
 * franjas ajustadas cuyo trío es MRZ horizontal, o null.
 */
export function localizarConEvidencia(pixeles: unknown): { candidatos: CandidatoMrz[]; evidencia: number | null } {
  if (!esPixelesRgba(pixeles)) return { candidatos: [], evidencia: null };
  const { width: w, height: h } = pixeles;
  const y = Math.round((1 - FRACCION_INFERIOR) * h);
  const inferior: CandidatoMrz = { metodo: "recorte-inferior", caja: { x: 0, y, ancho: w, alto: h - y } };
  const proyeccion = candidatoProyeccion(pixeles);
  const completa: CandidatoMrz = { metodo: "imagen-completa", caja: { x: 0, y: 0, ancho: w, alto: h } };
  const base = proyeccion === null ? [inferior, completa] : [proyeccion, inferior, completa];
  const luma = luminancias(pixeles);
  let evidencia: number | null = null;
  const franjas = ventanasFranja(w, h).map((f) => {
    const { candidato, medidas } = ajustarFranja(luma, w, f);
    if (medidas !== null && esTrioMrzHorizontal(medidas)) {
      const centro = (candidato.caja.y + candidato.caja.alto / 2) / h;
      if (evidencia === null || centro > evidencia) evidencia = centro;
    }
    return candidato;
  });
  return { candidatos: [...base, ...franjas], evidencia };
}

/** Una columna es fondo (p. ej. madera al lado de la tarjeta) si tiene tinta en al menos esta fracción de filas. */
const FRACCION_COLUMNA_FONDO = 0.8;
/** Salto mínimo de luminancia que cuenta como borde, y fracción de columnas con borde para que una fila sea texto. */
const UMBRAL_BORDE_MAXIMO = 40;
const UMBRAL_BORDE_MINIMO = 12;
const FACTOR_UMBRAL = 0.5;
const PERCENTIL_UMBRAL = 0.99;
const FRACCION_BORDES_FILA = 0.03;

/**
 * LMI-11: dentro de la franja, con umbral de Otsu local y sin las columnas de fondo, busca el trío regular de bandas
 * más bajo y ajusta la caja a él (con margen de medio alto de línea). Si no lo hay, devuelve la franja tal cual.
 */
function ajustarFranja(luma: Uint8Array, w: number, f: CandidatoMrz): { candidato: CandidatoMrz; medidas: MedidasTrio | null } {
  const { candidato, medidas } = analizarVentana(luma, w, f);
  return { candidato, medidas };
}

/** Diagnóstico de una ventana de LMI-11 (solo números): umbral de borde, bandas encontradas y motivo si no hay trío. */
export interface AnalisisVentana {
  readonly candidato: CandidatoMrz;
  readonly medidas: MedidasTrio | null;
  readonly umbral: number;
  readonly bandas: number;
  readonly motivo: "trio" | "sin-columnas-utiles" | "menos-de-3-bandas" | "sin-trio-valido";
}

/** Percentil (0-1) de los saltos horizontales de luminancia de la ventana. */
function percentilSaltos(local: Uint8Array, w: number, hf: number, p: number): number {
  const hist = new Uint32Array(256);
  for (let y = 0; y < hf; y++) for (let x = 0; x + 1 < w; x++) { const d = Math.abs((local[y * w + x] as number) - (local[y * w + x + 1] as number)); hist[d] = (hist[d] as number) + 1; }
  const objetivo = p * hf * (w - 1);
  let acumulado = 0;
  for (let v = 0; v < 256; v++) {
    acumulado += hist[v] as number;
    if (acumulado >= objetivo) return v;
  }
  return 255;
}

export function analizarVentana(luma: Uint8Array, w: number, f: CandidatoMrz): AnalisisVentana {
  const { y: y0, alto: hf } = f.caja;
  const local = luma.subarray(y0 * w, (y0 + hf) * w);
  const umbral = Math.min(UMBRAL_BORDE_MAXIMO, Math.max(UMBRAL_BORDE_MINIMO, Math.round(FACTOR_UMBRAL * percentilSaltos(local, w, hf, PERCENTIL_UMBRAL))));
  // Borde fuerte (LMI-11e): salto de luminancia >= umbral de la ventana entre vecinos horizontales. El texto OCR-B produce muchos; la
  // madera y el fondo impreso de la tarjeta, pocos.
  const borde = (x: number, y: number): boolean =>
    x + 1 < w && Math.abs((local[y * w + x] as number) - (local[y * w + x + 1] as number)) >= umbral;
  const bordeCol = new Uint32Array(w);
  for (let y = 0; y < hf; y++) for (let x = 0; x < w; x++) if (borde(x, y)) bordeCol[x] = (bordeCol[x] as number) + 1;
  const util = (x: number): boolean => (bordeCol[x] as number) < FRACCION_COLUMNA_FONDO * hf;
  let utiles = 0;
  for (let x = 0; x < w; x++) if (util(x)) utiles++;
  if (utiles === 0) return { candidato: f, medidas: null, umbral, bandas: 0, motivo: "sin-columnas-utiles" };
  const conteos = new Uint32Array(hf);
  for (let y = 0; y < hf; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (util(x) && borde(x, y)) n++;
    conteos[y] = n;
  }
  const encontradas = bandas(conteos, 0, Math.max(2, Math.ceil(FRACCION_BORDES_FILA * utiles)));
  for (let i = encontradas.length - 3; i >= 0; i--) {
    const [a, b, c] = encontradas.slice(i, i + 3) as [Banda, Banda, Banda];
    if (!bandasRegulares(a, b, c)) continue;
    // LMI-11c: una línea pegada a un borde interior de la ventana puede estar cortada.
    if ((a.inicio === 0 && y0 > 0) || (c.fin === hf - 1 && y0 + hf < luma.length / w)) continue;
    // LMI-11d: límites en x del grupo de columnas con borde más poblado (huecos de más de un alto de línea separan
    // grupos), para dejar fuera el borde de la tarjeta o el fondo junto a la MRZ.
    const columna = (x: number): boolean => {
      for (let y = a.inicio; y <= c.fin; y++) if (util(x) && borde(x, y)) return true;
      return false;
    };
    const { x0, x1 } = grupoMayor(columna, w, (alto(a) + alto(b) + alto(c)) / 3);
    const margen = Math.round(((alto(a) + alto(b) + alto(c)) / 3) * 0.5);
    const izq = Math.max(0, x0 - margen);
    const der = Math.min(w, x1 + 1 + margen);
    const arriba = Math.max(0, a.inicio - margen);
    const abajo = Math.min(hf, c.fin + 1 + margen);
    // LMI-14: tramos = rachas maximales de columnas útiles con algún borde en las filas de la línea.
    const tramos = [a, b, c].map((banda) => {
      let n = 0;
      let antes = false;
      for (let x = x0; x <= x1; x++) {
        let hay = false;
        for (let y = banda.inicio; y <= banda.fin && !hay; y++) hay = util(x) && borde(x, y);
        if (hay && !antes) n++;
        antes = hay;
      }
      return n;
    }) as [number, number, number];
    return {
      candidato: { metodo: "franja", caja: { x: izq, y: y0 + arriba, ancho: der - izq, alto: abajo - arriba } },
      medidas: { tramos, altoMedio: (alto(a) + alto(b) + alto(c)) / 3, ancho: x1 - x0 + 1 },
      umbral,
      bandas: encontradas.length,
      motivo: "trio",
    };
  }
  return { candidato: f, medidas: null, umbral, bandas: encontradas.length, motivo: encontradas.length < 3 ? "menos-de-3-bandas" : "sin-trio-valido" };
}

/**
 * LMI-11d: extremos del grupo con más columnas activas, separando grupos por huecos de más de `hueco` columnas.
 * Empate: el primero. Solo se llama con al menos una columna activa (las bandas del trío tienen bordes).
 */
function grupoMayor(activa: (x: number) => boolean, w: number, hueco: number): { x0: number; x1: number } {
  let mejor = { x0: 0, x1: -1, n: 0 };
  let actual = { x0: 0, x1: -1, n: 0 };
  for (let x = 0; x < w; x++) {
    if (!activa(x)) continue;
    if (actual.n === 0 || x - actual.x1 - 1 > hueco) actual = { x0: x, x1: x, n: 0 };
    actual.x1 = x;
    actual.n++;
    if (actual.n > mejor.n) mejor = { ...actual };
  }
  return mejor;
}

/** Alto y paso de las franjas de LMI-11, como fracción del alto de la imagen. */
const FRACCIONES_FRANJA = [0.15, 0.3, 0.45] as const;
const FRACCION_PASO = 0.05;

/**
 * LMI-11: ventanas horizontales de todo el ancho, de abajo arriba, sin repetir cajas. Sirven cuando la tarjeta
 * completa está sobre un fondo con textura y la proyección global no separa las 3 bandas.
 */
export function ventanasFranja(w: number, h: number): CandidatoMrz[] {
  const paso = Math.max(1, Math.round(FRACCION_PASO * h));
  const r: CandidatoMrz[] = [];
  for (const fraccion of FRACCIONES_FRANJA) {
    const alto = Math.max(1, Math.round(fraccion * h));
    const vistas = new Set<number>();
    for (let y = h - alto; y > -paso; y -= paso) {
      const y0 = Math.max(0, y);
      if (vistas.has(y0)) continue;
      vistas.add(y0);
      r.push({ metodo: "franja", caja: { x: 0, y: y0, ancho: w, alto: Math.min(alto, h - y0) } });
    }
  }
  return r;
}

/** Giros de LMI-12, en grados en sentido horario. */
export const GIROS = [90, 270] as const;
export type Giro = (typeof GIROS)[number];

/** LMI-12: copia de `p` girada `grados` en sentido horario (90 o 270). No modifica la entrada. */
export function girar(p: PixelesRgba, grados: Giro): PixelesRgba {
  const { width: w, height: h } = p;
  const data = new Uint8ClampedArray(w * h * 4);
  // Destino de h x w: en 90 horario, (xd, yd) viene de (yd, h - 1 - xd); en 270, de (w - 1 - yd, xd).
  for (let yd = 0; yd < w; yd++) {
    for (let xd = 0; xd < h; xd++) {
      const [xs, ys] = grados === 90 ? [yd, h - 1 - xd] : [w - 1 - yd, xd];
      const o = (yd * h + xd) * 4;
      const s = (ys * w + xs) * 4;
      for (let k = 0; k < 4; k++) data[o + k] = p.data[s + k] as number;
    }
  }
  return { width: h, height: w, data };
}
