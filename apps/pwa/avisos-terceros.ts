/**
 * THIRD_PARTY_LICENSES.txt de la PWA (pwa-lectura-offline, OFF-20; condición C3 del revisor de licencias). La generación
 * vive en tools/avisos-terceros.mjs, compartida con el paquete @lector-cedula/web (sdk-integracion, SDK-26).
 */
import { textoAvisosTercerosPwa } from "../../tools/avisos-terceros.mjs";

export function textoAvisosTerceros(): string {
  return textoAvisosTercerosPwa();
}
