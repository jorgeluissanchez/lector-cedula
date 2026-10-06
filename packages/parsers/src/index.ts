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

// MRZ TD1 de la cédula digital (cambio parser-mrz-cedula-digital).
export { digitoControlIcao } from "./icao-9303.js";

export { parsearMrzCedulaDigital } from "./mrz-cedula-digital.js";
export type {
  CamposMrzCedulaDigital,
  CodigoErrorCampoMrz,
  CorreccionOcr,
  DigitoControl,
  DigitosControlMrz,
  EstadoDigitoControl,
  MotivoRechazoMrz,
  OpcionesMrzCedulaDigital,
  ResultadoMrzCedulaDigital,
} from "./mrz-cedula-digital.js";

// PDF417 de la cédula amarilla (cambio parser-pdf417-amarilla).
export { parsearPdf417Amarilla } from "./pdf417-amarilla/index.js";
export type {
  BloqueDemograficoPdf417,
  CampoCedulaAmarilla,
  CamposCedulaAmarilla,
  ConfianzaCampo,
  IdValidacionPdf417,
  ModoLecturaPdf417,
  MotivoErrorPdf417,
  OpcionesPdf417Amarilla,
  ResolutorDivipol,
  ResultadoPdf417Amarilla,
  Rh,
  ValidacionPdf417,
  VarianteTramaPdf417,
} from "./pdf417-amarilla/index.js";

// Códigos de lugar DIVIPOL de la Registraduría (cambio divipol-registraduria, design.md decisión 3). La
// equivalencia con DIVIPOLA del DANE vive en el punto de entrada separado ./divipola y nunca se importa aquí (DV-17).
export { DIVIPOL_METADATOS, buscarDivipol } from "./divipol/buscar.js";
export type { MotivoDivipolNoEncontrado, ResultadoDivipol, TipoLugarDivipol } from "./divipol/buscar.js";
