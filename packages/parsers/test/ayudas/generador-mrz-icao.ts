/**
 * Generador sintético de MRZ ICAO 9303 TD3 (pasaporte) y TD1 genérico (cambio otros-documentos, tarea 1.1).
 * Vive como ayuda de prueba de packages/parsers para no alterar la interfaz pública estable de
 * @lector-cedula/fixtures (FX-02). Solo personas ficticias (principio III). Calcula los dígitos de control con una
 * implementación propia, independiente de `digitoControlIcao`, para que el round-trip no sea circular.
 */
import fc from "fast-check";

/** Dígito de control ICAO 9303: `0-9` su cifra, `A-Z` 10 a 35, `<` 0; pesos 7, 3, 1; módulo 10. */
export function digito(campo: string): string {
  const alfabeto = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let suma = 0;
  for (let i = 0; i < campo.length; i++) {
    const c = campo.charAt(i);
    const valor = c === "<" ? 0 : alfabeto.indexOf(c);
    if (valor < 0) throw new Error(`carácter fuera del alfabeto MRZ: ${c}`);
    suma += valor * Number("731".charAt(i % 3));
  }
  return String(suma % 10);
}

/** Rellena con `<` a la derecha hasta `n` caracteres (error si no cabe). */
export function relleno(texto: string, n: number): string {
  if (texto.length > n) throw new Error(`"${texto}" no cabe en ${n}`);
  return texto + "<".repeat(n - texto.length);
}

const aMrz = (texto: string): string => texto.replace(/ /g, "<");

export interface DatosTd3 {
  codigo?: string;
  emisor: string;
  apellidos: string;
  nombres: string;
  numero: string;
  nacionalidad: string;
  /** `AAMMDD`. */
  nacimiento: string;
  sexo: "F" | "M" | "<" | "X";
  /** `AAMMDD`. */
  vencimiento: string;
  opcional: string;
}

/** Dos líneas de 44 con los cinco dígitos de control correctos. */
export function generarTd3(d: DatosTd3): [string, string] {
  const l1 = relleno(relleno(d.codigo ?? "P", 2) + relleno(d.emisor, 3) + aMrz(d.apellidos) + "<<" + aMrz(d.nombres), 44);
  const numero = relleno(d.numero, 9);
  const opcional = relleno(d.opcional, 14);
  const parcial =
    numero +
    digito(numero) +
    relleno(d.nacionalidad, 3) +
    d.nacimiento +
    digito(d.nacimiento) +
    d.sexo +
    d.vencimiento +
    digito(d.vencimiento) +
    opcional +
    digito(opcional);
  const compuesto = parcial.slice(0, 10) + parcial.slice(13, 20) + parcial.slice(21, 43);
  return [l1, parcial + digito(compuesto)];
}

export interface DatosTd1 {
  codigo: string;
  emisor: string;
  numero: string;
  opcional1: string;
  nacimiento: string;
  sexo: "F" | "M" | "<" | "X";
  vencimiento: string;
  nacionalidad: string;
  opcional2: string;
  apellidos: string;
  nombres: string;
}

/** Tres líneas de 30 con los cuatro dígitos de control correctos. */
export function generarTd1(d: DatosTd1): [string, string, string] {
  const numero = relleno(d.numero, 9);
  const l1 = relleno(d.codigo, 2) + relleno(d.emisor, 3) + numero + digito(numero) + relleno(d.opcional1, 15);
  const sinCompuesto =
    d.nacimiento + digito(d.nacimiento) + d.sexo + d.vencimiento + digito(d.vencimiento) + relleno(d.nacionalidad, 3) + relleno(d.opcional2, 11);
  const compuesto = l1.slice(5, 30) + sinCompuesto.slice(0, 7) + sinCompuesto.slice(8, 15) + sinCompuesto.slice(18, 29);
  const l3 = relleno(aMrz(d.apellidos) + "<<" + aMrz(d.nombres), 30);
  return [l1, sinCompuesto + digito(compuesto), l3];
}

/** Espécimen ICAO 9303 parte 4 (Utopía), dato público. */
export const ESPECIMEN_ICAO: [string, string] = ["P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<", "L898902C36UTO7408122F1204159ZE184226B<<<<<10"];
/** Pasaporte colombiano sintético de OD-01a. */
export const PASAPORTE_COL: [string, string] = ["P<COLPEREZ<NUNEZ<<ANA<MARIA<<<<<<<<<<<<<<<<<", "AZ12345673COL9002155F31021451234567890<<<<78"];
/** CE sintética de OD-10a. */
export const CE_SINTETICA: [string, string, string] = ["I<COL1234567<<4<<<<<<<<<<<<<<<", "8001014F3001019VEN<<<<<<<<<<<4", "GARCIA<<MARIA<JOSE<<<<<<<<<<<<"];

