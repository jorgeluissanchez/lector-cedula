/**
 * Adaptador de evals del parser PDF417 de la cédula amarilla (cambio parser-pdf417-amarilla, design.md decisión 15).
 * El JSON no transporta Uint8Array: la entrada del fixture es hexadecimal en minúsculas. El resultado se aplana para
 * medir exact match y CER por campo: éxito -> `{ ok, ...campos, variante, modo, bloqueDemografico, warnings }`;
 * error -> `{ ok: false, error }`.
 */
import { parsearPdf417Amarilla } from "../../../packages/parsers/dist/index.js";

const HEX = /^(?:[0-9a-f]{2})*$/;

/** Bytes de un texto hexadecimal en minúsculas; lanza si no lo es. */
function bytesDeHex(hex) {
  if (typeof hex !== "string" || !HEX.test(hex)) throw new Error("entrada no es hex en minúsculas de longitud par");
  const bytes = new Uint8Array(hex.length / 2);
  // Stryker disable next-line EqualityOperator: escribir en el índice length de un Uint8Array no tiene efecto
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return bytes;
}

/** Evalúa un fixture `pdf417-amarilla`: parsea los bytes del hex y aplana el resultado. */
export function evaluarPdf417AmarillaHex(hex, opciones) {
  const bytes = bytesDeHex(hex);
  const r = parsearPdf417Amarilla(bytes, opciones);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, ...r.campos, ...r.trama, warnings: r.warnings };
}
