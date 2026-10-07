import { congelarProfundo } from "./congelar.js";
import { HIPOTESIS_PDF417, type IdHipotesis, type VariantePdf417 } from "./hipotesis.js";
import { leerOpciones, validarVariante } from "./opciones.js";
import { LONGITUD_NOMBRE, type PersonaFicticia, type Rh, type Sexo, validarPersona } from "./persona.js";
import { crearPrng, type Prng, validarSemilla } from "./prng.js";

const MARCADOR = "PubDSK_1"; // privacidad-ok: marcador estructural del generador sintético, no es un payload

/** Longitud de la trama completa (H01). */
const LONGITUD_TRAMA = 531;

/** Variantes admitidas, en el orden de FX-14. */
export const VARIANTES_PDF417: readonly VariantePdf417[] = ["completa", "windows-truncada", "sin-pubdsk", "fecha-primero"];

/** Intervalo semiabierto `[inicio, fin)` de bytes del payload. */
export type Rango = readonly [inicio: number, fin: number];

/** Opciones de `generarPdf417`. */
export interface OpcionesPdf417 {
  /** Por omisión `"completa"`. */
  readonly variante?: VariantePdf417;
  /** Entero de 0 a 4294967295; por omisión `1`. */
  readonly semilla?: number;
}

/** Campos que un parser correcto debe devolver del payload (NUIP sin ceros a la izquierda, fecha `YYYY-MM-DD`). */
export interface CamposPdf417 {
  readonly nuip: string;
  readonly primerApellido: string;
  readonly segundoApellido: string;
  readonly primerNombre: string;
  readonly segundoNombre: string;
  readonly sexo: Sexo;
  readonly fechaNacimiento: string;
  readonly departamento: string;
  readonly municipio: string;
  readonly rh: Rh;
}

/** Rangos de bytes de cada campo del payload (FX-07, FX-15). `marcador` es `null` en la variante sin marcador. */
export interface RangosPdf417 {
  readonly afis: Rango;
  readonly marcador: Rango | null;
  readonly nuip: Rango;
  readonly primerApellido: Rango;
  readonly segundoApellido: Rango;
  readonly primerNombre: Rango;
  readonly segundoNombre: Rango;
  readonly bloqueDemografico: Rango;
  readonly rh: Rango;
  readonly cola: Rango;
}

/** Fixture PDF417 sintético: bytes, estructura declarada, datos esperados e hipótesis asumidas. */
export interface FixturePdf417 {
  readonly sintetico: true;
  readonly variante: VariantePdf417;
  readonly semilla: number;
  /** Payload binario (ISO-8859-1). Es un `Uint8Array` nuevo en cada llamada y no está congelado. */
  readonly bytes: Uint8Array;
  readonly hipotesis: readonly IdHipotesis[];
  readonly persona: PersonaFicticia;
  readonly esperado: CamposPdf417;
  readonly rangos: RangosPdf417;
}

/** Rangos de la trama completa: todos presentes, también el marcador. */
type RangosCompleta = { readonly [K in keyof RangosPdf417]: Rango };

/** Escritor de bytes ISO-8859-1: cada carácter admitido (`A-Z`, `Ñ`, dígitos, espacio, `+`, `-`, `_`) es un byte. */
class Trama {
  readonly bytes: number[] = [];

  get posicion(): number {
    return this.bytes.length;
  }

  /** Escribe `texto` y devuelve su rango. La Ñ (U+00D1) se escribe como el byte 0xD1. */
  texto(texto: string): Rango {
    const inicio = this.posicion;
    for (const c of texto) this.bytes.push(c.charCodeAt(0));
    return [inicio, this.posicion];
  }

  nul(n: number): void {
    for (let i = 0; i < n; i++) this.bytes.push(0);
  }

  /** Campo de nombre de 23 bytes con relleno 0x00 a la derecha (G01, H04). */
  nombre(nombre: string): Rango {
    const inicio = this.posicion;
    this.texto(nombre);
    this.nul(LONGITUD_NOMBRE - nombre.length);
    return [inicio, this.posicion];
  }
}

/**
 * Trama completa (G01) con el bloque sexo-primero (H05) o fecha-primero (G04). El PRNG se consume en el orden de
 * design.md, decisión 5: 2 dígitos de cabecera, 4 del AFIS, 8 del campo `[40,48)`, 1 dígito del bloque y la cola.
 */
