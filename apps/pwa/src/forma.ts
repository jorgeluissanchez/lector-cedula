/**
 * Forma de la cámara (demo-opciones, DOP-03, DOP-03a y DOP-07). `pantalla-completa` es la de siempre (CAM-08: guía sobre
 * el frame completo con `object-fit: contain`, sin guía para el Worker). Los recuadros son los de `examples/login`
 * (SDK-64), con `object-fit: cover`: la guía se calcula en la región visible con la geometría pública del núcleo
 * `@lector-cedula/web` (primer paso de SDK-35).
 */
import { calcularGuia, guiaEnPantalla, type Caja } from "@lector-cedula/capture";
import { guiaEnElemento, guiaEnVideo } from "@lector-cedula/web";
import type { FormaCamara } from "./preferencias";

export type { FormaCamara } from "./preferencias";

export const FORMAS: readonly FormaCamara[] = Object.freeze(["pantalla-completa", "recuadro-horizontal", "recuadro-vertical"]);

export const RECUADROS = Object.freeze({
  "recuadro-horizontal": Object.freeze({ ancho: 320, alto: 200, orientacion: "horizontal" }),
  "recuadro-vertical": Object.freeze({ ancho: 260, alto: 400, orientacion: "vertical" }),
} as const);

export const TEXTO_DE_PIE = "Sostén la cédula de pie, sin girar el teléfono.";

/** Medidas del vídeo (resolución de la pista) y del elemento que lo muestra (píxeles CSS). */
export interface MedidasForma {
  readonly anchoVideo: number;
  readonly altoVideo: number;
  readonly anchoElemento: number;
  readonly altoElemento: number;
}

/** DOP-03a: guía en píxeles del vídeo para el Worker de calidad y el cuadrilátero; `undefined` a pantalla completa. */
export function guiaDeForma(forma: FormaCamara, m: MedidasForma): Caja | undefined {
  if (forma === "pantalla-completa") return undefined;
  if (!(m.anchoVideo > 0 && m.altoVideo > 0)) return undefined;
  return guiaEnVideo({ ...m, ajuste: "cover" }, { orientacion: RECUADROS[forma].orientacion }) ?? undefined;
}

/** Guía en píxeles CSS relativos al elemento del vídeo; `null` sin medidas. */
export function guiaEnPantallaDeForma(forma: FormaCamara, m: MedidasForma): Caja | null {
  if (!(m.anchoVideo > 0 && m.altoVideo > 0)) return null;
  if (forma === "pantalla-completa") return guiaEnPantalla(calcularGuia(m.anchoVideo, m.altoVideo), m.anchoVideo, m.altoVideo, m.anchoElemento, m.altoElemento);
  const g = guiaDeForma(forma, m);
  return g === undefined ? null : guiaEnElemento(g, { ...m, ajuste: "cover" });
}
