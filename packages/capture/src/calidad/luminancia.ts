/** Luminancia entera de CAL-01: `Y = (77·R + 150·G + 29·B + 128) >> 8`. */
export function luminancia(r: number, g: number, b: number): number {
  return (77 * r + 150 * g + 29 * b + 128) >> 8;
}

/** Luminancia de cada píxel de un frame RGBA (el alfa se ignora). */
export function luminanciasFrame(pixeles: Uint8ClampedArray, ancho: number, alto: number): Uint8Array {
  const total = ancho * alto;
  const y = new Uint8Array(total);
  for (let i = 0, o = 0; i < total; i++, o += 4) {
    y[i] = luminancia(pixeles[o] ?? 0, pixeles[o + 1] ?? 0, pixeles[o + 2] ?? 0);
  }
  return y;
}
