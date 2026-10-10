/**
 * CAM-08: guía de encuadre centrada con proporción ID-1 (85,60:53,98; hipótesis C01 de
 * `docs/decisiones/hipotesis-formato.md`), lado largo paralelo al del frame y lados <= 90 % del frame.
 * CAL-14: detector por defecto que devuelve la guía como cuadrilátero de análisis (`fuente: "guia"`).
 */
import type { Cuadrilatero, DeteccionDocumento, FrameAnalisis } from "../calidad/tipos.js";
import type { DetectorDocumento } from "../interfaces.js";

export const PROPORCION_ID1 = 85.6 / 53.98;
const FRACCION_MAXIMA = 0.9;

/** SDK-61: orientación forzada de la guía y margen por lado (fracción de la región, por omisión 0,05). */
export interface OpcionesGuia {
  readonly orientacion?: "horizontal" | "vertical";
  readonly margen?: number;
}

export interface Caja {
  readonly x: number;
  readonly y: number;
  readonly ancho: number;
  readonly alto: number;
}

/** Guía en píxeles del frame, con lados y posiciones redondeados al entero más cercano. */
export function calcularGuia(ancho: number, alto: number, opciones: OpcionesGuia = {}): Caja {
  // Stryker disable next-line EqualityOperator: equivalente; con ancho = alto la guía horizontal y la vertical coinciden por simetría.
  const horizontal = opciones.orientacion === undefined ? ancho >= alto : opciones.orientacion === "horizontal";
  const fraccion = opciones.margen === undefined ? FRACCION_MAXIMA : 1 - 2 * opciones.margen;
  const anchoMax = fraccion * ancho;
  const altoMax = fraccion * alto;
  // SDK-61: el lado largo de la guía sigue la orientación pedida, aunque no coincida con la del frame.
  const anchoGuia = Math.round(horizontal ? Math.min(anchoMax, altoMax * PROPORCION_ID1) : Math.min(anchoMax, altoMax / PROPORCION_ID1));
  const altoGuia = Math.round(horizontal ? Math.min(altoMax, anchoMax / PROPORCION_ID1) : Math.min(altoMax, anchoMax * PROPORCION_ID1));
  return { x: Math.round((ancho - anchoGuia) / 2), y: Math.round((alto - altoGuia) / 2), ancho: anchoGuia, alto: altoGuia };
}

/** SDK-61: guía calculada dentro de `region` (p. ej. la zona visible del vídeo tras `object-fit: cover`), en píxeles del frame. */
export function calcularGuiaEnRegion(region: Caja, opciones: OpcionesGuia = {}): Caja {
  const g = calcularGuia(region.ancho, region.alto, opciones);
  return { x: Math.round(region.x) + g.x, y: Math.round(region.y) + g.y, ancho: g.ancho, alto: g.alto };
}

/** Guía del frame original escalada, sin redondear, a un frame de análisis de `ancho` x `alto`. */
export function guiaEnAnalisis(ancho: number, alto: number, anchoOriginal: number, altoOriginal: number, guia?: Caja): Cuadrilatero {
  const g = guia ?? calcularGuia(anchoOriginal, altoOriginal);
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
      return { cuadrilatero: guiaEnAnalisis(frame.ancho, frame.alto, frame.anchoOriginal, frame.altoOriginal, frame.guia), confianza: null, fuente: "guia" };
    },
  };
}
