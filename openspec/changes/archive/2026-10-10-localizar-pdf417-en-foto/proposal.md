# Proposal: localizar-pdf417-en-foto

## Why

Con una foto real de celular (cédula amarilla sobre una mesa, 4096x1842, orientación EXIF, código pequeño respecto al fondo) `npm run leer-foto` devuelve `documento-no-encontrado`: los intentos de LPI-02 trabajan sobre la imagen completa y el binarizador se confunde con el fondo. Recortando la zona del código y pasándola a gris, zxing-wasm la lee y el parser la acepta. Falta que el decodificador localice el código por sí mismo.

## What Changes

- El decodificador convierte la imagen a gris antes de cualquier intento y, en Node, aplica la orientación EXIF del JPEG (en navegador ya la aplica `createImageBitmap`).
- Nuevos intentos de localización: recorte de la banda con mayor densidad de bordes verticales (binarizadores `LocalAverage` y `GlobalHistogram`, giros 0 y ±2°) y rejilla de ventanas solapadas a 3 tamaños (`LocalAverage`). Solo se acepta un símbolo cuyos bytes acepte `parsearPdf417Amarilla`.
- En fotos grandes (> 4 MP) la banda va antes de los intentos de LPI-02, que sobre 7,5 MP tardan más que el presupuesto.
- Límite de tiempo total configurable (`limiteMs`, 15 000 ms por defecto).
- Pruebas con una imagen sintética difícil (4096x1842, textura de madera sintética, código girado 4° que ocupa ≈15 % del área), con y sin EXIF rotado. No se usa ni se copia la foto real.

## Capabilities

### New Capabilities
- Ninguna.

### Modified Capabilities
- `lectura-pdf417-imagen`: requisitos añadidos LPI-09 a LPI-13 (el cambio `leer-pdf417-desde-imagen` aún no está archivado, por eso se añaden como ADDED en la misma capacidad).

## Impact

- `packages/capture/src/pdf417/` y sus pruebas. Sin dependencias nuevas.
- Privacidad: todo sigue en memoria; los recortes no se persisten.
