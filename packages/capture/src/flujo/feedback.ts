/**
 * CAL-12: texto de la región de estado (design.md, decisión 9). Salvo "Listo", que es inmediato, el texto cambia solo
 * cuando la nueva situación se repite en 2 resultados consecutivos.
 */
import type { Motivo, ResultadoCalidad } from "../calidad/tipos.js";

/** `inicial`: sin resultados aún; `estable`: motivo `null` sin la racha completa; `listo`: captura aceptada. */
export type Situacion = "inicial" | Motivo | "estable" | "listo";

export const TEXTOS_FEEDBACK: Readonly<Record<Situacion, string>> = Object.freeze({
  inicial: "Ubica la cédula dentro del recuadro",
  acerca: "Acerca la cédula",
  oscuro: "Busca un lugar con más luz",
  sobreexpuesto: "Hay demasiada luz",
  reflejo: "Hay reflejo, inclina la cédula",
  desenfocado: "Desenfocado, mantén la cámara quieta",
  estable: "No te muevas",
  listo: "Listo",
});

export function textoSituacion(s: Situacion): string {
  return TEXTOS_FEEDBACK[s];
}

export interface Feedback {
  readonly texto: string;
  actualizar(resultado: Pick<ResultadoCalidad, "motivo">): string;
  listo(): string;
  reiniciar(): void;
}

export function crearFeedback(): Feedback {
  let vigente: Situacion = "inicial";
  let anterior: Situacion | null = null;
  return {
    get texto() {
      return TEXTOS_FEEDBACK[vigente];
    },
    actualizar({ motivo }) {
      const situacion: Situacion = motivo ?? "estable";
      if (situacion === anterior) vigente = situacion;
      anterior = situacion;
      return TEXTOS_FEEDBACK[vigente];
    },
    listo() {
      vigente = "listo";
      return TEXTOS_FEEDBACK.listo;
    },
    reiniciar() {
      vigente = "inicial";
      anterior = null;
    },
  };
}
