/**
 * Tabla de cuantización de luminancia de JPEG (ITU-T T.81, anexo K) escalada por calidad (fórmula IJG).
 * La usan el detector `edicion` (FRA-10) y el generador sintético para simular recompresión.
 */
const BASE_LUMA = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37,
  56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
] as const;

/** Paso de cuantización por coeficiente (fila mayor v*8+u) para una calidad 1-100. */
export function tablaLuma(calidad: number): Int32Array {
  const q = Math.min(100, Math.max(1, Math.round(calidad)));
  const escala = q < 50 ? 5000 / q : 200 - 2 * q;
  const t = new Int32Array(64);
  for (let i = 0; i < 64; i++) t[i] = Math.min(255, Math.max(1, Math.floor(((BASE_LUMA[i] as number) * escala + 50) / 100)));
  return t;
}
