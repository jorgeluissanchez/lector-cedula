# Proposal: leer-pdf417-desde-imagen

## Why

El usuario quiere probar ya el lector con fotos de cédulas amarillas. Hoy `parsearPdf417Amarilla` solo acepta bytes crudos; falta el paso imagen -> bytes del PDF417. Este cambio lo añade con zxing-wasm 3.1.5 (MIT, `node tools/licencia-check.mjs --package zxing-wasm` -> `licencia-check: OK` el 2026-10-06) y una CLI local para fotos reales que nunca entran al repositorio ni se escriben a disco.

## What Changes

- Nuevo módulo `packages/capture/src/pdf417/` con `decodificarPdf417Imagen(imagen)`: acepta bytes PNG/JPEG (`Uint8Array`) o `ImageData`, llama a `readBarcodes` con `formats: ["PDF417"]`, `tryHarder`, `tryRotate` y reintentos con escala 0,5 y 0,75, y devuelve los **bytes crudos** del código, nunca el texto.
- Nueva CLI `npm run leer-foto -- <ruta>` (`tools/leer-foto.mjs`) que encadena el decodificador con `parsearPdf417Amarilla(bytes, { divipol: buscarDivipol })` e imprime el resultado normalizado en stdout. No escribe nada a disco ni a logs y rechaza rutas dentro del repositorio salvo `evals/real/` (ignorado por git).
- Pruebas solo con imágenes sintéticas: PDF417 generado con el writer de zxing-wasm desde `generarPdf417` de `@lector-cedula/fixtures`, más pruebas metamórficas (rotación ±3°, blur, escala, JPEG) en navegador real.
- Dependencia nueva: `zxing-wasm@3.1.5` en `packages/capture`.

## Capabilities

### New Capabilities
- `lectura-pdf417-imagen`: decodificar el PDF417 de la cédula amarilla desde una imagen y leerlo desde la línea de comandos.

### Modified Capabilities
- Ninguna. `parsearPdf417Amarilla` y `buscarDivipol` se consumen sin cambios.

## Impact

- `packages/capture` (módulo nuevo y dependencia), `tools/leer-foto.mjs`, script `leer-foto` en `package.json` raíz.
- Tamaño: el reader WASM de zxing-wasm pesa unos 1,04 MiB (skill `captura-movil`); se carga de forma diferida, solo al decodificar.
- Privacidad (principio III): la CLI es la primera ruta que toca fotos reales; requiere `revisor-privacidad`. Licencias: `revisor-licencias`.
