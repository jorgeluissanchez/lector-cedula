// Reglas de edad (OFF-24 y, con el parámetro de TI, OFF-24b de otros-documentos). Fechas `AAAA-MM-DD`. Quien nace el
// 29 de febrero cumple años el 1 de marzo en años no bisiestos.

/** `true` si en `fechaReferencia` la persona nacida en `fechaNacimiento` ya cumplió `anios` años. */
export function cumplioAnios(fechaNacimiento: string, fechaReferencia: string, anios: number): boolean {
  const diferencia = Number(fechaReferencia.slice(0, 4)) - Number(fechaNacimiento.slice(0, 4));
  // Stryker disable next-line EqualityOperator: equivalente; con `diferencia !== anios`, `>` y `>=` coinciden.
  if (diferencia !== anios) return diferencia > anios;
  return fechaReferencia.slice(5) >= fechaNacimiento.slice(5);
}

/** `true` si en `fechaReferencia` la persona nacida en `fechaNacimiento` ya cumplió 18 años. */
export function esMayorDeEdad(fechaNacimiento: string, fechaReferencia: string): boolean {
  return cumplioAnios(fechaNacimiento, fechaReferencia, 18);
}

/** OD-32b: edad mínima de la tarjeta de identidad; por debajo, el documento es el registro civil. */
export const EDAD_MINIMA_TI = 7;
