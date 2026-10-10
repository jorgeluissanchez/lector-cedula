/**
 * @lector-cedula/motor: motor de lectura de la cédula colombiana en proceso para Node (motor-backend-embebido, MOT-01
 * a MOT-09). Corre en el servidor de la empresa que lo integra; sin red, sin disco y con búferes a cero.
 */
export { crearMotor, leerDocumento, cerrarCompartido, LIMITES_POR_DEFECTO, COLA_MAXIMA_POR_DEFECTO } from "./motor.js";
export type { EventoRegistro, Motor, OpcionesMotor } from "./motor.js";
export { leerCabecera, type Cabecera, type FormatoImagen } from "./cabeceras.js";
export { SHA256_MRZ, verificarModelo } from "./recursos.js";
export type { EstadisticasPool } from "./pool.js";
export { verificarFirmaWebhook, TOLERANCIA_WEBHOOK_S } from "./webhook.js";
export type { CuerpoWebhook, OpcionesWebhook } from "./webhook.js";
export { ErrorMotor, CODIGOS_ERROR_MOTOR } from "@lector-cedula/protocolo";
export type { CodigoErrorMotor, MotorLector, OpcionesLecturaMotor, ResultadoMotor, RiesgoMotor } from "@lector-cedula/protocolo";