function construirCompleta(persona: PersonaFicticia, prng: Prng, fechaPrimero: boolean): { bytes: number[]; rangos: RangosCompleta } {
  const t = new Trama();
  t.texto(prng.digitos(2));
  const afis = t.texto("9999" + prng.digitos(4));
  t.nul(14);
  const marcador = t.texto(MARCADOR);
  t.nul(8);
  t.texto(prng.digitos(8));
  const nuip = t.texto(persona.nuip.padStart(10, "0"));
  const primerApellido = t.nombre(persona.primerApellido);
  const segundoApellido = t.nombre(persona.segundoApellido);
  const primerNombre = t.nombre(persona.primerNombre);
  const segundoNombre = t.nombre(persona.segundoNombre);
  const fecha = persona.fechaNacimiento.replaceAll("-", "");
  const lugar = persona.departamento + persona.municipio + prng.digitos(1);
  const inicioBloque = t.posicion;
  t.texto(fechaPrimero ? "02" + fecha + persona.sexo + lugar : "0" + persona.sexo + fecha + lugar);
  const rh = t.texto(persona.rh);
  const bloqueDemografico: Rango = [inicioBloque, t.posicion];
  const inicioCola = t.posicion;
  while (t.posicion < LONGITUD_TRAMA) t.bytes.push(prng.byte());
  const cola: Rango = [inicioCola, t.posicion];
  return {
    bytes: t.bytes,
    rangos: { afis, marcador, nuip, primerApellido, segundoApellido, primerNombre, segundoNombre, bloqueDemografico, rh, cola },
  };
}

/** Desplaza `delta` posiciones todo rango que empieza en `corte` o después. */
function desplazar(rangos: RangosCompleta, corte: number, delta: number): RangosCompleta {
  const mover = (r: Rango): Rango => (r[0] >= corte ? [r[0] + delta, r[1] + delta] : r);
  return Object.fromEntries(Object.entries(rangos).map(([clave, r]) => [clave, mover(r)])) as unknown as RangosCompleta;
}

/**
 * Deriva de la trama completa las variantes estructurales (design.md, decisión 4), de modo que la relación con la
 * completa sea exacta por construcción:
 * - `windows-truncada` (G02): sin los 11 NUL de `[13,24)`; todo lo posterior se desplaza −11.
 * - `sin-pubdsk` (G03, +1): el marcador pasa a NUL, se inserta un NUL en la posición 32 y se recorta el último
 *   byte de la cola para conservar 531 bytes (H01); todo campo desde el byte 32 se desplaza +1.
 */
function aplicarVariante(variante: VariantePdf417, bytes: number[], rangos: RangosCompleta): { final: number[]; rangos: RangosPdf417 } {
  if (variante === "windows-truncada") {
    return { final: [...bytes.slice(0, 13), ...bytes.slice(24)], rangos: desplazar(rangos, 24, -11) };
  }
  if (variante === "sin-pubdsk") {
    const movidos = desplazar(rangos, 32, 1);
    return {
      final: [...bytes.slice(0, 24), ...new Array<number>(9).fill(0), ...bytes.slice(32, LONGITUD_TRAMA - 1)],
      rangos: { ...movidos, marcador: null, cola: [movidos.cola[0], LONGITUD_TRAMA] },
    };
  }
  return { final: bytes, rangos };
}

/** Campos esperados del payload: los de la persona (el NUIP de la persona no tiene ceros a la izquierda). */
function esperadoDe(p: PersonaFicticia): CamposPdf417 {
  return {
    nuip: p.nuip,
    primerApellido: p.primerApellido,
    segundoApellido: p.segundoApellido,
    primerNombre: p.primerNombre,
    segundoNombre: p.segundoNombre,
    sexo: p.sexo,
    fechaNacimiento: p.fechaNacimiento,
    departamento: p.departamento,
    municipio: p.municipio,
    rh: p.rh,
  };
}

/**
 * Genera el payload PDF417 de la cédula amarilla de una persona ficticia (FX-07 a FX-15).
 * Valida la persona y después las opciones; ante el primer fallo lanza `ErrorFixture` (FX-03).
 * Es puro y determinista: misma persona, opciones y semilla dan la misma salida (FX-06).
 */
export function generarPdf417(persona: PersonaFicticia, opciones?: OpcionesPdf417): FixturePdf417 {
  const p = validarPersona(persona);
  const o = leerOpciones(opciones);
  const variante = validarVariante(o.variante, VARIANTES_PDF417, "completa");
  const semilla = validarSemilla(o.semilla);
  const { bytes, rangos } = construirCompleta(p, crearPrng(semilla), variante === "fecha-primero");
  const { final, rangos: declarados } = aplicarVariante(variante, bytes, rangos);
  return congelarProfundo({
    sintetico: true as const,
    variante,
    semilla,
    bytes: Uint8Array.from(final),
    // H05b: el RH AB± ocupa 3 bytes y desplaza el separador y la cola.
    hipotesis: (p.rh.startsWith("AB") ? [...HIPOTESIS_PDF417[variante], "H05b" as const] : [...HIPOTESIS_PDF417[variante]]).sort(),
    persona: p,
    esperado: esperadoDe(p),
    rangos: declarados,
  });
}
