/**
 * CAL-10: cadencia de análisis. Envía un frame solo si no hay otro en vuelo y han pasado al menos
 * `intervaloMinimoMs` desde el envío anterior. Reloj inyectado para probarlo sin tiempo real.
 */
export interface Planificador {
  readonly enVuelo: boolean;
  /** Decide si se envía un frame ahora; si devuelve `true`, queda un frame en vuelo. */
  intentar(): boolean;
  /** La respuesta del frame en vuelo llegó. */
  completar(): void;
  /** Olvida el frame en vuelo y el último envío (al detener o reanudar la cámara). */
  reiniciar(): void;
}

export function crearPlanificador(intervaloMinimoMs: number, reloj: () => number): Planificador {
  let enVuelo = false;
  let ultimoEnvio: number | null = null;
  return {
    get enVuelo() {
      return enVuelo;
    },
    intentar() {
      const ahora = reloj();
      if (enVuelo || (ultimoEnvio !== null && ahora - ultimoEnvio < intervaloMinimoMs)) return false;
      enVuelo = true;
      ultimoEnvio = ahora;
      return true;
    },
    completar() {
      enVuelo = false;
    },
    reiniciar() {
      enVuelo = false;
      ultimoEnvio = null;
    },
  };
}
