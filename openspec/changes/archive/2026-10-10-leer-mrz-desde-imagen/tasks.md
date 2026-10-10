# Tasks

Reglas: TDD (la prueba se ve fallar antes de implementar). Datos sintéticos generados dentro de la prueba; ninguna imagen en el repositorio. Pruebas que lanzan procesos, navegador o Tesseract declaran `{ timeout: 60_000 }` o mayor en su `describe`. Comandos `U`, `B`, `M`, `E`, `L`, `P` definidos en `design.md`, sección `## Pruebas`. Requiere que `leer-pdf417-desde-imagen` esté archivado antes de la tarea 4.

## 1. Modelo, dependencia, fuente y renderizador sintético

- [x] 1.1 Ejecutar `node tools/licencia-check.mjs --package tesseract.js@7.0.0` e instalar `tesseract.js@7.0.0` exacto en `packages/capture`; crear `tools/modelos/descargar-mrz.mjs`, el script `modelos:mrz`, la entrada de `models/manifest.json` y `models/tesseract/` en `.gitignore`; versionar `evals/sinteticos/fuentes/OCRB.otf` y `LICENCIA-OCRB.md`; escribir `evals/sinteticos/render-mrz.mjs` (R, F y las 8 distorsiones en Chromium de Playwright). Comprobar primero que `mrz.traineddata` carga en Tesseract.js 7 y que las opciones de LMI-02 existen con ese nombre (riesgos del design; si no, actualizar la spec en el momento). Cubre: LMI-08, LMI-09. Tipos de prueba: unitaria del script con `fetch` inyectado, unitaria de hash de la fuente, seguridad estática (licencias), humo del renderizador (R tiene `cajaMrz` dentro de la imagen). Verificación: `U` y `L`.

## 2. Localización y extracción (puras)

- [x] 2.1 Implementar `packages/capture/src/mrz/localizar.ts` (`localizarFranjaMrz`) y `extraer.ts` (`extraerLineasMrz`). Cubre: LMI-01, LMI-01b, LMI-03. Tipos de prueba: unitaria con literales, propiedad (nunca lanza, round-trip con `arbFixtureMrz`, idempotencia), mutación. Verificación: `U` y `M`.

## 3. Lector con Tesseract.js y eval

- [x] 3.1 Implementar `packages/capture/src/mrz/lector.ts` (`crearLectorMrz`, intentos, `import()` diferido, sin caché ni red) y exportarlo; crear `evals/runners/mrz-imagen.mjs`, el script `eval:mrz-imagen` y sus pruebas; prueba de navegador con `ImageData`. Cubre: LMI-02, LMI-04, LMI-05, LMI-06, LMI-07, LMI-09 (carga diferida). Tipos de prueba: unitaria con OCR inyectado, integración con modelo real, propiedad (nunca lanza), navegador, eval golden sintético, metamórfica, privacidad (disco, consola, red), mutación. Verificación: `U`, `B`, `E`, `P` y `M`. Requiere `revisor-privacidad` y `revisor-licencias`.

## 4. CLI con detección automática

- [x] 4.1 Ampliar `tools/leer-foto.mjs` (orden PDF417 -> MRZ, `tipo`, `--fecha-referencia`, códigos 2 y 3, máscara MRZ, `LECTOR_CEDULA_RUTA_MODELO_MRZ`) y `tools/test/leer-foto.test.mjs` con los 9 escenarios de LPI-06. Cubre: LPI-06 (modificado). Tipos de prueba: integración de CLI con procesos hijo, privacidad estática. Verificación: `U` y `P`; después `npm run check` completo. Requiere `revisor-privacidad`.
