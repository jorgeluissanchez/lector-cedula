# Stack open source verificado (2026-10-06)

## Runtime
- onnxruntime-web 1.30.0 (MIT): WASM SIMD/threads, WebGPU, WebNN, fallback automático.
- @techstark/opencv-js 5.0.0 (Apache-2.0, WASM ~8-10 MB; cargar diferido o build recortado).
- iOS Safari: sin ImageCapture API; usar canvas.drawImage del stream (hasta 4K) o input capture.
- Capacitor 8 + @capgo/camera-preview 8.11.6 (MPL-2.0): foco táctil, torch, zoom, exposición, captura a fichero.

## Códigos
- zxing-cpp v3.1.1 (Apache-2.0, 2026-07): referencia PDF417; Python `zxing-cpp` 3.1.1 para backend.
- zxing-wasm 3.1.5 (MIT): reader ~1.04 MiB, full ~1.46 MiB; PDF417 + MicroPDF417.
- barcode-detector 3.2.2 (MIT): nativo si existe, si no zxing-wasm.
- @capacitor-mlkit/barcode-scanning 8.2.1 (Apache-2.0): ML Kit on-device, más tolerante con PDF417 denso.
- Reglas: ≥2-3 px/módulo, capturar 1920-4K, recortar región, tryHarder+tryRotate+downscale 0.5/0.75.

## MRZ
- cheminfo/mrz 5.0.2 (MIT): parser TD1/TD2/TD3 con checksums. Imprescindible.
- alsenet-labs/mrz-scanner v2 (AGPL-3.0, ojo comercial): CNN ONNX ~300 KB OCR-B, ~7 fps cliente.
- DocsaidLab/MRZScanner 1.0.7 (Apache-2.0): MobileNet-V4+BiFPN, 512×512, backend ONNX CPU; ONNX exportable a web.
- tesseractMRZ mrz.traineddata (BSD-3, archivado 2020): útil con Tesseract.js.
- Evitar PassportEye/fastmrz(AGPL) en producción.

## OCR
- PaddleOCR 3.7.0 (Apache-2.0): PP-OCRv5_mobile_rec 16 MB, 21,2 ms/crop CPU; PP-OCRv6 (jun-2026) tiny 1,5M params, small, medium. ONNX: huggingface.co/monkt/paddleocr-onnx.
- ppu-paddle-ocr 6.6.0 (MIT, TS): navegador/Worker/RN; v6 tiny ~6 MB, small ~30 MB, medium ~139 MB; WebGPU 2-5×; M1 138 ms/imagen.
- RapidOCR 3.9.2 (Apache-2.0): backend CPU más mantenido (ONNX/OpenVINO).
- docTR 1.1.0 / OnnxTR 0.9.0 (Apache-2.0): alternativa.
- Tesseract.js 7.0.0: solo MRZ o texto limpio.
- EasyOCR: en mantenimiento mínimo, no usar.

## Detección y recorte
- DocsaidLab/DocAligner 1.1.1 (Apache-2.0): 4 esquinas por heatmap, robusto a fondo/oclusión; ONNX ~5-20 MB. Mejor OSS para ID.
- jscanify 1.4.3 (MIT): contornos, falla con bajo contraste.
- YOLO Ultralytics AGPL-3.0 → usar YOLOX/RT-DETR/PP-PicoDet (Apache-2.0) si se entrena detector.
- @capacitor-mlkit/document-scanner 8.2.1: UI de Google, menos control.

## Calidad
- Blur: varianza Laplaciano (OpenCV.js o canvas puro). Glare: % píxeles >245 + blobs saturados dentro del cuadrilátero. Exposición: histograma. Módulo propio ~200 líneas, Worker 5-10 fps sobre 640 px.

## Antifraude
- Face match: facenet-pytorch (MIT, LFW 99,65 %) o ArcFace licencia limpia → ONNX; YuNet (OpenCV Zoo, Apache-2.0) o MediaPipe para detección; @vladmandic/human 3.3.6 (MIT) en navegador. NO InsightFace buffalo_l/antelopev2 sin licencia comercial.
- Liveness pasivo: Silent-Face-Anti-Spoofing MiniFASNet (Apache-2.0, ~4 MB, 19-90 ms móvil) → ONNX.
- Document liveness: no hay OSS maduro; entrenar MobileNetV3/EfficientNet-B0 → ONNX (~5-10 MB) con DLC-2021 + MIDV-Holo + capturas propias; señales: moiré/FFT, holograma dinámico entre frames, B/N.
- Forgery: TruFor/CAT-Net (licencias no comerciales/ausentes) solo backend revisión manual; ELA señal débil. Papers 2026: FNR ~50 % en IDs forjados → confiar en checksums + consistencia VIZ↔MRZ↔PDF417 + face match.

## Pipelines completos
- Idswyft Community (MIT, ~37★, 1.400+ commits, 2026-10): OCR PaddleOCR, PDF417+MRZ, face match, liveness, Docker Compose; claim 15 req/s p95 <400 ms en 2 vCPU/4 GB. Esqueleto útil.
- Ballerine (~2.4k★, licencia custom): orquestación/reglas, sin motor propio.
- DocsaidLab suite (Apache-2.0): DocAligner, MRZScanner, DocClassifier.
- Qwen3-VL 2B/4B (Apache-2.0): fallback KIE asíncrono, no tiempo real.

