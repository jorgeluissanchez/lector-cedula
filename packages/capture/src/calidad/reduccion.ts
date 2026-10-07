/** Lado largo del frame de análisis (CAL-01). */
export const LADO_ANALISIS = 640;

export interface Dimensiones {
  readonly ancho: number;
  readonly alto: number;
}

/**
 * Dimensiones del frame de análisis (CAL-01): el lado largo mide 640 px, o el del original si es menor, y el lado
 * corto se escala en la misma proporción y se redondea al entero más cercano.
 */
export function dimensionesAnalisis(ancho: number, alto: number): Dimensiones {
  const largo = Math.max(ancho, alto);
  if (largo <= LADO_ANALISIS) return { ancho, alto };
  const escala = LADO_ANALISIS / largo;
  return ancho >= alto
    ? { ancho: LADO_ANALISIS, alto: Math.round(alto * escala) }
    : { ancho: Math.round(ancho * escala), alto: LADO_ANALISIS };
}
