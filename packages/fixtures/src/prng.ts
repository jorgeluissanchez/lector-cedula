import { ErrorFixture } from "./errores.js";

/** Semilla por omisión (FX-06). */
export const SEMILLA_POR_OMISION = 1;

/** Mayor semilla admitida: el estado de mulberry32 es de 32 bits. */
export const SEMILLA_MAXIMA = 0xffffffff;

/** Generador pseudoaleatorio sembrado. Toda la aleatoriedad del paquete sale de aquí (FX-06). */
export interface Prng {
  /** Siguiente número en `[0, 1)`. */
  siguiente(): number;
  /** Dígito de 0 a 9: `Math.floor(r() * 10)`. */
  digito(): number;
  /** `n` dígitos consecutivos como texto. */
  digitos(n: number): string;
  /** Byte de 0 a 255: `Math.floor(r() * 256)`. */
  byte(): number;
}

/** mulberry32 (dominio público), implementación de referencia de design.md, decisión 5. */
function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Crea un PRNG nuevo sembrado con `semilla` (entero de 0 a 4294967295 ya validado). */
export function crearPrng(semilla: number): Prng {
  const r = mulberry32(semilla);
  const digito = (): number => Math.floor(r() * 10);
  return {
    siguiente: r,
    digito,
    digitos: (n) => Array.from({ length: n }, digito).join(""),
    byte: () => Math.floor(r() * 256),
  };
}

/** Valida la opción `semilla` (FX-03, FX-06): `undefined` da la de omisión; si no, entero de 0 a 4294967295. */
export function validarSemilla(valor: unknown): number {
  if (valor === undefined) return SEMILLA_POR_OMISION;
  if (!Number.isInteger(valor) || (valor as number) < 0 || (valor as number) > SEMILLA_MAXIMA) {
    throw new ErrorFixture("semilla-invalida", "semilla");
  }
  return valor as number;
}
