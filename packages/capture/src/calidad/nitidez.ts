import { rampa } from "./rampa.js";
import type { MetricaNitidez } from "./tipos.js";

export interface UmbralesNitidez {
  readonly laplacianoDesenfocado: number;
  readonly laplacianoNitido: number;
}

/** Subscore de nitidez de CAL-03: `rampa(varianza, laplacianoDesenfocado, laplacianoNitido)`. */
export function subscoreNitidez(varianza: number, u: UmbralesNitidez): number {
  return rampa(varianza, u.laplacianoDesenfocado, u.laplacianoNitido);
}

/**
 * Nitidez de CAL-03: varianza poblacional del Laplaciano de 4 vecinos sobre los píxeles de M que no están en el
 * borde del frame. Sin píxeles medibles, la varianza es 0.
 */
export function medirNitidez(
  lum: Uint8Array,
  mascara: Uint8Array,
  ancho: number,
  alto: number,
  u: UmbralesNitidez,
): MetricaNitidez {
  // Dos pasadas (media y luego desviaciones) sin guardar los Laplacianos: mismo resultado que la definición.
  const laplaciano = (i: number) =>
    (lum[i - 1] ?? 0) + (lum[i + 1] ?? 0) + (lum[i - ancho] ?? 0) + (lum[i + ancho] ?? 0) - 4 * (lum[i] ?? 0);
  let n = 0;
  let suma = 0;
  for (let y = 1; y < alto - 1; y++) {
    for (let i = y * ancho + 1, fin = y * ancho + ancho - 1; i < fin; i++) {
      if (mascara[i] !== 1) continue;
      suma += laplaciano(i);
      n++;
    }
  }
  let varianza = 0;
  if (n > 0) {
    const media = suma / n;
    let cuadrados = 0;
    for (let y = 1; y < alto - 1; y++) {
      for (let i = y * ancho + 1, fin = y * ancho + ancho - 1; i < fin; i++) {
        if (mascara[i] !== 1) continue;
        const d = laplaciano(i) - media;
        cuadrados += d * d;
      }
    }
    varianza = cuadrados / n;
  }
  return { varianza, subscore: subscoreNitidez(varianza, u) };
}
