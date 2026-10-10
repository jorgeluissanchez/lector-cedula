/**
 * Entrada del IIFE (sdk-nativo, NAT-07): expone `globalThis.LectorCedulaNucleo`, congelado. Es lo único que el bundle
 * escribe en el ámbito global.
 */
import { crearEstado, decidirEnvio, mensajeError, procesarMrz, procesarPdf417, transicion, validarOpciones, validarUrlSubida, VERSION } from "./nucleo.js";

(globalThis as Record<string, unknown>)["LectorCedulaNucleo"] = Object.freeze({
  version: VERSION,
  procesarPdf417,
  procesarMrz,
  transicion,
  crearEstado,
  validarOpciones,
  validarUrlSubida,
  decidirEnvio,
  mensajeError,
});
