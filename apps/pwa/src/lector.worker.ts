/**
 * Worker lector de la PWA (pwa-lectura-offline, OFF-06; design.md, decisiones 1, 4 y 5). Todas las rutas son del mismo
 * origen y con hash (las emite Vite con `?url` y las precachea el service worker): sin CDN ni IndexedDB (OFF-04,
 * OFF-11). Elige el core de tesseract.js con o sin SIMD según el navegador (se precachean las dos variantes).
 */
import { iniciarWorkerLector, type AlcanceLector } from "@lector-cedula/capture";
import urlCoreLstmWasm from "tesseract.js-core/tesseract-core-lstm.wasm?url";
import urlCoreLstm from "tesseract.js-core/tesseract-core-lstm.js?url";
import urlCoreSimdWasm from "tesseract.js-core/tesseract-core-simd-lstm.wasm?url";
import urlCoreSimd from "tesseract.js-core/tesseract-core-simd-lstm.js?url";
import urlWorkerTesseract from "tesseract.js/dist/worker.min.js?url";
import urlZxing from "zxing-wasm/reader/zxing_reader.wasm?url";
import urlModelo from "../../../models/tesseract/mrz.traineddata?url";
import { PRESUPUESTO_MRZ_PWA } from "./presupuesto";

// Módulo mínimo con una instrucción SIMD (v128): `WebAssembly.validate` dice si el navegador la admite.
const SIMD = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
const absoluta = (u: string): string => new URL(u, self.location.href).href;

// El core de cada variante busca su .wasm por el nombre con hash (lo reescribe plugin-pwa.ts al compilar); se
// referencian aquí para que Vite los emita.
void urlCoreLstmWasm;
void urlCoreSimdWasm;

// tesseract.js pide `${langPath}/mrz.traineddata`; con `langPath = <ruta con hash>?` la petición es
// `/assets/mrz-<hash>.traineddata?/mrz.traineddata`: el servidor y el service worker la resuelven por la ruta.
const langPath = `${absoluta(urlModelo)}?`;

iniciarWorkerLector(self as unknown as AlcanceLector, {
  zxingWasm: absoluta(urlZxing),
  tesseractWorker: absoluta(urlWorkerTesseract),
  tesseractCore: absoluta(WebAssembly.validate(SIMD) ? urlCoreSimd : urlCoreLstm),
  modeloMrz: langPath,
  ...PRESUPUESTO_MRZ_PWA,
});
