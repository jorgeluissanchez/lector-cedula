/**
 * Tipos del núcleo de calidad (design.md, decisión 7). Puro: sin DOM salvo `Uint8ClampedArray`.
 * `src/interfaces.ts` los reexporta junto con las interfaces de detector y lector.
 */

export type Punto = readonly [x: number, y: number];
/** Orden: superior izquierda, superior derecha, inferior derecha, inferior izquierda. */
export type Cuadrilatero = readonly [Punto, Punto, Punto, Punto];

export interface FrameAnalisis {
  readonly ancho: number;
  readonly alto: number;
  /** RGBA de 8 bits por canal. */
  readonly pixeles: Uint8ClampedArray;
  readonly anchoOriginal: number;
  readonly altoOriginal: number;
  /** SDK-61: guía en píxeles del frame original elegida por el llamador (zona visible, orientación); sin ella, CAM-08. */
  readonly guia?: { readonly x: number; readonly y: number; readonly ancho: number; readonly alto: number };
}

export interface DeteccionDocumento {
  /** En píxeles del frame de análisis; `null` si no se encontró documento. */
  readonly cuadrilatero: Cuadrilatero | null;
  /** 0..1, `null` si no aplica. */
  readonly confianza: number | null;
  readonly fuente: "guia" | "modelo";
}

/** Motivos en orden de prioridad para los empates (CAL-07). */
export const MOTIVOS = ["acerca", "oscuro", "sobreexpuesto", "reflejo", "desenfocado"] as const;
export type Motivo = (typeof MOTIVOS)[number];

export interface MetricaNitidez {
  readonly varianza: number;
  readonly subscore: number;
}

export interface MetricaReflejo {
  readonly fraccionSaturada: number;
  readonly componenteMayor: number;
  readonly subscore: number;
}

export interface MetricaExposicion {
  readonly media: number;
  readonly fraccionOscura: number;
  readonly subscoreOscuro: number;
  readonly subscoreSobreexpuesto: number;
}

export interface MetricaTamano {
  readonly ratio: number;
  readonly subscore: number;
}

export interface MetricasCalidad {
  readonly nitidez: MetricaNitidez;
  readonly reflejo: MetricaReflejo;
  readonly exposicion: MetricaExposicion;
  /** `null` con la guía (`fuente: "guia"`), CAL-06. */
  readonly tamano: MetricaTamano | null;
}

export interface ResultadoCalidad {
  /** Entero 0..100. */
  readonly score: number;
  readonly motivo: Motivo | null;
  /** `null` si el detector no encontró documento (CAL-14). */
  readonly metricas: MetricasCalidad | null;
}

export type CodigoErrorAnalisis = "frame-invalido" | "cuadrilatero-invalido";

export type ResultadoAnalisis =
  | { readonly ok: true; readonly resultado: ResultadoCalidad }
  | { readonly ok: false; readonly codigo: CodigoErrorAnalisis };
