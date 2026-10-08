# Plan E2E: captura-calidad-pwa

Semilla: `e2e/seed.spec.ts`. App: compilación de producción de `apps/pwa` en `http://localhost:4173` (webServer de `playwright.config.ts`). Cámara: vídeos sintéticos `.y4m` de `npm run e2e:videos`, uno por proyecto `captura-<video>-<escritorio|pixel>`; cada prueba declara `@video:<nombre>`. Instrumentación: `e2e/captura/instrumentacion.ts`. Esperas solo por condición.

| Archivo | Escenario | ID | Vídeo | Pasos y comprobación |
|---|---|---|---|---|
| pwa.spec.ts | Manifiesto | CAM-01 | nitida-1080p | GET `/manifest.webmanifest`: 200, JSON con nombre, idioma, inicio, `standalone`, iconos 192 y 512 PNG |
| pwa.spec.ts | Shell sin conexión | CAM-01 | nitida-1080p | esperar `serviceWorker.controller`, `setOffline(true)`, recargar: botón "Iniciar cámara" y `inicio` |
| pwa.spec.ts | Caché limitada a recursos estáticos | CAM-01 | nitida-1080p | flujo hasta `listo`; cada clave de `CacheStorage` del mismo origen y con ruta permitida |
| camara.spec.ts | Origen HTTP que no es localhost | CAM-02 | nitida-1080p | `http://lector.test/` reenviado al servidor; error `contexto-inseguro` y 0 llamadas |
| camara.spec.ts | Navegador sin getUserMedia | CAM-02 | nitida-1080p | error `sin-soporte` con su texto |
| camara.spec.ts | Sin cámara antes de la acción | CAM-03 | nitida-1080p | tras `load`, 0 llamadas e `inicio` |
| camara.spec.ts | Restricciones exactas | CAM-03 | nitida-1080p | 1 llamada igual al literal |
| camara.spec.ts | Vídeo en línea | CAM-03 | nitida-1080p | 1 `<video>` `playsinline`, `autoplay`, `muted`; 1 pista de vídeo y 0 de audio |
| camara.spec.ts | Cámara de 1280x720 | CAM-04 | nitida-720p | aviso exacto y llega a `listo` |
| camara.spec.ts | Cámara de 1920x1080 | CAM-04 | nitida-1080p | ningún "Tu cámara entrega" en `activo` |
| camara.spec.ts | Permiso denegado y reintento | CAM-05 | nitida-1080p | `permiso-denegado`; tras "Reintentar", 2 llamadas y `activo` |
| camara.spec.ts | Pista con, sin y rechazo de enfoque continuo | CAM-06 | nitida-1080p | 1 llamada literal; 0 llamadas; `activo` sin `data-error` |
| camara.spec.ts | Sin ImageCapture; sin carga de archivos | CAM-07 | nitida-1080p | contador 0 hasta `listo`; 0 `input[type=file]` en 4 pantallas |
| guia.spec.ts | Guía en pantalla | CAM-08 | nitida-1080p | caja con tolerancia 1 px en escritorio y Pixel 7 |
| ciclo-de-vida.spec.ts | Pistas detenidas en listo, Cancelar, página oculta y reanudación | CAM-10 | nitida-1080p | pistas `ended`, `srcObject` nulo, `pausado`, "Continuar" |
| calidad.spec.ts | Feedback con cada vídeo | CAL-12 | 5 vídeos | región de estado llega al texto esperado |
| calidad.spec.ts | Auto-captura y vídeo desenfocado | CAL-11 | nitida, desenfocada | `listo`; sigue `activo` tras 30 medidas |
| calidad.spec.ts | Cadencia real | CAL-10 | desenfocada-1080p | 30 medidas `calidad:frame` con intervalos >= 100 ms y tramo <= 5800 ms |
| privacidad.spec.ts | Red, almacenamiento, Worker diferido, sin decodificadores | CAM-11, CAM-12, CAL-15 | nitida-1080p | solo GET del mismo origen permitidos; 0 WebSockets; almacenamiento vacío; `calidad.worker` 0 y luego 1; sin `zxing`, `barcode` ni `.wasm` |
| accesibilidad.spec.ts | axe, región de estado, botones, guía, idioma y título | CAM-09 | nitida-1080p | 0 violaciones serious/critical en 5 pantallas x 2 dispositivos |
| tiempo-a-listo.spec.ts | Medición y reporte | CAL-13 | nitida-1080p | 20 ejecuciones; p95 <= 3000 ms; mediana <= 2000 ms; reporte con 7 claves |
| visual.spec.ts | Apariencia de la guía y de las pantallas | CAM-08, CAM-09 | reflejo, nitida | `toHaveScreenshot` con el vídeo enmascarado (`@visual`) |
| webkit.spec.ts | Motor WebKit | CAM-07 | canvas | `getUserMedia` sustituido por `canvas.captureStream()`; llega a `listo` |
| calidad-captura (navegador) | Detector sustituto, documento no encontrado | CAL-14 | n/a | cubierto en Vitest browser |
