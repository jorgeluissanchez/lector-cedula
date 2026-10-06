/**
 * Parser de la MRZ TD1 de la cédula digital colombiana a partir de las tres líneas de texto de un OCR.
 *
 * Contrato: openspec/changes/parser-mrz-cedula-digital/specs/mrz-cedula-digital/spec.md (MZ-01 a MZ-20);
 * decisiones en design.md del mismo cambio, incluidas las tomadas tras la evidencia de
 * docs/decisiones/2026-10-06-evidencia-hipotesis-formato.md: M01 confirmada, M02 confirmada con corrección
 * (NUIP de 10 cifras y relleno), M03 pendiente (código DIVIPOL de expedición o de nacimiento), que se
 * declara en `warnings` (principio VI).
 * Función pura y total: sin E/S, sin reloj, sin estado; nunca lanza ni modifica sus argumentos (MZ-02).
 * No decodifica el QR ni devuelve RH (MZ-19).
 */
import { digitoControlIcao } from "./icao-9303.js";
import { validarFormatoNuip } from "./nuip-formato.js";
import type { TipoProbable } from "./nuip-formato.js";

/** Opciones del parser (MZ-04). */
export interface OpcionesMrzCedulaDigital {
  /** Fecha local de Colombia (`America/Bogota`) como `AAAA-MM-DD`, año 2000 a 2099. */
  fechaReferencia: string;
}

/** Motivo de rechazo estructural, en orden de prioridad (MZ-03). */
export type MotivoRechazoMrz =
  | "entrada-no-valida"
  | "numero-lineas-invalido"
  | "fecha-referencia-invalida"
  | "entrada-demasiado-larga"
  | "caracteres-invalidos"
  | "longitud-linea-invalida"
  | "no-es-cedula-digital";

type MotivoConLinea = "entrada-demasiado-larga" | "caracteres-invalidos" | "longitud-linea-invalida";

export type EstadoDigitoControl = "valido" | "invalido" | "ilegible" | "ausente";

export interface DigitoControl {
  estado: EstadoDigitoControl;
  /** Carácter leído en la posición del dígito, tras la corrección OCR-B. */
  leido: string;
  /** Dígito ICAO 9303 calculado sobre las líneas corregidas. */
  calculado: number;
}

export interface CorreccionOcr {
  linea: 1 | 2 | 3;
  columna: number;
  original: string;
  corregido: string;
}

/** Errores de campo, en el orden fijo de MZ-17. */
export type CodigoErrorCampoMrz =
  | "serial-invalido"
  | "fecha-nacimiento-invalida"
  | "sexo-invalido"
  | "fecha-vencimiento-invalida"
  | "nacionalidad-invalida"
  | "nuip-invalido"
  | "nombre-no-alfabetico";

export interface CamposMrzCedulaDigital {
  /** Serial del documento, 9 cifras con ceros a la izquierda (M01). */
  serial: string | null;
  /** Código DIVIPOL de 5 cifras, crudo; no se sabe si es el lugar de expedición o el de nacimiento (M03). */
  codigoLugarMrz: string | null;
  fechaNacimiento: string | null;
  sexo: "M" | "F" | "X" | null;
  fechaVencimiento: string | null;
  nacionalidad: "COL" | null;
  /** NUIP del opcional de la línea 2 (M02), validado con `validarFormatoNuip` como cédula. */
  nuip: string | null;
  nuipTipoProbable: TipoProbable | null;
  apellidos: string;
  nombres: string;
  nombresPosiblementeTruncados: boolean;
}

export interface DigitosControlMrz {
  serial: DigitoControl;
  nacimiento: DigitoControl;
  vencimiento: DigitoControl;
  compuesto: DigitoControl;
}

export type ResultadoMrzCedulaDigital =
  | { ok: false; motivo: Exclude<MotivoRechazoMrz, MotivoConLinea> }
  | { ok: false; motivo: MotivoConLinea; linea: 1 | 2 | 3 }
  | {
      ok: true;
      /** `true` solo si los dígitos de control y todos los campos son correctos (MZ-17). */
      valido: boolean;
      campos: CamposMrzCedulaDigital;
      digitosControl: DigitosControlMrz;
      correcciones: CorreccionOcr[];
      errores: CodigoErrorCampoMrz[];
      warnings: string[];
      lineasCorregidas: [string, string, string];
    };

