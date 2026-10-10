/**
 * Motor de reglas del SDK nativo (sdk-nativo, NAT-07, NAT-12; design.md, decisión 1). Funciones síncronas con entrada y
 * salida JSON que reúnen, importadas y no copiadas: la interpretación de `packages/capture/src/lectura` (edad, TI,
 * máscara y lugar) sobre los parsers, la máquina de estados y la validación de opciones de `packages/web`, y las
 * decisiones del envío (`upload.url` del mismo origen y segura, menores). Ninguna lanza: una entrada inválida da un
 * error o un estado válido. Sin DOM, sin red, sin disco, sin reloj (la fecha de referencia la pasa el nativo).
 */
import { buscarDivipol, parsearPdf417Amarilla } from "@lector-cedula/parsers";
import { fechaReferenciaValida, interpretarLineasMrz } from "../../capture/src/mrz/interpretar.js";
import type { IntentoMrz } from "../../capture/src/mrz/lector.js";
import { interpretarMrz, interpretarPdf417, type Paso } from "../../capture/src/lectura/leer.js";
import type { OpcionesLectura, ResultadoLectura } from "../../capture/src/lectura/tipos.js";
import { urlSubidaValida } from "../../web/src/envio.js";
import { congelar, ESTADO_INICIAL } from "../../web/src/estado.js";
import { transicion as transicionWeb, type EventoLector } from "../../web/src/maquina.js";
import { mensaje } from "../../web/src/mensajes.js";
import { opcionInvalida } from "../../web/src/opciones.js";
import { aPresentacion } from "../../web/src/presentacion.js";
import type { CodigoError, ContenidoLector, EnvioLector, EstadoLector, FaseLector, ResultadoPresentacion, TipoDocumento } from "../../web/src/tipos.js";
import { decodificarBase64 } from "./base64.js";
import { VERSION } from "./version.js";

export { VERSION };

/** Opciones de `procesarPdf417` y `procesarMrz`. `fechaReferencia` (`AAAA-MM-DD`, America/Bogota) es obligatoria. */
export interface OpcionesProceso {
  readonly fechaReferencia: string;
  /** Admite la tarjeta de identidad y los menores (OD-30a); por omisión `false`. */
  readonly admitirTi?: boolean;
  /** Por omisión `false` (como `crearLector` de la web y `leer-foto --sin-mascara`). */
  readonly enmascarar?: boolean;
  /** Tipos admitidos; por omisión todos. */
  readonly documentos?: readonly TipoDocumento[];
}

export type SalidaProceso =
  | { readonly ok: true; readonly resultado: ResultadoPresentacion; readonly contenido: ContenidoLector; readonly menorDeEdad: boolean }
  | { readonly ok: false; readonly error: { readonly codigo: CodigoError; readonly motivo: string } };

export type DecisionEnvio =
  | { readonly accion: "ninguno"; readonly envio: null }
  | { readonly accion: "enviar"; readonly envio: EnvioLector }
  | { readonly accion: "no-enviar"; readonly envio: EnvioLector };

const FASES: ReadonlySet<string> = new Set<FaseLector>(["inicio", "permiso", "activo", "listo", "leyendo", "resultado", "error"]);

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const fallo = (codigo: CodigoError, motivo: string): SalidaProceso => ({ ok: false, error: { codigo, motivo } });

/** Código público de una lectura fallida (el mismo criterio que `codigoErrorLectura` del controlador web, SDK-27). */
function codigoDeLectura(error: string): CodigoError {
  if (error === "menor-de-edad" || error === "ti-mayor-de-edad") return "menor-de-edad";
  if (error === "documento-no-admitido") return "documento-no-admitido";
  return "lectura-fallida";
}

function opcionesLectura(o: unknown): { fecha: string; lectura: OpcionesLectura; documentos: readonly unknown[] | null } | null {
  if (!esObjeto(o)) return null;
  const fecha = fechaReferenciaValida(o);
  if (fecha === null) return null;
  return {
    fecha,
    lectura: { fechaReferencia: fecha, enmascarar: o["enmascarar"] === true, ...(o["admitirTi"] === true ? { admitirTarjetaIdentidad: true } : {}) },
    documentos: Array.isArray(o["documentos"]) ? (o["documentos"] as unknown[]) : null,
  };
}

function salida(paso: Paso, documentos: readonly unknown[] | null): SalidaProceso {
  const r: ResultadoLectura = "final" in paso ? paso.final : "soloCe" in paso ? paso.soloCe : paso.noEncontrado;
  if (!r.ok) return fallo(codigoDeLectura(r.error), r.error);
  if (documentos !== null && !documentos.includes(r.tipoDocumento)) return fallo("documento-no-admitido", "documento-no-admitido");
  const menorDeEdad = r.tipoDocumento === "tarjeta-identidad" || r.menorDeEdad === true;
  return { ok: true, resultado: aPresentacion(r), contenido: r.fuente, menorDeEdad };
}

function protegido<A extends unknown[], R>(f: (...a: A) => R, alFallar: (...a: A) => R): (...a: A) => R {
  return (...a: A) => {
    try {
      return f(...a);
    } catch {
      return alFallar(...a);
    }
  };
}

