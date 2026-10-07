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
