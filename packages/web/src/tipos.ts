/**
 * Tipos públicos del núcleo headless (sdk-integracion, SDK-27, SDK-28, SDK-38). Sin código: solo contratos.
 */
import type { FrameLectura, ResultadoLectura } from "@lector-cedula/capture";

type LecturaCorrecta = Extract<ResultadoLectura, { ok: true }>;
export type CamposDocumento = LecturaCorrecta["campos"];
export type TipoDocumento = LecturaCorrecta["tipoDocumento"];

export type FaseLector = "inicio" | "permiso" | "activo" | "listo" | "leyendo" | "resultado" | "error";

export type MotivoCalidad = "oscuro" | "sobreexpuesto" | "reflejo" | "desenfocado" | "acerca";

export type ContenidoLector = "pdf417" | "mrz-td1" | "mrz-td3";

export interface Rectangulo {
  readonly x: number;
  readonly y: number;
  readonly ancho: number;
  readonly alto: number;
}

export interface CalidadLector {
  readonly score: number;
  readonly motivo: MotivoCalidad | null;
}

export interface GuiaLector {
  /** Píxeles del vídeo. */
  readonly video: Rectangulo;
  /** Fracciones [0, 1] del vídeo. */
  readonly normalizada: Rectangulo;
}

/** Resultado de presentación: nunca de confianza (SDK-22). */
export interface ResultadoPresentacion {
  readonly tipo: TipoDocumento;
  readonly campos: CamposDocumento;
  readonly warnings: readonly string[];
  readonly confiable: false;
  readonly validacion_id: string | null;
}

export type CodigoError =
  | "opcion-invalida"
  | "entorno-no-soportado"
  | "camara-denegada"
  | "camara-no-disponible"
  | "camara-ocupada"
  | "camara-error"
  | "motor-no-disponible"
  | "lectura-fallida"
  | "menor-de-edad"
  | "documento-no-admitido"
  | "calidad-error";

export interface ErrorLector {
  readonly codigo: CodigoError;
  readonly mensaje: string;
  readonly opcion?: string;
}

export type CodigoEnvio = "servidor-no-disponible" | "subida-fallida" | "sesion-invalida" | "sesion-vencida" | "menor-no-enviado";

export type EnvioLector =
  | { readonly estado: "enviando" }
  | { readonly estado: "enviado"; readonly validacion_id: string }
  | { readonly estado: "fallido"; readonly codigo: CodigoEnvio };

export interface EstadoLector {
  readonly fase: FaseLector;
  readonly calidad: CalidadLector | null;
  readonly guia: GuiaLector | null;
  readonly contenido: ContenidoLector | null;
  readonly progreso: number | null;
  readonly intento: number;
  readonly resultado: ResultadoPresentacion | null;
  readonly error: ErrorLector | null;
  readonly envio: EnvioLector | null;
}

export type Idioma = "es" | "en";

export interface OpcionesLector {
  /** `https://...` o `http://localhost`. Opcional: sin él no hay ninguna petición fuera del origen (SDK-37). */
  readonly servidor?: string;
  /**
   * Token de `hosted_url`; exige `servidor`. Antes de crear la sesión, el integrador debe obtener la autorización del
   * titular para el tratamiento de sus datos (Ley 1581 de 2012); el SDK no la pide por él.
   */
  readonly sesion?: string;
  /** URL base de los assets (`@lector-cedula/web/assets`). */
  readonly recursos?: string;
  /** Tipos admitidos; por omisión todos. */
  readonly documentos?: readonly TipoDocumento[];
  /** Admite la tarjeta de identidad y los menores (OD-30a). */
  readonly admitirTi?: boolean;
  /** Con envío: sube también tarjetas de identidad y menores (por omisión no se envían: `menor-no-enviado`). */
  readonly enviarMenores?: boolean;
  /** Solo afecta a `error.mensaje`. */
  readonly idioma?: Idioma;
}

export interface ControladorLector {
  iniciar(video: HTMLVideoElement): Promise<void>;
  cancelar(): void;
  reintentar(): void;
  destruir(): void;
  obtenerEstado(): EstadoLector;
  suscribir(fn: (estado: EstadoLector) => void): () => void;
}

// ---- Dependencias inyectables (DEPS) ----

export interface CamaraLector {
  readonly stream: MediaStream;
  readonly ancho: number;
  readonly alto: number;
  detener(): void;
}

/** Análisis de un frame del vídeo. */
export interface FrameCalidad {
  readonly score: number;
  readonly motivo: MotivoCalidad | null;
  /** Guía en píxeles del vídeo. */
  readonly guia: Rectangulo;
  readonly anchoVideo: number;
  readonly altoVideo: number;
  /** Pista de tipo (presencia); `null` sin documento. */
  readonly contenido: "pdf417" | "mrz" | null;
  /** Captura guiada: el frame basta para leer sin pasar por `listo`. */
  readonly guiada?: boolean;
}

export interface CalidadInyectada {
  /** `null` si aún no hay frame. Rechaza ante un fallo del Worker. */
  analizar(video: HTMLVideoElement): Promise<FrameCalidad | null>;
  terminar(): void;
}

/** Captura aceptada: frames de lectura en memoria (se ponen a cero al liberar). */
export interface CapturaLector {
  readonly frames: readonly FrameLectura[];
  readonly pista: "pdf417" | "mrz" | null;
  /** Imagen codificada para el envío opcional (solo con `sesion`). */
  readonly imagen?: () => Promise<Blob>;
  liberar(): void;
}

export interface LectorInyectado {
  leer(captura: CapturaLector, senal: AbortSignal, progreso: (p: number) => void): Promise<ResultadoLectura>;
  terminar(): void;
}

export interface DependenciasLector {
  /** Pide la cámara y la conecta al `video` (`srcObject` y `play()`). Rechaza con el error de `getUserMedia`. */
  abrirCamara(video: HTMLVideoElement): Promise<CamaraLector>;
  crearCalidad(): CalidadInyectada;
  /** Revalida a resolución completa; `null` si no alcanza el umbral. */
  capturar(video: HTMLVideoElement, camara: CamaraLector, contenido: "pdf417" | "mrz" | null): Promise<CapturaLector | null>;
  crearLector(): LectorInyectado;
  /** Programa el siguiente ciclo de análisis; devuelve la cancelación. */
  programar(fn: () => void): () => void;
  ahora(): number;
  /** `fetch` para el envío opcional. */
  fetch?: typeof fetch;
}
