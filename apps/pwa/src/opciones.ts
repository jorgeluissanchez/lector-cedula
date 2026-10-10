/**
 * Valores efectivos de las opciones de la demo (demo-opciones, DOP-04 y DOP-05). Lo forzado por la compilación o por la
 * URL siempre manda; la preferencia del panel solo cuenta en la compilación demo.
 */

/** DOP-04: con la TI de compilación o en la demo se compilan el texto y la página de la autorización del representante. */
export function tiDisponible(admitirTi: boolean, demo: boolean): boolean {
  return admitirTi || demo;
}

/** DOP-04: TI que se pasa a la lectura (`admitirTarjetaIdentidad`). */
export function tiEfectiva(o: { readonly compilacion: boolean; readonly demo: boolean; readonly preferencia: boolean }): boolean {
  return o.compilacion || (o.demo && o.preferencia);
}

/** DOP-05: señal de fraude; `forzado` es `fraudeActivo(VITE_FRAUDE, location.search)` (FRA-21). */
export function fraudeEfectivo(o: { readonly forzado: boolean; readonly demo: boolean; readonly preferencia: boolean }): boolean {
  return o.forzado || (o.demo && o.preferencia);
}
