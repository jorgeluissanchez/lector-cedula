/**
 * CAL-11: auto-captura. Se solicita cuando `framesConsecutivos` resultados seguidos tienen score >= `umbralListo`;
 * un resultado por debajo reinicia la cuenta. La captura a resolución completa se revalida: si no alcanza el umbral,
 * la cuenta vuelve a 0 y el análisis continúa; si lo alcanza, la pantalla pasa a `listo`.
 */
import type { ResultadoCalidad } from "../calidad/tipos.js";
import type { Umbrales } from "../calidad/umbrales.js";

export type FaseAutocaptura = "analizando" | "revalidando" | "listo";

export interface PasoAutocaptura {
  readonly cuenta: number;
  readonly solicitarCaptura: boolean;
}

export type ResultadoRevalidacion =
  | { readonly aceptada: false; readonly cuenta: 0; readonly pantalla: "activo" }
  | { readonly aceptada: true; readonly cuenta: number; readonly pantalla: "listo"; readonly calidad: ResultadoCalidad };

export interface Autocaptura {
  readonly cuenta: number;
  readonly fase: FaseAutocaptura;
  registrar(score: number): PasoAutocaptura;
  revalidar(calidad: ResultadoCalidad): ResultadoRevalidacion;
  reiniciar(): void;
}

export function crearAutocaptura(u: Pick<Umbrales, "umbralListo" | "framesConsecutivos">): Autocaptura {
  let cuenta = 0;
  let fase: FaseAutocaptura = "analizando";
  return {
    get cuenta() {
      return cuenta;
    },
    get fase() {
      return fase;
    },
    registrar(score) {
      // Mientras se revalida o tras `listo`, los resultados no cuentan.
      if (fase !== "analizando") return { cuenta, solicitarCaptura: false };
      cuenta = score >= u.umbralListo ? cuenta + 1 : 0;
      const solicitarCaptura = cuenta >= u.framesConsecutivos;
      if (solicitarCaptura) fase = "revalidando";
      return { cuenta, solicitarCaptura };
    },
    revalidar(calidad) {
      if (fase !== "revalidando") throw new Error("sin-captura-solicitada");
      if (calidad.score >= u.umbralListo) {
        fase = "listo";
        return { aceptada: true, cuenta, pantalla: "listo", calidad };
      }
      cuenta = 0;
      fase = "analizando";
      return { aceptada: false, cuenta: 0, pantalla: "activo" };
    },
    reiniciar() {
      cuenta = 0;
      fase = "analizando";
    },
  };
}
