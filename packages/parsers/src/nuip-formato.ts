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

/** Dígitos ASCII y separadores admitidos: punto, guion y la clase `\s` (NF-03, NF-05). */
const SOLO_ADMITIDOS = /^[0-9.\-\s]*$/;
/** Guion final seguido de exactamente un dígito: posible dígito de verificación estilo NIT (NF-08). */
const PATRON_NIT = /-[0-9]\s*$/;
const SEPARADORES = /[.\-\s]/g;
const CEROS_IZQUIERDA = /^0+/;

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

/** Comportamiento previo a NF-10 (solo `"ti"` exacto activa la tarjeta de identidad); lo sustituye la tarea 3.2. */
function esTarjetaIdentidad(opciones: unknown): boolean {
  return (opciones as OpcionesFormatoNuip | null | undefined)?.tipoDocumento === "ti";
}

/**
 * Valida el formato de un número de cédula de ciudadanía o tarjeta de identidad capturado como texto.
 * Acepta cualquier valor de JavaScript y nunca lanza (NF-02); el uso correcto de `opciones` es
 * `OpcionesFormatoNuip`. Orden de evaluación: design.md de nuip-endurecer-entradas, decisión 1.
 */
export function validarFormatoNuip(entrada: unknown, opciones?: unknown): ResultadoFormatoNuip {
  // (a) NF-11: sin convertir la entrada a texto.
  if (typeof entrada !== "string") return invalido("entrada-no-texto");

  if (!SOLO_ADMITIDOS.test(entrada)) return invalido("caracteres-invalidos");
  if (PATRON_NIT.test(entrada)) return invalido("posible-digito-verificacion");

  const sinSeparadores = entrada.replace(SEPARADORES, "");
  if (sinSeparadores === "") return invalido("vacio");

  const numero = sinSeparadores.replace(CEROS_IZQUIERDA, "");
  return esTarjetaIdentidad(opciones) ? clasificarTi(numero) : clasificarCc(numero);
}
