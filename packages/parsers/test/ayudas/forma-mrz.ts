/**
 * Comprobación de la forma de MZ-01 (cambio parser-mrz-cedula-digital), escrita desde la spec y compartida por las
 * pruebas unitarias, de propiedad y de fuzz del parser MRZ.
 */
import type { ResultadoMrzCedulaDigital } from "../../src/index.js";

const MOTIVOS_SIN_LINEA = ["entrada-no-valida", "numero-lineas-invalido", "fecha-referencia-invalida", "no-es-cedula-digital"];
const MOTIVOS_CON_LINEA = ["entrada-demasiado-larga", "caracteres-invalidos", "longitud-linea-invalida"];
const ESTADOS = ["valido", "invalido", "ilegible", "ausente"];
const CODIGOS_ERROR = [
  "serial-invalido",
  "fecha-nacimiento-invalida",
  "sexo-invalido",
  "fecha-vencimiento-invalida",
  "nacionalidad-invalida",
  "nuip-invalido",
  "nombre-no-alfabetico",
];
const CLAVES_CAMPOS = [
  "apellidos",
  "codigoLugarMrz",
  "fechaNacimiento",
  "fechaVencimiento",
  "nacionalidad",
  "nombres",
  "nombresPosiblementeTruncados",
  "nuip",
  "nuipTipoProbable",
  "serial",
  "sexo",
];

const clavesOrdenadas = (o: object) => JSON.stringify(Object.keys(o).sort());

/** Forma exacta exigida por MZ-01. */
export function cumpleFormaMz01(r: ResultadoMrzCedulaDigital): boolean {
  if (!r.ok) {
    if (MOTIVOS_SIN_LINEA.includes(r.motivo)) return clavesOrdenadas(r) === '["motivo","ok"]';
    return (
      MOTIVOS_CON_LINEA.includes(r.motivo) &&
      clavesOrdenadas(r) === '["linea","motivo","ok"]' &&
      "linea" in r &&
      [1, 2, 3].includes(r.linea)
    );
  }
  const digitosOk = Object.values(r.digitosControl).every(
    (d) =>
      clavesOrdenadas(d) === '["calculado","estado","leido"]' &&
      ESTADOS.includes(d.estado) &&
      typeof d.leido === "string" &&
      d.leido.length === 1 &&
      Number.isInteger(d.calculado) &&
      d.calculado >= 0 &&
      d.calculado <= 9,
  );
  return (
    clavesOrdenadas(r) ===
      '["campos","correcciones","digitosControl","errores","lineasCorregidas","ok","valido","warnings"]' &&
    typeof r.valido === "boolean" &&
    clavesOrdenadas(r.campos) === JSON.stringify(CLAVES_CAMPOS) &&
    clavesOrdenadas(r.digitosControl) === '["compuesto","nacimiento","serial","vencimiento"]' &&
    digitosOk &&
    Array.isArray(r.correcciones) &&
    r.correcciones.every((c) => clavesOrdenadas(c) === '["columna","corregido","linea","original"]') &&
    Array.isArray(r.errores) &&
    r.errores.every((e) => CODIGOS_ERROR.includes(e)) &&
    Array.isArray(r.warnings) &&
    r.warnings.every((w) => typeof w === "string") &&
    r.lineasCorregidas.length === 3 &&
    r.lineasCorregidas.every((l) => typeof l === "string" && l.length === 30)
  );
}
