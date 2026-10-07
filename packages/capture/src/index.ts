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
