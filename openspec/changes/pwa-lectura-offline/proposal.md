# pwa-lectura-offline

## Why

`captura-calidad-pwa` entrega cámara, calidad y auto-captura, pero termina en `listo` sin leer nada (CAL-15: ningún decodificador). Los lectores ya existen y están probados en Node (`packages/capture`: PDF417 con zxing-wasm, MRZ con tesseract.js + `mrz.traineddata`, plan de giros LMI-12/LMI-14 y presupuesto LMI-13; `packages/parsers` con DIVIPOL) y la CLI `tools/leer-foto.mjs` ya hace la detección automática amarilla/digital y la máscara de 2 dígitos. Falta conectarlos a la PWA.

Requisito duro del usuario: la PWA MUST funcionar 100 % sin red y leer igual de bien sin red que con red. Todo corre en el dispositivo; el servidor (`motor-real-servidor`) es opcional y nunca necesario. Hoy tesseract.js, por defecto, descarga worker, core y modelo de un CDN, y `captura-calidad-pwa` (CAM-01, escenario "Precarga sin el Worker de calidad"; CAM-12, "Worker diferido") deja el Worker de calidad fuera de la precaché: ambas cosas rompen el modo sin conexión.

## What Changes

- Lector de documento en un Worker dedicado que implementa `LectorCodigos` (solo `"pdf417"`) y lee la MRZ, con la misma detección automática que `tools/leer-foto.mjs`: primero PDF417; si el error es `pdf417-no-encontrado`, MRZ TD1 con el plan de giros. Nunca se decodifica el QR de la digital.
- Parseo con `parsearPdf417Amarilla` (con DIVIPOL) y `parsearMrzCedulaDigital`; resultado enmascarado como la CLI (NUIP y serial: 2 últimos caracteres; nombres: inicial y asteriscos; lugar de nacimiento sin máscara).
- Service worker con precaché completa en la primera visita (shell, Worker de calidad, Worker lector, `zxing_reader.wasm`, worker y core de tesseract, `mrz.traineddata`, tabla DIVIPOL) verificada con SHA-256 contra un manifiesto generado en la compilación; indicador "Lista para usar sin conexión".
- Cero peticiones fuera del origen; cero peticiones de red durante una lectura.
- Ningún resultado ni imagen persiste: sin `localStorage`, `sessionStorage`, IndexedDB, cookies ni respuestas dinámicas en `CacheStorage`; bytes de la captura a cero tras leer.
- **Supersede** (cuando `captura-calidad-pwa` se archive, este cambio pasa a MODIFIED): el escenario "Precarga sin el Worker de calidad" de CAM-01 y el escenario "Worker diferido" de CAM-12. El Worker de calidad se precachea en `install` del service worker (no se ejecuta hasta "Iniciar cámara"). La regex de "Caché limitada a recursos estáticos" de CAM-01 se mantiene: todos los recursos nuevos se emiten bajo `assets/`.

## Capabilities

### New Capabilities

- `lectura-pwa-offline`: lectura en el dispositivo de la captura aceptada, resultado enmascarado y funcionamiento completo sin conexión (requisitos OFF-01 a OFF-18).

### Modified Capabilities

- Ninguna archivada. `captura-camara` (CAM-01, CAM-12) de `captura-calidad-pwa`, en curso, queda afectada; ver tarea 8.2.

## Meta comercial (skill `benchmark-comercial`)

| Aspecto | Referencia | Meta de este cambio | Brecha que queda |
|---|---|---|---|
| 100 % on-device, sin red | Microblink BlinkID, Scanbot (SDK offline) | Lectura completa sin conexión tras la primera visita (OFF-01, OFF-12) | App nativa (fase 5) |
| PDF417 de la amarilla | Microblink, Regula | p95 <= 1,5 s en Pixel 7 emulado (OFF-15) | Medición en dispositivos reales |
| MRZ de la digital | Regula, Didit | p95 <= 5 s; girada p95 <= 10 s (OFF-15) | Un detector de orientación más rápido que OCR |
| Privacidad | Truora, Didit (procesan en servidor) | Ningún dato sale ni persiste (OFF-11, OFF-04) | |

## Impact

- `packages/capture`: nuevo `src/lectura/` (orquestación, máscara, Worker lector y su protocolo), sin cambiar los lectores existentes.
- `apps/pwa`: pantallas `leyendo`, `resultado` y `error-lectura`; `sw.ts` y `plugin-pwa.ts` (manifiesto de precaché con SHA-256).
- `e2e/`: vídeos `.y4m` sintéticos con cédula amarilla, digital y digital girada; nuevos specs en `e2e/lectura/`.
- `tools/leer-foto.mjs`: pasa a importar la máscara compartida (sin cambio de salida).
- Dependencias: ninguna nueva; `tesseract.js@7.0.0`, `tesseract.js-core` y `zxing-wasm@3.1.5` ya instaladas; `mrz.traineddata` ya en `models/tesseract` (revisión de licencia de su redistribución en la PWA: tarea 9.2).
