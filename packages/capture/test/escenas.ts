/**
 * Generadores de escenas sintéticas para las pruebas de calidad (tarea 2.1), según las convenciones de la spec
 * `calidad-captura`. Todas las imágenes se generan en memoria; ninguna sale de la prueba (principio III).
 * Un frame es RGBA de 8 bits por canal; las escenas en gris escriben (v, v, v, 255).
 */
import type { Cuadrilatero, FrameAnalisis } from "../src/calidad/tipos.js";

export interface Escena {
  readonly ancho: number;
  readonly alto: number;
  readonly pixeles: Uint8ClampedArray;
}

function crear(ancho: number, alto: number, valor: (x: number, y: number) => number): Escena {
  const pixeles = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const v = valor(x, y);
      const i = (y * ancho + x) * 4;
      pixeles[i] = v;
      pixeles[i + 1] = v;
      pixeles[i + 2] = v;
      pixeles[i + 3] = 255;
    }
  }
  return { ancho, alto, pixeles };
}

/** "Gris v": todos los píxeles (v, v, v, 255). */
export function gris(ancho: number, alto: number, v: number): Escena {
  return crear(ancho, alto, () => v);
}

/** "Tablero a/b": a si x + y es par, b si es impar. */
export function tablero(ancho: number, alto: number, a: number, b: number): Escena {
  return crear(ancho, alto, (x, y) => ((x + y) % 2 === 0 ? a : b));
}

/** "Rayas a/b": a en columnas pares, b en impares. */
export function rayas(ancho: number, alto: number, a: number, b: number): Escena {
  return crear(ancho, alto, (x) => (x % 2 === 0 ? a : b));
}

/** Escribe un gris en un píxel (in situ). */
export function pintar(escena: Escena, x: number, y: number, v: number): void {
  const i = (y * escena.ancho + x) * 4;
  escena.pixeles[i] = v;
  escena.pixeles[i + 1] = v;
  escena.pixeles[i + 2] = v;
  escena.pixeles[i + 3] = 255;
}

/** "Bloque v en [x0..x1]x[y0..y1]" (rango inclusivo); devuelve una escena nueva. */
export function bloque(base: Escena, v: number, x0: number, x1: number, y0: number, y1: number): Escena {
  const escena = copiar(base);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) pintar(escena, x, y, v);
  return escena;
}

/** Disco de gris v centrado en el frame: píxeles cuyo centro está a distancia <= r del centro del frame. */
export function disco(base: Escena, v: number, radio: number): Escena {
  const escena = copiar(base);
  const cx = escena.ancho / 2;
  const cy = escena.alto / 2;
  for (let y = 0; y < escena.alto; y++) {
    for (let x = 0; x < escena.ancho; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= radio * radio) pintar(escena, x, y, v);
    }
  }
  return escena;
}

/** mulberry32 (dominio público): PRNG sembrado, independiente del código bajo prueba. */
export function prng(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** "Ruido de semilla s": cada píxel un gris uniforme e independiente en 0..255. */
export function ruido(ancho: number, alto: number, semilla: number): Escena {
  const r = prng(semilla);
  return crear(ancho, alto, () => Math.floor(r() * 256));
}

/** Desenfoque de caja 3x3 por canal (RGB), borde replicado y redondeo al entero más cercano (CAL-03). */
export function desenfoqueCaja(escena: Escena): Escena {
  const { ancho, alto, pixeles } = escena;
  const salida = new Uint8ClampedArray(pixeles.length);
  // Suma separable (fila y luego columna): la suma entera de la ventana 3x3 es idéntica a la directa.
  const filas = new Int32Array(pixeles.length);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const izq = (y * ancho + Math.max(0, x - 1)) * 4;
      const cen = (y * ancho + x) * 4;
      const der = (y * ancho + Math.min(ancho - 1, x + 1)) * 4;
      for (let c = 0; c < 3; c++) filas[cen + c] = (pixeles[izq + c] ?? 0) + (pixeles[cen + c] ?? 0) + (pixeles[der + c] ?? 0);
    }
  }
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const arr = (Math.max(0, y - 1) * ancho + x) * 4;
      const cen = (y * ancho + x) * 4;
      const aba = (Math.min(alto - 1, y + 1) * ancho + x) * 4;
      for (let c = 0; c < 3; c++) {
        salida[cen + c] = Math.round(((filas[arr + c] ?? 0) + (filas[cen + c] ?? 0) + (filas[aba + c] ?? 0)) / 9);
      }
      salida[cen + 3] = pixeles[cen + 3] ?? 255;
    }
  }
  return { ancho, alto, pixeles: salida };
}

/** Aplica `veces` desenfoques de caja seguidos. */
export function desenfocar(escena: Escena, veces: number): Escena {
  let actual = escena;
  for (let i = 0; i < veces; i++) actual = desenfoqueCaja(actual);
  return actual;
}

/** Multiplica cada canal RGB por `factor`, con redondeo y saturación en 255 (CAL-05). */
export function brillo(escena: Escena, factor: number): Escena {
  const salida = new Uint8ClampedArray(escena.pixeles.length);
  for (let i = 0; i < salida.length; i++) {
    const v = escena.pixeles[i] ?? 0;
    salida[i] = i % 4 === 3 ? v : Math.min(255, Math.round(v * factor));
  }
  return { ancho: escena.ancho, alto: escena.alto, pixeles: salida };
}

export function copiar(escena: Escena): Escena {
  return { ancho: escena.ancho, alto: escena.alto, pixeles: new Uint8ClampedArray(escena.pixeles) };
}

/** Valor del canal rojo del píxel (x, y). */
export function valor(escena: Escena, x: number, y: number): number | undefined {
  return escena.pixeles[(y * escena.ancho + x) * 4];
}

/** Frame de análisis sin reducción: el original es la propia escena. */
export function comoFrame(escena: Escena): FrameAnalisis {
  return { ...escena, anchoOriginal: escena.ancho, altoOriginal: escena.alto };
}

/** "Completo": [(0,0), (W,0), (W,H), (0,H)]. */
export function completo(ancho: number, alto: number): Cuadrilatero {
  return [[0, 0], [ancho, 0], [ancho, alto], [0, alto]];
}

/** "rect (x0,y0)-(x1,y1)". */
export function rect(x0: number, y0: number, x1: number, y1: number): Cuadrilatero {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

/** Guía de 1920x1080 de CAM-08 escalada por 1/3 al frame de 640x360 (CAL-02). */
export const GUIA_640: Cuadrilatero = [[190 / 3, 18], [1731 / 3, 18], [1731 / 3, 342], [190 / 3, 342]];
