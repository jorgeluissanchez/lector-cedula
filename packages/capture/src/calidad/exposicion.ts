import { rampa } from "./rampa.js";
import type { MetricaExposicion } from "./tipos.js";

export interface UmbralesExposicion {
  readonly luminanciaOscura: number;
  readonly fraccionOscuraMax: number;
  readonly mediaNegra: number;
  readonly mediaOscuraOk: number;
  readonly mediaClaraOk: number;
  readonly mediaBlanca: number;
}

/**
 * Exposición de CAL-05 sobre M: `oscuro = min(rampa(media, mediaNegra, mediaOscuraOk),
 * 100 - rampa(fraccionOscura, 0, fraccionOscuraMax))` y `sobreexpuesto = 100 - rampa(media, mediaClaraOk, mediaBlanca)`.
 */
export function medirExposicion(
  lum: Uint8Array,
  mascara: Uint8Array,
  tamanoM: number,
  u: UmbralesExposicion,
): MetricaExposicion {
  let suma = 0;
  let oscuros = 0;
  for (let i = 0; i < mascara.length; i++) {
    if (mascara[i] !== 1) continue;
    const y = lum[i] ?? 0;
    suma += y;
    if (y <= u.luminanciaOscura) oscuros++;
  }
  const media = suma / tamanoM;
  const fraccionOscura = oscuros / tamanoM;
  return {
    media,
    fraccionOscura,
    subscoreOscuro: Math.min(rampa(media, u.mediaNegra, u.mediaOscuraOk), 100 - rampa(fraccionOscura, 0, u.fraccionOscuraMax)),
    subscoreSobreexpuesto: 100 - rampa(media, u.mediaClaraOk, u.mediaBlanca),
  };
}
