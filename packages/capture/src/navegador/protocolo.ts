/** Protocolo entre el hilo principal y el Worker de calidad (design.md, decisión 6; CAL-09). */
import type { DeteccionDocumento, ResultadoCalidad } from "../calidad/tipos.js";
import type { ResultadoConfiguracion } from "../calidad/umbrales.js";

export type MensajeAlWorker =
  | { readonly tipo: "configurar"; readonly id: number; readonly umbrales: unknown }
  | {
      readonly tipo: "analizar";
      readonly id: number;
      readonly ancho: number;
      readonly alto: number;
      readonly anchoOriginal: number;
      readonly altoOriginal: number;
      /** Transferido, sin copia. */
      readonly pixeles: ArrayBuffer;
    };

export type CodigoErrorWorker = "frame-invalido" | "cuadrilatero-invalido" | "mensaje-invalido";

export type MensajeDelWorker =
  | { readonly tipo: "configurado"; readonly id: number; readonly resultado: ResultadoConfiguracion }
  | {
      readonly tipo: "resultado";
      readonly id: number;
      readonly resultado: ResultadoCalidad;
      readonly deteccion: DeteccionDocumento;
      /** El mismo buffer recibido, devuelto por transferencia. */
      readonly pixeles: ArrayBuffer;
    }
  | { readonly tipo: "error"; readonly id: number; readonly codigo: CodigoErrorWorker; readonly pixeles?: ArrayBuffer };
