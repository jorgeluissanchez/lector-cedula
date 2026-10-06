/**
 * Bloque demográfico (PA-11 a PA-14; design.md, decisiones 6 y 7). Dos formas, disjuntas por el segundo
 * carácter, reconocidas con autómatas de un solo paso (sin expresiones regulares con retroceso):
 * - sexo primero (H05): `[0-9][MF][0-9]{8}[0-9]*(AB|A|B|O)[+-]`;
 * - fecha primero (H08, pendiente): `[0-9]{2}[0-9]{8}[MF][0-9]*(AB|A|B|O)[+-]`.
 * El signo del RH es el último byte que se lee: lo que sigue es biometría (H09) y nunca se examina.
 */
import { esDigito } from "./bytes.js";
import type { BloqueDemograficoPdf417, Rh } from "./index.js";
import type { EstadoDivipolCodigos } from "./lectura.js";

export interface BloqueLeido {
  forma: BloqueDemograficoPdf417;
  sexo: "M" | "F";
  /** `YYYYMMDD` tal como viene en la trama. */
  fecha: string;
  /** Run de dígitos entre la fecha (o el sexo) y el RH. */
  digitos: string;
  rh: Rh;
}

const M = 0x4d;
const F = 0x46;
const A = 0x41;
const B = 0x42;
const O = 0x4f;
const MAS = 0x2b;
const MENOS = 0x2d;
const DIGITOS_FECHA = 8;
/** Exactamente 6 dígitos: departamento (2), municipio (3) y uno desconocido (H05, H06). */
const DIGITOS_DIVIPOL = 6;

function sexoEn(bytes: Uint8Array, i: number): "M" | "F" | null {
  const b = bytes[i];
  return b === M ? "M" : b === F ? "F" : null;
}

/** `bytes[desde, desde + n)` si son todos dígitos; si no, `null`. */
function digitosFijos(bytes: Uint8Array, desde: number, n: number): string | null {
  let texto = "";
  for (let i = desde; i < desde + n; i++) {
    const b = bytes[i];
    if (!esDigito(b)) return null;
    texto += String.fromCharCode(b ?? 0);
  }
  return texto;
}

/** Run de dígitos desde `desde` hasta el primer byte que no es dígito. */
function runDigitos(bytes: Uint8Array, desde: number): string {
  let texto = "";
  for (let i = desde; esDigito(bytes[i]); i++) texto += String.fromCharCode(bytes[i] ?? 0);
  return texto;
}

/** RH en `i`: `AB` antes que `A`, `B` u `O`, seguido del signo, que es el último byte leído. */
function rhEn(bytes: Uint8Array, i: number): Rh | null {
  const b = bytes[i];
  let grupo: string;
  let posicionSigno = i + 1;
  if (b === A && bytes[i + 1] === B) {
    grupo = "AB";
    posicionSigno = i + 2;
  } else if (b === A || b === B || b === O) {
    grupo = String.fromCharCode(b);
  } else {
    return null;
  }
  const signo = bytes[posicionSigno];
  if (signo !== MAS && signo !== MENOS) return null;
  return (grupo + String.fromCharCode(signo)) as Rh;
}

/** Resto común: run de dígitos y RH desde `desde`. */
function cola(bytes: Uint8Array, desde: number): { digitos: string; rh: Rh } | null {
  const digitos = runDigitos(bytes, desde);
  const rh = rhEn(bytes, desde + digitos.length);
  return rh === null ? null : { digitos, rh };
}

/** Bloque sexo primero que empieza en `inicio`, o `null`. */
export function reconocerSexoPrimero(bytes: Uint8Array, inicio: number): BloqueLeido | null {
  if (!esDigito(bytes[inicio])) return null;
  const sexo = sexoEn(bytes, inicio + 1);
  if (sexo === null) return null;
  const fecha = digitosFijos(bytes, inicio + 2, DIGITOS_FECHA);
  if (fecha === null) return null;
  const resto = cola(bytes, inicio + 2 + DIGITOS_FECHA);
  return resto === null ? null : { forma: "sexo-primero", sexo, fecha, ...resto };
}

/** Bloque fecha primero que empieza en `inicio`, o `null`. */
export function reconocerFechaPrimero(bytes: Uint8Array, inicio: number): BloqueLeido | null {
  const prefijoYFecha = digitosFijos(bytes, inicio, 2 + DIGITOS_FECHA);
  if (prefijoYFecha === null) return null;
  const sexo = sexoEn(bytes, inicio + 2 + DIGITOS_FECHA);
  if (sexo === null) return null;
  const resto = cola(bytes, inicio + 3 + DIGITOS_FECHA);
  return resto === null ? null : { forma: "fecha-primero", sexo, fecha: prefijoYFecha.slice(2), ...resto };
}

/** Bloque de cualquiera de las dos formas, elegida por el segundo carácter (letra o dígito). */
export function reconocerBloque(bytes: Uint8Array, inicio: number): BloqueLeido | null {
  return esDigito(bytes[inicio + 1]) ? reconocerFechaPrimero(bytes, inicio) : reconocerSexoPrimero(bytes, inicio);
}

/** Días de cada mes en un año no bisiesto. */
const DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const ANIO_MIN = 1900;
const ANIO_MAX = 2099;

function esBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

/** `YYYY-MM-DD` si `YYYYMMDD` es una fecha gregoriana real entre 1900 y 2099; si no, `null` (PA-14). */
export function fechaIso(fecha: string): string | null {
  const anio = Number(fecha.slice(0, 4));
  const mes = Number(fecha.slice(4, 6));
  const dia = Number(fecha.slice(6, 8));
  if (anio < ANIO_MIN || anio > ANIO_MAX) return null;
  const diasMes = mes === 2 && esBisiesto(anio) ? 29 : DIAS_MES[mes - 1];
  if (diasMes === undefined || dia < 1 || dia > diasMes) return null;
  return `${fecha.slice(0, 4)}-${fecha.slice(4, 6)}-${fecha.slice(6, 8)}`;
}

export interface DatosBloque {
  sexo: "M" | "F";
  fechaNacimiento: string;
  rh: Rh;
  codigoDepartamentoNacimiento: string | null;
  codigoMunicipioNacimiento: string | null;
  divipol: EstadoDivipolCodigos;
}

/**
 * Campos del bloque. DIVIPOL solo en sexo primero con exactamente 6 dígitos (H06); fecha primero nunca da
 * códigos (decisión del orquestador, pregunta 3). `null` si la fecha no es real.
 */
export function interpretarBloque(bloque: BloqueLeido): DatosBloque | null {
  const fechaNacimiento = fechaIso(bloque.fecha);
  if (fechaNacimiento === null) return null;
  const base = { sexo: bloque.sexo, fechaNacimiento, rh: bloque.rh };
  if (bloque.forma === "fecha-primero") {
    return { ...base, codigoDepartamentoNacimiento: null, codigoMunicipioNacimiento: null, divipol: "bloque-sin-divipol" };
  }
  if (bloque.digitos.length !== DIGITOS_DIVIPOL) {
    return { ...base, codigoDepartamentoNacimiento: null, codigoMunicipioNacimiento: null, divipol: "longitud-inesperada" };
  }
  return {
    ...base,
    codigoDepartamentoNacimiento: bloque.digitos.slice(0, 2),
    codigoMunicipioNacimiento: bloque.digitos.slice(2, 5),
    divipol: "ok",
  };
}
