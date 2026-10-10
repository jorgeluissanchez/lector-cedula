/**
 * SDK-61 y SDK-62: geometría pura de la guía en un `<video>` embebido de cualquier tamaño (nunca se asume pantalla
 * completa). `regionVisible` da la parte del frame que el usuario ve (con `object-fit: cover` el vídeo se recorta),
 * `guiaEnVideo` calcula la guía ID-1 dentro de esa región y `guiaEnElemento` la lleva a píxeles CSS del elemento.
 */
import { calcularGuiaEnRegion } from "@lector-cedula/capture";
import type { MedidasVideo, OpcionesGuiaLector, Rectangulo } from "./tipos.js";

type MedidasGuia = MedidasVideo;

const positivo = (v: number): boolean => Number.isFinite(v) && v > 0;
const validas = (m: MedidasGuia): boolean => positivo(m.anchoVideo) && positivo(m.altoVideo) && positivo(m.anchoElemento) && positivo(m.altoElemento);

function escala(m: MedidasGuia): number {
  const ex = m.anchoElemento / m.anchoVideo;
  const ey = m.altoElemento / m.altoVideo;
  return m.ajuste === "cover" ? Math.max(ex, ey) : Math.min(ex, ey);
}

/** Rectángulo de `guia` (píxeles del vídeo) en píxeles CSS relativos al elemento; `null` con medidas no positivas. */
export function guiaEnElemento(guia: Rectangulo, m: MedidasGuia): Rectangulo | null {
  if (!validas(m)) return null;
  const s = escala(m);
  const dx = (m.anchoElemento - m.anchoVideo * s) / 2;
  const dy = (m.altoElemento - m.altoVideo * s) / 2;
  return { x: dx + guia.x * s, y: dy + guia.y * s, ancho: guia.ancho * s, alto: guia.alto * s };
}

/** Parte del frame visible en el elemento (píxeles del vídeo). Con `contain`, el frame completo. */
export function regionVisible(m: MedidasGuia): Rectangulo | null {
  if (!positivo(m.anchoVideo) || !positivo(m.altoVideo)) return null;
  const completo = { x: 0, y: 0, ancho: m.anchoVideo, alto: m.altoVideo };
  if (!validas(m) || m.ajuste !== "cover") return completo;
  const s = escala(m);
  const ancho = Math.min(m.anchoVideo, m.anchoElemento / s);
  const alto = Math.min(m.altoVideo, m.altoElemento / s);
  return { x: (m.anchoVideo - ancho) / 2, y: (m.altoVideo - alto) / 2, ancho, alto };
}

/**
 * Guía ID-1 en píxeles del vídeo dentro de la región visible, con la orientación pedida (por omisión horizontal).
 * Enteros y dentro del frame.
 */
export function guiaEnVideo(m: MedidasGuia, opciones: OpcionesGuiaLector = {}): Rectangulo | null {
  const r = regionVisible(m);
  if (r === null) return null;
  // Se redondea hacia dentro para que la guía nunca salga de la región visible ni del frame.
  const x0 = Math.ceil(r.x);
  const y0 = Math.ceil(r.y);
  const region = { x: x0, y: y0, ancho: Math.floor(r.x + r.ancho) - x0, alto: Math.floor(r.y + r.alto) - y0 };
  return calcularGuiaEnRegion(region, { orientacion: opciones.orientacion ?? "horizontal", ...(opciones.margen === undefined ? {} : { margen: opciones.margen }) });
}
