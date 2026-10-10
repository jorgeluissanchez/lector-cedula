# Design: leer-mrz-desde-imagen

## Context

`parsearMrzCedulaDigital(lineas, { fechaReferencia })` (packages/parsers) recibe 3 líneas TD1, corrige confusiones OCR-B solo en zonas numéricas (MZ-07) y valida los 4 dígitos de control. `leer-foto` ya lee PDF417 con zxing-wasm. Falta imagen -> 3 líneas. Restricciones: Python local bloqueado (todo en Node), sin datos reales, sin persistencia, licencias limpias.

## Goals / Non-Goals

- Goals: localizar la franja MRZ en un reverso o foto frontal-plana; OCR con Tesseract.js 7 y `mrz.traineddata`; CLI con detección automática; eval sintética con meta >= 98 % de lecturas con los 4 dígitos válidos.
- Non-Goals: corrección de perspectiva fuerte o detección de bordes de la tarjeta; integración en la PWA y Web Worker de captura (cambio posterior, skill `captura-movil`); anverso; QR (principio V: nunca se decodifica); OCR de campos fuera de la MRZ.

## Decisions

1. **Ubicación `packages/capture/src/mrz/`**, igual que `pdf417/`: el OCR es E/S y WASM; el parser sigue puro (principio VII). `localizarFranjaMrz` y `extraerLineasMrz` son puras y se mutan con Stryker.
2. **Localización en dos candidatos** (LMI-01): proyección horizontal tras Otsu, buscando exactamente 3 bandas regulares en la mitad inferior (la MRZ TD1 son 3 líneas monoespaciadas de alto uniforme, M05); respaldo de recorte inferior del 40 %. Sin modelos de detección: barato, determinista y suficiente para fotos encuadradas. La validación final la dan los dígitos de control, no la heurística.
3. **Tesseract.js 7.0.0 + `mrz.traineddata` de Doubango** (BSD-3-Clause, LSTM entrenado para OCR-B). Lista blanca `A-Z0-9<` y PSM 6 (bloque uniforme). `cacheMethod: "none"`, `gzip: false`, `langPath` local: sin red ni IndexedDB ni escritura en disco (principio III; `privacidad-check` marca `indexedDB` en código de producto). Los nombres exactos de las opciones se comprueban en la tarea 1 contra la API de 7.0.0; si difieren, se ajusta la spec LMI-02 en el momento (lección de "Errores pasados").
4. **Elección del intento** (LMI-04): se para en el primero con 4 dígitos válidos; si no, el que más tenga. El lector nunca modifica caracteres: las correcciones OCR-B las hace solo el parser y quedan en `correcciones`. Un número solo se acepta como válido si los checksums lo respaldan (principio V).
5. **Modelo reproducible** (LMI-08): descarga desde `raw.githubusercontent.com` fijada al commit `1e7adfecda5f3c9ae1fb12cf6b4b8c3958c63e46` (último del repo, 2020-01-05), SHA-256 y tamaño verificados (medidos el 2026-10-06 en el scratchpad; el SHA-1 de blob de GitHub es `60a26a1171336fae2b5ede0949a9c556d131ed69`). No se versiona el binario de 11 MB; se declara en `models/manifest.json` y `.gitignore` añade `models/tesseract/`.
6. **Fuente OCR-B de prueba**: `OCRB.otf` del paquete `ocr-0.3.1` de Matthew Skala (aportes propios en dominio público; base METAFONT de Norbert Schwarz: "you may freely use, modify, and/or distribute ... without limitation"; versión Wagner en CTAN marcada `other-free`). Se versiona (18 324 bytes) en `evals/sinteticos/fuentes/` con su nota de licencia para que las pruebas no dependan de la red; solo pruebas y evals. Registro en `docs/decisiones/2026-10-06-licencias-mrz-ocr.md`. El zip trae archivos de autotools (GPL con excepción) que no se copian.
7. **Render sintético en Chromium vía Playwright desde Node**: un helper `evals/sinteticos/render-mrz.mjs` abre una página `about:blank`, carga la fuente con `FontFace` desde bytes, dibuja R(L) con canvas 2D, aplica la distorsión (`rotate`, `filter: blur()`/`brightness()`, `toBlob('image/jpeg', 0.7)`, escalado, ruido con PRNG de `@lector-cedula/fixtures`) y devuelve PNG o JPEG como `Uint8Array` y `cajaMrz`. Evita `@napi-rs/canvas` (binario nativo que la directiva de Control de aplicaciones de Windows podría bloquear) y Python. Un navegador por archivo de prueba, reutilizado.
8. **CLI** (LPI-06 modificado): PDF417 primero (más barato y ya probado); MRZ solo si no hay PDF417. Variable `LECTOR_CEDULA_RUTA_MODELO_MRZ` para pruebas. Fecha de referencia por defecto con `Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" })`. Máscara MRZ amplía la de PDF417 y oculta `lineasCorregidas` y `correcciones`, que contienen el NUIP.
9. **Eval** `npm run eval:mrz-imagen` (`evals/runners/mrz-imagen.mjs`): separado de `eval:quick` por coste (unas 600 lecturas OCR); reporte solo con contadores. Lector inyectable para probar el propio corredor (antipatrón "código de harness sin mutar").

## Risks / Trade-offs

