/**
 * @lector-cedula/parsers/divipol-2018: consulados DIVIPOL de 2018 de la Registraduría (cambio
 * divipol-consulados-2018, DC-01 a DC-05).
 *
 * Punto de entrada separado del principal: los datos son material adaptado de la Registraduría Nacional del Estado
 * Civil bajo CC BY-SA 4.0 (atribución en DIVIPOL_2018_METADATOS y packages/parsers/THIRD_PARTY_NOTICES.md). El
 * punto de entrada principal nunca importa este módulo.
 *
 * Función pura y total: nunca lanza y devuelve objetos y arreglos nuevos en cada llamada. Solo resuelve consulados
 * (departamento 88): los 69 de 2018 y los códigos alternos de Belice (88195) e Irlanda (88480).
 */
import type { ResultadoDivipol } from "../divipol/buscar.js";
import { FILAS_CONSULADOS_2018, FUENTE_CONSULADOS_2018, RENOMBRADOS_2018_GENERADO } from "./consulados.generated.js";

export const DIVIPOL_2018_METADATOS: {
  readonly fuente: string;
  readonly url: string;
  readonly licencia: "CC-BY-SA-4.0";
  readonly sha256: string;
  readonly cambios: string;
  readonly filas: number;
} = Object.freeze({
  fuente: FUENTE_CONSULADOS_2018.fuente,
  url: FUENTE_CONSULADOS_2018.url,
  licencia: FUENTE_CONSULADOS_2018.licencia,
  sha256: FUENTE_CONSULADOS_2018.sha256,
  cambios: FUENTE_CONSULADOS_2018.cambios,
  filas: FILAS_CONSULADOS_2018.length,
});

/** Consulados cuyo nombre vigente (2018) difiere del de la tabla principal (DC-03). */
export const RENOMBRADOS_2018: readonly string[] = Object.freeze([...RENOMBRADOS_2018_GENERADO]);

const CONSULADOS = new Map<string, string>(FILAS_CONSULADOS_2018);
const CODIGO = /^[0-9]{5}$/;

export function buscarConsulado2018(codigo: unknown): ResultadoDivipol {
  if (typeof codigo !== "string" || !CODIGO.test(codigo)) {
    return { encontrado: false, codigo: null, motivo: "formato-invalido", warnings: [] };
  }
  const municipio = CONSULADOS.get(codigo);
  if (municipio === undefined) return { encontrado: false, codigo, motivo: "desconocido", warnings: [] };
  return {
    encontrado: true,
    codigo,
    codigoDepartamento: codigo.slice(0, 2),
    codigoMunicipio: codigo.slice(2),
    departamento: "CONSULADOS",
    municipio,
    tipo: "consulado",
    warnings: ["D03"],
  };
}
