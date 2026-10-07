/* eslint-disable @typescript-eslint/no-require-imports */
// Worker de Tesseract.js 7.0.0 para Node (cambio leer-mrz-desde-imagen, LMI-02 y LMI-07). Sustituye al worker por
// defecto por dos motivos verificados en la tarea 1:
// 1. Fija el core `tesseract-core-simd-lstm`: el core `relaxedsimd-lstm`, que Tesseract.js elige por defecto en Node 24,
//    aborta al cargar `mrz.traineddata` (modelo de coma flotante) con `missing function: DotProductSSE`.
// 2. Privacidad: `writeCache` no escribe nada (aunque `cacheMethod: "none"` ya lo evita) y no hay `fetch`: el modelo
//    solo se lee de una ruta local.
"use strict";

const { parentPort } = require("node:worker_threads");
const { readFile } = require("node:fs/promises");
const { gunzipSync } = require("node:zlib");
const worker = require("tesseract.js/src/worker-script");

let core = null;

worker.setAdapter({
  getCore: async (_oem, _core, res) => {
    if (core === null) {
      res.progress({ status: "loading tesseract core", progress: 0 });
      core = require("tesseract.js-core/tesseract-core-simd-lstm");
      res.progress({ status: "loading tesseract core", progress: 1 });
    }
    return core;
  },
  gunzip: gunzipSync,
  fetch: () => Promise.reject(new Error("red deshabilitada")),
  readCache: (ruta) => readFile(ruta),
  writeCache: () => Promise.resolve(),
  deleteCache: () => Promise.resolve(),
  checkCache: () => Promise.resolve(false),
});

parentPort.on("message", (paquete) => {
  worker.dispatchHandlers(paquete, (obj) => parentPort.postMessage(obj));
});
