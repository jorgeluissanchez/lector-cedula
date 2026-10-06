import { congelarProfundo } from "./congelar.js";
import { ErrorFixture } from "./errores.js";
import { HIPOTESIS_MRZ, type IdHipotesis } from "./hipotesis.js";
import { inyectar, validarOpcionesOcr } from "./ocr.js";
import { leerOpciones, validarVariante } from "./opciones.js";
import { type PersonaFicticia, type Sexo, validarPersona } from "./persona.js";
import { validarSemilla } from "./prng.js";

/** Variantes de la MRZ TD1 (FX-16, FX-19, FX-20). */
export type VarianteMrz =
  | "valida"
  | "cd-documento-alterado"
  | "cd-nacimiento-alterado"
  | "cd-vencimiento-alterado"
  | "cd-compuesto-alterado"
  | "cd-documento-relleno"
  | "ocr-b";

/** Variantes admitidas, en el orden de FX-22. */
export const VARIANTES_MRZ: readonly VarianteMrz[] = [
  "valida",
  "cd-documento-alterado",
  "cd-nacimiento-alterado",
  "cd-vencimiento-alterado",
  "cd-compuesto-alterado",
  "cd-documento-relleno",
  "ocr-b",
];

/** Posición de la MRZ donde inyectar un error OCR-B (líneas desde 1, posiciones desde 0). */
export interface PosicionOcr {
  readonly linea: 1 | 2;
  readonly posicion: number;
  /** Por omisión, la primera confusión del dígito. */
  readonly caracter?: string;
}

/** Opciones de `generarMrzTd1`. */
export interface OpcionesMrz {
  /** Por omisión `"valida"`. */
  readonly variante?: VarianteMrz;
  /** Entero de 0 a 4294967295; por omisión `1`. */
  readonly semilla?: number;
  /** Solo con `ocr-b`: número de errores (1 a 5, por omisión 1) elegidos con la semilla. */
  readonly erroresOcr?: number;
  /** Solo con `ocr-b`: posiciones fijas (sin usar la semilla). */
  readonly posicionesOcr?: readonly PosicionOcr[];
}

/** Error OCR-B aplicado sobre `lineasSinErrores`. */
export interface InyeccionOcr {
  readonly linea: 1 | 2;
  readonly posicion: number;
  readonly original: string;
  readonly inyectado: string;
}

/** Estado de un dígito de control en el fixture. */
export type EstadoDigitoControl = "valido" | "invalido" | "relleno";

/** Campos que un parser correcto debe devolver de la MRZ (nombres transliterados, G05). */
export interface CamposMrz {
  readonly serialDocumento: string;
  readonly lugarExpedicion: string;
  readonly fechaNacimiento: string;
  readonly sexo: Sexo;
  readonly fechaVencimiento: string;
  readonly nacionalidad: "COL";
  readonly nuip: string;
  readonly primerApellido: string;
  readonly segundoApellido: string;
  readonly primerNombre: string;
  readonly segundoNombre: string;
  readonly digitosControl: {
    readonly documento: EstadoDigitoControl;
    readonly nacimiento: EstadoDigitoControl;
    readonly vencimiento: EstadoDigitoControl;
    readonly compuesto: EstadoDigitoControl;
  };
}

/** Fixture MRZ TD1 sintético. */
export interface FixtureMrz {
  readonly sintetico: true;
  readonly variante: VarianteMrz;
  readonly semilla: number;
  readonly lineas: readonly [string, string, string];
  /** `lineas` unidas por `"\n"`. */
  readonly texto: string;
  /** Las líneas antes de inyectar errores OCR-B (iguales a `lineas` salvo en `ocr-b`). */
  readonly lineasSinErrores: readonly [string, string, string];
  readonly inyecciones: readonly InyeccionOcr[];
  readonly hipotesis: readonly IdHipotesis[];
  readonly persona: PersonaFicticia;
  readonly esperado: CamposMrz;
}

