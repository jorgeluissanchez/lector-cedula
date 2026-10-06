# Proposal

## Why

La Fase 2 de `PLAN.md` exige igualar la captura de Didit, Scanbot y Microblink en el navegador: score de calidad 0-100 on-device, rechazo de frames malos antes de decodificar, auto-captura y feedback en vivo (fila 5 de la tabla de la sección 0). Hoy el repositorio no tiene ni PWA ni `packages/capture`: sin una captura con calidad medida, los cambios posteriores (detección de documento, lectura de PDF417, OCR) recibirían frames borrosos o con reflejo y fallarían por causas que no son suyas.

## What Changes

- Esqueleto de la PWA en `apps/pwa` (Vite + TypeScript estricto + Preact, sin plugin de PWA): manifiesto, service worker que solo guarda el shell de la aplicación y pantallas `inicio`, `activo`, `pausado`, `listo` y `error`.
- Acceso a la cámara trasera: `getUserMedia` con 1920x1080 ideal y aviso si la pista entrega menos, comprobación de contexto seguro, `<video>` en línea (`playsinline`, `muted`), enfoque continuo cuando el dispositivo lo ofrece, toma del frame con `canvas.drawImage` (nunca `ImageCapture`, que no existe en iOS) y sin aceptar imágenes subidas.
- Guía de encuadre con la proporción ID-1 (hipótesis C01), alineada con el lado largo del frame, que hace de cuadrilátero de análisis mientras no exista un detector.
- Paquete nuevo `packages/capture` (`@lector-cedula/capture`) con el score de calidad 0-100 calculado en un Web Worker sobre frames reducidos a 640 px: nitidez (varianza del Laplaciano), reflejo (fracción de luminancia >= 250 y componente saturado mayor dentro del cuadrilátero), exposición por histograma y tamaño relativo. Score = mínimo de los subscores; motivo = la métrica limitante.
- Auto-captura tras N frames consecutivos sobre el umbral, con revalidación del frame a resolución completa.
- Feedback en tiempo real accesible ("Acerca la cédula", "Hay reflejo, inclina la cédula", "Desenfocado, mantén la cámara quieta", "Listo", y dos de exposición), con histéresis para no saturar lectores de pantalla.
- Umbrales calibrables, validados y documentados en `docs/decisiones/2026-10-06-umbrales-calidad-captura.md` (valores provisionales hasta calibrar con DLC-2021 y el set de campo).
- Interfaces `DetectorDocumento` y `LectorCodigos` para los cambios posteriores. **Fuera de este cambio**: la detección de documento con DocAligner, jscanify u OpenCV.js, la corrección de perspectiva, la lectura de códigos, el clasificador de versión y la linterna.
- Privacidad (principio III): ningún frame se persiste ni sale del dispositivo; los buffers se transfieren al Worker sin copia y la captura se borra al repetir, cancelar o salir.
- Infraestructura de pruebas de la fila "Captura web": Vitest browser mode (`@vitest/browser@3.2.7`), vídeos `.y4m` sintéticos generados con ffmpeg en Docker, proyectos de Playwright por vídeo y dispositivo, axe, regresión visual en `mcr.microsoft.com/playwright:v1.63.0-noble`, Lighthouse CI y medición del tiempo hasta "listo".

## Capabilities

### New Capabilities
- `captura-camara`: PWA instalable, acceso seguro a la cámara trasera, resolución mínima, errores de cámara, toma del frame desde el vídeo en vivo, guía de encuadre, ciclo de vida de la cámara, accesibilidad y garantías de privacidad de la captura.
- `calidad-captura`: frame de análisis de 640 px, métricas de nitidez, reflejo, exposición y tamaño dentro del cuadrilátero, score 0-100 y motivo, umbrales calibrables, procesamiento en Worker, cadencia, auto-captura, feedback, tiempo hasta "listo" e interfaces de detección y lectura de códigos.

### Modified Capabilities
<!-- Ninguna: las capacidades existentes (formato-nuip, evals-por-campo) no cambian. -->

## Meta comercial (skill `benchmark-comercial`)

| Aspecto | Referencia | Meta de este cambio | Brecha que queda |
|---|---|---|---|
| Score 0-100 configurable | Didit | Score 0-100 con umbrales configurables y validados (CAL-07, CAL-08) | Calibración con datos (DLC-2021, set de campo) |
| Glare y blur en vivo | Scanbot, Microblink | Reflejo y desenfoque por frame con feedback (CAL-03, CAL-04, CAL-12) | Glare por zona del documento (requiere detector y plantilla) |
| Auto-captura | Didit, Microblink | N frames consecutivos + revalidación (CAL-11) | |
| Rechazo de esquinas fuera del frame, perspectiva, recorte | Didit, Scanbot | Solo interfaz (CAL-14) | Cambio posterior de detección |
| Velocidad | Didit (veredicto < 2 s) | p95 <= 3 s y mediana <= 2 s hasta "listo" sobre vídeo sintético (CAL-13) | Medición en dispositivos reales (set de campo) |
| 100 % on-device | Microblink, Scanbot | Ningún frame sale del dispositivo (CAM-11) | |

## Impact

- Código nuevo: `packages/capture/`, `apps/pwa/`, `e2e/captura/`, `e2e/videos/` (script de generación; los `.y4m` no se versionan).
- Configuración: `tsconfig.json` (referencias), `vitest.config.ts` (exclusión de cobertura de código solo-navegador), `vitest.browser.config.ts` nuevo, `playwright.config.ts` (servidor web y proyectos por vídeo), `stryker.config.mjs` (núcleo de calidad), `.gitignore` (`*.y4m`, reportes).
- Dependencias nuevas, todas comprobadas con `node tools/licencia-check.mjs --package` el 2026-10-06: `preact@10.29.8` (MIT, producción), `vite@7.3.7` (MIT, ya presente como dependencia transitiva), `@vitest/browser@3.2.7` (MIT, desarrollo), `@lhci/cli@0.15.1` (Apache-2.0, desarrollo). Herramientas en Docker, no distribuidas: `jrottenberg/ffmpeg:8-alpine` y `mcr.microsoft.com/playwright:v1.63.0-noble`.
- Documentación: `docs/decisiones/2026-10-06-umbrales-calidad-captura.md` (nuevo) e hipótesis C01 y C02 en `docs/decisiones/hipotesis-formato.md`.
- Revisores: `revisor-privacidad` (toca captura) y `revisor-licencias` (dependencias nuevas).
- Divergencia con `PLAN.md` (sección 2.1 dice "Vite + React"): se elige Preact; ver design.md, decisión 1, y la pregunta abierta 1.
