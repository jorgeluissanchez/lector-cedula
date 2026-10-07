/**
 * CAM-11: captura aceptada en memoria. `liberar()` pone sus bytes a cero; la app lo llama al pulsar "Repetir" o
 * "Cancelar" y al ocultarse la página (design.md, decisión 8). Nunca se codifica ni se guarda.
 */
import type { Cuadrilatero, ResultadoCalidad } from "../calidad/tipos.js";
import type { CapturaAceptada } from "../interfaces.js";

export interface DatosCaptura {
  readonly ancho: number;
  readonly alto: number;
  readonly pixeles: Uint8ClampedArray;
  readonly cuadrilatero: Cuadrilatero;
  readonly calidad: ResultadoCalidad;
}

export function crearCapturaAceptada({ ancho, alto, pixeles, cuadrilatero, calidad }: DatosCaptura): CapturaAceptada {
  let liberada = false;
  return {
    ancho,
    alto,
    pixeles,
    cuadrilatero,
    calidad,
    get liberada() {
      return liberada;
    },
    liberar() {
      pixeles.fill(0);
      liberada = true;
    },
  };
}