## Datasets
- MIDV-500/2019/2020 (atribución; ESP incluido), MIDV-Holo (CC BY-SA 2.5, hologramas vs ataques), DLC-2021 (CC BY-SA 2.5, recaptura/fotocopia/glare, ~34 GB), SIDTD (CC BY 4.0, forgery), DocXPand-25k (CC BY-NC-SA, generador MIT → plantillas propias de cédula), FantasyID (Idiap).
- No hay dataset público de PDF417 real: generar sintético con writer de zxing-wasm full.

## Adendo (segunda pasada del mismo agente)
- Benchmark Dynamsoft jul-2026 (vendedor interesado, 88 PDF417 variados): zxing-cpp 52 % a 128 ms/img, ML Kit 61 % a 304 ms, Dynamsoft 95 %. zxing-cpp issue #145 (detector PDF417 line-scanning, tolera ~3° rotación) abierto desde 2020. Implicación: corregir perspectiva/rotación ANTES de decodificar y reintentar en servidor a resolución completa.
- ML Kit: Android bundled +2,4 MB; Google recomienda PDF417 ≥1156 px ancho; telemetría a Google (declarar en privacidad).
- alsenet mrz-scanner: paquetes npm NO publicados (404); habría que compilar desde repo (AGPL).
- web-mrz-reader 2.0.3 (ISC, 37,6 MB unpacked, autor único, sin métricas).
- tesseractMRZ incluye dataset >7.000 .tif de MRZ con GT (BSD-3) útil para evaluar OCR-B.
- SIDTD CC-BY-4.0 = comercial OK; MIDV-2020 Zenodo CC-BY-SA; DocXPand NC.
- Idswyft: edición enterprise de pago; joven, de empresa.

## Correcciones de la tercera pasada (2026-10-06)
- CAT-Net: código Apache-2.0, pesos CC BY 4.0 -> PERMITIDO comercialmente (antes figuraba como sin licencia).
- Surya: código Apache-2.0 pero pesos RAIL-M (límite de 5 M USD de ingresos) -> no usar.
- Qwen2.5-VL-3B: no comercial. Qwen3-VL sí es Apache-2.0 (GGUF 2B Q4_K_M 1,1 GB, 5-20 s/doc en CPU estimado).
- pyiqa/IQA-PyTorch: PolyForm Noncommercial. BRISQUE solo en servidor vía `brisque` PyPI (Apache-2.0). No hay BRISQUE/NIQE en JS.
- DocAligner: pesos con licencia no confirmada (issue #13 abierto 2026-10-05). Tamaños: LC050 1,7 MB Jaccard 0,9826; LC100 4,9 MB 0,9892; MBV2-140 14,7 MB 0,9909; FastViT_SA24 83 MB 0,9937 (SmartDoc2015). 10-20 FPS móvil.
- OpenCV.js build custom core+imgproc ~2 MB.
- PP-OCRv6 e2e Xeon: tiny 0,32 s, small 0,79 s, medium 2,05 s por imagen; ONNX oficiales en HF PaddlePaddle/pp-ocrv6; latin_PP-OCRv5_mobile_rec 84,7 %.
- Tesseract.js 7 con relaxedsimd: 15-35 % menos tiempo.
- Glare: glare-score (MIT, Node, 14 ms en 4K) como receta; RodinDmitry/glare (Apache-2.0, arXiv 1911.05189).
- Face: FaceX (Apache-2.0, navegador WASM 48 KB, MobileFaceNet-xs 8,4 MB, LFW 99,07 %, MiniFASNet 2x1,7 MB; joven, un autor). OpenCV Zoo SFace/YuNet Apache-2.0. buffalo_sc 16 MB también es del pack no comercial.
- Liveness: facenox/face-antispoof-onnx (Apache-2.0, 1,82 MB / 600 KB cuantizado, CelebA-Spoof AUC 0,998 autoinformado). MiniFASNet ONNX web en HF garciafido/minifasnet-v2-anti-spoofing-onnx (1,74 MB). DeepPixBiS generaliza mal (OULU EER 28 %).
- Pipelines: blitzid (MIT, SCRFD+RapidOCR+MRZ CPU, OCR 0,9 s, face 173 ms i7), OpenBiometrics (MIT, YuNet/SFace/MiniFASNet+MRZ). Ballerine es MIT + Elastic License 2.0 y su README dice "major rebuild, not actively supported". FaceOnLive/OpenKYC, KBY-AI, Recognito, MiniAiLive: SDK cerrados.
- @capacitor-mlkit/barcode-scanning 8.1.0+ trae `readBarcodesFromImage` también en web.
- Document scanner nativo: @capacitor-mlkit/document-scanner solo Android; en iOS VisionKit vía plugin de pago o Flutter cunning_document_scanner (MIT).
- Datasets nuevos con licencia comercial: IDNet-2025 (CC BY 4.0, HF cactuslab/IDNet-2025), IDSpace (CC BY 4.0, github asu-cactus/IDSpace), FantasyID (CC BY 4.0, arXiv 2507.20808). MIDV-2020 sin CC explícita (solo eval). SIDTD con licencia inconsistente. Brasil BID y Chile restringido; ninguno de Colombia salvo HF cedula_anverso_v2.
- Generadores MRZ sintéticos: tony-xlh/SynthMRZ, DocsaidLab train_dataset.py.
