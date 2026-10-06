/**
 * @lector-cedula/parsers
 *
 * Parsers puros (sin E/S) para la cédula colombiana. Ver
 * docs/investigacion/01-formato-cedula-y-repos.md y la constitución (principios III, V, VI y VII).
 */
export const VERSION = "0.0.0";

export { validarFormatoNuip } from "./nuip-formato.js";
export type {
  MotivoFormatoInvalido,
  OpcionesFormatoNuip,
  ResultadoFormatoNuip,
  TipoDocumento,
  TipoProbable,
} from "./nuip-formato.js";
