/**
 * Validador de formato del número de identificación colombiano.
 *
 * Contrato: openspec/changes/validador-formato-nuip/specs/formato-nuip/spec.md (NF-01 a NF-09).
 * Decide solo el formato; nunca afirma que el número exista ni a quién pertenece.
 * Función pura y total: sin E/S, sin estado, nunca lanza.
 */

/** Motivo de rechazo, en orden de prioridad (NF-01). */
export type MotivoFormatoInvalido =
  | "entrada-no-texto"
  | "tipo-documento-invalido"
  | "entrada-demasiado-larga"
  | "caracteres-invalidos"
  | "posible-digito-verificacion"
  | "vacio"
  | "longitud-invalida";

/** Tipo de documento al que probablemente corresponde el número normalizado. */
export type TipoProbable = "nuip" | "cedula-antigua" | "ti-antigua";

/** Tipo de documento: cédula de ciudadanía (por defecto) o tarjeta de identidad (NF-09). */
export type TipoDocumento = "cc" | "ti";

export type ResultadoFormatoNuip =
  | {
      valido: true;
      /** Número normalizado: solo dígitos ASCII, sin ceros a la izquierda. */
      numero: string;
      tipoProbable: TipoProbable;
      /** Longitud de `numero`. */
      digitos: number;
      /** IDs de hipótesis no confirmadas aplicadas (principio VI). */
      warnings: string[];
    }
  | {
      valido: false;
      motivo: MotivoFormatoInvalido;
    };

/*
 * Separadores admitidos S (NF-03; design.md de nuip-endurecer-entradas, decisión 2), siempre como
 * clases explícitas y nunca con `\s`, que admitiría BOM, U+2028, U+3000 y otros (NF-05):
 * - punto U+002E;
 * - H (guiones): U+002D, U+2010, U+2011, U+2013, U+2212;
 * - W (espacio admitido): U+0020, U+0009, U+000A, U+000D, U+00A0, U+202F.
 * Sin la bandera `u`: un surrogate aislado o un carácter astral no pertenece a la clase (NF-05).
 */
/** Dígitos ASCII y separadores S, y nada más (NF-03, NF-05). */
const SOLO_ADMITIDOS = /^[0-9.\-\u2010\u2011\u2013\u2212 \t\n\r\u00A0\u202F]*$/;
/** Guion final seguido de exactamente un dígito: posible dígito de verificación estilo NIT (NF-08). */
const PATRON_NIT = /-[0-9]\s*$/;
/** Separadores S que se eliminan en cualquier posición (NF-03, NF-06). */
const SEPARADORES = /[.\-\u2010\u2011\u2013\u2212 \t\n\r\u00A0\u202F]/g;
const CEROS_IZQUIERDA = /^0+/;

/** Longitud máxima de la entrada original, en unidades de código UTF-16 (NF-12; design.md, decisión 5). */
const MAX_UNIDADES_ENTRADA = 64;

/** Longitudes aceptadas para cédula de ciudadanía (NF-07, decisión 5 de design.md). */
const MIN_CC = 5;
const MAX_CC = 10;
const DIGITOS_NUIP = 10;
/** Longitud de la tarjeta de identidad antigua: hipótesis pendiente N01 (NF-09, decisión 7 de design.md). */
const DIGITOS_TI_ANTIGUA = 11;
const HIPOTESIS_TI_ANTIGUA = "N01";

export interface OpcionesFormatoNuip {
  /** Tipo de documento; por defecto `"cc"`. */
  tipoDocumento?: TipoDocumento;
}

function invalido(motivo: MotivoFormatoInvalido): ResultadoFormatoNuip {
  return { valido: false, motivo };
}

function valido(numero: string, tipoProbable: TipoProbable, warnings: string[]): ResultadoFormatoNuip {
  return { valido: true, numero, tipoProbable, digitos: numero.length, warnings };
}

/** Tabla de longitudes de la cédula de ciudadanía (NF-07). */
function clasificarCc(numero: string): ResultadoFormatoNuip {
  const digitos = numero.length;
  if (digitos < MIN_CC || digitos > MAX_CC) return invalido("longitud-invalida");
  return valido(numero, digitos === DIGITOS_NUIP ? "nuip" : "cedula-antigua", []);
}

/** Tabla de longitudes de la tarjeta de identidad (NF-09). */
function clasificarTi(numero: string): ResultadoFormatoNuip {
  if (numero.length === DIGITOS_NUIP) return valido(numero, "nuip", []);
  if (numero.length === DIGITOS_TI_ANTIGUA) return valido(numero, "ti-antigua", [HIPOTESIS_TI_ANTIGUA]);
  return invalido("longitud-invalida");
}

/** Tabla de longitudes por tipo de documento (NF-07, NF-09). */
const CLASIFICADORES: Record<TipoDocumento, (numero: string) => ResultadoFormatoNuip> = {
  cc: clasificarCc,
  ti: clasificarTi,
};

/**
 * Lee el tipo de documento de `opciones` (NF-10; design.md, decisiones 3 y 13 del orquestador).
 * Devuelve `undefined` si el tipo no es válido. `tipoDocumento` se lee una sola vez y se normaliza
 * con `trim()` y `toLowerCase()` (sin `toLocaleLowerCase`, para no depender del entorno, NF-02).
 */
function leerTipoDocumento(opciones: unknown): TipoDocumento | undefined {
  if (opciones === undefined || opciones === null) return "cc";
  if (typeof opciones !== "object" && typeof opciones !== "function") return undefined;
  const tipo: unknown = (opciones as { tipoDocumento?: unknown }).tipoDocumento;
  if (tipo === undefined) return "cc";
  if (typeof tipo !== "string") return undefined;
  const normalizado = tipo.trim().toLowerCase();
  return normalizado === "cc" || normalizado === "ti" ? normalizado : undefined;
}

/**
 * Valida el formato de un número de cédula de ciudadanía o tarjeta de identidad capturado como texto.
 * Acepta cualquier valor de JavaScript y nunca lanza (NF-02); el uso correcto de `opciones` es
 * `OpcionesFormatoNuip`. Orden de evaluación: design.md de nuip-endurecer-entradas, decisión 1.
 */
export function validarFormatoNuip(entrada: unknown, opciones?: unknown): ResultadoFormatoNuip {
  // (a) NF-11: sin convertir la entrada a texto.
  if (typeof entrada !== "string") return invalido("entrada-no-texto");
  // (b) NF-10: el tipo de documento se resuelve antes de examinar la entrada (NF-13).
  const tipoDocumento = leerTipoDocumento(opciones);
  if (tipoDocumento === undefined) return invalido("tipo-documento-invalido");
  // (c) NF-12: O(1), antes de cualquier expresión regular sobre la entrada.
  if (entrada.length > MAX_UNIDADES_ENTRADA) return invalido("entrada-demasiado-larga");

  if (!SOLO_ADMITIDOS.test(entrada)) return invalido("caracteres-invalidos");
  if (PATRON_NIT.test(entrada)) return invalido("posible-digito-verificacion");

  const sinSeparadores = entrada.replace(SEPARADORES, "");
  if (sinSeparadores === "") return invalido("vacio");

  const numero = sinSeparadores.replace(CEROS_IZQUIERDA, "");
  return CLASIFICADORES[tipoDocumento](numero);
}
