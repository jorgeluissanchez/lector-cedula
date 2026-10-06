# Tasks

Reglas: TDD (la prueba se ve fallar antes de implementar). Datos sintéticos generados dentro de la prueba; ninguna imagen en el repositorio. Pruebas que lanzan procesos o WASM pesado declaran `{ timeout: 60_000 }` en su `describe`. Comandos `U`, `B`, `M`, `L`, `P` definidos en `design.md`, sección `## Pruebas`.

## 1. Dependencia y generador de imágenes sintéticas

- [ ] 1.1 Ejecutar `node tools/licencia-check.mjs --package zxing-wasm@3.1.5`, instalar `zxing-wasm@3.1.5` exacto en `packages/capture` y escribir el helper de prueba `packages/capture/test/pdf417/sintetica.ts` que genera la imagen S (writer de zxing-wasm desde `generarPdf417`). Comprobar primero que el writer acepta `Uint8Array` binario (riesgo del design). Cubre: LPI-08 (licencia). Tipos de prueba: seguridad estática (licencias), unitaria de humo del helper (S decodifica con `readBarcodes` directo). Verificación: `L` y `U`.

## 2. Decodificador en Node

- [ ] 2.1 Implementar `packages/capture/src/pdf417/decodificar.ts` (`decodificarPdf417Imagen`, reintentos, inyección de `readBarcodes`, import dinámico) y exportarlo desde `src/index.ts`. Cubre: LPI-01, LPI-02, LPI-03 (Node), LPI-05, LPI-07 (consola), LPI-08 (carga diferida). Tipos de prueba: unitaria, propiedad (round-trip y nunca lanza), integración con el parser, mutación. Verificación: `U` y `M`.

## 3. Navegador y metamórficas

- [ ] 3.1 Pruebas en `packages/capture/test-browser/pdf417/` para `ImageData` y las 8 distorsiones de LPI-04 con canvas 2D; ajustar el decodificador si alguna entrada de navegador falla. Cubre: LPI-03 (ImageData), LPI-04. Tipos de prueba: unitaria en navegador, metamórfica. Verificación: `B`.

## 4. CLI leer-foto

- [ ] 4.1 Crear `tools/leer-foto.mjs`, el script `leer-foto` en `package.json` raíz y `tools/test/leer-foto.test.mjs` (procesos hijo con imágenes en `os.tmpdir()` y `evals/real/tmp-prueba-<uuid>.png`, borradas al final). Cubre: LPI-06, LPI-07. Tipos de prueba: integración de CLI, privacidad estática. Verificación: `U` y `P`; después `npm run check` completo. Requiere `revisor-privacidad`.
