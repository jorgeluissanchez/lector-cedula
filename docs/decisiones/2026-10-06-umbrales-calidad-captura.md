# Umbrales del score de calidad de captura

Fecha: 2026-10-06. Estado: **provisional** (sin calibrar con datos). Cambio OpenSpec: `captura-calidad-pwa`, requisitos CAL-03 a CAL-08, CAL-10 y CAL-11 de la capacidad `calidad-captura`.

## Contexto

El score 0-100 se calcula en el dispositivo sobre un frame de análisis de 640 px de lado largo (CAL-01), dentro del cuadrilátero de análisis (CAL-02). Cada métrica produce un subscore 0-100 con una rampa lineal entre dos umbrales; el score es el mínimo de los subscores (CAL-07). No hay BRISQUE ni NIQE en JavaScript con licencia limpia (pyiqa es PolyForm Noncommercial), así que el módulo es propio.

Los valores de esta tabla se eligieron por razonamiento sobre el frame de 640 px y sobre escenas sintéticas, no con datos medidos. Sirven para que las pruebas y la PWA funcionen; **no** son la configuración de producción hasta completar la calibración de la sección "Procedimiento".

## Valores por defecto

| Umbral | Valor | Métrica y efecto | Origen del valor provisional |
|---|---|---|---|
| `laplacianoDesenfocado` | 8 | Nitidez: varianza del Laplaciano en o por debajo da subscore 0 | Recalibrado el 2026-10-10 (antes 40) con mediciones de fotos reales y escenas sintéticas: `2026-10-10-recalibracion-nitidez.md` |
| `laplacianoNitido` | 35 | Nitidez: varianza en o por encima da subscore 100; el score 70 queda en 27 | Recalibrado el 2026-10-10 (antes 200): ídem |
| `luminanciaSaturada` | 250 | Reflejo: un píxel con Y >= 250 cuenta como saturado | Receta de glare-score (MIT) y paper arXiv 1911.05189; fijado en la petición de la Fase 2 |
| `fraccionSaturadaMax` | 0,05 | Reflejo: 5 % de M saturado lleva el subscore a 0 | Un reflejo que cubre el 5 % del documento tapa varios campos |
| `componenteSaturadoMax` | 0,02 | Reflejo: un componente saturado del 2 % de M lleva el subscore a 0 | Un brillo compacto del 2 % puede tapar una fila del PDF417 |
| `luminanciaOscura` | 5 | Exposición: Y <= 5 cuenta como sombra recortada | Simétrico a la saturación, con margen por ruido del sensor |
| `fraccionOscuraMax` | 0,25 | Exposición: 25 % de M recortado en negro lleva `oscuro` a 0 | Sombra dura sobre un cuarto del documento |
| `mediaNegra` | 20 | Exposición: media en o por debajo da `oscuro` 0 | Imagen casi negra |
| `mediaOscuraOk` | 60 | Exposición: media en o por encima no penaliza por oscuridad | |
| `mediaClaraOk` | 200 | Exposición: media en o por debajo no penaliza por sobreexposición | El fondo de la amarilla ronda Y 228 en sRGB puro; la cámara lo suele exponer por debajo; vigilar en la calibración |
| `mediaBlanca` | 240 | Exposición: media en o por encima da `sobreexpuesto` 0 | |
| `ratioMinimo` | 0,10 | Tamaño: el cuadrilátero ocupa el 10 % del frame o menos, subscore 0 | Solo con detector (`fuente: "modelo"`) |
| `ratioOk` | 0,30 | Tamaño: el 30 % o más, subscore 100 | La guía de CAM-08 ocupa el 72 % de un frame 16:9 |
| `umbralListo` | 70 | Score mínimo para contar un frame hacia la auto-captura | Referencia Didit (umbral configurable); a calibrar contra FRR |
| `framesConsecutivos` | 3 | Frames seguidos sobre el umbral para capturar | A 5-10 fps son 0,3-0,6 s de estabilidad |
| `intervaloMinimoMs` | 100 | Intervalo mínimo entre envíos al Worker (10 fps máximo) | Skill `captura-movil`: 5-10 fps |

Rangos válidos y relaciones de orden: escenario "Reglas de validez" de CAL-08.

## Procedimiento de calibración (pendiente)

1. Datos: DLC-2021 (CC BY-SA 2.5, solo evaluación, descargado con `evals/datasets/` y nunca versionado) y vídeos del set de campo (fuera del repositorio, cifrados). Se etiqueta cada frame como bueno o malo por motivo (desenfocado, reflejo, oscuro, sobreexpuesto, lejano) con la regla "¿se lee el código a resolución completa?".
2. Por métrica: curva de rechazo de frames buenos (FRR) frente a rechazo de frames malos de su motivo. Se elige el umbral que deja FRR <= 5 % con el mayor rechazo de malos; se reporta también el rechazo obtenido.
3. `umbralListo` y `framesConsecutivos`: se eligen para que el tiempo hasta "listo" sobre los vídeos buenos cumpla CAL-13 (p95 <= 3 s) y la tasa de capturas que luego no se decodifican sea mínima (requiere el cambio de lectura de códigos).
4. Resultado: una fila por umbral con valor calibrado, dataset y versión, FRR y rechazo medidos, y fecha. Se registra en este archivo.

## Cómo cambiar un valor

Los valores por defecto están fijados literalmente en el escenario "Valores por defecto" de CAL-08. Cambiarlos exige un cambio OpenSpec sobre `calidad-captura` que actualice ese escenario y este documento en el mismo PR. Nunca se baja un umbral para que una prueba pase (skill `estrategia-pruebas`, antipatrones). En tiempo de ejecución, quien integra el SDK puede sustituir umbrales con la configuración parcial de CAL-08 sin tocar los valores por defecto.
