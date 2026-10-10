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
      /** SDK-61: guía en píxeles del frame original (zona visible); dentro del frame o `frame-invalido`. */
      readonly guia?: { readonly x: number; readonly y: number; readonly ancho: number; readonly alto: number };
    };

/**
 * OFF-27: contenido de cédula que vio la presencia (pista de tipo para la lectura), forma heredada: `"mrz"` es TD1 y el
 * TD3 llega como `null`. Es la salida del Worker sin `contenidoTd` (consumidores aún no migrados, como @lector-cedula/web).
 */
export type ContenidoPresencia = "pdf417" | "mrz" | null;

/** OD-20 (otros-documentos): contenido del Worker con `contenidoTd: true` (la PWA). */
export type ContenidoPresenciaTd = "pdf417" | "mrz-td1" | "mrz-td3" | null;

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
      /** OFF-27: `null` si la presencia no se evaluó o no hay cédula. */
      readonly contenido: ContenidoPresencia | ContenidoPresenciaTd;
    }
  | { readonly tipo: "error"; readonly id: number; readonly codigo: CodigoErrorWorker; readonly pixeles?: ArrayBuffer };
