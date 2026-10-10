# Recalibración estricta de la nitidez (CAL-08, OFF-25)

Fecha: 2026-10-10. Cambio: `pwa-lectura-offline` (tarea 5.8). Decisión del usuario del 2026-10-07: nitidez, iluminación (oscuro y sobreexpuesto), reflejo y movimiento siguen activos y bloquean la captura; la presencia de cédula es una condición adicional, nunca un sustituto. Sustituye a la captura guiada de `2026-10-07-captura-guiada-nitidez.md`.

## Umbrales

| Umbral | Antes | Ahora | Varianza para score 70 |
|---|---|---|---|
| `laplacianoDesenfocado` | 40 | 8 | |
| `laplacianoNitido` | 200 | 35 | |
| Score 70 (`umbralListo`, sin cambios) | | | antes 152, ahora 27 |
| `LAPLACIANO_MINIMO_GUIADO` (OFF-25 anterior) | 12 | eliminado | |

El resto de CAL-08 no cambia. `umbralListo` sigue en 70 y `framesConsecutivos` en 3.

## Por qué 8 y 35

Varianza del Laplaciano de 4 vecinos en el frame de análisis de 640 px (CAL-03), dentro de la guía de CAM-08.

Fotos reales del usuario (medidas el 2026-10-07 fuera del repositorio; solo números, las fotos no entran al repositorio): entre 326 y 798 tal como salen de la app de cámara (con realce). El vídeo en vivo no lleva ese realce; un desenfoque gaussiano adicional de sigma 1 px en el frame de análisis las baja a **entre 28 y 56**, con sigma 1,5 a entre 12 y 20 y con sigma 2 a entre 8 y 11.

- `laplacianoNitido` 35 y `laplacianoDesenfocado` 8 ponen el score 70 en una varianza de 27 (`rampa(27, 8, 35)` = 70): las fotos reales con sigma 1 (28 a 56) pasan y con sigma 1,5 (12 a 20) no. Es el punto que separa "suave como un celular" de "desenfocado".
- El 8 deja el subscore en 0 a la altura del desenfoque extremo (fotos con sigma 2: 8 a 11; `desenfocada-1080p`: 5).

## Mediciones sintéticas (todas reproducibles en las pruebas)

Escenas de `packages/capture/test/lectura/escenas-presencia.ts` (cédulas de `PERSONA_BASE` en la guía; ruido +-4 y JPEG 50 tras el desenfoque). Score con los umbrales nuevos.

| Escena | Varianza | Score nuevo | Motivo nuevo | Antes (40/200 + guiada) |
|---|---|---|---|---|
| Digital, sigma 1,5 | 33,4 | >= 70 | `null` | 70 (guiada) |
| Digital girada 90 grados, sigma 1 | 46,9 | 100 | `null` | 70 (guiada) |
| Amarilla, sigma 1,5 | 71,9 | 100 | `null` | 70 (guiada) |
| Amarilla contraste 20 %, sigma 0,75 | 49,9 | 100 | `null` | 70 (guiada) |
| Amarilla contraste 20 %, sigma 1 | 25,1 | 63 | `desenfocado` | 70 (guiada) |
| Digital, sigma 2 | 14,5 | 24 | `desenfocado` | 70 (guiada) |
| Digital, sigma 3,5 | < 8 | 0 | `desenfocado` | `desenfocado` |
| Digital, movimiento diagonal 9 px + sigma 1 | 21,5 | 50 | `desenfocado` | 70 (guiada) |
| Digital, movimiento horizontal 15 px + sigma 1 | 25,6 | 65 | `desenfocado` | 70 (guiada) |
| Cara / pared / hoja / texto nítidas | 140 / 489 / 196 / 7120 | 69 | `acerca` (presencia) | 69 `acerca` |
| Cara / pared / hoja con sigma 1 | 15,5 / 8,9 / 16,4 | < 70 | `desenfocado` | `acerca` |

Vídeos E2E (frame 0, reducción por área):

| Vídeo | Varianza | Score antes | Score ahora |
|---|---|---|---|
| `amarilla-suave-1080p` | 77,9 | 24 (70 con guiada) | 100 |
| `digital-suave-1080p` | 128,6 | 55 (70 con guiada) | 88 (limita `sobreexpuesto`) |
| `desenfocada-1080p` | 5,0 | 0 | 0 |
| `amarilla-1080p` con gaussiano sigma 6 (NAT-03) | 19,4 | 0 (70 con guiada) | 42, `desenfocado` |
| `amarilla-1080p` con sigma 10 | 2,5 | 0 | 0 |
| `amarilla-1080p`, `digital-1080p`, `nitida-1080p` | 2184 a 8146 | 87 a 100 | sin cambios |

## Límite conocido: movimiento en un solo eje

La varianza del Laplaciano de 4 vecinos conserva la energía del eje perpendicular al movimiento. Un desenfoque de movimiento horizontal puro de 15 px deja la digital en 229 y la amarilla en 235: no se detecta como desenfoque. Combinado con un desenfoque leve (sigma 1), sí (25,6). Si en campo aparecen capturas movidas en un eje que no se leen, la lectura falla y reintenta (OFF-26); una métrica direccional sería un cambio nuevo.

## Consecuencias

- La presencia (OFF-22) solo se evalúa en frames con score >= 70: ya no hay elevación del score. Desaparece `LAPLACIANO_MINIMO_GUIADO` de `packages/capture` y la clave `laplacianoMinimoGuiado` del JSON generado para el núcleo nativo (`packages/nucleo-js/scripts/generar-umbrales.mjs`).
- Núcleo Kotlin (`sdk-nativo`, NAT-03): misma regla (paridad exacta). El escenario "Desenfoque con documento presente (captura guiada)" pasa a exigir `desenfocado` con sigma 6.
- Sin presencia activada (el Worker de calidad de `packages/capture` con sus opciones por defecto), escenas sin cédula con varianza >= 27 llegan a 70: antes hacía falta 152. La PWA y el SDK web (`packages/web`) activan la presencia y lo impiden con OFF-22.