/** Bytes del PDF417 (base64) decodificados por zxing-cpp en el nativo. Los bytes se ponen a cero tras parsearlos. */
export const procesarPdf417 = protegido(
  (bytesBase64: unknown, opciones: unknown): SalidaProceso => {
    const o = opcionesLectura(opciones);
    if (o === null) return fallo("opcion-invalida", "fecha-referencia-invalida");
    const bytes = decodificarBase64(bytesBase64);
    if (bytes === null) return fallo("lectura-fallida", "entrada-invalida");
    try {
      return salida(interpretarPdf417(bytes, "nativo", { parsearPdf417: parsearPdf417Amarilla, buscarDivipol }, o.lectura), o.documentos);
    } finally {
      bytes.fill(0);
    }
  },
  () => fallo("lectura-fallida", "motor"),
);

/** Líneas MRZ leídas por el OCR nativo: 3 líneas TD1 (cédula digital o CE) o 2 líneas TD3 (pasaporte). */
export const procesarMrz = protegido(
  (lineas: unknown, opciones: unknown): SalidaProceso => {
    const o = opcionesLectura(opciones);
    if (o === null) return fallo("opcion-invalida", "fecha-referencia-invalida");
    if (!Array.isArray(lineas) || (lineas.length !== 2 && lineas.length !== 3) || !lineas.every((l) => typeof l === "string")) return fallo("lectura-fallida", "entrada-invalida");
    const formato = lineas.length === 2 ? "td3" : "td1";
    const lectura = interpretarLineasMrz(lineas, formato, o.fecha, "nativo" as IntentoMrz);
    return salida(interpretarMrz(lectura, o.lectura), o.documentos);
  },
  () => fallo("lectura-fallida", "motor"),
);

/** Nombre de la primera opción inválida de `OpcionesLector` (SDK-27, SDK-38) o `null`. */
export const validarOpciones = protegido(
  (opciones: unknown): string | null => opcionInvalida(opciones),
  () => "opciones",
);

/** Estado inicial; con opciones inválidas, fase `error` con `opcion-invalida` y la opción (NAT-12 "Sesión sin servidor"). */
export const crearEstado = protegido(
  (opciones: unknown = {}): EstadoLector => {
    const invalida = opcionInvalida(opciones);
    if (invalida === null) return ESTADO_INICIAL;
    const idioma = esObjeto(opciones) && opciones["idioma"] === "en" && invalida !== "idioma" ? "en" : "es";
    return congelar({ ...ESTADO_INICIAL, fase: "error", error: { codigo: "opcion-invalida", mensaje: mensaje("opcion-invalida", idioma), opcion: invalida } });
  },
  () => ESTADO_INICIAL,
);

/** Transición pura de la máquina web (SDK-27, SDK-28). Un estado inválido da el inicial; un evento inválido, el mismo estado. */
export const transicion = protegido(
  (estado: unknown, evento: unknown): EstadoLector => {
    if (!esObjeto(estado) || typeof estado["fase"] !== "string" || !FASES.has(estado["fase"])) return ESTADO_INICIAL;
    const e = estado as unknown as EstadoLector;
    if (!esObjeto(evento) || typeof evento["tipo"] !== "string") return e;
    return transicionWeb(e, evento as unknown as EventoLector);
  },
  (estado: unknown) => (esObjeto(estado) && typeof estado["fase"] === "string" && FASES.has(estado["fase"]) ? (estado as unknown as EstadoLector) : ESTADO_INICIAL),
);

/** SDK-42: `upload.url` del mismo origen que `servidor` y segura. */
export const validarUrlSubida = protegido(
  (url: unknown, servidor: unknown): boolean => typeof url === "string" && typeof servidor === "string" && urlSubidaValida(url, servidor),
  () => false,
);

const NINGUNO: DecisionEnvio = { accion: "ninguno", envio: null };

/**
 * SDK-38 y SDK-43: con `servidor` y `sesion` válidos y un resultado, se envía; una TI o un menor solo con
 * `enviarMenores: true` (si no, `menor-no-enviado`). Sin servidor o sin sesión no hay ninguna petición.
 */
export const decidirEnvio = protegido(
  (salidaProceso: unknown, opciones: unknown): DecisionEnvio => {
    if (!esObjeto(opciones) || opcionInvalida(opciones) !== null || opciones["servidor"] === undefined || opciones["sesion"] === undefined) return NINGUNO;
    if (!esObjeto(salidaProceso) || salidaProceso["ok"] !== true || !esObjeto(salidaProceso["resultado"])) return NINGUNO;
    const menor = salidaProceso["menorDeEdad"] === true || salidaProceso["resultado"]["tipo"] === "tarjeta-identidad";
    if (menor && opciones["enviarMenores"] !== true) return { accion: "no-enviar", envio: { estado: "fallido", codigo: "menor-no-enviado" } };
    return { accion: "enviar", envio: { estado: "enviando" } };
  },
  () => NINGUNO,
);
