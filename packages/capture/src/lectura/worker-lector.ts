// Worker lector (OFF-06, OFF-07, OFF-10, OFF-11, OFF-14; design.md, decisiones 1, 4 y 5). Conecta el manejador puro
// con zxing-wasm (solo PDF417, WASM desde `rutas.zxingWasm`), un único lector MRZ de tesseract.js con rutas del mismo
// origen (`cacheMethod: "none"`, sin CDN ni IndexedDB) y los parsers con DIVIPOL. Responde el resultado
// (enmascarado salvo con `enmascarar: false`, OFF-09); nunca lanza hacia fuera. Código de entorno (navegador): lo cubre la prueba de Vitest browser.
// Stryker disable all
import { buscarDivipol, parsearPdf417Amarilla } from "@lector-cedula/parsers";
import { crearLectorMrz } from "../mrz/lector.js";
import {
  crearDecodificador,
  type DecodificadorPdf417,
} from "../pdf417/decodificar.js";
import { crearManejadorLector, type RespuestaLector } from "./manejador.js";

export interface RutasLector {
  /** URL de `zxing_reader.wasm`. */
  readonly zxingWasm: string;
  /** URL del worker de tesseract.js. */
  readonly tesseractWorker: string;
  /** URL del core de tesseract.js (archivo o directorio con las variantes `simd-lstm` y `lstm`). */
  readonly tesseractCore: string;
  /** Directorio (URL) que contiene `mrz.traineddata`. */
  readonly modeloMrz: string;
  /** OFF-23: presupuesto de la MRZ (por defecto el de LMI-13). */
  readonly maxLlamadasOcr?: number;
  readonly tiempoLimiteMs?: number;
  /** OFF-09: `false` en la PWA (datos completos); por defecto `true`. */
  readonly enmascarar?: boolean;
}

export interface AlcanceLector {
  onmessage: ((evento: MessageEvent<unknown>) => void) | null;
  postMessage(mensaje: RespuestaLector): void;
}

function lectorZxing(rutaWasm: string): DecodificadorPdf417 {
  let listo: Promise<typeof import("zxing-wasm/reader")> | null = null;
  return async (imagen, opciones) => {
    listo ??= import("zxing-wasm/reader").then(async (zxing) => {
      await zxing.prepareZXingModule({
        overrides: { locateFile: () => rutaWasm },
        fireImmediately: true,
      });
      return zxing;
    });
    const zxing = await listo;
    return zxing.readBarcodes(imagen as unknown as ImageData, opciones);
  };
}

export function iniciarWorkerLector(
  alcance: AlcanceLector,
  rutas: RutasLector,
): void {
  const manejar = crearManejadorLector(
    {
      decodificar: crearDecodificador({
        readBarcodes: lectorZxing(rutas.zxingWasm),
      }),
      lectorMrz: crearLectorMrz({
        rutaModelo: rutas.modeloMrz,
        rutaWorker: rutas.tesseractWorker,
        rutaCore: rutas.tesseractCore,
        ...(rutas.maxLlamadasOcr === undefined
          ? {}
          : { maxLlamadasOcr: rutas.maxLlamadasOcr }),
        ...(rutas.tiempoLimiteMs === undefined
          ? {}
          : { tiempoLimiteMs: rutas.tiempoLimiteMs }),
      }),
      parsearPdf417: parsearPdf417Amarilla,
      buscarDivipol,
    },
    { enmascarar: rutas.enmascarar ?? true },
  );
  alcance.onmessage = (evento) => {
    void manejar(evento.data)
      .then((respuesta) => {
        if (respuesta !== null) alcance.postMessage(respuesta);
      })
      .catch(() => undefined);
  };
}
