import { rampa } from "./rampa.js";
import { areaConSigno } from "./region.js";
import type { Cuadrilatero, MetricaTamano } from "./tipos.js";

export interface UmbralesTamano {
  readonly ratioMinimo: number;
  readonly ratioOk: number;
}

/** Tamaño relativo de CAL-06 (solo con `fuente: "modelo"`): área del cuadrilátero entre el área del frame. */
export function medirTamano(c: Cuadrilatero, ancho: number, alto: number, u: UmbralesTamano): MetricaTamano {
  const ratio = Math.abs(areaConSigno(c)) / (ancho * alto);
  return { ratio, subscore: rampa(ratio, u.ratioMinimo, u.ratioOk) };
}