/** Datos base del pasaporte colombiano sintético, para variantes con dígitos recalculados. */
export const DATOS_PASAPORTE_COL: DatosTd3 = {
  emisor: "COL",
  apellidos: "PEREZ NUNEZ",
  nombres: "ANA MARIA",
  numero: "AZ1234567",
  nacionalidad: "COL",
  nacimiento: "900215",
  sexo: "F",
  vencimiento: "310214",
  opcional: "1234567890",
};

/** Datos base de la CE sintética. */
export const DATOS_CE: DatosTd1 = {
  codigo: "I",
  emisor: "COL",
  numero: "1234567",
  opcional1: "",
  nacimiento: "800101",
  sexo: "F",
  vencimiento: "300101",
  nacionalidad: "VEN",
  opcional2: "",
  apellidos: "GARCIA",
  nombres: "MARIA JOSE",
};

const LETRAS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const ALFANUM = [..."0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const palabra = (min: number, max: number): fc.Arbitrary<string> => fc.string({ unit: fc.constantFrom(...LETRAS), minLength: min, maxLength: max });
const cifras = (n: number): fc.Arbitrary<string> => fc.string({ unit: fc.constantFrom(..."0123456789"), minLength: n, maxLength: n });
const PAISES = ["COL", "VEN", "ESP", "USA", "D", "UTO", "ECU", "PER"] as const;

/** Fecha `AAMMDD` existente en cualquier siglo (día hasta 28 para no depender del mes). */
const arbAammdd = (): fc.Arbitrary<string> =>
  fc
    .tuple(fc.integer({ min: 0, max: 99 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }))
    .map(([a, m, d]) => [a, m, d].map((n) => String(n).padStart(2, "0")).join(""));

/** Pasaporte sintético válido por construcción: apellidos de 1 a 3 palabras, nombres de 1 a 2. */
export function arbDatosTd3(): fc.Arbitrary<DatosTd3> {
  return fc
    .record({
      emisor: fc.constantFrom(...PAISES),
      apellidos: fc.array(palabra(2, 7), { minLength: 1, maxLength: 3 }).map((p) => p.join(" ")),
      nombres: fc.array(palabra(2, 7), { minLength: 1, maxLength: 2 }).map((p) => p.join(" ")),
      numero: fc.string({ unit: fc.constantFrom(...ALFANUM), minLength: 1, maxLength: 9 }),
      nacionalidad: fc.constantFrom(...PAISES),
      nacimiento: arbAammdd(),
      sexo: fc.constantFrom("F", "M", "<", "X") as fc.Arbitrary<DatosTd3["sexo"]>,
      vencimiento: arbAammdd(),
      opcional: fc.oneof(fc.constant(""), cifras(10)),
    })
    .filter((d) => d.apellidos.length + d.nombres.length + 2 <= 39);
}

/** TD1 sintético válido por construcción. */
export function arbDatosTd1(): fc.Arbitrary<DatosTd1> {
  return fc
    .record({
      codigo: fc.constantFrom("I", "ID", "IE", "IC", "IT", "TI", "AC"),
      emisor: fc.constantFrom(...PAISES),
      numero: fc.string({ unit: fc.constantFrom(...ALFANUM), minLength: 1, maxLength: 9 }),
      opcional1: fc.oneof(fc.constant(""), cifras(5)),
      nacimiento: arbAammdd(),
      sexo: fc.constantFrom("F", "M", "<", "X") as fc.Arbitrary<DatosTd1["sexo"]>,
      vencimiento: arbAammdd(),
      nacionalidad: fc.constantFrom(...PAISES),
      opcional2: fc.oneof(fc.constant(""), cifras(10)),
      apellidos: fc.array(palabra(2, 6), { minLength: 1, maxLength: 2 }).map((p) => p.join(" ")),
      nombres: fc.array(palabra(2, 6), { minLength: 1, maxLength: 2 }).map((p) => p.join(" ")),
    })
    .filter((d) => d.apellidos.length + d.nombres.length + 2 <= 30);
}

/** `AAMMDD` a ISO con la regla de siglo de OD-05. */
export function isoNacimiento(aammdd: string, referencia: string): string {
  const en2000 = `20${aammdd.slice(0, 2)}-${aammdd.slice(2, 4)}-${aammdd.slice(4, 6)}`;
  return en2000 <= referencia ? en2000 : `19${en2000.slice(2)}`;
}

export const isoVencimiento = (aammdd: string): string => `20${aammdd.slice(0, 2)}-${aammdd.slice(2, 4)}-${aammdd.slice(4, 6)}`;
