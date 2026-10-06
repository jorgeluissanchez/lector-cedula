/**
 * Clasificación de la trama (PA-06; design.md, decisión 4). H02 (byte 24 confirmado para la trama completa;
 * la posición en tramas truncadas depende del lector) y H07 (variante sin marcador, pendiente).
 */
import { buscarMarcador } from "./bytes.js";
import type { VarianteTramaPdf417 } from "./index.js";

/** El marcador solo se busca en los primeros 64 bytes: uno aleatorio en la cola no cambia la variante (PA-16). */
const LIMITE_BUSQUEDA_MARCADOR = 64;
const POSICION_MARCADOR_COMPLETA = 24;
/** Cabecera `[10,24)` donde la trama completa lleva su run de NUL. */
const INICIO_RUN_NUL = 10;
/** Regla "más de 4 NUL seguidos" de la investigación. */
const MIN_RUN_NUL = 5;

function hayRunNul(bytes: Uint8Array, desde: number, hasta: number, minimo: number): boolean {
  let run = 0;
  for (let i = desde; i < hasta; i++) {
    run = bytes[i] === 0 ? run + 1 : 0;
    if (run >= minimo) return true;
  }
  return false;
}

/** Variante de la trama según la posición del marcador y el run de NUL de la cabecera. */
export function clasificarTrama(bytes: Uint8Array): VarianteTramaPdf417 {
  const posicion = buscarMarcador(bytes, LIMITE_BUSQUEDA_MARCADOR);
  if (posicion < 0) return "sin-pubdsk";
  const completa =
    posicion === POSICION_MARCADOR_COMPLETA &&
    hayRunNul(bytes, INICIO_RUN_NUL, POSICION_MARCADOR_COMPLETA, MIN_RUN_NUL);
  return completa ? "completa" : "truncada";
}
