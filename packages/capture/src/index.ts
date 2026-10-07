// @lector-cedula/capture: índice público (design.md, decisión 2). Núcleo de calidad puro (CAL-01 a CAL-08).
export { analizarFrame } from "./calidad/score.js";
export { dimensionesAnalisis, LADO_ANALISIS, type Dimensiones } from "./calidad/reduccion.js";
export { luminancia, luminanciasFrame } from "./calidad/luminancia.js";
export {
  crearConfiguracionUmbrales,
  UMBRALES_POR_DEFECTO,
  validarUmbrales,
  type CampoUmbral,
  type ConfiguracionUmbrales,
  type ResultadoConfiguracion,
  type ResultadoValidacion,
  type Umbrales,
} from "./calidad/umbrales.js";
export {
  MOTIVOS,
  type CodigoErrorAnalisis,
  type Cuadrilatero,
  type DeteccionDocumento,
  type FrameAnalisis,
  type MetricaExposicion,
  type MetricaNitidez,
  type MetricaReflejo,
  type MetricasCalidad,
  type MetricaTamano,
  type Motivo,
  type Punto,
  type ResultadoAnalisis,
  type ResultadoCalidad,
} from "./calidad/tipos.js";

// Interfaces públicas para los cambios posteriores (CAL-14, CAL-15; design.md, decisión 7).
export type { CapturaAceptada, CodigoLeido, DetectorDocumento, FormatoCodigo, LectorCodigos } from "./interfaces.js";

// Flujo puro (CAM-02, CAM-04, CAM-05, CAM-08, CAL-10 a CAL-12, CAL-14).
export { evaluarEntorno, TEXTOS_ENTORNO, type Entorno, type EstadoEntorno } from "./flujo/entorno.js";
export { avisoResolucion, clasificarResolucion, type ClaseResolucion } from "./flujo/resolucion.js";
export { clasificarErrorCamara, TEXTOS_ERROR_CAMARA, type CodigoErrorCamara, type ErrorCamara } from "./flujo/errores-camara.js";
export { calcularGuia, crearDetectorGuia, guiaEnAnalisis, guiaEnPantalla, PROPORCION_ID1, type Caja } from "./flujo/guia.js";
export { crearPlanificador, type Planificador } from "./flujo/planificador.js";
export {
  crearAutocaptura,
  type Autocaptura,
  type FaseAutocaptura,
  type PasoAutocaptura,
  type ResultadoRevalidacion,
} from "./flujo/autocaptura.js";
export { crearFeedback, TEXTOS_FEEDBACK, textoSituacion, type Feedback, type Situacion } from "./flujo/feedback.js";

// Navegador (CAL-09, CAM-07, CAM-11): Worker, cliente, frames y captura.
export { iniciarWorkerCalidad, type AlcanceWorker } from "./navegador/worker-calidad.js";
export { crearClienteCalidad, type ClienteCalidad, type PuertoWorker, type RespuestaAnalisis } from "./navegador/cliente-calidad.js";
export type { CodigoErrorWorker, MensajeAlWorker, MensajeDelWorker } from "./navegador/protocolo.js";
export { tomarFrameAnalisis, tomarFrameCaptura, type FrameCompleto } from "./navegador/frames.js";
export { crearCapturaAceptada, type DatosCaptura } from "./navegador/captura.js";

// Lectura del PDF417 desde imagen (cambio leer-pdf417-desde-imagen). zxing-wasm se carga solo al decodificar (LPI-08).
export {
  crearDecodificador,
  decodificarPdf417Imagen,
  type DecodificadorPixeles,
  type DependenciasDecodificador,
  type ErrorPdf417Imagen,
  type IntentoPdf417,
  type DecodificadorPdf417,
  type OpcionesLector,
  type Pixeles,
  type ResultadoPdf417Imagen,
} from "./pdf417/decodificar.js";

// Lectura de la MRZ TD1 desde imagen (cambio leer-mrz-desde-imagen). Tesseract.js se carga solo al leer (LMI-09).
export { extraerLineasMrz } from "./mrz/extraer.js";
export { localizarFranjaMrz, type CajaMrz, type CandidatoMrz, type MetodoLocalizacion, type PixelesRgba } from "./mrz/localizar.js";
export {
  crearLectorMrz,
  type CrearWorkerOcr,
  type ErrorLectorMrz,
  type LectorMrz,
  type OpcionesLectorMrz,
  type ResultadoLectorMrz,
  type WorkerOcr,
} from "./mrz/lector.js";
