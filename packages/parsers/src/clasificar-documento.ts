/**
 * Clasificación del documento a partir de su MRZ (cambio otros-documentos, OD-11 a OD-12).
 *
 * Las reglas de la cédula de extranjería son hipótesis pendientes (CE01 a CE03 y CE05 a CE07 en
 * docs/decisiones/hipotesis-formato.md) y se declaran como warnings (principio VI). La TI solo se admite por PDF417:
 * una MRZ `IT` o `TI` de Colombia (T01) se rechaza (decisión del orquestador 1). Pura y total.
 */
import { type CamposMrzTd1, parsearMrzTd1, type ResultadoMrzTd1 } from "./mrz-td1.js";
import { type CamposMrzTd3, parsearMrzTd3, type ResultadoMrzTd3 } from "./mrz-td3.js";

export type TipoDocumentoMrz = "cedula-ciudadania" | "cedula-extranjeria" | "pasaporte";

export type ResultadoClasificacion =
  | { ok: true; tipoDocumento: "pasaporte"; fuente: "mrz-td3"; campos: CamposMrzTd3; warnings: string[] }
  | { ok: true; tipoDocumento: "cedula-ciudadania" | "cedula-extranjeria"; fuente: "mrz-td1"; campos: CamposMrzTd1; warnings: string[] }
  | { ok: false; error: "documento-no-admitido"; warnings?: string[] }
  | Extract<ResultadoMrzTd1, { ok: false }>
  | Extract<ResultadoMrzTd3, { ok: false }>;

const COLOMBIA = "COL";
const CODIGOS_CE = ["I", "ID", "IE"];
const CODIGOS_TI = ["IT", "TI"];
/** Hipótesis de la CE que se declaran mientras no haya espécimen (OD-11, OD-11a). CE04 se cumple con OD-13. */
const HIPOTESIS_CE = ["CE01", "CE02", "CE03", "CE05", "CE06", "CE07"];
const SOLO_CIFRAS = /^[0-9]+$/;

/**
 * Clasifica una MRZ: 2 líneas como pasaporte (TD3) y cualquier otra entrada como TD1. Propaga los errores del parser
 * y devuelve `documento-no-admitido` para lo que no es CC, CE ni pasaporte.
 */
export function clasificarDocumento(lineas: unknown, opciones?: unknown): ResultadoClasificacion {
  if (Array.isArray(lineas) && lineas.length === 2) {
    const r = parsearMrzTd3(lineas, opciones);
    if (!r.ok) return r;
    return { ok: true, tipoDocumento: "pasaporte", fuente: "mrz-td3", campos: r.campos, warnings: r.warnings };
  }
  const r = parsearMrzTd1(lineas, opciones);
  if (!r.ok) return r;
  const { codigoDocumento, estadoEmisor, nacionalidad, numeroDocumento } = r.campos;
  if (estadoEmisor !== COLOMBIA) return { ok: false, error: "documento-no-admitido" };
  if (codigoDocumento === "IC") return { ok: true, tipoDocumento: "cedula-ciudadania", fuente: "mrz-td1", campos: r.campos, warnings: r.warnings };
  if (CODIGOS_TI.includes(codigoDocumento)) return { ok: false, error: "documento-no-admitido", warnings: ["T01"] };
  if (!CODIGOS_CE.includes(codigoDocumento) || nacionalidad === COLOMBIA) return { ok: false, error: "documento-no-admitido" };
  const warnings = [...r.warnings, ...HIPOTESIS_CE];
  if (!SOLO_CIFRAS.test(numeroDocumento)) warnings.push("CE03-numero-no-numerico");
  return { ok: true, tipoDocumento: "cedula-extranjeria", fuente: "mrz-td1", campos: r.campos, warnings };
}
