// Worker lector de prueba (pwa-lectura-offline, tarea 3.1): rutas locales servidas por el servidor de Vitest.
import urlCore from "tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url";
import urlWorkerTesseract from "tesseract.js/dist/worker.min.js?url";
import urlZxing from "zxing-wasm/reader/zxing_reader.wasm?url";
import urlModelo from "../../../../models/tesseract/mrz.traineddata?url";
import { iniciarWorkerLector, type AlcanceLector } from "../../src/lectura/worker-lector.js";

const absoluta = (u: string) => new URL(u, self.location.href).href;
const modelo = absoluta(urlModelo);

iniciarWorkerLector(self as unknown as AlcanceLector, {
  zxingWasm: absoluta(urlZxing),
  tesseractWorker: absoluta(urlWorkerTesseract),
  tesseractCore: absoluta(urlCore),
  modeloMrz: modelo.slice(0, modelo.lastIndexOf("/")),
});
