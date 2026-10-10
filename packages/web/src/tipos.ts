/**
 * Tipos públicos del núcleo headless (sdk-integracion, SDK-27, SDK-28, SDK-38). Sin código: solo contratos.
 */
import type { CamposDocumento, FrameLectura, ResultadoLectura } from "@lector-cedula/capture";
import type { EtapaIntermedia, Rechazo } from "@lector-cedula/protocolo";
import type { DispositivoLector, UmbralesAuto } from "./decidir-front.js";

export type { DispositivoLector, MotivoFront, UmbralesAuto, DecisionFront } from "./decidir-front.js";
export type { MotivoRechazo } from "@lector-cedula/protocolo";

type LecturaCorrecta = Extract<ResultadoLectura, { ok: true }>;
/** SDK-65: campos del documento con los tipos que producen los parsers (una sola definición, en `@lector-cedula/capture`). */
export type { CamposDocumento, FechaIso, LugarNacimiento, Rh, SexoDocumento } from "@lector-cedula/capture";
export type TipoDocumento = LecturaCorrecta["tipoDocumento"];

export type FaseLector = "inicio" | "permiso" | "activo" | "listo" | "leyendo" | "verificando" | "resultado" | "error";

export type MotivoCalidad = "oscuro" | "sobreexpuesto" | "reflejo" | "desenfocado" | "acerca";

export type ContenidoLector = "pdf417" | "mrz-td1" | "mrz-td3";

export interface Rectangulo {
  readonly x: number;
  readonly y: number;
  readonly ancho: number;
  readonly alto: number;
}

/** SDK-62: cómo se ajusta el vídeo a su elemento (`object-fit` computado; cualquier valor distinto de `cover` es `contain`). */
export type AjusteVideo = "cover" | "contain";

/** SDK-61: guía ID-1 de pie (`vertical`) o apaisada (`horizontal`, por omisión) y margen por lado (0 a 0,25; por omisión 0,05). */
export interface OpcionesGuiaLector {
  readonly orientacion?: "horizontal" | "vertical";
  readonly margen?: number;
}

