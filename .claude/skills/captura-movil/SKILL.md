---
name: captura-movil
description: Restricciones y recetas de captura con cámara en navegador móvil y Capacitor (resolución, iOS, Workers, calidad, tamaños de WASM). Cárgala al implementar packages/capture o la app móvil.
---

# Captura móvil

## Restricciones verificadas (octubre de 2026)

- iOS Safari no tiene `ImageCapture` (hasta 26.x). La foto se toma con `canvas.drawImage` del `<video>` (máximo la resolución del stream) o con `<input type="file" capture>`.
- iOS Safari no tiene Barcode Detection API. Android Chrome sí, con `pdf417` en `getSupportedFormats()`.
- El PDF417 de la cédula necesita unos 2 píxeles por módulo: el código debe ocupar 1156 px de ancho o más. Pide 1920x1080 como mínimo.
- zxing-cpp tolera mal la rotación (unos 3 grados, issue #145): corrige perspectiva y rotación antes de decodificar.
- Benchmark de referencia (Dynamsoft, vendedor interesado): zxing-cpp 52 % a 128 ms, ML Kit 61 % a 304 ms. En la app nativa, ML Kit es el segundo intento.

## Arquitectura

- Todo el procesamiento de frames en un Web Worker. El hilo principal solo dibuja la guía.
- Calidad a 5-10 fps sobre frames reducidos a 640 px; decodificación sobre el recorte a resolución completa.
- Se captura vídeo, no se acepta una imagen subida (habilita señales de holograma).
- `onnxruntime-web` con WebGPU y fallback WASM. Carga diferida de modelos.

## Presupuesto de tamaño

| Recurso | Tamaño |
|---|---|
| zxing-wasm reader | 1,04 MiB |
| OpenCV.js recortado (core + imgproc) | unos 2 MB |
| DocAligner LC050 / LC100 | 1,7 / 4,9 MB |
| PP-OCRv6 tiny (ppu-paddle-ocr) | unos 6 MB |
| MiniFASNet ONNX | 1,7 MB |

## Score de calidad (0-100)

- Desenfoque: varianza del Laplaciano, umbral normalizado por resolución.
- Reflejo: fracción de píxeles con luminancia de 250 o más dentro del cuadrilátero y componentes saturados de tamaño mínimo.
- Exposición: histograma (fracción de píxeles de 5 o menos y de 250 o más).
- Tamaño: área del cuadrilátero respecto al frame.
- Auto-captura cuando el score supera el umbral durante N frames seguidos.

## Capacitor

`@capgo/camera-preview` 8.11.6 (MPL-2.0) para foco, torch, zoom y captura a fichero. `@capacitor-mlkit/barcode-scanning` 8.2.1 como decodificador nativo. Declarar ML Kit en el aviso de privacidad.
