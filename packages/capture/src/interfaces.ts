/**
 * Interfaces públicas para los cambios posteriores (design.md, decisión 7; CAL-14 y CAL-15).
 * En este cambio solo el detector por defecto (`crearDetectorGuia`) implementa `DetectorDocumento`;
 * ningún componente implementa ni invoca `LectorCodigos` (CAL-15).
 */
import type { Cuadrilatero, DeteccionDocumento, FrameAnalisis, ResultadoCalidad } from "./calidad/tipos.js";

export type { Cuadrilatero, DeteccionDocumento, FrameAnalisis, Punto, ResultadoCalidad } from "./calidad/tipos.js";

export interface DetectorDocumento {
  readonly id: string;
  detectar(frame: FrameAnalisis): DeteccionDocumento | Promise<DeteccionDocumento>;
  liberar?(): void;
}

export interface CapturaAceptada {
  readonly ancho: number;
  readonly alto: number;
  /** RGBA a resolución completa. */
  readonly pixeles: Uint8ClampedArray;
  /** En píxeles de la captura. */
  readonly cuadrilatero: Cuadrilatero;
  readonly calidad: ResultadoCalidad;
  readonly liberada: boolean;
  /** Pone los bytes a cero (CAM-11). */
  liberar(): void;
}

/** Solo PDF417: el QR de la cédula digital no se decodifica (principio V). */
export type FormatoCodigo = "pdf417";

export interface CodigoLeido {
  readonly formato: FormatoCodigo;
  /** Bytes crudos ISO-8859-1; el parser descarta la biometría. */
  readonly bytes: Uint8Array;
  readonly esquinas: Cuadrilatero | null;
}

export interface LectorCodigos {
  readonly id: string;
  readonly formatos: readonly FormatoCodigo[];
  leer(captura: CapturaAceptada, opciones?: { readonly senal?: AbortSignal }): Promise<readonly CodigoLeido[]>;
}
