/**
 * Parser genérico de la MRZ TD1 (ICAO 9303 parte 5: 3 líneas de 30), para la cédula de extranjería y otros TD1.
 *
 * Contrato: openspec/changes/otros-documentos/specs/cedula-extranjeria/spec.md (OD-10, OD-10a, OD-10b). No sustituye
 * a `parsearMrzCedulaDigital`, cuya salida no cambia. Total: nunca lanza ni modifica sus argumentos.
 */
import {
  corregirZonas,
  type CorreccionIcao,
  estadoDigito,
  type EstadoDigitoIcao,
  fechaNacimientoIcao,
  fechaVencimientoIcao,
  leerFechaReferenciaIcao,
  leerLineasIcao,
  leerNombreIcao,
  paisesYVigencia,
  sexoIcao,
  type SexoIcao,
  sinRelleno,
} from "./mrz-icao-comun.js";

export interface CamposMrzTd1 {
  codigoDocumento: string;
  estadoEmisor: string;
  numeroDocumento: string;
  datoOpcional1: string | null;
  fechaNacimiento: string;
  sexo: SexoIcao;
  fechaVencimiento: string;
  nacionalidad: string;
  datoOpcional2: string | null;
  apellidos: string;
  nombres: string;
}

export interface DigitosControlTd1 {
  numeroDocumento: EstadoDigitoIcao;
  nacimiento: EstadoDigitoIcao;
  vencimiento: EstadoDigitoIcao;
  compuesto: EstadoDigitoIcao;
}

/** Corrección OCR-B del TD1 con su línea (1 o 2). */
export interface CorreccionTd1 extends CorreccionIcao {
  linea: 1 | 2;
}

export type ErrorMrzTd1 = "formato-td1" | "fecha-referencia-invalida" | "fecha-invalida";

export type ResultadoMrzTd1 =
  | {
      ok: true;
      campos: CamposMrzTd1;
      nombrePaisEmisor: string | null;
      nombreNacionalidad: string | null;
      digitosControl: DigitosControlTd1;
      correcciones: CorreccionTd1[];
      warnings: string[];
    }
  | { ok: false; error: ErrorMrzTd1 }
  | { ok: false; error: "digito-control"; digitosControl: DigitosControlTd1 };

/** Zonas numéricas (OD-10a): línea 1 [14]; línea 2 [0,7), [8,15) y [29]. */
const ZONAS_L1 = [[14, 15]] as const;
const ZONAS_L2 = [
  [0, 7],
  [8, 15],
  [29, 30],
] as const;

/**
 * Lee cualquier MRZ TD1. `lineas` debe ser un array de 3 strings de 30 caracteres de `0-9A-Z<`; `opciones` admite
 * `{ fechaReferencia: "AAAA-MM-DD" }` (por defecto, hoy en Bogotá). Acepta cualquier valor y nunca lanza.
 */
export function parsearMrzTd1(lineas: unknown, opciones?: unknown): ResultadoMrzTd1 {
  const leidas = leerLineasIcao(lineas, 3, 30);
  if (leidas === null) return { ok: false, error: "formato-td1" };
  const referencia = leerFechaReferenciaIcao(opciones);
  if (referencia === null) return { ok: false, error: "fecha-referencia-invalida" };

  const c1 = corregirZonas(leidas[0] as string, ZONAS_L1);
  const c2 = corregirZonas(leidas[1] as string, ZONAS_L2);
  const l1 = c1.linea;
  const l2 = c2.linea;
  const correcciones: CorreccionTd1[] = [
    ...c1.correcciones.map((c) => ({ linea: 1 as const, ...c })),
    ...c2.correcciones.map((c) => ({ linea: 2 as const, ...c })),
  ];
  const digitosControl: DigitosControlTd1 = {
    numeroDocumento: estadoDigito(l1.slice(5, 14), l1.charAt(14)),
    nacimiento: estadoDigito(l2.slice(0, 6), l2.charAt(6)),
    vencimiento: estadoDigito(l2.slice(8, 14), l2.charAt(14)),
    compuesto: estadoDigito(l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29), l2.charAt(29)),
  };
  if (Object.values(digitosControl).includes("invalido")) return { ok: false, error: "digito-control", digitosControl };

  const fechaNacimiento = fechaNacimientoIcao(l2.slice(0, 6), referencia);
  const fechaVencimiento = fechaVencimientoIcao(l2.slice(8, 14));
  if (fechaNacimiento === null || fechaVencimiento === null) return { ok: false, error: "fecha-invalida" };

  const paises = paisesYVigencia(l1.slice(2, 5), l2.slice(15, 18), fechaVencimiento, referencia);
  return {
    ok: true,
    campos: {
      codigoDocumento: l1.slice(0, 2).replace(/</g, ""),
      estadoEmisor: paises.estadoEmisor,
      numeroDocumento: l1.slice(5, 14).replace(/</g, ""),
      datoOpcional1: sinRelleno(l1.slice(15, 30)),
      fechaNacimiento,
      sexo: sexoIcao(l2.charAt(7)),
      fechaVencimiento,
      nacionalidad: paises.nacionalidad,
      datoOpcional2: sinRelleno(l2.slice(18, 29)),
      ...leerNombreIcao(leidas[2] as string),
    },
    nombrePaisEmisor: paises.nombrePaisEmisor,
    nombreNacionalidad: paises.nombreNacionalidad,
    digitosControl,
    correcciones,
    warnings: paises.warnings,
  };
}
