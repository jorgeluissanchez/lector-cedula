/**
 * CAM-08: guía de encuadre centrada con proporción ID-1 (85,60:53,98; hipótesis C01 de
 * `docs/decisiones/hipotesis-formato.md`), lado largo paralelo al del frame y lados <= 90 % del frame.
 * CAL-14: detector por defecto que devuelve la guía como cuadrilátero de análisis (`fuente: "guia"`).
 */
import type { Cuadrilatero, DeteccionDocumento, FrameAnalisis } from "../calidad/tipos.js";
import type { DetectorDocumento } from "../interfaces.js";

export const PROPORCION_ID1 = 85.6 / 53.98;
const FRACCION_MAXIMA = 0.9;

export interface Caja {
  readonly x: number;
  readonly y: number;
  readonly ancho: number;
  readonly alto: number;
}

/** Guía en píxeles del frame, con lados y posiciones redondeados al entero más cercano. */
export function calcularGuia(ancho: number, alto: number): Caja {
  // Stryker disable next-line EqualityOperator: equivalente; con ancho = alto la guía horizontal y la vertical coinciden por simetría.
  const horizontal = ancho >= alto;
  const largoMax = FRACCION_MAXIMA * Math.max(ancho, alto);
  const cortoMax = FRACCION_MAXIMA * Math.min(ancho, alto);
  const largo = Math.round(Math.min(largoMax, cortoMax * PROPORCION_ID1));
  const corto = Math.round(Math.min(cortoMax, largoMax / PROPORCION_ID1));
  const anchoGuia = horizontal ? largo : corto;
  const altoGuia = horizontal ? corto : largo;
  return { x: Math.round((ancho - anchoGuia) / 2), y: Math.round((alto - altoGuia) / 2), ancho: anchoGuia, alto: altoGuia };
}

/** Guía del frame original escalada, sin redondear, a un frame de análisis de `ancho` x `alto`. */
export function guiaEnAnalisis(ancho: number, alto: number, anchoOriginal: number, altoOriginal: number): Cuadrilatero {
  const g = calcularGuia(anchoOriginal, altoOriginal);
  const x0 = (g.x * ancho) / anchoOriginal;
  const x1 = ((g.x + g.ancho) * ancho) / anchoOriginal;
  const y0 = (g.y * alto) / altoOriginal;
  const y1 = ((g.y + g.alto) * alto) / altoOriginal;
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

/** Caja de la guía en pantalla cuando el vídeo se muestra con `object-fit: contain` en un contenedor. */
export function guiaEnPantalla(guia: Caja, anchoFrame: number, altoFrame: number, anchoContenedor: number, altoContenedor: number): Caja {
  const escala = Math.min(anchoContenedor / anchoFrame, altoContenedor / altoFrame);
  const dx = (anchoContenedor - anchoFrame * escala) / 2;
  const dy = (altoContenedor - altoFrame * escala) / 2;
  return { x: dx + guia.x * escala, y: dy + guia.y * escala, ancho: guia.ancho * escala, alto: guia.alto * escala };
}

/** Detector por defecto (CAL-14): la guía, calculada en el frame original y escalada al de análisis. */
export function crearDetectorGuia(): DetectorDocumento {
  return {
    id: "guia",
    detectar(frame: FrameAnalisis): DeteccionDocumento {
      return { cuadrilatero: guiaEnAnalisis(frame.ancho, frame.alto, frame.anchoOriginal, frame.altoOriginal), confianza: null, fuente: "guia" };
    },
  };
}
