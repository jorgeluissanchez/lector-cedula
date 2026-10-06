// fixture-sintetico: personas y tramas ficticias de la spec parser-pdf417-amarilla (NUIP 9999..., AFIS 99998888, tarjeta 99997777).
// Disposición corregida por la evidencia pública del 2026-10-06: [32,40) son 0x00 y [40,48) es un campo numérico de 8 bytes.
/**
 * Tramas de referencia de openspec/changes/parser-pdf417-amarilla/specs/pdf417-cedula-amarilla/spec.md
 * (convenciones de los escenarios). Disposición escrita a mano desde la spec: este archivo no importa nada
 * del parser, para que sus pruebas sean un oráculo independiente.
 */

export interface PersonaReferencia {
  /** Campo NUIP de 10 dígitos tal como va en la trama (con ceros a la izquierda si los hay). */
  campoNuip: string;
  apellido1: string;
  /** `""` es campo vacío (`-` en la tabla de la spec). */
  apellido2: string;
  nombre1: string;
  nombre2: string;
  sexo: "M" | "F";
  /** `YYYYMMDD`. */
  fecha: string;
  depto: string;
  mpio: string;
  rh: string;
}

/** Ñ = 0xD1, É = 0xC9, Á = 0xC1 en ISO-8859-1 (un byte por carácter). */
const N_TILDE = String.fromCharCode(0xd1);
const E_AGUDA = String.fromCharCode(0xc9);
const A_AGUDA = String.fromCharCode(0xc1);

export const P1: PersonaReferencia = {
  campoNuip: "9999123456", apellido1: "PEREZ", apellido2: "GOMEZ", nombre1: "JUAN", nombre2: "CARLOS",
  sexo: "M", fecha: "20000229", depto: "16", mpio: "001", rh: "O+",
};
export const P2: PersonaReferencia = {
  campoNuip: "9999000001", apellido1: `PE${N_TILDE}A`, apellido2: `NU${N_TILDE}EZ`, nombre1: `JOS${E_AGUDA}`,
  nombre2: `${A_AGUDA}NGEL`, sexo: "M", fecha: "19851231", depto: "01", mpio: "001", rh: "AB-",
};
export const P3: PersonaReferencia = {
  campoNuip: "9999000002", apellido1: "MARTINEZ", apellido2: "MEJIA", nombre1: "MARIA", nombre2: "",
  sexo: "F", fecha: "19700101", depto: "31", mpio: "019", rh: "AB+",
};
export const P4: PersonaReferencia = {
  campoNuip: "9999000003", apellido1: "DE LA OSSA", apellido2: "DEL CASTILLO", nombre1: "ANA", nombre2: "LUCIA",
  sexo: "F", fecha: "19990715", depto: "88", mpio: "001", rh: "O-",
};
export const P5: PersonaReferencia = {
  campoNuip: "9999000004", apellido1: `${N_TILDE}USTES`, apellido2: "ROJAS", nombre1: "LUIS", nombre2: "",
  sexo: "M", fecha: "20040310", depto: "00", mpio: "000", rh: "B-",
};
export const P6: PersonaReferencia = {
  campoNuip: "0099990005", apellido1: "GOMEZ", apellido2: "PEREZ", nombre1: "PEDRO", nombre2: "",
  sexo: "M", fecha: "19500601", depto: "16", mpio: "001", rh: "A-",
};
export const P7: PersonaReferencia = {
  campoNuip: "9999000006", apellido1: "SMITH", apellido2: "", nombre1: "JOHN", nombre2: "PAUL",
  sexo: "M", fecha: "19800505", depto: "16", mpio: "001", rh: "B+",
};
export const P8: PersonaReferencia = {
  campoNuip: "9999000007", apellido1: "PEREZ", apellido2: "ABCDEFGHIJKLMNOPQRSTUVW", nombre1: "JUAN", nombre2: "CARLOS",
  sexo: "M", fecha: "20000229", depto: "16", mpio: "001", rh: "A+",
};

export const PERSONAS = { P1, P2, P3, P4, P5, P6, P7, P8 } as const;

/** Texto del marcador de la spec; solo en pruebas (el código de producto lo declara como bytes). */
export const MARCADOR_TEXTO = "PubDSK_1";
export const AFIS = "99998888";
export const TARJETA = "99997777";

/** Longitud de la trama completa de referencia. */
export const LONGITUD_C = 531;
/** Inicio del bloque demográfico en la trama completa. */
export const INICIO_BLOQUE_C = 150;
const LONGITUD_CAMPO_NOMBRE = 23;

/** Byte de la cola en la posición absoluta `i` (spec: `(i * 73 + 41) mod 256`). */
export function byteCola(i: number): number {
  return (i * 73 + 41) % 256;
}

/** Bytes ISO-8859-1 de un texto; falla si algún carácter no cabe en un byte. */
export function latin1(texto: string): number[] {
  const salida: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    const codigo = texto.charCodeAt(i);
    if (codigo > 0xff) throw new Error(`carácter fuera de ISO-8859-1 en la posición ${i}`);
    salida.push(codigo);
  }
  return salida;
}

/** Bloque sexo primero de la spec: `0` + sexo + fecha + depto + mpio + `0` + RH. */
export function bloqueSexoPrimero(p: PersonaReferencia): string {
  return `0${p.sexo}${p.fecha}${p.depto}${p.mpio}0${p.rh}`;
}

