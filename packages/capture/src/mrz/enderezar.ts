// Enderezado del recorte antes del OCR (cambio leer-mrz-desde-imagen, LMI-04 y LMI-06). Puro y total.
// Con ±2° las 3 líneas de la MRZ se inclinan lo bastante para que Tesseract inserte o pierda caracteres; se estima la
// inclinación maximizando la nitidez de la proyección por filas y se gira el recorte en sentido contrario.
import { girar, type Pixeles } from "../pdf417/pixeles.js";
import { luminancias, umbralOtsu, type PixelesRgba } from "./localizar.js";

/** Ángulos probados, en grados (de -MAXIMO a MAXIMO en pasos de PASO). */
export const INCLINACION_MAXIMA = 4;
export const PASO_INCLINACION = 0.25;
/** Por debajo de este ángulo no se gira (evita interpolar sin necesidad). */
export const INCLINACION_MINIMA = 0.5;

/** Ángulos probados ordenados por valor absoluto (0, 0,25, -0,25, 0,5, ...): ante empate gana el menor giro. */
export function angulosProbados(): number[] {
  const r = [0];
  for (let k = 1; k * PASO_INCLINACION <= INCLINACION_MAXIMA; k++) r.push(k * PASO_INCLINACION, -k * PASO_INCLINACION);
  return r;
}

/**
 * Inclinación estimada del texto en grados (positiva si las líneas bajan hacia la derecha, como un giro horario en
 * canvas 2D), o 0 si no hay tinta separable.
 */
export function estimarInclinacion(p: PixelesRgba): number {
  const { width: w, height: h } = p;
  const luma = luminancias(p);
  // Sin umbral (un solo nivel) no hay tinta: todos los ángulos empatan y gana 0.
  const t = umbralOtsu(luma) ?? -1;
  const puntos: (readonly [number, number])[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if ((luma[y * w + x] as number) <= t) puntos.push([x, y]);
  }
  // Con |tan| < 0,07 el desplazamiento vertical nunca llega a w filas: el margen w basta.
  const filas = new Float64Array(h + 2 * w);
  let mejorAngulo = 0;
  let mejorPuntaje = -1;
  for (const angulo of angulosProbados()) {
    const tan = Math.tan((angulo * Math.PI) / 180);
    filas.fill(0);
    for (const [x, y] of puntos) {
      const fila = Math.round(y - x * tan) + w;
      filas[fila] = (filas[fila] as number) + 1;
    }
    let puntaje = 0;
    for (const v of filas) puntaje += v * v;
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejorAngulo = angulo;
    }
  }
  return mejorAngulo;
}

/** Devuelve `p` enderezado si su inclinación estimada alcanza `INCLINACION_MINIMA`; si no, `p` sin cambios. */
export function enderezar(p: Pixeles): Pixeles {
  const angulo = estimarInclinacion(p);
  return Math.abs(angulo) >= INCLINACION_MINIMA ? girar(p, -angulo) : p;
}