type Linea = 1 | 2 | 3;
type Lineas = [string, string, string];
type Tabla = Readonly<Record<string, string>>;

/** Longitud máxima de cada línea original, en unidades UTF-16 (design.md, decisión 13). */
const MAX_UNIDADES_LINEA = 64;
const LONGITUD_LINEA = 30;
const NUMERO_LINEAS = 3;
const LINEAS: readonly Linea[] = [1, 2, 3];

/** Blancos que inserta un OCR y se eliminan en cualquier posición (MZ-05); nunca `\s`. */
const BLANCOS_OCR = /[ \t\r\n]/g;
const MINUSCULAS_ASCII = /[a-z]/g;
const ALFABETO_MRZ = /^[A-Z0-9<]*$/;
const FECHA_REFERENCIA = /^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/;
/** Solo cifras. Se aplica a cortes de longitud fija (serial 9, código 5, fecha 6, dígito 1). */
const SOLO_CIFRAS = /^[0-9]*$/;
const RELLENO = /^<*$/;
const RELLENO_FINAL = /<+$/;
const SERIES_RELLENO = /<+/g;
/** Serie inicial sin `<` seguida solo de relleno (MZ-12). */
const OPCIONAL_NUIP = /^([^<]*)<*$/;
const ALGUNA_CIFRA = /[0-9]/;
const PAIS = "COL";
/** Hipótesis pendiente del opcional de la línea 1 (M03). */
const HIPOTESIS_LUGAR = "M03";

/** Confusiones OCR-B de letra por cifra, solo para zonas numéricas (MZ-07; skill formato-cedula). */
const TABLA_OCR_B: Tabla = { O: "0", Q: "0", I: "1", Z: "2", S: "5", G: "6", B: "8" };
/** Única corrección en los campos de país (MZ-06, MZ-15). */
const TABLA_PAIS: Tabla = { "0": "O" };
/** Sexo de la columna 7 de la línea 2; `X` y `<` son "no especificado" (MZ-14; design.md, decisión 9). */
const SEXOS: Readonly<Record<string, "M" | "F" | "X">> = { M: "M", F: "F", X: "X", "<": "X" };

function rechazo(motivo: Exclude<MotivoRechazoMrz, MotivoConLinea>): ResultadoMrzCedulaDigital {
  return { ok: false, motivo };
}

function rechazoLinea(motivo: MotivoConLinea, linea: Linea): ResultadoMrzCedulaDigital {
  return { ok: false, motivo, linea };
}

/** Tres strings, o `null` si la entrada no es un array de strings (MZ-03). `undefined` si no son 3. */
function leerLineas(lineas: unknown): Lineas | null | undefined {
  if (!Array.isArray(lineas)) return null;
  for (let i = 0; i < lineas.length; i++) {
    if (typeof lineas[i] !== "string") return null;
  }
  if (lineas.length !== NUMERO_LINEAS) return undefined;
  return [lineas[0], lineas[1], lineas[2]] as Lineas;
}

function esBisiesto(anio: number): boolean {
  return anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0);
}

/** Días del mes `mes` (1 a 12) del año `anio`. */
function diasDelMes(anio: number, mes: number): number {
  if (mes === 2) return esBisiesto(anio) ? 29 : 28;
  return mes === 4 || mes === 6 || mes === 9 || mes === 11 ? 30 : 31;
}

/** `iso` si es una fecha `AAAA-MM-DD` (forma ya comprobada) del calendario gregoriano; si no, `null`. */
function fechaExistente(iso: string): string | null {
  const anio = Number(iso.slice(0, 4));
  const mes = Number(iso.slice(5, 7));
  const dia = Number(iso.slice(8, 10));
  if (mes < 1 || mes > 12 || dia < 1 || dia > diasDelMes(anio, mes)) return null;
  return iso;
}

/** Fecha de referencia válida o `null` (MZ-04). Solo propiedad propia; se lee una vez. */
function leerFechaReferencia(opciones: unknown): string | null {
  if (typeof opciones !== "object" || opciones === null) return null;
  if (!Object.hasOwn(opciones, "fechaReferencia")) return null;
  const fecha: unknown = (opciones as { fechaReferencia?: unknown }).fechaReferencia;
  // Expresión anclada en ambos extremos: una cadena larga falla tras pocos caracteres.
  if (typeof fecha !== "string" || !FECHA_REFERENCIA.test(fecha)) return null;
  return fechaExistente(fecha);
}

