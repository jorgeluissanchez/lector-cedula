# Licencias para leer la MRZ desde imagen (2026-10-06)

Cambio OpenSpec: `leer-mrz-desde-imagen`. Estado: propuesto, pendiente de ratificación humana y de `revisor-licencias`.

| Componente | Uso | Licencia | Evidencia |
|---|---|---|---|
| `tesseract.js@7.0.0` | Producción (CLI y futuro cliente) | Apache-2.0 | `npm view`; `node tools/licencia-check.mjs --package tesseract.js` -> `licencia-check: OK` |
| `tesseract.js-core@7.0.0` (transitiva) | Producción | Apache-2.0 | `npm view tesseract.js-core license` |
| `mrz.traineddata` (DoubangoTelecom/tesseractMRZ, commit `1e7adfecda5f3c9ae1fb12cf6b4b8c3958c63e46`, `tessdata_best/`) | Producción, no versionado; se descarga con `npm run modelos:mrz` | BSD-3-Clause | API de GitHub `license.spdx_id = BSD-3-Clause`; `LICENSE` del commit. SHA-256 `e44f5b7a6bdd3f382ef3bfa84ee0057f5897946a84a094c26910e0a124f3a9bd`, 11 396 382 bytes |
| `OCRB.otf` de `ocr-0.3.1.zip` (Matthew Skala, https://tsukurimashou.org/ocr.php.en) | Solo pruebas y evals, versionado en `evals/sinteticos/fuentes/` | Sin SPDX: aportes de Skala en dominio público; METAFONT de Norbert Schwarz "you may freely use, modify, and/or distribute any of these files ... without limitation" (README de CTAN `ocr-b`, CTAN lo clasifica `other-free`) | zip SHA-256 `58136fccfdee0923cc83a20996a067b98bae054570ee41bf896d7ca8224399bf`; `OCRB.otf` SHA-256 `87c8d5bfd541d28023d2ba3383169c49f565e10d487ebb027ea0d735ef558707` |

Notas:
- La fuente no tiene identificador SPDX de la lista permitida; se asimila a dominio público/permisiva. Requiere decisión humana (principio IV) antes de versionarla.
- El zip de la fuente incluye scripts de autotools bajo GPL con excepción; no se copian.
- Descartados: `fastmrz` y `alsenet mrz-scanner` (AGPL, constitución), `@napi-rs/canvas` (MIT, pero binario nativo con riesgo frente a la directiva de Control de aplicaciones de Windows; el render se hace en el Chromium de Playwright).

## Comprobación de la tarea 1 (2026-10-06): `mrz.traineddata` con Tesseract.js 7.0.0

- El modelo descargado coincide: SHA-256 `e44f5b7a…a9bd`, 11 396 382 bytes. La fuente `OCRB.otf` coincide: `87c8d5bf…8707`.
- `mrz.traineddata` (tessdata_best, coma flotante) **carga y lee** con los cores `tesseract-core-simd-lstm`, `tesseract-core-lstm` y `tesseract-core` de `tesseract.js-core@7.0.0`.
- Con el core `tesseract-core-relaxedsimd-lstm`, que Tesseract.js elige por defecto en Node 24 y en Chromium con relaxed SIMD, aborta: `missing function: _ZN9tesseract13DotProductSSEEPKfS1_i`. El parámetro `dotproduct` no lo evita.
- Decisión: no se aplica la alternativa `eng` (decisión 2 del orquestador). En Node, worker propio `packages/capture/worker/tesseract-node.cjs` que fija `tesseract-core-simd-lstm` (y no tiene `fetch` ni escribe caché). En el navegador, `rutaCore` apunta al archivo `tesseract-core-simd-lstm.wasm.js` (si `corePath` termina en `.js`, Tesseract.js lo usa tal cual) y `rutaWorker` al `worker.min.js` local; sin ambas rutas el lector devuelve `modelo-no-disponible` en vez de usar la CDN.
- Las opciones de LMI-02 existen con esos nombres en 7.0.0 (`langPath`, `gzip`, `cacheMethod`, `OEM.LSTM_ONLY = 1`, `tessedit_char_whitelist`, `tessedit_pageseg_mode`). Se añaden `workerPath`, `corePath`, `workerBlobURL: false` y `errorHandler` (sin él, un fallo al cargar el modelo lanza fuera de toda promesa).
