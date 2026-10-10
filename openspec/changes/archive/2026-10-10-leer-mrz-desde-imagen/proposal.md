# Proposal: leer-mrz-desde-imagen

## Why

`npm run leer-foto` ya lee la cédula amarilla (PDF417, cambio `leer-pdf417-desde-imagen`). El usuario quiere leer también la cédula **digital** desde una foto del reverso. `parsearMrzCedulaDigital` ya existe y recibe las 3 líneas TD1; falta el paso imagen -> 3 líneas: localizar la franja MRZ y hacer OCR. La fuente legible por máquina de la digital es la MRZ (principio V); el QR no se toca.

## What Changes

- Nuevo módulo `packages/capture/src/mrz/`:
  - `localizarFranjaMrz(pixeles)`: heurística pura sobre píxeles (binarización Otsu + proyección horizontal de tinta, busca 3 bandas de texto de altura y separación regulares en la mitad inferior) con respaldo de recorte inferior fijo.
  - `crearLectorMrz({ rutaModelo })`: worker de Tesseract.js 7.0.0 con `mrz.traineddata` (Doubango tesseractMRZ, BSD-3-Clause), lista blanca `A-Z0-9<`, sin caché en disco ni en IndexedDB, sin red. `leer(imagen, { fechaReferencia })` encadena localizar -> OCR -> normalizar a 3 líneas de 30 -> `parsearMrzCedulaDigital`.
- Modelo reproducible: `npm run modelos:mrz` descarga `mrz.traineddata` desde un commit fijo de GitHub, verifica SHA-256 y lo deja en `models/tesseract/` (ignorado por git); se declara en `models/manifest.json`.
- CLI `leer-foto`: detección automática; prueba PDF417 y, si no hay, MRZ. La salida gana el campo `tipo` (`"pdf417"` | `"mrz"`) y la opción `--fecha-referencia AAAA-MM-DD`. Modifica LPI-06.
- Pruebas solo sintéticas: las 3 líneas de `generarMrzTd1` de `@lector-cedula/fixtures` renderizadas en OCR-B (fuente de Matthew Skala, dominio público + permiso libre de N. Schwarz) sobre un reverso ficticio, con distorsiones, en Chromium de Playwright lanzado desde Node (sin Python, sin dependencias nativas nuevas).
- Eval nueva `npm run eval:mrz-imagen`: % de lecturas con los 4 dígitos de control válidos y líneas iguales a la verdad; meta >= 98 % en sintéticas limpias.
- Hipótesis nueva M05 (posición y tipografía de la franja MRZ) en `docs/decisiones/hipotesis-formato.md`.
- Dependencia nueva en `packages/capture`, versión exacta: `tesseract.js@7.0.0` (Apache-2.0; `node tools/licencia-check.mjs --package tesseract.js` -> `licencia-check: OK` el 2026-10-06; trae `tesseract.js-core@7.0.0`, Apache-2.0).

## Capabilities

### New Capabilities
- `lectura-mrz-imagen`: localizar y leer la MRZ TD1 de la cédula digital desde una imagen.

### Modified Capabilities
- `lectura-pdf417-imagen`: LPI-06 (la CLI detecta el tipo de documento y añade `tipo`).

## Impact

- `packages/capture/src/mrz/`, `tools/leer-foto.mjs`, `tools/modelos/descargar-mrz.mjs`, `evals/runners/mrz-imagen.mjs`, `evals/sinteticos/fuentes/` (fuente OCR-B de prueba), `models/manifest.json`, `.gitignore`, `package.json` raíz.
- Tamaño: Tesseract.js core WASM (varios MB) + `mrz.traineddata` de 11 396 382 bytes. Solo CLI y Node en este cambio; la integración en la PWA es un cambio posterior (skill `captura-movil`).
- Depende de que `leer-pdf417-desde-imagen` esté archivado (LPI-06 debe existir en `openspec/specs/`).
- Revisores: `revisor-privacidad` (la CLI toca fotos reales) y `revisor-licencias` (Tesseract.js, traineddata, fuente).
