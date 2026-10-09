// @lector-cedula/web: núcleo headless (sdk-integracion, SDK-27 a SDK-30, SDK-07, SDK-08). Sin UI, sin estilos y sin
// efectos al importar: la cámara, los Workers y el motor se cargan solo al usarlos.
import type { EntradaLectura, OpcionesLeerDocumento } from "./lectura-headless.js";
import type { ResultadoPresentacion } from "./tipos.js";

export { crearLector } from "./controlador.js";
export { TRANSICIONES } from "./maquina.js";
export { ESTADO_INICIAL } from "./estado.js";
export { precargarMotor, NOMBRE_CACHE } from "./cargador.js";
export { VERSION } from "./version.js";
export type * from "./tipos.js";
export type { EntradaLectura, OpcionesLeerDocumento } from "./lectura-headless.js";

/** SDK-08: lee una imagen sin cámara ni DOM. Rechaza con `codigo` (`lectura-fallida`, `motor-no-disponible`...) o `AbortError`. */
export async function leerDocumento(entrada: EntradaLectura, opciones: OpcionesLeerDocumento = {}): Promise<ResultadoPresentacion> {
  const { leerDocumentoHeadless } = await import("./lectura-headless.js");
  return leerDocumentoHeadless(entrada, opciones);
}
