/**
 * @lector-cedula/fraud: señal de riesgo de presentación fraudulenta de la cédula (cambio deteccion-fraude).
 * En el dispositivo, offline, sin persistencia. La autenticidad definitiva solo la da la Registraduría.
 */
export type {
  Accion,
  CamposDocumento,
  CodigoMotivo,
  ConfigFraude,
  DatosDocumento,
  Detalle,
  EntradaFraude,
  FrameRGBA,
  Motivo,
  Nivel,
  PoliticaBloqueo,
  Punto,
  SenalRiesgo,
} from "./tipos.js";
export {
  CODIGOS_MOTIVO,
  CONFIG_FRAUDE_POR_DEFECTO,
  UMBRAL_MOTIVO,
  type ResultadoConfig,
  agregarMotivos,
  decidirAccion,
  nivelPorPuntaje,
  validarConfigFraude,
} from "./config.js";
export { evaluarFraude } from "./evaluar.js";
export { evaluarYLiberar } from "./worker.js";
