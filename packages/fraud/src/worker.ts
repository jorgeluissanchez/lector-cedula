/**
 * Manejador para el Worker (FRA-03): evalúa y pone a cero los buffers de los frames recibidos, también si la
 * evaluación falla. No escribe en ningún almacenamiento.
 */
import { evaluarFraude } from "./evaluar.js";
import type { SenalRiesgo } from "./tipos.js";

export function evaluarYLiberar(entrada: unknown, config?: unknown): SenalRiesgo {
  try {
    return evaluarFraude(entrada, config);
  } finally {
    const fs = typeof entrada === "object" && entrada !== null ? (entrada as { frames?: unknown }).frames : undefined;
    if (Array.isArray(fs)) {
      for (const f of fs) {
        const data = typeof f === "object" && f !== null ? (f as { data?: unknown }).data : undefined;
        if (data instanceof Uint8ClampedArray) data.fill(0);
      }
    }
  }
}
