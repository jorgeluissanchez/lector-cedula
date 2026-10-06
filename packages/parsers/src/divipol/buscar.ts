/**
 * Búsqueda de códigos de lugar DIVIPOL de la Registraduría (cambio divipol-registraduria, requisitos DV-01 a DV-09
 * y DV-11; design.md decisión 3).
 *
 * Función pura y total: nunca lanza, sin E/S, y devuelve objetos y arreglos nuevos en cada llamada (DV-08). Los
 * códigos son siempre DIVIPOL, nunca DIVIPOLA del DANE (DV-03). Las advertencias son IDs de hipótesis de
 * docs/decisiones/hipotesis-formato.md: D01 (municipio o consulado posterior a la fuente), D02 (código histórico
 * de Bogotá), D03 (numeración de consulados) y D04 (00000 = lugar no registrado).
 */
import { DEPARTAMENTOS_DIVIPOL, FILAS_DIVIPOL, FUENTE_TABLA_DIVIPOL } from "./tabla.generated.js";

export type TipoLugarDivipol = "municipio" | "consulado";
export type MotivoDivipolNoEncontrado = "formato-invalido" | "sin-dato" | "desconocido";
export type ResultadoDivipol =
  | {
      encontrado: true;
      /** 5 dígitos ASCII. */
      codigo: string;
      /** 2 dígitos. */
      codigoDepartamento: string;
      /** 3 dígitos. */
      codigoMunicipio: string;
      departamento: string;
      municipio: string;
      tipo: TipoLugarDivipol;
      /** IDs de hipótesis: D02 (15001) o D03 (consulados). */
      warnings: string[];
    }
  | {
      encontrado: false;
      /** null solo con "formato-invalido". */
      codigo: string | null;
      motivo: MotivoDivipolNoEncontrado;
      /** D01 (departamento conocido) o D04 (00000). */
      warnings: string[];
    };

export const DIVIPOL_METADATOS: {
  readonly fuente: string;
  readonly commit: string;
  readonly ruta: string;
  readonly licencia: "MIT";
  readonly sha256: string;
  readonly filas: number;
} = Object.freeze({
  fuente: FUENTE_TABLA_DIVIPOL.fuente,
  commit: FUENTE_TABLA_DIVIPOL.commit,
  ruta: FUENTE_TABLA_DIVIPOL.ruta,
  licencia: FUENTE_TABLA_DIVIPOL.licencia,
  sha256: FUENTE_TABLA_DIVIPOL.sha256,
  filas: FILAS_DIVIPOL.length,
});

const MUNICIPIOS = new Map<string, string>(FILAS_DIVIPOL);
const DEPARTAMENTOS = new Map<string, string>(Object.entries(DEPARTAMENTOS_DIVIPOL));
const CODIGO_DIVIPOL = /^[0-9]{5}$/;
const DEPARTAMENTO_CONSULADOS = "88";
const BOGOTA_HISTORICO = "15001";
const SIN_DATO = "00000";

export function buscarDivipol(codigo: unknown): ResultadoDivipol {
  if (typeof codigo !== "string" || !CODIGO_DIVIPOL.test(codigo)) {
    return { encontrado: false, codigo: null, motivo: "formato-invalido", warnings: [] };
  }
  const codigoDepartamento = codigo.slice(0, 2);
  const departamento = DEPARTAMENTOS.get(codigoDepartamento);
  const municipio = MUNICIPIOS.get(codigo);
  if (departamento === undefined || municipio === undefined) {
    if (codigo === SIN_DATO) return { encontrado: false, codigo, motivo: "sin-dato", warnings: ["D04"] };
    return { encontrado: false, codigo, motivo: "desconocido", warnings: departamento === undefined ? [] : ["D01"] };
  }
  const consulado = codigoDepartamento === DEPARTAMENTO_CONSULADOS;
  return {
    encontrado: true,
    codigo,
    codigoDepartamento,
    codigoMunicipio: codigo.slice(2),
    departamento,
    municipio,
    tipo: consulado ? "consulado" : "municipio",
    warnings: consulado ? ["D03"] : codigo === BOGOTA_HISTORICO ? ["D02"] : [],
  };
}
