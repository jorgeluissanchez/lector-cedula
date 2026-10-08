# Captura guiada por la presencia y nitidez mínima (OFF-25, OFF-26)

Fecha: 2026-10-07. Cambio: `pwa-lectura-offline` (tarea 5.6).

## Problema

En un Android real (Chrome, túnel HTTPS), una cédula digital bien encuadrada dejaba la PWA en `activo` con "Desenfocado, mantén la cámara quieta". El subscore de nitidez de CAL-03 (`rampa(varianza, 40, 200)`) exige una varianza del Laplaciano >= 152 en el frame de análisis de 640 px para llegar a 70. Los vídeos sintéticos dan de 1000 a 6500.

## Medidas (solo números; las fotos del usuario no entran al repositorio)

Script fuera del repositorio. Frame de análisis por promedio de área, guía de CAM-08 y `analizarFrame`.

| Imagen | Dimensiones | Varianza (área) | Varianza (vecino) | Score | Tarjeta en la guía | Presencia |
|---|---|---|---|---|---|---|
| Foto 1 (recorte MRZ) | 1813x406 | 331 | 643 | 100 | no | no |
| Foto 2 | 720x1280 | 357 | 604 | 100 | no | no |
| Foto 3 | 900x1600 | 798 | 1476 | 94 | no | no |
| Foto 4 | 899x1599 | 607 | 1070 | 100 | no | no |
| Captura de pantalla de la app (recorte 9:16) | 610x1084 | 326 | 468 | 100 | sí | sí (MRZ) |

Las fotos de la app de cámara llevan realce y superan el umbral. El vídeo en vivo no lleva ese realce. Un desenfoque gaussiano de sigma 1 px en el frame de análisis (unos 3 px a 1080p) baja la varianza de esas mismas fotos a entre 28 y 56. Con sigma 1,5 baja a entre 12 y 20, y con sigma 2, a entre 8 y 11. Con sigma 0,75 en la captura de pantalla se pierde la tarjeta: la guía dibujada sobre el vídeo influye en esa medida, así que no es concluyente.

Sintéticas degradadas (desenfoque, ruido +-4 y JPEG 50) en el frame de análisis:

| Escena | sigma 0 | 0,75 | 1 | 1,5 | 2 | 2,5 | 3,5 |
|---|---|---|---|---|---|---|---|
| Amarilla | 6546 | 750 | 288 | 72 | 27 | 15 | 7 |
| Amarilla, contraste 20 % | | | 25 | 11 | 6 | | |
| Digital | 1239 | 235 | 111 | 33 | 15 | 9 | 5 |
| Digital girada 90 grados | 1021 | 109 | 47 | 15 | 8 | 5 | 3 |
| Cara / pared / hoja | 124 / 79 / 177 | 26 / 15 / 33 | 15 / 9 / 16 | 8 / 4 / 7 | | | |

Vídeos E2E: `amarilla-suave-1080p` tiene una varianza de 79 (score 24) y `digital-suave-1080p`, de 129 (score 56). La CLI lee los dos.

## Decisión

- `LAPLACIANO_MINIMO_GUIADO = 12`. Por debajo, el frame se descarta por desenfoque extremo o movimiento. Entre 12 y 152 se intenta la lectura si hay presencia de cédula (OFF-25).
- Presencia más robusta. Los bordes de la tarjeta se miden con diferencias a 2 px. Se añade el patrón PDF417 suave: con desenfoque, la amarilla da del 17 al 28 % de bloques, y el texto y la hoja, del 1,5 al 2,2 %.
- Reintento silencioso de la lectura: hasta 3 lecturas o 20 s (OFF-26).
- Los umbrales de CAL-08 no cambian.
