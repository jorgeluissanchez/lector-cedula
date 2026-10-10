# Spec Delta

## Purpose

Ajustar `calidad-captura` (cambio `captura-calidad-pwa`) a la lectura en el dispositivo: este cambio sí implementa e invoca la interfaz de lector de códigos (solo PDF417, OFF-07), al llegar a `listo` (OFF-19), y el service worker precachea `zxing_reader.wasm` en su `install` (OFF-01). El escenario "Ningún decodificador en este cambio" pasa a exigir que no se descargue ni ejecute ningún decodificador antes de la captura aceptada.

Recalibración estricta de la nitidez (tarea 5.8, decisión del usuario del 2026-10-07): `laplacianoDesenfocado` pasa de 40 a 8 y `laplacianoNitido` de 200 a 35, de modo que el score 70 queda en una varianza del Laplaciano de 27 (antes, 152). Sustituye a la captura guiada (OFF-25) que elevaba el score: nitidez, exposición y reflejo vuelven a bloquear siempre. Mediciones en `docs/decisiones/2026-10-10-recalibracion-nitidez.md`. Cambian por ello los escenarios con valores literales de CAL-03 ("Subscore intermedio"), CAL-07 ("Desenfoque fuerte rechaza el frame") y CAL-08 ("Valores por defecto" y "Configuración inválida").

## MODIFIED Requirements

### Requirement: CAL-15 Interfaz de lector de códigos
El paquete MUST exponer una interfaz de lector de códigos (firma en design.md, decisión 7) que recibe una captura aceptada y devuelve los bytes crudos de cada código. Su formato MUST admitir solo `"pdf417"`, porque el QR de la cédula digital no se decodifica (principio V). La única implementación es el lector PDF417 del Worker lector (`pwa-lectura-offline`, OFF-07), que solo se invoca tras la captura aceptada.

#### Scenario: Contrato de tipos
- **WHEN** se ejecuta la comprobación de tipos de Vitest sobre `packages/capture`
- **THEN** un lector que declara el formato `"pdf417"` y devuelve `Uint8Array` satisface la interfaz, y uno que declara `"qr"` produce un error esperado (`@ts-expect-error`)

#### Scenario: Ningún decodificador antes de la captura
- **WHEN** se registran las peticiones de la página y de sus Workers (no las del service worker) desde la carga de `/` hasta que `data-pantalla` vale `activo` con `nitida-1080p`
- **THEN** ninguna ruta contiene `zxing`, `barcode`, `lector.worker` ni termina en `.wasm`

### Requirement: CAL-03 Nitidez
La nitidez MUST ser la varianza poblacional del Laplaciano de 4 vecinos, `Y(x-1,y) + Y(x+1,y) + Y(x,y-1) + Y(x,y+1) - 4·Y(x,y)`, sobre los píxeles de M que no están en el borde del frame. Su subscore MUST ser `rampa(varianza, laplacianoDesenfocado, laplacianoNitido)` y su motivo es `desenfocado`.

#### Scenario: Patrones de varianza conocida
- **WHEN** se mide la nitidez de frames de 64x64 con cuadrilátero completo: gris 128, tablero 0/255, rayas 0/255 y tablero 60/190
- **THEN** las varianzas son, en ese orden, 0, 1040400, 260100 y 270400, y los subscores 0, 100, 100 y 100

#### Scenario: Subscore intermedio
- **WHEN** se calcula el subscore de nitidez para varianzas 8, 21.5, 27 y 35
- **THEN** los subscores son 0, 50, 70 y 100

#### Scenario: El desenfoque nunca mejora la nitidez
- **WHEN** a 100 frames de ruido de 128x128 (semillas 1 a 100) con cuadrilátero completo se les aplica 1, 2 y 3 veces un desenfoque de caja 3x3 con borde replicado y redondeo al entero más cercano
- **THEN** en cada frame la varianza tras 1 aplicación es como máximo el 5 % de la original, ninguna aplicación adicional aumenta la varianza y ningún subscore aumenta

### Requirement: CAL-07 Score y motivo
El score MUST ser el mínimo de los subscores evaluados (`acerca`, `oscuro`, `sobreexpuesto`, `reflejo`, `desenfocado`), entero entre 0 y 100. Si es menor que `umbralListo`, el motivo MUST ser la métrica de menor subscore, con empates resueltos en ese orden; si no, MUST ser `null`. El cálculo MUST ser determinista.

#### Scenario: Resultado completo
- **WHEN** se analiza un frame gris 128 de 64x64 con cuadrilátero completo y `fuente: "guia"`
- **THEN** el resultado es exactamente `{ "score": 0, "motivo": "desenfocado", "metricas": { "nitidez": { "varianza": 0, "subscore": 0 }, "reflejo": { "fraccionSaturada": 0, "componenteMayor": 0, "subscore": 100 }, "exposicion": { "media": 128, "fraccionOscura": 0, "subscoreOscuro": 100, "subscoreSobreexpuesto": 100 }, "tamano": null } }`