/** Número (1 a 3) de la primera línea que cumple `afectada`, o `null` (MZ-03). */
function primeraLinea(lineas: Lineas, afectada: (linea: string) => boolean): Linea | null {
  for (const n of LINEAS) {
    if (afectada(lineas[n - 1] as string)) return n;
  }
  return null;
}

/** Quita los blancos de OCR y pasa a mayúsculas solo `a`-`z` (MZ-05). */
function normalizar(linea: string): string {
  return linea.replace(BLANCOS_OCR, "").replace(MINUSCULAS_ASCII, (c) => c.toUpperCase());
}

/** Sustituye cada carácter de `texto` según `tabla`; los que no están en la tabla quedan igual. */
function sustituir(texto: string, tabla: Tabla): string {
  let resultado = "";
  for (const c of texto) resultado += tabla[c] ?? c;
  return resultado;
}

/** Registra en `correcciones` cada posición en que `original` y `corregido` difieren (MZ-07). */
function registrar(correcciones: CorreccionOcr[], linea: Linea, desde: number, original: string, corregido: string): void {
  [...original].forEach((antes, i) => {
    const despues = corregido.charAt(i);
    if (antes !== despues) correcciones.push({ linea, columna: desde + i, original: antes, corregido: despues });
  });
}

/** Corrige con la tabla OCR-B las columnas `desde` a `hasta - 1` de una línea y registra los cambios. */
function corregirZona(correcciones: CorreccionOcr[], linea: Linea, texto: string, desde: number, hasta: number): string {
  const original = texto.slice(desde, hasta);
  const corregido = sustituir(original, TABLA_OCR_B);
  registrar(correcciones, linea, desde, original, corregido);
  return corregido;
}

/**
 * Corrige un campo de país (línea 1 col. 2-4, línea 2 col. 15-17): `0` por `O` solo si el resultado es
 * `COL`, el único valor admitido (MZ-06, MZ-15; design.md, decisión 5). Si no, lo deja crudo.
 */
function corregirPais(correcciones: CorreccionOcr[], linea: Linea, texto: string, desde: number): string {
  const original = texto.slice(desde, desde + 3);
  const corregido = sustituir(original, TABLA_PAIS);
  if (corregido !== PAIS) return original;
  registrar(correcciones, linea, desde, original, corregido);
  return corregido;
}

/**
 * Opcional de la línea 1 (col. 15-19): se corrige solo si el resultado son 5 cifras y las col. 20-29 son
 * relleno, y entonces es el código de lugar; si no, queda crudo, sin registrar nada (MZ-11; decisión 6).
 */
function corregirOpcionalL1(correcciones: CorreccionOcr[], l1: string): { texto: string; codigo: string | null } {
  const original = l1.slice(15, 20);
  const corregido = sustituir(original, TABLA_OCR_B);
  if (!SOLO_CIFRAS.test(corregido) || !RELLENO.test(l1.slice(20, 30))) return { texto: original, codigo: null };
  registrar(correcciones, 1, 15, original, corregido);
  return { texto: corregido, codigo: corregido };
}

/** Aplica las correcciones de MZ-06, MZ-07, MZ-11 y MZ-15, registradas en orden de línea y columna. */
function corregirLineas(lineas: Lineas): { corregidas: Lineas; correcciones: CorreccionOcr[]; codigoLugar: string | null } {
  const [l1, l2, l3] = lineas;
  const correcciones: CorreccionOcr[] = [];
  const pais = corregirPais(correcciones, 1, l1, 2);
  const serial = corregirZona(correcciones, 1, l1, 5, 15);
  const opcional = corregirOpcionalL1(correcciones, l1);
  const c1 = l1.slice(0, 2) + pais + serial + opcional.texto + l1.slice(20, 30);
  const c2 =
    corregirZona(correcciones, 2, l2, 0, 7) +
    l2.charAt(7) +
    corregirZona(correcciones, 2, l2, 8, 15) +
    corregirPais(correcciones, 2, l2, 15) +
    corregirZona(correcciones, 2, l2, 18, 30);
  return { corregidas: [c1, c2, l3], correcciones, codigoLugar: opcional.codigo };
}

