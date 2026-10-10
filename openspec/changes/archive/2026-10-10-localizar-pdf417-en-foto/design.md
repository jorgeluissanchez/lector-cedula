# Design: localizar-pdf417-en-foto

## Context

Diagnóstico sobre una foto real (no incluida): el recorte de la zona del código a gris con `readBarcodes(..., { binarizer: "LocalAverage", tryHarder, tryRotate, tryDownscale })` lee 531 bytes válidos. Sobre la imagen entera fallan los 5 intentos de LPI-02. Prototipos sintéticos mostraron que un código girado 3-4° sobre textura de madera solo se lee recortado y girado -2° (con `GlobalHistogram` o, a -4°, con ambos binarizadores), y que los 5 intentos base sobre 4096x1842 tardan entre 12 y 23 s en Node.

## Decisiones

1. **Gris primero.** Una sola conversión a luminancia (BT.601, enteros) antes de todo intento: reduce trabajo de los recortes y fija la entrada de zxing.
2. **EXIF en Node.** jpeg-js ignora la orientación; se lee la etiqueta 0x0112 del segmento APP1 Exif (TIFF II/MM) y se aplican las 8 orientaciones. En navegador `createImageBitmap(blob, { imageOrientation: "from-image" })`.
3. **Banda de bordes.** Sobre una versión reducida (lado mayor ≤ 1024) se cuenta por celda de 16x16 la proporción de píxeles con |gradiente horizontal| ≥ 32. Se toma la celda máxima y se agranda la caja con las celdas conectadas de densidad ≥ 50 % del máximo; margen del 10 % por lado (mínimo 2 celdas). Los recortes se hacen a resolución completa.
4. **Rejilla.** Ventanas de 0,7, 0,5 y 0,35 del ancho y alto, paso de media ventana, la última alineada al borde (4 + 9 + 25 = 38 ventanas), binarizador `LocalAverage` (el que funcionó en la foto real).
5. **Aceptación por el parser.** En los intentos de localización solo cuenta un símbolo cuyos bytes den `ok: true` en `parsearPdf417Amarilla(bytes)` (inyectable como `aceptar`), para no devolver un PDF417 ajeno. Los intentos de LPI-02 no cambian.
6. **Orden y presupuesto.** Imagen ≤ 4 MP: LPI-02, banda, rejilla. Imagen > 4 MP: banda, LPI-02, rejilla. El límite (`limiteMs`, 15 000 por defecto, reloj `ahora` inyectable) se comprueba antes de cada intento salvo el primero; agotado, el resultado es `pdf417-no-encontrado`.

## Riesgos

- En móviles lentos 15 s puede no cubrir la rejilla; el orden pone primero lo más probable.
- La imagen sintética no reproduce todos los defectos de una foto real; la foto del usuario solo se usa manualmente con la CLI, fuera del repo.

## Pruebas

Comandos: `U` = `npx vitest run packages/capture/test/pdf417`; `P` = `npm run check:privacidad`; `C` = `npm run leer-foto -- --sin-mascara <tmpdir>/dificil.jpg` (manual, imagen sintética D generada en el scratchpad).

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| LPI-09 | Unitaria con lector inyectado | Vitest | `U` | todas las llamadas reciben R=G=B, A=255 |
| LPI-10 | Unitaria de orientación (8 valores) | Vitest + jpeg-js | `U` | dimensiones y píxel de esquina exactos |
| LPI-10 | Integración imagen D con EXIF 6 | Vitest + zxing-wasm | `U` | `bytes` = `F.bytes` |
| LPI-11 | Unitaria de orden con lector inyectado | Vitest | `U` | orden y nombres de intento exactos |
| LPI-11 | Integración imagen sintética difícil D | Vitest + zxing-wasm | `U` | base falla; completo da `F.bytes` |
| LPI-14 | Unitaria con lector inyectado | Vitest | `U` | nombre de intento y opciones exactos |
| LPI-12 | Unitaria con reloj inyectado | Vitest | `U` | número de llamadas exacto |
| LPI-13 | Privacidad estática | `privacidad-check` | `P` | 0 hallazgos |
| LPI-13 | CLI sobre D (manual) | `leer-foto` | `C` | código 0, campos = `F.esperado` |
