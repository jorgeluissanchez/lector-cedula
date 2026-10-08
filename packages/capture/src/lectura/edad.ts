// Regla de mayoría de edad (OFF-24): el lector solo admite cédulas de ciudadanía de mayores de edad.
// Fechas `AAAA-MM-DD`. Quien nace el 29 de febrero cumple años el 1 de marzo en años no bisiestos.

/** `true` si en `fechaReferencia` la persona nacida en `fechaNacimiento` ya cumplió 18 años. */
export function esMayorDeEdad(
  fechaNacimiento: string,
  fechaReferencia: string,
): boolean {
  const anios =
    Number(fechaReferencia.slice(0, 4)) - Number(fechaNacimiento.slice(0, 4));
  // Stryker disable next-line EqualityOperator: equivalente; con `anios !== 18`, `>` y `>=` coinciden.
  if (anios !== 18) return anios > 18;
  return fechaReferencia.slice(5) >= fechaNacimiento.slice(5);
}
