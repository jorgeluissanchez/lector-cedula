/**
 * CAM-07: todo frame se obtiene dibujando la fuente (el `<video>` en vivo, o el canvas de la captura para la
 * revalidación) en un canvas con `drawImage`. Nunca `ImageCapture`, nunca archivos. Los píxeles quedan en memoria.
 */
import { dimensionesAnalisis } from "../calidad/reduccion.js";
import type { FrameAnalisis } from "../calidad/tipos.js";

export interface FrameCompleto {
  readonly ancho: number;
  readonly alto: number;
  /** RGBA de 8 bits por canal. */
  readonly pixeles: Uint8ClampedArray;
}

function dibujar(fuente: CanvasImageSource, anchoFuente: number, altoFuente: number, ancho: number, alto: number): Uint8ClampedArray {
  if (!(anchoFuente > 0 && altoFuente > 0)) throw new Error("video-sin-frame");
  const lienzo = new OffscreenCanvas(ancho, alto);
  const ctx = lienzo.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  ctx.drawImage(fuente, 0, 0, ancho, alto);
  return ctx.getImageData(0, 0, ancho, alto).data;
}

/** Frame de captura a la resolución de la pista. */
export function tomarFrameCaptura(video: HTMLVideoElement): FrameCompleto {
  const ancho = video.videoWidth;
  const alto = video.videoHeight;
  return { ancho, alto, pixeles: dibujar(video, ancho, alto, ancho, alto) };
}

/** Frame de análisis reducido según CAL-01 desde una fuente de `anchoOriginal` x `altoOriginal`. */
export function tomarFrameAnalisis(fuente: CanvasImageSource, anchoOriginal: number, altoOriginal: number): FrameAnalisis {
  const { ancho, alto } = dimensionesAnalisis(anchoOriginal, altoOriginal);
  return { ancho, alto, anchoOriginal, altoOriginal, pixeles: dibujar(fuente, anchoOriginal, altoOriginal, ancho, alto) };
}
