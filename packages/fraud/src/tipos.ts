/**
 * Contrato de la señal de riesgo (cambio deteccion-fraude, FRA-01; design.md, decisión 10).
 * La señal informa; no decide sola. Nunca contiene datos del documento ni píxeles (FRA-03).
 */

export type CodigoMotivo = "pantalla" | "fotocopia" | "recorte" | "edicion" | "inconsistencia";

export type DetallePantalla = "moire" | "subpixeles" | "reflejo-plano" | "marco-pantalla" | "banding";
export type DetalleFotocopia = "gris" | "baja-saturacion" | "tramado" | "papel" | "sin-holograma";
export type DetalleRecorte = "aspecto" | "esquinas-rectas";
export type DetalleEdicion = "doble-compresion" | "superposicion";
export type DetalleInconsistencia =
  | "fecha-imposible"
  | "nuip-formato"
  | "municipio-inexistente"
  | "vencido"
  | "digito-control"
  | "mrz-vs-visible"
  | "pdf417-vs-visible";

export type Detalle = DetallePantalla | DetalleFotocopia | DetalleRecorte | DetalleEdicion | DetalleInconsistencia;

export interface Motivo {
  codigo: CodigoMotivo;
  /** 0 a 1. */
  puntaje: number;
  /** Código kebab-case de lista cerrada, sin datos del documento. */
  detalle: Detalle;
}

export type Nivel = "bajo" | "medio" | "alto";
export type Accion = "continuar" | "revisar" | "bloquear";

export interface SenalRiesgo {
  version: 1;
  /** Entero 0-100. */
  puntaje: number;
  nivel: Nivel;
  motivos: Motivo[];
  accion: Accion;
  senalesOmitidas: string[];
  fase: "heuristica" | "heuristica+modelo";
  warnings: string[];
}

export interface PoliticaBloqueo {
  puntajeMinimo: number;
  motivosMinimos: number;
  /** Permite bloquear con un único motivo (decisión P3). */
  motivoUnico?: boolean;
}

export interface ConfigFraude {
  umbralMedio: number;
  umbralAlto: number;
  pesos: Record<CodigoMotivo, number>;
  bloquearSi?: PoliticaBloqueo;
  modelo: { habilitado: boolean };
}

export interface Punto {
  x: number;
  y: number;
}

/** Frame RGBA como el de `ImageData`. */
export interface FrameRGBA {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Campos de un documento ya leídos por los parsers o el OCR (ISO AAAA-MM-DD). */
export interface CamposDocumento {
  nuip?: string;
  fechaNacimiento?: string;
  fechaExpedicion?: string;
  fechaVencimiento?: string;
  /** Código DIVIPOL de 5 dígitos (se admite `DD-MMM`). */
  codigoLugar?: string;
}

export interface DatosDocumento {
  /** Campos del PDF417 de la amarilla. */
  pdf417?: CamposDocumento;
  /** Líneas crudas de la MRZ de la digital; se analizan con `parsearMrzCedulaDigital`. */
  mrz?: { lineas: unknown };
  /** Texto visible del anverso (OCR). */
  visible?: CamposDocumento;
}

export interface EntradaFraude {
  frames: FrameRGBA[];
  /** Esquinas de la tarjeta en el frame: superior izquierda, superior derecha, inferior derecha, inferior izquierda. */
  cuadrilatero: [Punto, Punto, Punto, Punto];
  tipo: "amarilla" | "digital";
  /** Cara capturada; el reverso no tiene holograma (por defecto `anverso`). */
  cara?: "anverso" | "reverso";
  /** El cuadrilátero es la guía de encuadre y no los bordes detectados: se omiten las señales geométricas (FRA-20). */
  cuadrilateroAproximado?: boolean;
  datos?: DatosDocumento;
  reloj: () => Date;
}