/** Calcula un dígito de control sobre texto ya normalizado al alfabeto MRZ (MZ-09, MZ-10). */
function digitoControl(datos: string, leido: string, admiteAusente: boolean): DigitoControl {
  // Tras la normalización solo quedan [A-Z0-9<]: el cálculo ICAO siempre está definido (design.md, decisión 2).
  const calculado = digitoControlIcao(datos) as number;
  let estado: EstadoDigitoControl;
  if (admiteAusente && leido === "<") estado = "ausente";
  else if (SOLO_CIFRAS.test(leido)) estado = Number(leido) === calculado ? "valido" : "invalido";
  else estado = "ilegible";
  return { estado, leido, calculado };
}

/** Los cuatro dígitos de control sobre las líneas corregidas (MZ-09). */
function calcularDigitos(l1: string, l2: string): DigitosControlMrz {
  const compuesto = l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29);
  return {
    serial: digitoControl(l1.slice(5, 14), l1.charAt(14), true),
    nacimiento: digitoControl(l2.slice(0, 6), l2.charAt(6), false),
    vencimiento: digitoControl(l2.slice(8, 14), l2.charAt(14), false),
    compuesto: digitoControl(compuesto, l2.charAt(29), false),
  };
}

/** `AAMMDD` en el siglo indicado como `AAAA-MM-DD`. */
function aIso(siglo: "19" | "20", aammdd: string): string {
  return `${siglo}${aammdd.slice(0, 2)}-${aammdd.slice(2, 4)}-${aammdd.slice(4, 6)}`;
}

/** Nacimiento: `20AA` si no es posterior a la referencia, si no `19AA` (MZ-13; design.md, decisión 3). */
function leerFechaNacimiento(aammdd: string, fechaReferencia: string): string | null {
  if (!SOLO_CIFRAS.test(aammdd)) return null;
  const en2000 = aIso("20", aammdd);
  // Comparar cadenas ISO equivale a comparar fechas.
  return fechaExistente(en2000 <= fechaReferencia ? en2000 : aIso("19", aammdd));
}

/** Vencimiento: siempre `20AA`, sin juicio de vigencia (MZ-13; design.md, decisión 4). */
function leerFechaVencimiento(aammdd: string): string | null {
  return SOLO_CIFRAS.test(aammdd) ? fechaExistente(aIso("20", aammdd)) : null;
}

/** NUIP del opcional de la línea 2, validado como cédula de ciudadanía (MZ-12; decisión 7 revisada). */
function leerNuip(opcional: string): { numero: string; tipoProbable: TipoProbable } | null {
  // Sin serie (opcional con cifras tras un "<"), `validarFormatoNuip(undefined)` rechaza: entrada-no-texto.
  const serie = OPCIONAL_NUIP.exec(opcional)?.[1];
  // Stryker disable next-line ObjectLiteral: equivalente; "cc" es el tipo por defecto (NF-10) y se deja explícito.
  const r = validarFormatoNuip(serie, { tipoDocumento: "cc" });
  return r.valido ? { numero: r.numero, tipoProbable: r.tipoProbable } : null;
}

/** Apellidos y nombres de la línea 3, sin corrección y sin separar apellidos (MZ-16; decisión 10). */
function leerNombre(l3: string): Pick<CamposMrzCedulaDigital, "apellidos" | "nombres" | "nombresPosiblementeTruncados"> {
  const sinRelleno = l3.replace(RELLENO_FINAL, "");
  const corte = sinRelleno.indexOf("<<");
  const apellidos = corte === -1 ? sinRelleno : sinRelleno.slice(0, corte);
  const nombres = corte === -1 ? "" : sinRelleno.slice(corte + 2);
  return {
    apellidos: apellidos.replace(SERIES_RELLENO, " "),
    nombres: nombres.replace(SERIES_RELLENO, " "),
    nombresPosiblementeTruncados: l3.charAt(29) !== "<",
  };
}

/** Regla de validez global (MZ-17). */
function esValido(digitos: DigitosControlMrz, errores: readonly CodigoErrorCampoMrz[]): boolean {
  return (
    errores.length === 0 &&
    (digitos.serial.estado === "valido" || digitos.serial.estado === "ausente") &&
    digitos.nacimiento.estado === "valido" &&
    digitos.vencimiento.estado === "valido" &&
    digitos.compuesto.estado === "valido"
  );
}

