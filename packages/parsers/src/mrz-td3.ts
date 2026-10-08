/**
 * Parser puro de la MRZ TD3 (pasaporte, ICAO 9303 parte 4: 2 líneas de 44).
 *
 * Contrato: openspec/changes/otros-documentos/specs/mrz-td3/spec.md (OD-01 a OD-05a). Total: nunca lanza ni modifica
 * sus argumentos. El dato opcional se devuelve sin interpretar (hipótesis P01 pendiente, OD-01c). Un pasaporte vencido
 * es un warning, no un rechazo (OD-05).
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

export interface CamposMrzTd3 {
  codigoDocumento: string;
  estadoEmisor: string;
  apellidos: string;
  nombres: string;
  numeroDocumento: string;
  nacionalidad: string;
  fechaNacimiento: string;
  sexo: SexoIcao;
  fechaVencimiento: string;
  /** Sin interpretar (P01). */
  datoOpcional: string | null;
}

export interface DigitosControlTd3 {
  numeroDocumento: EstadoDigitoIcao;
  nacimiento: EstadoDigitoIcao;
  vencimiento: EstadoDigitoIcao;
  datoOpcional: EstadoDigitoIcao;
  compuesto: EstadoDigitoIcao;
}

export type ErrorMrzTd3 = "formato-td3" | "no-es-pasaporte" | "fecha-referencia-invalida" | "fecha-invalida";

export type ResultadoMrzTd3 =
  | {
      ok: true;
      tipoDocumento: "pasaporte";
      campos: CamposMrzTd3;
      nombrePaisEmisor: string | null;
      nombreNacionalidad: string | null;
      digitosControl: DigitosControlTd3;
      correcciones: CorreccionIcao[];
      warnings: string[];
    }
  | { ok: false; error: ErrorMrzTd3 }
  | { ok: false; error: "digito-control"; digitosControl: DigitosControlTd3 };

/** Zonas numéricas de la línea 2 (OD-03): [9], [13,20), [21,28), [42], [43]. */
const ZONAS_NUMERICAS = [
  [9, 10],
  [13, 20],
  [21, 28],
  [42, 44],
] as const;

function digitos(l2: string): DigitosControlTd3 {
  const opcional = l2.slice(28, 42);
  // Con el campo vacío, "0" ya es el dígito calculado; "<" se admite además (OD-02).
  const opcionalVacio = /^<*$/.test(opcional) && l2.charAt(42) === "<";
  return {
    numeroDocumento: estadoDigito(l2.slice(0, 9), l2.charAt(9)),
    nacimiento: estadoDigito(l2.slice(13, 19), l2.charAt(19)),
    vencimiento: estadoDigito(l2.slice(21, 27), l2.charAt(27)),
    datoOpcional: opcionalVacio ? "valido" : estadoDigito(opcional, l2.charAt(42)),
    compuesto: estadoDigito(l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43), l2.charAt(43)),
  };
}

/**
 * Lee la MRZ TD3 de un pasaporte. `lineas` debe ser un array de 2 strings de 44 caracteres de `0-9A-Z<`; `opciones`
 * admite `{ fechaReferencia: "AAAA-MM-DD" }` (por defecto, hoy en Bogotá). Acepta cualquier valor y nunca lanza.
 */
export function parsearMrzTd3(lineas: unknown, opciones?: unknown): ResultadoMrzTd3 {
  const leidas = leerLineasIcao(lineas, 2, 44);
  if (leidas === null) return { ok: false, error: "formato-td3" };
  const [l1, original2] = leidas as [string, string];
  if (l1.charAt(0) !== "P") return { ok: false, error: "no-es-pasaporte" };
  const referencia = leerFechaReferenciaIcao(opciones);
  if (referencia === null) return { ok: false, error: "fecha-referencia-invalida" };

  const { linea: l2, correcciones } = corregirZonas(original2, ZONAS_NUMERICAS);
  const digitosControl = digitos(l2);
  if (Object.values(digitosControl).includes("invalido")) return { ok: false, error: "digito-control", digitosControl };

  const fechaNacimiento = fechaNacimientoIcao(l2.slice(13, 19), referencia);
  const fechaVencimiento = fechaVencimientoIcao(l2.slice(21, 27));
  if (fechaNacimiento === null || fechaVencimiento === null) return { ok: false, error: "fecha-invalida" };

  const paises = paisesYVigencia(l1.slice(2, 5), l2.slice(10, 13), fechaVencimiento, referencia);
  return {
    ok: true,
    tipoDocumento: "pasaporte",
    campos: {
      codigoDocumento: l1.slice(0, 2).replace(/</g, ""),
      estadoEmisor: paises.estadoEmisor,
      ...leerNombreIcao(l1.slice(5, 44)),
      numeroDocumento: l2.slice(0, 9).replace(/</g, ""),
      nacionalidad: paises.nacionalidad,
      fechaNacimiento,
      sexo: sexoIcao(l2.charAt(20)),
      fechaVencimiento,
      datoOpcional: sinRelleno(l2.slice(28, 42)),
    },
    nombrePaisEmisor: paises.nombrePaisEmisor,
    nombreNacionalidad: paises.nombreNacionalidad,
    digitosControl,
    correcciones,
    warnings: paises.warnings,
  };
}
