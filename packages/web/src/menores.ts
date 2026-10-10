/**
 * Regla de menores del envío (SDK-38, SDK-43, SDK-53; OD-30a), única para la web y el motor nativo (nucleo-js, NAT-12).
 * Un resultado es de un menor si es una tarjeta de identidad o trae `menorDeEdad: true`; se retiene (no se envía)
 * salvo con `enviarMenores: true`.
 */
export interface DatosMenor {
  readonly tipoDocumento?: unknown;
  readonly menorDeEdad?: unknown;
}

/** `true` si el resultado es de un menor (TI o `menorDeEdad`). */
export function esMenor(r: DatosMenor): boolean {
  return r.tipoDocumento === "tarjeta-identidad" || r.menorDeEdad === true;
}

/** `true` si el resultado de un menor debe quedarse en el dispositivo (`menor-no-enviado` o rechazo local). */
export function retenerMenor(r: DatosMenor, opciones: { readonly enviarMenores?: unknown }): boolean {
  return esMenor(r) && opciones.enviarMenores !== true;
}