/** Bloque fecha primero de la spec (sufijo F): `02` + fecha + sexo + depto + mpio + `0` + RH. */
export function bloqueFechaPrimero(p: PersonaReferencia): string {
  return `02${p.fecha}${p.sexo}${p.depto}${p.mpio}0${p.rh}`;
}

/** `cuantos` bytes 0x00. */
export function nulos(cuantos: number): number[] {
  return new Array<number>(cuantos).fill(0);
}

function campoNombre(texto: string): number[] {
  const bytes = latin1(texto);
  if (bytes.length > LONGITUD_CAMPO_NOMBRE) throw new Error("nombre de más de 23 bytes");
  return [...bytes, ...nulos(LONGITUD_CAMPO_NOMBRE - bytes.length)];
}

/**
 * Trama completa `C(p)` de 531 bytes. `bloque` sustituye el bloque demográfico (por defecto, sexo primero);
 * la cola sigue la fórmula de la spec desde el byte siguiente al bloque hasta 531.
 */
export function C(p: PersonaReferencia, bloque: string = bloqueSexoPrimero(p)): Uint8Array {
  if (p.campoNuip.length !== 10) throw new Error("el campo NUIP mide 10 bytes");
  const datos = [
    ...latin1("01"),
    ...latin1(AFIS),
    ...nulos(14),
    ...latin1(MARCADOR_TEXTO),
    ...nulos(8),
    ...latin1(TARJETA),
    ...latin1(p.campoNuip),
    ...campoNombre(p.apellido1),
    ...campoNombre(p.apellido2),
    ...campoNombre(p.nombre1),
    ...campoNombre(p.nombre2),
    ...latin1(bloque),
  ];
  if (datos.length > LONGITUD_C) throw new Error("bloque demasiado largo");
  const trama = new Uint8Array(LONGITUD_C);
  trama.set(datos);
  for (let i = datos.length; i < LONGITUD_C; i++) trama[i] = byteCola(i);
  return trama;
}

/** `W` de una trama completa: sin los bytes `[13,24)` (marcador en el byte 13). */
export function truncar(completa: Uint8Array): Uint8Array {
  return Uint8Array.from([...completa.subarray(0, 13), ...completa.subarray(24)]);
}

/** `S` de una trama completa: `[0,24)` + 9 bytes 0x00 + `[32, fin - 1)` (desplazamiento +1 de G03, misma longitud). */
export function quitarMarcador(completa: Uint8Array): Uint8Array {
  return Uint8Array.from([...completa.subarray(0, 24), ...nulos(9), ...completa.subarray(32, completa.length - 1)]);
}

export const W = (p: PersonaReferencia): Uint8Array => truncar(C(p));
export const S = (p: PersonaReferencia): Uint8Array => quitarMarcador(C(p));
export const C_F = (p: PersonaReferencia): Uint8Array => C(p, bloqueFechaPrimero(p));
export const W_F = (p: PersonaReferencia): Uint8Array => truncar(C_F(p));
export const S_F = (p: PersonaReferencia): Uint8Array => quitarMarcador(C_F(p));

/** Copia de `trama` con `bytes` escritos desde `posicion` (texto en ISO-8859-1 o arreglo de bytes). */
export function sustituir(trama: Uint8Array, posicion: number, bytes: string | readonly number[]): Uint8Array {
  const copia = Uint8Array.from(trama);
  copia.set(typeof bytes === "string" ? latin1(bytes) : bytes, posicion);
  return copia;
}

/** Copia de `trama` con `bytes` insertados en `posicion` (la trama crece). */
export function insertar(trama: Uint8Array, posicion: number, bytes: readonly number[]): Uint8Array {
  return Uint8Array.from([...trama.subarray(0, posicion), ...bytes, ...trama.subarray(posicion)]);
}

/** Copia de `trama` extendida hasta `longitud` con la fórmula de la cola en las posiciones absolutas nuevas. */
export function extenderCola(trama: Uint8Array, longitud: number): Uint8Array {
  const salida = new Uint8Array(longitud);
  salida.set(trama);
  for (let i = trama.length; i < longitud; i++) salida[i] = byteCola(i);
  return salida;
}

/** Posición del primer byte de la cola de `C(p)` (el siguiente al signo del RH del bloque sexo primero). */
export function inicioColaC(p: PersonaReferencia): number {
  return INICIO_BLOQUE_C + bloqueSexoPrimero(p).length;
}

/** Copia de `trama` con todo lo que hay desde `inicio` sustituido por `cola`. */
export function cambiarCola(trama: Uint8Array, inicio: number, cola: readonly number[]): Uint8Array {
  return Uint8Array.from([...trama.subarray(0, inicio), ...cola]);
}

/** Copia de `trama` sin los bytes `[desde, hasta)`. */
export function quitar(trama: Uint8Array, desde: number, hasta: number): Uint8Array {
  return Uint8Array.from([...trama.subarray(0, desde), ...trama.subarray(hasta)]);
}

/** Copia de `trama` sin ningún byte 0x00 de `[0, fin)` (lectores que quitan todos los NUL, H14). */
export function sinNulosHasta(trama: Uint8Array, fin: number): Uint8Array {
  return Uint8Array.from([...trama.subarray(0, fin).filter((b) => b !== 0), ...trama.subarray(fin)]);
}
