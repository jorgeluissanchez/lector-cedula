/**
 * @lector-cedula/protocolo: protocolo entre el front (`@lector-cedula/web`, opción `backend`) y el back
 * (`@lector-cedula/servidor`, `crearLectorServidor`). Cambio motor-backend-embebido, MOT-19 a MOT-25.
 *
 * - Petición: `POST` multipart con el campo `imagen` (PNG, JPEG o WebP) y, opcional, `cliente` (JSON con la lectura
 *   local del front); o el binario crudo con `Content-Type: image/*` y, opcional, la cabecera `X-Lector-Cliente` con
 *   el JSON de la lectura local en base64url. Sin `cliente` (modo `front-back` con dispositivo débil) el back valida
 *   igual y no compara.
 * - Respuesta: NDJSON (`application/x-ndjson`), un evento por línea, con eventos intermedios sin datos del documento
 *   y exactamente un evento final `resultado`, siempre el último (MOT-20). Con `Accept: application/json` (sin
 *   `application/x-ndjson`) o `?streaming=0`, un único JSON igual al evento final (MOT-25).
 *
 * Sin dependencias y sin código de plataforma: solo tipos, constantes y un validador puro.
 */

export const TIPO_NDJSON = "application/x-ndjson; charset=utf-8";
export const TIPO_JSON = "application/json; charset=utf-8";
/** Cabecera (en minúsculas) con la lectura local en base64url cuando el cuerpo es el binario de la imagen. */
export const CABECERA_CLIENTE = "x-lector-cliente";
/** Campos del multipart. */
export const CAMPO_IMAGEN = "imagen";
export const CAMPO_CLIENTE = "cliente";
/** Parámetro de consulta que pide la respuesta JSON única (`?streaming=0`). */
export const PARAMETRO_STREAMING = "streaming";

export const ETAPAS_INTERMEDIAS = ["recibido", "leyendo", "fraude", "comparando"] as const;
export type EtapaIntermedia = (typeof ETAPAS_INTERMEDIAS)[number];

/** MOT-22: lista cerrada de motivos de rechazo. */
export const MOTIVOS_RECHAZO = [
  "no-coincide",
  "fraude",
  "ilegible",
  "menor-de-edad",
  "documento-no-admitido",
  "demasiado-grande",
  "tiempo-agotado",
  "ocupado",
  "error-interno",
] as const;
export type MotivoRechazo = (typeof MOTIVOS_RECHAZO)[number];

/** Evento intermedio: nunca lleva datos del documento (MOT-23). `progreso` en [0, 1] y no decreciente. */
export interface EventoIntermedio {
  readonly etapa: EtapaIntermedia;
  readonly progreso?: number;
}

export interface Rechazo {
  readonly motivo: MotivoRechazo;
  /** Solo con `no-coincide`: rutas de campo, sin valores (MOT-10). */
  readonly diferencias?: readonly string[];
}

/** Documento confirmado: al menos `tipoDocumento`, `campos` (obligatorio) y `warnings`, en camelCase como capture. */
export interface EventoResultadoOk<D = unknown, R = unknown> {
  readonly etapa: "resultado";
  readonly ok: true;
  readonly documento: D;
  readonly riesgo?: R | null;
}

export interface EventoResultadoRechazo<R = unknown> {
  readonly etapa: "resultado";
  readonly ok: false;
  readonly rechazo: Rechazo;
  readonly riesgo?: R | null;
}

export type EventoResultado<D = unknown, R = unknown> = EventoResultadoOk<D, R> | EventoResultadoRechazo<R>;
export type EventoProtocolo<D = unknown, R = unknown> = EventoIntermedio | EventoResultado<D, R>;

const ETAPAS: ReadonlySet<string> = new Set(ETAPAS_INTERMEDIAS);
const MOTIVOS: ReadonlySet<string> = new Set(MOTIVOS_RECHAZO);

function esObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function soloClaves(o: Record<string, unknown>, permitidas: readonly string[]): boolean {
  return Object.keys(o).every((k) => permitidas.includes(k));
}

function rechazoValido(r: unknown): boolean {
  if (!esObjeto(r) || !soloClaves(r, ["motivo", "diferencias"])) return false;
  if (typeof r.motivo !== "string" || !MOTIVOS.has(r.motivo)) return false;
  if (!("diferencias" in r)) return true;
  return Array.isArray(r.diferencias) && r.diferencias.every((d) => typeof d === "string");
}

/** Comprueba un evento del protocolo (la misma regla que `protocolo-ndjson.schema.json`). Nunca lanza. */
export function validarEvento(x: unknown): x is EventoProtocolo {
  if (!esObjeto(x) || typeof x.etapa !== "string") return false;
  if (ETAPAS.has(x.etapa)) {
    if (!soloClaves(x, ["etapa", "progreso"])) return false;
    if (!("progreso" in x)) return true;
    const p = x.progreso;
    return typeof p === "number" && p >= 0 && p <= 1;
  }
  if (x.etapa !== "resultado") return false;
  if (x.ok === true) return soloClaves(x, ["etapa", "ok", "documento", "riesgo"]) && esObjeto(x.documento) && esObjeto(x.documento.campos);
  if (x.ok === false) return soloClaves(x, ["etapa", "ok", "rechazo", "riesgo"]) && rechazoValido(x.rechazo);
  return false;
}

export {
  CODIGOS_ERROR_MOTOR,
  ErrorMotor,
  codigoErrorMotor,
  type CodigoErrorMotor,
  type LecturaMotorFallida,
  type LecturaMotorOk,
  type MotorLector,
  type NivelRiesgo,
  type OpcionesLecturaMotor,
  type ResultadoMotor,
  type RiesgoMotor,
} from "./motor.js";
