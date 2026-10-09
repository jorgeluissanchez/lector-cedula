/**
 * Reintento automático (OFF-26, misma regla que la PWA): ante "no encontrado", "no válido" o "tiempo agotado" se
 * vuelve a la cámara hasta 3 lecturas o 20 000 ms desde la primera. La PWA pasa a usar esta copia al migrar (3.6).
 */
import { clasificarErrorLectura, type ResultadoLectura } from "@lector-cedula/capture";

export const MAX_LECTURAS = 3;
export const TIEMPO_MAX_REINTENTOS_MS = 20_000;

const REINTENTABLES: ReadonlySet<string> = new Set(["no-encontrado", "no-valido", "tiempo-agotado"]);

export interface Reintentos {
  iniciar(): void;
  decidir(r: ResultadoLectura): "reintentar" | "mostrar";
  reiniciar(): void;
}

export function crearReintentos(ahora: () => number): Reintentos {
  let lecturas = 0;
  let inicio = 0;
  return {
    iniciar() {
      if (lecturas === 0) inicio = ahora();
      lecturas++;
    },
    decidir(r) {
      if (r.ok || !REINTENTABLES.has(clasificarErrorLectura(r).codigo)) return "mostrar";
      return lecturas < MAX_LECTURAS && ahora() - inicio < TIEMPO_MAX_REINTENTOS_MS ? "reintentar" : "mostrar";
    },
    reiniciar() {
      lecturas = 0;
    },
  };
}
