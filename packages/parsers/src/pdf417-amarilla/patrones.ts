/**
 * Modo patrones (PA-08 a PA-10; design.md, decisión 6). Enfoque de fgardila/colombian-id-reader reimplementado
 * con pruebas propias (el repositorio no declara licencia): normalizador 1:1 que conserva las letras Latin-1,
 * fronteras de 2 o más separadores y NUIP por H03. Recorridos lineales acotados por las posiciones 96 y 192
 * para no leer la biometría (PA-16).
 */
import { esDigito, esLetra, hayMarcadorEn } from "./bytes.js";
import { interpretarBloque, reconocerBloque } from "./bloque-demografico.js";
import type { MotivoErrorPdf417 } from "./index.js";
import type { ResultadoLector } from "./lectura.js";
import { validarFormatoNuip } from "../nuip-formato.js";

const ESPACIO = 0x20;
const NUL = 0x00;
const MAS = 0x2b;
const MENOS = 0x2d;
const GUION_BAJO = 0x5f;
/** El último dígito del NUIP debe estar antes de esta posición (PA-16). */
const LIMITE_NUIP = 96;
/** Ningún campo de patrones empieza ni se extiende hasta esta posición o después (PA-16). */
const LIMITE_BLOQUE = 192;
const DIGITOS_NUIP = 10;
const MAX_NOMBRES = 3;

/** Normalizador 1:1 (PA-08): letras, dígitos, `+`, `-`, `_` y 0x20 se conservan; el resto pasa a 0x20. */
export function normalizarByte(byte: number): number {
  const conservado = esLetra(byte) || esDigito(byte) || byte === MAS || byte === MENOS || byte === GUION_BAJO;
  return conservado ? byte : ESPACIO;
}

/** Byte normalizado en `i`; el fin de la entrada cuenta como separador. */
function normalizadoEn(bytes: Uint8Array, i: number): number {
  return normalizarByte(bytes[i] ?? ESPACIO);
}

/**
 * NUIP (H03, PA-09): los 10 últimos dígitos del primer run de 10 o más dígitos seguido de una letra que no
 * empieza el marcador, con el último dígito antes de la posición 96. Devuelve el rango `[inicio, fin)`.
 */
export function localizarNuip(bytes: Uint8Array): { inicio: number; fin: number } | null {
  const fin = Math.min(bytes.length, LIMITE_NUIP + 1);
  let run = 0;
  for (let i = 0; i < fin; i++) {
    if (esDigito(bytes[i])) {
      run++;
      continue;
    }
    if (run >= DIGITOS_NUIP && esLetra(bytes[i]) && !hayMarcadorEn(bytes, i)) return { inicio: i - DIGITOS_NUIP, fin: i };
    run = 0;
  }
  return null;
}

export interface Segmento {
  /** Posición siguiente al último byte del campo (inicio de la frontera o fin de la entrada). */
  fin: number;
  /** El campo normalizado cumple `L+( L+)*`. */
  esNombre: boolean;
  /** Los bytes crudos que se normalizaron a espacio son 0x20 o 0x00 (PA-05). */
  crudoValido: boolean;
  /** Texto normalizado del campo, decodificado como ISO-8859-1. */
  texto: string;
}

/**
 * Campo que empieza en `inicio` (un byte no separador) y termina en la siguiente frontera: un separador
 * seguido de otro o del fin de la entrada. Un campo que llega a la posición 192 no es nombre (PA-16).
 */
export function leerSegmento(bytes: Uint8Array, inicio: number): Segmento {
  let esNombre = true;
  let crudoValido = true;
  let texto = "";
  let i = inicio;
  // Stryker disable next-line EqualityOperator: en i = length el byte fuera de rango cuenta como separador y el siguiente también, así que corta en fin = length igual
  for (; i < bytes.length; i++) {
    if (i >= LIMITE_BLOQUE) return { fin: i, esNombre: false, crudoValido, texto };
    const normalizado = normalizadoEn(bytes, i);
    if (normalizado === ESPACIO) {
      if (normalizadoEn(bytes, i + 1) === ESPACIO) break;
      if (bytes[i] !== ESPACIO && bytes[i] !== NUL) crudoValido = false;
    } else if (!esLetra(normalizado)) {
      esNombre = false;
    }
    texto += String.fromCharCode(normalizado);
  }
  return { fin: i, esNombre, crudoValido, texto };
}

/** Primera posición desde `desde` que no es separador, sin pasar de 192 ni del fin de la entrada. */
export function saltarFrontera(bytes: Uint8Array, desde: number): number {
  let i = desde;
  while (i < bytes.length && i < LIMITE_BLOQUE && normalizadoEn(bytes, i) === ESPACIO) i++;
  return i;
}

function fallo(error: MotivoErrorPdf417): ResultadoLector {
  return { ok: false, error };
}

/**
 * Lector por patrones. Etapas en orden (PA-03): NUIP, primer apellido, campos de nombre (como mucho 3) y
 * bloque demográfico. Asignación H15: 3 nombres en orden; 2 = segundo apellido y primer nombre; 1 = primer nombre.
 */
export function leerPatrones(bytes: Uint8Array): ResultadoLector {
  const nuip = localizarNuip(bytes);
  if (nuip === null) return fallo("nuip-no-encontrado");
  let campoNuip = "";
  for (let i = nuip.inicio; i < nuip.fin; i++) campoNuip += String.fromCharCode(bytes[i] ?? 0);
  const formato = validarFormatoNuip(campoNuip);
  if (!formato.valido) return fallo("nuip-invalido");

  const apellido = leerSegmento(bytes, nuip.fin);
  if (!apellido.esNombre || !apellido.crudoValido) return fallo("caracteres-invalidos-en-nombre");

  const nombres: string[] = [];
  let inicio = saltarFrontera(bytes, apellido.fin);
  while (esLetra(bytes[inicio])) {
    const campo = leerSegmento(bytes, inicio);
    if (!campo.esNombre) return fallo("bloque-demografico-no-encontrado");
    if (!campo.crudoValido) return fallo("caracteres-invalidos-en-nombre");
    nombres.push(campo.texto);
    if (nombres.length > MAX_NOMBRES) return fallo("nombres-no-reconocidos");
    inicio = saltarFrontera(bytes, campo.fin);
  }

  if (inicio >= LIMITE_BLOQUE) return fallo("bloque-demografico-no-encontrado");
  const bloque = reconocerBloque(bytes, inicio);
  if (bloque === null) return fallo("bloque-demografico-no-encontrado");
  if (nombres.length === 0) return fallo("nombres-no-reconocidos");
  const datos = interpretarBloque(bloque);
  if (datos === null) return fallo("fecha-nacimiento-invalida");

  const completos = nombres.length === MAX_NOMBRES;
  const { divipol, ...campoBloque } = datos;
  return {
    ok: true,
    lectura: {
      campos: {
        numeroDocumento: formato.numero,
        primerApellido: apellido.texto,
        segundoApellido: nombres.length > 1 ? (nombres[0] ?? null) : null,
        // Stryker disable next-line StringLiteral: inalcanzable, antes se exige al menos un nombre (nombres-no-reconocidos), así que el índice siempre existe
        primerNombre: nombres[nombres.length > 1 ? 1 : 0] ?? "",
        segundoNombre: nombres[2] ?? null,
        ...campoBloque,
      },
      bloque: bloque.forma,
      tipoNuip: formato.tipoProbable,
      nombresPorH15: !completos,
      divipol,
    },
  };
}
