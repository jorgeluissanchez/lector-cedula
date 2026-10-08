/**
 * Piezas comunes de los parsers ICAO 9303 genéricos `parsearMrzTd3` y `parsearMrzTd1` (cambio otros-documentos,
 * OD-02 a OD-05a y OD-10a). No las usa `parsearMrzCedulaDigital`, cuyo contrato (MZ) no cambia.
 */
import { digitoControlIcao } from "./icao-9303.js";
import { buscarPaisIcao } from "./paises-icao.js";

export type EstadoDigitoIcao = "valido" | "invalido";
export type SexoIcao = "F" | "M" | null;

/** Alfabeto MRZ estricto: sin espacios ni minúsculas (OD-01b, OD-10b). */
const ALFABETO_MRZ = /^[0-9A-Z<]*$/;
const CIFRA = /^[0-9]$/;
const SEIS_CIFRAS = /^[0-9]{6}$/;
const FECHA_ISO = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const RELLENO_FINAL = /<+$/;
const SERIES_RELLENO = /<+/g;
/** Desfase fijo de America/Bogota (sin horario de verano). */
const DESFASE_BOGOTA_MS = 5 * 60 * 60 * 1000;

/** Confusiones OCR-B de letra por cifra, solo en zonas numéricas (OD-03). */
const OCR_B: Readonly<Record<string, string>> = { O: "0", Q: "0", I: "1", Z: "2", S: "5", G: "6", B: "8" };

/** `lineas` si es un array de exactamente `n` strings de `longitud` caracteres del alfabeto MRZ; si no, `null`. */
export function leerLineasIcao(lineas: unknown, n: number, longitud: number): string[] | null {
  if (!Array.isArray(lineas) || lineas.length !== n) return null;
  for (const linea of lineas as unknown[]) {
    if (typeof linea !== "string" || linea.length !== longitud || !ALFABETO_MRZ.test(linea)) return null;
  }
  return [...(lineas as string[])];
}

function esBisiesto(anio: number): boolean {
  return anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0);
}

/** `true` si `iso` (`AAAA-MM-DD` ya comprobado) es una fecha del calendario gregoriano. */
function existe(iso: string): boolean {
  const anio = Number(iso.slice(0, 4));
  const mes = Number(iso.slice(5, 7));
  const dia = Number(iso.slice(8, 10));
  const dias = mes === 2 ? (esBisiesto(anio) ? 29 : 28) : mes === 4 || mes === 6 || mes === 9 || mes === 11 ? 30 : 31;
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= dias;
}

/** Fecha de hoy en America/Bogota como `AAAA-MM-DD`. */
function hoyBogota(): string {
  return new Date(Date.now() - DESFASE_BOGOTA_MS).toISOString().slice(0, 10);
}

/**
 * `fechaReferencia` de las opciones (OD-05a): la fecha si es válida, `null` si está presente y no lo es, y la fecha
 * del sistema en Bogotá si `opciones` no es un objeto o no la trae.
 */
export function leerFechaReferenciaIcao(opciones: unknown): string | null {
  if (typeof opciones !== "object" || opciones === null || !Object.hasOwn(opciones, "fechaReferencia")) return hoyBogota();
  const fecha: unknown = (opciones as { fechaReferencia: unknown }).fechaReferencia;
  return typeof fecha === "string" && FECHA_ISO.test(fecha) && existe(fecha) ? fecha : null;
}

/** Corrección OCR-B registrada; en TD3 `posicion` es la columna de la línea 2. */
export interface CorreccionIcao {
  posicion: number;
  de: string;
  a: string;
}

/**
 * Aplica OCR-B en las posiciones de `zonas` (pares `[desde, hasta)`) de `linea` y devuelve la línea corregida y las
 * correcciones en orden de columna (OD-03).
 */
export function corregirZonas(linea: string, zonas: readonly (readonly [number, number])[]): { linea: string; correcciones: CorreccionIcao[] } {
  const caracteres = [...linea];
  const correcciones: CorreccionIcao[] = [];
  for (const [desde, hasta] of zonas) {
    for (let i = desde; i < hasta; i++) {
      const de = caracteres[i] as string;
      const a = OCR_B[de];
      if (a !== undefined) {
        caracteres[i] = a;
        correcciones.push({ posicion: i, de, a });
      }
    }
  }
  return { linea: caracteres.join(""), correcciones };
}

/** Estado del dígito de control `leido` sobre `datos` (ya del alfabeto MRZ). */
export function estadoDigito(datos: string, leido: string): EstadoDigitoIcao {
  return CIFRA.test(leido) && Number(leido) === digitoControlIcao(datos) ? "valido" : "invalido";
}

/** `AAMMDD` del nacimiento a ISO: `20AA` si no supera la referencia, si no `19AA`; `null` si no existe (OD-05). */
export function fechaNacimientoIcao(aammdd: string, referencia: string): string | null {
  if (!SEIS_CIFRAS.test(aammdd)) return null;
  const en2000 = `20${aammdd.slice(0, 2)}-${aammdd.slice(2, 4)}-${aammdd.slice(4, 6)}`;
  const iso = en2000 <= referencia ? en2000 : `19${en2000.slice(2)}`;
  return existe(iso) ? iso : null;
}

/** `AAMMDD` del vencimiento a ISO, siempre `20AA`; `null` si no existe (OD-05). */
export function fechaVencimientoIcao(aammdd: string): string | null {
  if (!SEIS_CIFRAS.test(aammdd)) return null;
  const iso = `20${aammdd.slice(0, 2)}-${aammdd.slice(2, 4)}-${aammdd.slice(4, 6)}`;
  return existe(iso) ? iso : null;
}

/** Sexo: `F` o `M`; `<`, `X` y cualquier otro carácter son `null` (OD-01a). */
export function sexoIcao(c: string): SexoIcao {
  return c === "F" || c === "M" ? c : null;
}

/** Texto sin el relleno final; `null` si queda vacío. */
export function sinRelleno(texto: string): string | null {
  const limpio = texto.replace(RELLENO_FINAL, "");
  return limpio === "" ? null : limpio;
}

/** Apellidos y nombres separados por `<<`, con `<` simple como espacio (OD-01a, OD-10). */
export function leerNombreIcao(zona: string): { apellidos: string; nombres: string } {
  const limpio = zona.replace(RELLENO_FINAL, "");
  const corte = limpio.indexOf("<<");
  const apellidos = corte === -1 ? limpio : limpio.slice(0, corte);
  const nombres = corte === -1 ? "" : limpio.slice(corte + 2);
  return { apellidos: apellidos.replace(SERIES_RELLENO, " "), nombres: nombres.replace(SERIES_RELLENO, " ") };
}

/**
 * Códigos y nombres de país del emisor y la nacionalidad, y los warnings `documento-vencido`, `pais-desconocido` y
 * `pais-especimen` sin repetir (OD-04, OD-05).
 */
export function paisesYVigencia(
  emisor: string,
  nacionalidad: string,
  fechaVencimiento: string,
  referencia: string,
): { estadoEmisor: string; nacionalidad: string; nombrePaisEmisor: string | null; nombreNacionalidad: string | null; warnings: string[] } {
  const e = buscarPaisIcao(emisor);
  const n = buscarPaisIcao(nacionalidad);
  const warnings = fechaVencimiento < referencia ? ["documento-vencido"] : [];
  for (const w of [...e.warnings, ...n.warnings]) if (!warnings.includes(w)) warnings.push(w);
  return { estadoEmisor: e.codigo, nacionalidad: n.codigo, nombrePaisEmisor: e.nombre, nombreNacionalidad: n.nombre, warnings };
}