#### Scenario: Frame bueno
- **WHEN** se analiza un frame tablero 60/190 de 64x64 con cuadrilátero completo
- **THEN** `score` es 100 y `motivo` es `null`

#### Scenario: Empate entre motivos
- **WHEN** se analiza un frame tablero 0/255 de 64x64 con cuadrilátero completo (subscores `oscuro` 0 y `reflejo` 0)
- **THEN** `score` es 0 y `motivo` es `oscuro`

#### Scenario: Documento lejano y documento suficiente
- **WHEN** se analiza un frame tablero 60/190 de 64x64 con rect (0,0)-(16,16) y, aparte, con rect (0,0)-(32,32)
- **THEN** con (0,0)-(16,16) `score` es 0 y `motivo` es `acerca`; con (0,0)-(32,32) `score` es 75 y `motivo` es `null`

#### Scenario: Desenfoque fuerte rechaza el frame
- **WHEN** a un frame tablero 60/190 de 128x128 con cuadrilátero completo se le aplica 2 veces, aparte 3 veces y aparte 4 veces el desenfoque de caja de CAL-03
- **THEN** con 3 y con 4 aplicaciones `score` es 0 y `motivo` es `desenfocado`; con 2 aplicaciones la varianza (entre 61 y 62) supera `laplacianoNitido` y `score` es 100 con `motivo` `null`

#### Scenario: Determinismo y mínimo
- **WHEN** se analiza dos veces cada frame generado por fast-check (ancho y alto entre 3 y 64, píxeles arbitrarios, cuadrilátero completo), al menos 1000 casos
- **THEN** los dos resultados son profundamente iguales y `score` es igual al mínimo de los subscores evaluados

### Requirement: CAL-08 Umbrales calibrables
Los umbrales MUST tener los valores por defecto del escenario, documentados con su origen en `docs/decisiones/2026-10-06-umbrales-calidad-captura.md` (la nitidez, en `docs/decisiones/2026-10-10-recalibracion-nitidez.md`), y MUST poder sustituirse en tiempo de ejecución de forma parcial. Una configuración inválida MUST rechazarse completa, con la lista ordenada de campos inválidos, sin cambiar los umbrales vigentes.

#### Scenario: Valores por defecto
- **WHEN** se leen los umbrales por defecto
- **THEN** son exactamente `{ "laplacianoDesenfocado": 8, "laplacianoNitido": 35, "luminanciaSaturada": 250, "fraccionSaturadaMax": 0.05, "componenteSaturadoMax": 0.02, "luminanciaOscura": 5, "fraccionOscuraMax": 0.25, "mediaNegra": 20, "mediaOscuraOk": 60, "mediaClaraOk": 200, "mediaBlanca": 240, "ratioMinimo": 0.1, "ratioOk": 0.3, "umbralListo": 70, "framesConsecutivos": 3, "intervaloMinimoMs": 100 }`

#### Scenario: Reglas de validez
- **WHEN** se valida una configuración parcial
- **THEN** cada campo presente MUST ser un número finito y cumplir: `luminanciaSaturada` y `luminanciaOscura` enteros en 0..255; `mediaNegra`, `mediaOscuraOk`, `mediaClaraOk` y `mediaBlanca` en 0..255; `fraccionSaturadaMax`, `componenteSaturadoMax`, `fraccionOscuraMax`, `ratioMinimo` y `ratioOk` en (0, 1]; `laplacianoDesenfocado` >= 0; `umbralListo` entero en 0..100; `framesConsecutivos` entero en 1..30; `intervaloMinimoMs` en 100..200; y, tras combinar con los vigentes, `laplacianoDesenfocado < laplacianoNitido`, `mediaNegra < mediaOscuraOk < mediaClaraOk < mediaBlanca` y `ratioMinimo < ratioOk`; cuando falla una relación de orden se listan los campos de esa relación presentes en la configuración parcial; un campo desconocido es inválido

#### Scenario: Configuración inválida
- **WHEN** se configura `{ "umbralListo": 101, "framesConsecutivos": 0, "laplacianoNitido": 5, "extra": 1 }`
- **THEN** el resultado es exactamente `{ "ok": false, "codigo": "umbrales-invalidos", "campos": ["extra", "framesConsecutivos", "laplacianoNitido", "umbralListo"] }` y los umbrales vigentes siguen siendo los valores por defecto

#### Scenario: Sustitución parcial con efecto
- **WHEN** se configura `{ "umbralListo": 80 }` y se analiza un frame tablero 60/190 de 64x64 con rect (0,0)-(32,32)
- **THEN** la configuración devuelve `{ "ok": true }`, los umbrales vigentes son los por defecto con `umbralListo` 80, y el resultado tiene `score` 75 y `motivo` `acerca`
