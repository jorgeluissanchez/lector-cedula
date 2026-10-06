/**
 * Parser del PDF417 de la cédula de ciudadanía amarilla.
 *
 * Contrato: openspec/changes/parser-pdf417-amarilla/specs/pdf417-cedula-amarilla/spec.md (PA-01 a PA-21) y
 * design.md (decisiones 1 a 14). Función pura y total: sin E/S, sin estado, nunca lanza. Descarta la biometría,
 * el código AFIS y la tarjeta decadactilar (principio III): ningún byte posterior al signo del RH se lee.
 */
import { ensamblar } from "./ensamblar.js";
import { leerOffsets } from "./offsets.js";
import { leerPatrones } from "./patrones.js";
import { clasificarTrama } from "./trama.js";

export type VarianteTramaPdf417 = "completa" | "truncada" | "sin-pubdsk";
export type ModoLecturaPdf417 = "offsets" | "patrones";
export type BloqueDemograficoPdf417 = "sexo-primero" | "fecha-primero";
export type Rh = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";

export interface CamposCedulaAmarilla {
  /** Formato `formato-nuip`, sin ceros a la izquierda. */
  numeroDocumento: string;
  primerApellido: string;
  segundoApellido: string | null;
  primerNombre: string;
  segundoNombre: string | null;
  sexo: "M" | "F";
  /** `YYYY-MM-DD`. */
  fechaNacimiento: string;
  rh: Rh;
  /** 2 dígitos DIVIPOL. */
  codigoDepartamentoNacimiento: string | null;
  /** 3 dígitos DIVIPOL. */
  codigoMunicipioNacimiento: string | null;
}

export type CampoCedulaAmarilla = keyof CamposCedulaAmarilla;
export type ConfianzaCampo = 0 | 0.5 | 0.6 | 0.9 | 1;
export type IdValidacionPdf417 = "formato-nuip" | "consistencia-modos" | "divipol-codigos" | "divipol-existe";

export interface ValidacionPdf417 {
  id: IdValidacionPdf417;
  estado: "ok" | "fallida" | "no-aplica";
  campos: CampoCedulaAmarilla[];
  /** Tabla de la decisión 9 de design.md. */
  detalle: string | null;
}

export type MotivoErrorPdf417 =
  | "entrada-no-bytes"
  | "opciones-invalidas"
  | "entrada-vacia"
  | "entrada-demasiado-larga"
  | "nuip-no-encontrado"
  | "nuip-invalido"
  | "caracteres-invalidos-en-nombre"
  | "nombres-no-reconocidos"
  | "bloque-demografico-no-encontrado"
  | "fecha-nacimiento-invalida";

export type ResultadoPdf417Amarilla =
  | {
      ok: true;
      version: "cc-amarilla";
      fuente: ["pdf417"];
      trama: { variante: VarianteTramaPdf417; modo: ModoLecturaPdf417; bloqueDemografico: BloqueDemograficoPdf417 };
      campos: CamposCedulaAmarilla;
      confianza: Record<CampoCedulaAmarilla, ConfianzaCampo>;
      validaciones: [ValidacionPdf417, ValidacionPdf417, ValidacionPdf417, ValidacionPdf417];
      warnings: string[];
    }
  | { ok: false; error: MotivoErrorPdf417 };

/** Compatible con la búsqueda DIVIPOL del cambio divipol-registraduria; la respuesta se lee sin confiar en su forma. */
export type ResolutorDivipol = (codigo: string) => unknown;

export interface OpcionesPdf417Amarilla {
  divipol?: ResolutorDivipol;
}

/** Longitud máxima de la entrada en bytes (PA-01). */
const MAX_BYTES = 2048;

function error(motivo: MotivoErrorPdf417): ResultadoPdf417Amarilla {
  return { ok: false, error: motivo };
}

/**
 * Lee `opciones` (PA-15): `undefined`, `null` o un objeto no array cuya propiedad `divipol`, leída una vez,
 * es `undefined` o una función. Devuelve `null` si no son válidas.
 */
function leerOpciones(opciones: unknown): { divipol: ResolutorDivipol | undefined } | null {
  if (opciones === undefined || opciones === null) return { divipol: undefined };
  if (typeof opciones !== "object" || Array.isArray(opciones)) return null;
  const divipol: unknown = (opciones as { divipol?: unknown }).divipol;
  if (divipol === undefined) return { divipol: undefined };
  return typeof divipol === "function" ? { divipol: divipol as ResolutorDivipol } : null;
}

/**
 * Interpreta los bytes crudos (ISO-8859-1) del PDF417 de la cédula amarilla. Acepta cualquier valor y nunca
 * lanza (PA-04); el uso correcto de `opciones` es `OpcionesPdf417Amarilla`.
 */
export function parsearPdf417Amarilla(bytes: unknown, opciones?: unknown): ResultadoPdf417Amarilla {
  if (!(bytes instanceof Uint8Array)) return error("entrada-no-bytes");
  const leidas = leerOpciones(opciones);
  if (leidas === null) return error("opciones-invalidas");
  if (bytes.length === 0) return error("entrada-vacia");
  if (bytes.length > MAX_BYTES) return error("entrada-demasiado-larga");
  const variante = clasificarTrama(bytes);
  const offsets = variante === "completa" ? leerOffsets(bytes) : null;
  return ensamblar(variante, offsets, leerPatrones(bytes), leidas.divipol);
}