/** Extrae los campos de tres líneas normalizadas de una cédula digital ya identificada. */
function leerCampos(normalizadas: Lineas, fechaReferencia: string): ResultadoMrzCedulaDigital {
  const { corregidas, correcciones, codigoLugar } = corregirLineas(normalizadas);
  const [l1, l2, l3] = corregidas;
  const errores: CodigoErrorCampoMrz[] = [];
  /** Devuelve `valor` y anota `error` si es `null`; el orden de las llamadas es el de MZ-17. */
  function anotar<T>(valor: T | null, error: CodigoErrorCampoMrz): T | null {
    if (valor === null) errores.push(error);
    return valor;
  }

  const serialLeido = l1.slice(5, 14);
  const serial = anotar(SOLO_CIFRAS.test(serialLeido) ? serialLeido : null, "serial-invalido");
  const fechaNacimiento = anotar(leerFechaNacimiento(l2.slice(0, 6), fechaReferencia), "fecha-nacimiento-invalida");
  const sexo = anotar(SEXOS[l2.charAt(7)] ?? null, "sexo-invalido");
  const fechaVencimiento = anotar(leerFechaVencimiento(l2.slice(8, 14)), "fecha-vencimiento-invalida");
  const nacionalidad = anotar(l2.slice(15, 18) === PAIS ? PAIS : null, "nacionalidad-invalida");
  const nuip = anotar(leerNuip(l2.slice(18, 29)), "nuip-invalido");
  if (ALGUNA_CIFRA.test(l3)) errores.push("nombre-no-alfabetico");

  const digitosControl = calcularDigitos(l1, l2);
  return {
    ok: true,
    valido: esValido(digitosControl, errores),
    campos: {
      serial,
      codigoLugarMrz: codigoLugar,
      fechaNacimiento,
      sexo,
      fechaVencimiento,
      nacionalidad,
      nuip: nuip?.numero ?? null,
      nuipTipoProbable: nuip?.tipoProbable ?? null,
      ...leerNombre(l3),
    },
    digitosControl,
    correcciones,
    errores,
    warnings: codigoLugar === null ? [] : [HIPOTESIS_LUGAR],
    lineasCorregidas: corregidas,
  };
}

/**
 * Lee la MRZ TD1 de la cédula digital colombiana. `lineas` debe ser un array de 3 strings y `opciones`
 * un `OpcionesMrzCedulaDigital`; acepta cualquier valor y nunca lanza (MZ-02). Orden de los rechazos: MZ-03.
 * Quien consuma el resultado MUST mirar `valido` antes de usar un campo como verdad (principio V).
 */
export function parsearMrzCedulaDigital(lineas: unknown, opciones?: unknown): ResultadoMrzCedulaDigital {
  const originales = leerLineas(lineas);
  if (originales === null) return rechazo("entrada-no-valida");
  if (originales === undefined) return rechazo("numero-lineas-invalido");
  const fechaReferencia = leerFechaReferencia(opciones);
  if (fechaReferencia === null) return rechazo("fecha-referencia-invalida");

  // O(1) por línea y antes de cualquier expresión regular (design.md, decisión 13).
  const larga = primeraLinea(originales, (l) => l.length > MAX_UNIDADES_LINEA);
  if (larga !== null) return rechazoLinea("entrada-demasiado-larga", larga);
  const normalizadas = originales.map(normalizar) as Lineas;
  const conCaracterInvalido = primeraLinea(normalizadas, (l) => !ALFABETO_MRZ.test(l));
  if (conCaracterInvalido !== null) return rechazoLinea("caracteres-invalidos", conCaracterInvalido);
  const deOtraLongitud = primeraLinea(normalizadas, (l) => l.length !== LONGITUD_LINEA);
  if (deOtraLongitud !== null) return rechazoLinea("longitud-linea-invalida", deOtraLongitud);
  const [l1] = normalizadas;
  if (!l1.startsWith("IC") || sustituir(l1.slice(2, 5), TABLA_PAIS) !== PAIS) return rechazo("no-es-cedula-digital");

  return leerCampos(normalizadas, fechaReferencia);
}