/** SDK-62: medidas del `<video>` del integrador (píxeles del vídeo y píxeles CSS del elemento). */
export interface MedidasVideo {
  readonly anchoVideo: number;
  readonly altoVideo: number;
  readonly anchoElemento: number;
  readonly altoElemento: number;
  readonly ajuste: AjusteVideo;
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

/** Resultado de presentación; `confiable: true` solo tras el evento final `ok` del backend propio (SDK-28, SDK-46). */
export interface ResultadoPresentacion {
  readonly tipo: TipoDocumento;
  readonly campos: CamposDocumento;
  readonly warnings: readonly string[];
  readonly confiable: boolean;
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
  | "calidad-error"
  | "verificacion-rechazada"
  | "backend-no-disponible"
  | "backend-rechazo-http"
  | "backend-tiempo-agotado"
  | "protocolo-invalido"
  | "cola-vencida"
  | "autoinicio-fallido";

export interface ErrorLector {
  readonly codigo: CodigoError;
  readonly mensaje: string;
  readonly opcion?: string;
  /** Con `autoinicio-fallido`: el código del fallo de la cámara (SDK-49). */
  readonly causa?: CodigoError;
}

/** SDK-46: etapa de la verificación en el backend propio; `en-espera` mientras no hay red (SDK-58). */
export interface VerificacionLector {
  readonly etapa: "en-espera" | EtapaIntermedia;
  readonly progreso: number | null;
}

/** SDK-47: rechazo del backend (o local, `menor-de-edad`); `diferencias` solo con rutas de campo. */
export type RechazoLector = Rechazo;

export interface IntentosVerificacion {
  readonly usados: number;
  readonly maximo: number;
}

export type ModoLector = "front" | "back" | "front-back";
export type ValidacionLector = "estricta" | "auto";

export type CodigoEnvio = "servidor-no-disponible" | "subida-fallida" | "sesion-invalida" | "sesion-vencida" | "menor-no-enviado";

export type EnvioLector =
  | { readonly estado: "enviando" }
  | { readonly estado: "enviado"; readonly validacion_id: string }
  | { readonly estado: "fallido"; readonly codigo: CodigoEnvio };

export interface EstadoLector {
  readonly fase: FaseLector;
  readonly calidad: CalidadLector | null;
  readonly guia: GuiaLector | null;
  /** SDK-62: la guía en píxeles CSS relativos al `<video>` (según su tamaño y `object-fit`); `null` sin guía o sin medidas. */
  readonly guiaEnPantalla: Rectangulo | null;
  readonly contenido: ContenidoLector | null;
  readonly progreso: number | null;
  readonly intento: number;
  readonly resultado: ResultadoPresentacion | null;
  readonly error: ErrorLector | null;
  readonly envio: EnvioLector | null;
  readonly verificacion: VerificacionLector | null;
  readonly rechazo: RechazoLector | null;
  readonly intentosVerificacion: IntentosVerificacion | null;
  /** SDK-55: modo efectivo, validación (solo `front-back`), si el motor local lee y el motivo de la decisión. */
  readonly modo: ModoLector | null;
  readonly validacion: ValidacionLector | null;
  readonly frontActivo: boolean | null;
  readonly modoMotivo: string | null;
}

export type Idioma = "es" | "en";

export interface OpcionesLector {
  /**
   * Endpoint del backend propio (SDK-45): ruta relativa, mismo origen, `https:` u `http://localhost`. Excluyente con
   * `servidor`/`sesion`. Antes de enviar, el integrador debe obtener la autorización del titular (Ley 1581 de 2012).
   */
  readonly backend?: string;
  /** Cabeceras propias de la petición al backend (objeto o función, también async). */
  readonly encabezadosBackend?: Readonly<Record<string, string>> | (() => Readonly<Record<string, string>> | Promise<Readonly<Record<string, string>>>);
  /** SDK-55: por omisión `front-back` con `backend` y `front` sin él. */
  readonly modo?: ModoLector;
  /** SDK-55, SDK-57: solo con `front-back`; por omisión `estricta`. */
  readonly validacion?: ValidacionLector;
  /** SDK-57: umbrales de `decidirFront` con `validacion: "auto"`. */
  readonly umbralesAuto?: UmbralesAuto;
  /** SDK-59: NDJSON en vivo (por omisión) o un único JSON. */
  readonly streaming?: boolean;
  /** SDK-58: vencimiento de la cola sin red (por omisión 600 000 ms). */
  readonly tiempoColaMs?: number;
  /** SDK-47: entero 1..10, por omisión 3. */
  readonly intentosVerificacion?: number;
  /** SDK-54: por omisión 30 000 ms. */
  readonly tiempoLimiteMs?: number;
  /** SDK-54: por omisión 15 000 ms. */
  readonly inactividadMs?: number;
  /** SDK-49: lo usan los adaptadores; en el núcleo, el fallo de cámara del primer `iniciar` vuelve a `inicio`. */
  readonly autoIniciar?: boolean;
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
  /** SDK-61: orientación y margen de la guía; se calcula dentro de la zona visible del `<video>`. */
  readonly guia?: OpcionesGuiaLector;
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
  /**
   * `null` si aún no hay frame. Rechaza ante un fallo del Worker. `guia` (SDK-61): guía en píxeles del vídeo dentro
   * de la zona visible; la calidad y la presencia se evalúan dentro de ella. Sin ella, la guía de las opciones en el frame completo.
   */
  analizar(video: HTMLVideoElement, guia?: Rectangulo | null): Promise<FrameCalidad | null>;
  terminar(): void;
}

/** Captura aceptada: frames de lectura en memoria (se ponen a cero al liberar). */
export interface CapturaLector {
  readonly frames: readonly FrameLectura[];
  readonly pista: "pdf417" | "mrz" | null;
  /** Imagen codificada para el envío (con `sesion` o `backend`). */
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
  capturar(video: HTMLVideoElement, camara: CamaraLector, contenido: "pdf417" | "mrz" | null, guia?: Rectangulo | null): Promise<CapturaLector | null>;
  crearLector(): LectorInyectado;
  /** Programa el siguiente ciclo de análisis; devuelve la cancelación. */
  programar(fn: () => void): () => void;
  ahora(): number;
  /** `fetch` para el envío opcional y el backend propio. */
  fetch?: typeof fetch;
  /** SDK-57: señales del dispositivo (por omisión, las del navegador). */
  senales?(): DispositivoLector;
  /** SDK-58: estado de la red (por omisión `navigator.onLine`). */
  enLinea?(): boolean;
  /** SDK-58: avisa al volver la red (por omisión el evento `online`); devuelve la cancelación. */
  alConectar?(fn: () => void): () => void;
  /** SDK-62: medidas del vídeo y su elemento (por omisión `videoWidth`, `clientWidth` y `getComputedStyle`); `null` sin medidas. Solo lee: nunca cambia estilos. */
  medirVideo?(video: HTMLVideoElement): MedidasVideo | null;
  /** SDK-62: avisa cuando cambia el tamaño del elemento o del vídeo (por omisión `ResizeObserver` y el evento `resize`); devuelve la cancelación. */
  observarVideo?(video: HTMLVideoElement, fn: () => void): () => void;
  /** Temporizador (por omisión `setTimeout`); reloj falso en pruebas. */
  temporizar?(fn: () => void, ms: number): () => void;
}
