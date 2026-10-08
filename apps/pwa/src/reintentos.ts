/**
 * OFF-26: reintento silencioso de la lectura. Una captura guiada (OFF-25) puede no leerse; ante `no-encontrado`,
 * `no-valido` o `tiempo-agotado` se vuelve a la cámara hasta 3 lecturas o 20 000 ms desde el inicio de la primera.
 */
import { clasificarErrorLectura, type ResultadoLectura } from "@lector-cedula/capture";

export const MAX_LECTURAS = 3;
export const TIEMPO_MAX_REINTENTOS_MS = 20_000;

const REINTENTABLES: ReadonlySet<string> = new Set(["no-encontrado", "no-valido", "tiempo-agotado"]);

export type Decision = "reintentar" | "mostrar";

export interface Reintentos {
  /** Al empezar cada lectura. */
  iniciar(): void;
  /** Al terminar una lectura (no cancelada). */
  decidir(r: ResultadoLectura): Decision;
  /** "Iniciar cámara", "Leer otra", "Intentar de nuevo" y "Cancelar". */
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
