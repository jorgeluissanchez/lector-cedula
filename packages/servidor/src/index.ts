export { verificarWebhook, compararTiempoConstante, TOLERANCIA_POR_DEFECTO } from "./webhook.js";
export type { EntradaVerificacion, EventoWebhook, MotivoRechazo, ResultadoVerificacion } from "./webhook.js";
export { crearCliente, ErrorLector } from "./cliente.js";
export type { Autorizacion, ClienteLector, EntradaSesion, ErrorCampo, OpcionesCliente, Sesion, Validacion } from "./cliente.js";
export { manejarWebhook } from "./manejar.js";
export type { OpcionesWebhook } from "./manejar.js";
// motor-backend-embebido (MOT-10, MOT-19 a MOT-25): manejador de servidor con el motor en proceso.
export { crearLectorServidor, BYTES_MAXIMOS, TIEMPO_MAXIMO_MS } from "./lector/lector.js";
export type {
  ContextoConfirmacion,
  DocumentoConfirmado,
  InstanciaFastify,
  LectorServidor,
  LimitesLector,
  OpcionesFraude,
  OpcionesLectorServidor,
} from "./lector/lector.js";
export { CAMPOS_COMPARADOS, compararConCliente } from "./lector/comparar.js";
export type { CampoComparado, Comparacion } from "./lector/comparar.js";
export { ErrorServidor, MENSAJE_SIN_MOTOR } from "./lector/carga.js";
export type { ManejadorNode, PeticionNodeLector, RespuestaNodeLector } from "./lector/nodo.js";
export { ErrorMotor, codigoErrorMotor } from "@lector-cedula/protocolo";
export type {
  CodigoErrorMotor,
  EventoProtocolo,
  EventoResultado,
  MotivoRechazo as MotivoRechazoLector,
  MotorLector,
  OpcionesLecturaMotor,
  ResultadoMotor,
  RiesgoMotor,
} from "@lector-cedula/protocolo";
