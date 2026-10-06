import { ErrorFixture } from "./errores.js";

/**
 * Lee el objeto de opciones recibido como `unknown` (FX-03). `undefined` equivale a `{}`; cualquier otro valor
 * que no sea un objeto se rechaza con `variante-invalida` y `campo` `"opciones"`, porque no puede nombrar una variante.
 */
export function leerOpciones(valor: unknown): Readonly<Record<string, unknown>> {
  if (valor === undefined) return {};
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
    throw new ErrorFixture("variante-invalida", "opciones");
  }
  return valor as Record<string, unknown>;
}

/** Valida la opción `variante` contra la lista permitida; `undefined` da la variante por omisión. */
export function validarVariante<V extends string>(valor: unknown, permitidas: readonly V[], porOmision: V): V {
  if (valor === undefined) return porOmision;
  if (!(permitidas as readonly unknown[]).includes(valor)) throw new ErrorFixture("variante-invalida", "variante");
  return valor as V;
}