/** Longitud de cada línea TD1. */
const ANCHO = 30;

/**
 * Valor ICAO 9303 de un carácter de un campo con dígito de control. En la cédula esos campos (serial, fechas, NUIP y
 * opcionales DIVIPOL) solo contienen dígitos y `<`, que vale 0; las letras (10 a 35) no aparecen por construcción.
 */
const valorIcao = (c: string): number => (c === "<" ? 0 : Number(c));

/** Pesos 7, 3, 1 repetidos desde el primer carácter. */
const PESOS = "731";

/** Dígito de control ICAO 9303 (FX-17): pesos 7, 3, 1 repetidos y suma módulo 10. */
function digitoControl(campo: string): string {
  let suma = 0;
  [...campo].forEach((c, i) => {
    suma += valorIcao(c) * Number(PESOS.charAt(i % 3));
  });
  return String(suma % 10);
}

/** Dígito compuesto de TD1: `L1[5,30)` + `L2[0,7)` + `L2[8,15)` + `L2[18,29)`. */
const compuesto = (l1: string, l2: string): string =>
  digitoControl(l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29));

/** `YYYY-MM-DD` -> `YYMMDD` por recorte. */
const aaMmDd = (fecha: string): string => fecha.slice(2).replaceAll("-", "");

/** Ñ transliterada a N (G05). */
const transliterar = (nombre: string): string => nombre.replaceAll("Ñ", "N");

/** Nombre en la MRZ: transliterado y con cada espacio interno como `<`. */
const enMrz = (nombre: string): string => transliterar(nombre).replaceAll(" ", "<");

/**
 * Líneas 1 y 2 válidas (FX-16, M01 a M03). Si el NUIP es corto se rellena con `<` solo para poder validar antes las
 * opciones OCR (FX-03); en ese caso `generarMrzTd1` lanza `nuip-no-soportado-en-mrz` después.
 */
function lineas12(p: PersonaFicticia): [string, string] {
  const l1 = "IC" + "COL" + p.serialDocumento + digitoControl(p.serialDocumento) + p.lugarExpedicion + "<".repeat(10);
  const nacimiento = aaMmDd(p.fechaNacimiento);
  const vencimiento = aaMmDd(p.fechaVencimiento);
  const l2 = nacimiento + digitoControl(nacimiento) + p.sexo + vencimiento + digitoControl(vencimiento) + "COL" + p.nuip.padEnd(10, "<") + "<";
  return [l1, l2 + compuesto(l1, l2)];
}

/** Línea 3 (FX-18, G05), o `null` si no cabe en 30 caracteres. */
type DigitosControl = { -readonly [K in keyof CamposMrz["digitosControl"]]: EstadoDigitoControl };

/** Sustituye el carácter `i` de `s`. */
const reemplazar = (s: string, i: number, c: string): string => s.slice(0, i) + c + s.slice(i + 1);

/** Recalcula el dígito compuesto de `l2` sobre las líneas dadas. */
const conCompuesto = (l1: string, l2: string): string => l2.slice(0, 29) + compuesto(l1, l2);

/** (correcto + 1) módulo 10. */
const alterar = (digito: string): string => String((Number(digito) + 1) % 10);

/** Dígitos que alteran las variantes `cd-*-alterado` salvo el compuesto: línea (0 o 1), posición y nombre. */
const ALTERABLES: Readonly<Record<string, readonly [0 | 1, number, keyof DigitosControl]>> = {
  "cd-documento-alterado": [0, 14, "documento"],
  "cd-nacimiento-alterado": [1, 6, "nacimiento"],
  "cd-vencimiento-alterado": [1, 14, "vencimiento"],
};

/**
 * Aplica las variantes de dígitos de control (FX-19, design.md, decisión 6). El estado de cada dígito se fija por
 * variante, no se recalcula comprobando el resultado.
 */
