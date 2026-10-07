/** `rampa(x, a, b)` de la spec `calidad-captura`: 0 si x <= a, 100 si x >= b y `Math.round(100·(x - a)/(b - a))` entre medias. */
export function rampa(x: number, a: number, b: number): number {
  if (x <= a) return 0;
  if (x >= b) return 100;
  return Math.round((100 * (x - a)) / (b - a));
}
