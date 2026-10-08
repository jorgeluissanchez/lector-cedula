// LectorCodigos de PDF417 (OFF-07, CAL-15): zxing-wasm solo con `formats: ["PDF417"]`; el QR nunca se decodifica.
import type {
  CapturaAceptada,
  CodigoLeido,
  LectorCodigos,
} from "../interfaces.js";
import {
  crearDecodificador,
  type DependenciasDecodificador,
} from "../pdf417/decodificar.js";

export function crearLectorCodigosPdf417(
  dependencias: DependenciasDecodificador = {},
): LectorCodigos {
  const decodificar = crearDecodificador(dependencias);
  return {
    id: "pdf417-zxing",
    formatos: ["pdf417"],
    async leer(
      captura: CapturaAceptada,
      opciones?: { readonly senal?: AbortSignal },
    ): Promise<readonly CodigoLeido[]> {
      if (opciones?.senal?.aborted === true) return [];
      const r = await decodificar({
        data: captura.pixeles,
        width: captura.ancho,
        height: captura.alto,
      });
      return r.ok
        ? [{ formato: "pdf417", bytes: r.bytes, esquinas: null }]
        : [];
    },
  };
}