function aplicarDigitos(variante: VarianteMrz, l1: string, l2: string): { l1: string; l2: string; estados: DigitosControl } {
  const estados: DigitosControl = { documento: "valido", nacimiento: "valido", vencimiento: "valido", compuesto: "valido" };
  const alterable = ALTERABLES[variante];
  if (alterable !== undefined) {
    const [linea, posicion, digito] = alterable;
    const lineas = [l1, l2];
    lineas[linea] = reemplazar(lineas[linea] as string, posicion, alterar((lineas[linea] as string).charAt(posicion)));
    estados[digito] = "invalido";
    const [a1, a2] = lineas as [string, string];
    return { l1: a1, l2: conCompuesto(a1, a2), estados };
  }
  if (variante === "cd-compuesto-alterado") {
    estados.compuesto = "invalido";
    return { l1, l2: reemplazar(l2, 29, alterar(l2.charAt(29))), estados };
  }
  if (variante === "cd-documento-relleno") {
    estados.documento = "relleno";
    const r1 = reemplazar(l1, 14, "<");
    return { l1: r1, l2: conCompuesto(r1, l2), estados };
  }
  return { l1, l2, estados };
}

function linea3(p: PersonaFicticia): string | null {
  const nombre = p.segundoNombre === "" ? enMrz(p.primerNombre) : enMrz(p.primerNombre) + "<" + enMrz(p.segundoNombre);
  const l3 = enMrz(p.primerApellido) + "<" + enMrz(p.segundoApellido) + "<<" + nombre;
  return l3.length > ANCHO ? null : l3.padEnd(ANCHO, "<");
}

/**
 * Genera las 3 líneas MRZ TD1 de la cédula digital de una persona ficticia (FX-16 a FX-21).
 * Valida la persona, después las opciones y por último las restricciones de la MRZ; ante el primer fallo lanza
 * `ErrorFixture` (FX-03). Es puro y determinista (FX-06).
 */
export function generarMrzTd1(persona: PersonaFicticia, opciones?: OpcionesMrz): FixtureMrz {
  const p = validarPersona(persona);
  const o = leerOpciones(opciones);
  const variante = validarVariante(o.variante, VARIANTES_MRZ, "valida");
  const semilla = validarSemilla(o.semilla);
  const [v1, v2] = lineas12(p);
  const plan = validarOpcionesOcr(variante === "ocr-b", o.erroresOcr, o.posicionesOcr, [v1, v2]);
  if (p.nuip.length !== 10) throw new ErrorFixture("nuip-no-soportado-en-mrz", "nuip");
  const l3 = linea3(p);
  if (l3 === null) throw new ErrorFixture("nombre-excede-mrz", null);
  const { l1, l2, estados } = aplicarDigitos(variante, v1, v2);
  const lineasSinErrores: [string, string, string] = [l1, l2, l3];
  const { lineas: [e1, e2], inyecciones } = plan === null ? { lineas: [l1, l2], inyecciones: [] } : inyectar(plan, semilla, [l1, l2]);
  const lineas: [string, string, string] = [e1, e2, l3];
  return congelarProfundo({
    sintetico: true as const,
    variante,
    semilla,
    lineas,
    texto: lineas.join("\n"),
    lineasSinErrores,
    inyecciones,
    hipotesis: [...HIPOTESIS_MRZ],
    persona: p,
    esperado: {
      serialDocumento: p.serialDocumento,
      lugarExpedicion: p.lugarExpedicion,
      fechaNacimiento: p.fechaNacimiento,
      sexo: p.sexo,
      fechaVencimiento: p.fechaVencimiento,
      nacionalidad: "COL" as const,
      nuip: p.nuip,
      primerApellido: transliterar(p.primerApellido),
      segundoApellido: transliterar(p.segundoApellido),
      primerNombre: transliterar(p.primerNombre),
      segundoNombre: transliterar(p.segundoNombre),
      digitosControl: estados,
    },
  });
}