- [`mrz.traineddata` es de 2020, entrenado para Tesseract 4 LSTM] -> la tarea 1 carga el modelo con Tesseract.js 7 antes de nada; si falla, pregunta abierta 2 (alternativas: `eng` de tessdata_fast Apache-2.0 con lista blanca, o entrenar uno propio en Docker).
- [La OCR-B de Skala puede diferir de la OCR-B impresa por la Registraduría] -> la meta del 98 % es solo sintética; la exactitud real se mide con el set de campo cifrado, fuera del repo. Hipótesis M05.
- [Coste: el eval completo puede tardar minutos] -> fuera de `npm run check`; se corre en la verificación del cambio y en `eval-runner` de fin de fase.
- [Tamaño de Tesseract.js core WASM para móvil] -> no aplica aún (solo Node/CLI); se mide al integrar en la PWA.

## Pruebas

Comandos: `U` = `npx vitest run packages/capture/test/mrz tools/test/leer-foto.test.mjs tools/test/modelos-mrz.test.mjs evals/test/mrz-imagen.test.mjs`; `B` = `npm run test:browser -- packages/capture/test-browser/mrz`; `M` = `npm run test:mutacion` (mutate `packages/capture/src/mrz/**`, `evals/runners/mrz-imagen.mjs`, `tools/modelos/descargar-mrz.mjs`); `E` = `npm run eval:mrz-imagen`; `L` = `npm run check:licencias`; `P` = `npm run check:privacidad`. Las pruebas con OCR real requieren `npm run modelos:mrz` previo y declaran `{ timeout: 60_000 }` (o mayor) en su `describe`.

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| LMI-01 | Unitaria sobre R renderizado y lienzos literales | Vitest + Playwright Chromium | `U` | 3/3 escenarios verdes, `toStrictEqual` en el literal |
| LMI-01 | Propiedad "nunca lanza" y forma | fast-check | `U` | 500 + 500 runs, 0 excepciones |
| LMI-01b | Unitaria con lienzos de rectángulos literales | Vitest | `U` | 2/2 escenarios, caja exacta |
| LMI-02 | Unitaria con `crearWorker` inyectado | Vitest | `U` | opciones exactas; `terminate` 1 vez |
| LMI-02 | Integración con Tesseract.js real (modelo ausente, espía de `fetch`) | Vitest | `U` | 0 URLs http(s) |
| LMI-03 | Unitaria con literales derivados de P | Vitest | `U` | 4/4 escenarios |
| LMI-03 | Propiedad round-trip (`arbFixtureMrz` -> texto con espacios, minúsculas y ruido -> líneas) | fast-check | `U` | numRuns >= 1000, 0 fallos; idempotencia sobre `lineas.join("\n")` |
| LMI-04 | Unitaria con OCR inyectado | Vitest | `U` | 4/4 escenarios, número de llamadas exacto |
| LMI-05 | Unitaria de errores con modelo real | Vitest | `U` | 4 literales |
| LMI-05 | Propiedad "nunca lanza" | fast-check | `U` | 300 + 300 runs, 0 excepciones |
| LMI-05 | Unitaria en navegador (ImageData) | Vitest browser, Chromium | `B` | lectura correcta |
| LMI-06 | Eval golden sintético | corredor `mrz-imagen` | `E` | limpias >= 196/200; 0 falsas; >= 45/50 por distorsión |
| LMI-06 | Metamórfica (8 distorsiones: la salida no cambia o falla, nunca otros datos) | corredor `mrz-imagen` | `E` | 0 lecturas falsas |
| LMI-06 | Unitaria del corredor con lector inyectado | Vitest | `U` | código 1 en ambos casos; reporte sin `<<` ni NUIP |
| LMI-06 | Integración foto F | Vitest + modelo real | `U` | lectura correcta |
| LMI-07 | Integración (listados de disco, espías de consola y `fetch`) | Vitest | `U` | listados idénticos; 0 llamadas |
| LMI-07 | Privacidad estática | `privacidad-check` | `P` | 0 hallazgos |
| LMI-08 | Unitaria del script con `fetch` inyectado | Vitest | `U` | 4/4 escenarios |
| LMI-09 | Licencias | `licencia-check` | `L` | 0 infracciones |
| LMI-09 | Unitaria de hash de fuente y de carga diferida (`vi.mock`) | Vitest | `U` | hash literal; contador 0 |
| LPI-06 | Integración de CLI (proceso hijo, `{ timeout: 60_000 }`) | Vitest + `child_process` | `U` | códigos 0/1/2/3/64 y stdout exactos en los 9 escenarios |
| LMI-01, LMI-01b, LMI-03, LMI-04, LMI-08 | Mutación | Stryker | `M` | mutation score >= 85 % (break 80) en los archivos de `mutate` |

Datos: solo `@lector-cedula/fixtures` y la fuente OCR-B; las imágenes se generan en memoria durante la prueba y no se escriben al repositorio (las de la CLI van a `os.tmpdir()` y se borran). Ninguna foto real participa en pruebas automáticas.

## Decisiones del orquestador (pendientes de ratificación humana)
1. Se archiva leer-pdf417-desde-imagen antes que este cambio (tras su verificación).
2. Si mrz.traineddata no carga en Tesseract.js 7, alternativa `eng` de tessdata_fast (Apache-2.0), descargada con hash; registrar la decisión y re-medir la meta.
3. Se aceptan los umbrales provisionales de distorsión (>= 45/50).
4. La OCR-B de Skala se trata como dominio público/permisiva y se versiona en evals/sinteticos/fuentes/ solo para pruebas, con su aviso de licencia.
5. El eval completo corre en la verificación del cambio y al cerrar fase, no en `npm run check`.
6. Máscara suficiente.
7. Modelo descargado con hash y caché en CI.
