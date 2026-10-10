# Spec Delta

## Purpose

Medir en el dispositivo, frame a frame, si la imagen del documento sirve para leerse, con un score 0-100 y un motivo accionable, decidir cuándo capturar y definir las interfaces por las que los cambios posteriores aportan la detección del documento y la lectura de códigos.

Convenciones de los escenarios: un frame es RGBA de 8 bits por canal. "Gris v" es un frame con todos los píxeles (v, v, v, 255). "Tablero a/b" asigna a al píxel (x, y) si x + y es par y b si es impar. "Rayas a/b" asigna a a las columnas pares y b a las impares. "Bloque v en [x0..x1]x[y0..y1]" sobrescribe con (v, v, v, 255) ese rango inclusivo. "Ruido de semilla s" asigna a cada píxel un gris uniforme e independiente en 0..255 generado con la semilla s. El cuadrilátero "completo" de un frame W x H es `[(0,0), (W,0), (W,H), (0,H)]`; "rect (x0,y0)-(x1,y1)" es `[(x0,y0), (x1,y0), (x1,y1), (x0,y1)]`. `Y` es la luminancia de CAL-01, `M` el conjunto de píxeles de CAL-02 y `rampa(x, a, b)` vale 0 si x <= a, 100 si x >= b y `Math.round(100 * (x - a) / (b - a))` en otro caso. Salvo que se indique otra cosa, los umbrales son los valores por defecto de CAL-08 y la fuente del cuadrilátero es `"modelo"`. Todas las imágenes son sintéticas y se generan dentro de la prueba.

## ADDED Requirements

### Requirement: CAL-01 Frame de análisis
El análisis de calidad MUST hacerse sobre un frame cuyo lado largo mide 640 px, o el del frame original si es menor, con el lado corto escalado en la misma proporción y redondeado al entero más cercano. La luminancia de cada píxel MUST ser `Y = (77·R + 150·G + 29·B + 128) >> 8`.

#### Scenario: Dimensiones del frame de análisis
- **WHEN** se calculan las dimensiones de análisis para frames de 1920x1080, 1280x720, 1080x1920, 3840x2160, 1440x1080, 640x480, 320x240 y 1000x1000
- **THEN** los resultados son, en ese orden, 640x360, 640x360, 360x640, 640x360, 640x480, 640x480, 320x240 y 640x640

#### Scenario: Luminancia de colores puros
- **WHEN** se calcula `Y` de (255, 255, 255), (0, 0, 0), (255, 0, 0), (0, 255, 0), (0, 0, 255), (250, 250, 250) y (249, 249, 249)
- **THEN** los resultados son, en ese orden, 255, 0, 77, 149, 29, 250 y 249

#### Scenario: Luminancia de grises
- **WHEN** se calcula `Y` de (v, v, v) para cada v entre 0 y 255
- **THEN** el resultado es v en los 256 casos

### Requirement: CAL-02 Cuadrilátero de análisis
Las métricas MUST calcularse solo sobre M: los píxeles del frame cuyo centro (x + 0,5, y + 0,5) está dentro o en el borde del cuadrilátero, dado en píxeles del frame de análisis en el orden superior izquierda, superior derecha, inferior derecha, inferior izquierda. Un cuadrilátero no convexo, con coordenadas no finitas, de área cero o con M vacío MUST rechazarse con el error `cuadrilatero-invalido`.

#### Scenario: Guía en el frame de análisis
- **WHEN** se calcula M en un frame de 640x360 con la guía de 1920x1080 de CAM-08 escalada por 1/3, es decir `[(190/3, 18), (1731/3, 18), (1731/3, 342), (190/3, 342)]`
- **THEN** M tiene 166536 píxeles

#### Scenario: Cuadrilátero completo y parcialmente fuera del frame
- **WHEN** se calcula M en un frame de 64x64 con el cuadrilátero completo y con `[(-10,-10), (10,-10), (10,10), (-10,10)]`
- **THEN** M tiene 4096 y 100 píxeles respectivamente

#### Scenario: Cuadriláteros inválidos
- **WHEN** se analiza un frame de 64x64 con `[(0,0), (64,64), (64,0), (0,64)]` (cruzado), con `[(0,0), (10,0), (20,0), (30,0)]` (área cero), con `[(0.6,0.6), (0.9,0.6), (0.9,0.9), (0.6,0.9)]` (sin centros dentro) y con `[(0,0), (NaN,0), (64,64), (0,64)]`
- **THEN** cada análisis termina con el error `cuadrilatero-invalido` y no devuelve score

### Requirement: CAL-03 Nitidez
La nitidez MUST ser la varianza poblacional del Laplaciano de 4 vecinos, `Y(x-1,y) + Y(x+1,y) + Y(x,y-1) + Y(x,y+1) - 4·Y(x,y)`, sobre los píxeles de M que no están en el borde del frame. Su subscore MUST ser `rampa(varianza, laplacianoDesenfocado, laplacianoNitido)` y su motivo es `desenfocado`.

#### Scenario: Patrones de varianza conocida
- **WHEN** se mide la nitidez de frames de 64x64 con cuadrilátero completo: gris 128, tablero 0/255, rayas 0/255 y tablero 60/190
- **THEN** las varianzas son, en ese orden, 0, 1040400, 260100 y 270400, y los subscores 0, 100, 100 y 100

#### Scenario: Subscore intermedio
- **WHEN** se calcula el subscore de nitidez para varianzas 40, 120 y 200
- **THEN** los subscores son 0, 50 y 100

#### Scenario: El desenfoque nunca mejora la nitidez
- **WHEN** a 100 frames de ruido de 128x128 (semillas 1 a 100) con cuadrilátero completo se les aplica 1, 2 y 3 veces un desenfoque de caja 3x3 con borde replicado y redondeo al entero más cercano
- **THEN** en cada frame la varianza tras 1 aplicación es como máximo el 5 % de la original, ninguna aplicación adicional aumenta la varianza y ningún subscore aumenta

### Requirement: CAL-04 Reflejo
El reflejo MUST medirse con `fraccionSaturada` (píxeles de M con `Y >= luminanciaSaturada`, entre el tamaño de M) y `componenteMayor` (área del mayor componente 4-conexo de esos píxeles dentro de M, entre el tamaño de M). Su subscore MUST ser `100 - rampa(max(fraccionSaturada / fraccionSaturadaMax, componenteMayor / componenteSaturadoMax), 0, 1)` y su motivo es `reflejo`.

#### Scenario: Reflejos de tamaño conocido
- **WHEN** se mide el reflejo en frames gris 128 de 100x100 con cuadrilátero completo: sin cambios, con bloque 255 en [40..49]x[40..49] y con bloque 255 en [40..59]x[40..59]
- **THEN** los resultados `(fraccionSaturada, componenteMayor, subscore)` son, en ese orden, (0, 0, 100), (0.01, 0.01, 50) y (0.04, 0.04, 0)

#### Scenario: Saturados dispersos
- **WHEN** en un frame gris 128 de 100x100 con cuadrilátero completo se ponen a 255 los 200 píxeles de [40..59]x[40..59] con x + y par
- **THEN** `fraccionSaturada` es 0.02, `componenteMayor` es 0.0001 y el subscore es 60

#### Scenario: Conectividad de 4 vecinos
- **WHEN** en un frame gris 128 de 100x100 con cuadrilátero completo hay un bloque 255 en [20..29]x[20..29] y otro en [30..39]x[30..39], que solo se tocan por una esquina
- **THEN** `fraccionSaturada` es 0.02, `componenteMayor` es 0.01 y el subscore es 50

#### Scenario: Umbral de saturación exacto
- **WHEN** en un frame gris 128 de 100x100 con cuadrilátero completo hay un bloque en [40..59]x[40..59] de valor 249 en un caso y 250 en otro
- **THEN** con 249 el subscore es 100 y con 250 es 0

#### Scenario: Reflejo fuera del cuadrilátero
- **WHEN** en un frame gris 128 de 100x100 hay un bloque 255 en [70..89]x[40..59] y el cuadrilátero es rect (0,0)-(50,100)
- **THEN** `fraccionSaturada` es 0, `componenteMayor` es 0 y el subscore es 100

#### Scenario: Un reflejo mayor nunca mejora el subscore
- **WHEN** en un frame gris 128 de 128x128 con cuadrilátero completo se dibuja un disco 255 centrado de radio 2, 4, 8 y 16
- **THEN** la secuencia de subscores no aumenta en ningún paso

### Requirement: CAL-05 Exposición
La exposición MUST evaluarse con la media `media` de Y en M y con `fraccionOscura` (píxeles de M con `Y <= luminanciaOscura`, entre el tamaño de M). El subscore `oscuro` MUST ser `min(rampa(media, mediaNegra, mediaOscuraOk), 100 - rampa(fraccionOscura, 0, fraccionOscuraMax))` y el subscore `sobreexpuesto` MUST ser `100 - rampa(media, mediaClaraOk, mediaBlanca)`.

#### Scenario: Grises uniformes
- **WHEN** se mide la exposición de frames de 64x64 con cuadrilátero completo: gris 128, gris 10, gris 40, gris 220 y gris 245
- **THEN** los subscores `(oscuro, sobreexpuesto)` son, en ese orden, (100, 100), (0, 100), (50, 100), (100, 50) y (100, 0)

#### Scenario: Sombras recortadas
- **WHEN** se mide un frame de 64x64 con cuadrilátero completo cuyas columnas 0 a 31 son gris 0 y las 32 a 63 gris 200
- **THEN** `media` es 100, `fraccionOscura` es 0.5, el subscore `oscuro` es 0 y el subscore `sobreexpuesto` es 100

#### Scenario: Más brillo nunca mejora la sobreexposición
- **WHEN** a 100 frames de ruido de 64x64 (semillas 1 a 100) se les multiplica cada canal por 1,2 con saturación en 255
- **THEN** en cada frame `media` no disminuye y el subscore `sobreexpuesto` no aumenta

### Requirement: CAL-06 Tamaño relativo
Cuando el cuadrilátero lo aporta un detector (`fuente: "modelo"`), el tamaño MUST ser el área del cuadrilátero, por la fórmula del polígono, entre el área del frame, con subscore `rampa(ratio, ratioMinimo, ratioOk)` y motivo `acerca`. Con la guía (`fuente: "guia"`) el tamaño MUST reportarse como `null` y MUST NOT participar en el score.

#### Scenario: Ratios conocidos
- **WHEN** se mide el tamaño en un frame de 640x360 con rect (0,0)-(320,180), con el cuadrilátero completo y con rect (0,0)-(128,72)
- **THEN** los resultados `(ratio, subscore)` son (0.25, 75), (1, 100) y (0.04, 0)

#### Scenario: Guía como cuadrilátero
- **WHEN** se mide un frame de 640x360 con la guía de CAL-02 y `fuente: "guia"`
- **THEN** `metricas.tamano` es `null`

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
- **WHEN** a un frame tablero 60/190 de 128x128 con cuadrilátero completo se le aplica 2 veces y, aparte, 3 veces el desenfoque de caja de CAL-03
- **THEN** en ambos casos `score` es menor que 70 y `motivo` es `desenfocado`

#### Scenario: Determinismo y mínimo
- **WHEN** se analiza dos veces cada frame generado por fast-check (ancho y alto entre 3 y 64, píxeles arbitrarios, cuadrilátero completo), al menos 1000 casos
- **THEN** los dos resultados son profundamente iguales y `score` es igual al mínimo de los subscores evaluados

### Requirement: CAL-08 Umbrales calibrables
Los umbrales MUST tener los valores por defecto del escenario, documentados con su origen en `docs/decisiones/2026-10-06-umbrales-calidad-captura.md`, y MUST poder sustituirse en tiempo de ejecución de forma parcial. Una configuración inválida MUST rechazarse completa, con la lista ordenada de campos inválidos, sin cambiar los umbrales vigentes.

#### Scenario: Valores por defecto
- **WHEN** se leen los umbrales por defecto
- **THEN** son exactamente `{ "laplacianoDesenfocado": 40, "laplacianoNitido": 200, "luminanciaSaturada": 250, "fraccionSaturadaMax": 0.05, "componenteSaturadoMax": 0.02, "luminanciaOscura": 5, "fraccionOscuraMax": 0.25, "mediaNegra": 20, "mediaOscuraOk": 60, "mediaClaraOk": 200, "mediaBlanca": 240, "ratioMinimo": 0.1, "ratioOk": 0.3, "umbralListo": 70, "framesConsecutivos": 3, "intervaloMinimoMs": 100 }`

#### Scenario: Reglas de validez
- **WHEN** se valida una configuración parcial
- **THEN** cada campo presente MUST ser un número finito y cumplir: `luminanciaSaturada` y `luminanciaOscura` enteros en 0..255; `mediaNegra`, `mediaOscuraOk`, `mediaClaraOk` y `mediaBlanca` en 0..255; `fraccionSaturadaMax`, `componenteSaturadoMax`, `fraccionOscuraMax`, `ratioMinimo` y `ratioOk` en (0, 1]; `laplacianoDesenfocado` >= 0; `umbralListo` entero en 0..100; `framesConsecutivos` entero en 1..30; `intervaloMinimoMs` en 100..200; y, tras combinar con los vigentes, `laplacianoDesenfocado < laplacianoNitido`, `mediaNegra < mediaOscuraOk < mediaClaraOk < mediaBlanca` y `ratioMinimo < ratioOk`; cuando falla una relación de orden se listan los campos de esa relación presentes en la configuración parcial; un campo desconocido es inválido

#### Scenario: Configuración inválida
- **WHEN** se configura `{ "umbralListo": 101, "framesConsecutivos": 0, "laplacianoNitido": 30, "extra": 1 }`
- **THEN** el resultado es exactamente `{ "ok": false, "codigo": "umbrales-invalidos", "campos": ["extra", "framesConsecutivos", "laplacianoNitido", "umbralListo"] }` y los umbrales vigentes siguen siendo los valores por defecto

#### Scenario: Sustitución parcial con efecto
- **WHEN** se configura `{ "umbralListo": 80 }` y se analiza un frame tablero 60/190 de 64x64 con rect (0,0)-(32,32)
- **THEN** la configuración devuelve `{ "ok": true }`, los umbrales vigentes son los por defecto con `umbralListo` 80, y el resultado tiene `score` 75 y `motivo` `acerca`

### Requirement: CAL-09 Procesamiento en Worker
El cálculo de calidad MUST ejecutarse en un Web Worker dedicado. Los píxeles MUST transferirse sin copia en ambos sentidos, el Worker MUST devolver el mismo resultado que el cálculo directo, y ante un mensaje mal formado MUST responder con un error tipado y seguir atendiendo.

#### Scenario: Transferencia sin copia
- **WHEN** en Chromium real (Vitest browser) el hilo principal envía un frame de 640x360 al Worker
- **THEN** inmediatamente después del envío el `ArrayBuffer` del hilo principal tiene `byteLength` 0, y la respuesta trae un `ArrayBuffer` de 921600 bytes con el mismo contenido enviado

#### Scenario: Resultado idéntico al cálculo directo
- **WHEN** se analizan en el Worker y directamente en la página los frames de los escenarios de CAL-03, CAL-04, CAL-05 y CAL-07 y 10 frames de ruido de 640x360 (semillas 1 a 10) con la guía de CAL-02
- **THEN** cada par de resultados es profundamente igual

#### Scenario: Mensajes mal formados
- **WHEN** se envía `{ "tipo": "analizar", "id": 7, "ancho": 640, "alto": 360 }` con un buffer de 100 bytes, después `{ "tipo": "analizar", "id": 8 }` con un frame de 64x64 y un cuadrilátero cruzado, y después un frame válido con `id` 9
- **THEN** las respuestas son `{ "tipo": "error", "id": 7, "codigo": "frame-invalido" }`, `{ "tipo": "error", "id": 8, "codigo": "cuadrilatero-invalido" }` y un mensaje `{ "tipo": "resultado", "id": 9, ... }`

### Requirement: CAL-10 Cadencia de análisis
El hilo principal MUST enviar un frame al Worker solo si no hay otro en análisis y han pasado al menos `intervaloMinimoMs` desde el envío anterior, de modo que nunca haya más de un frame en vuelo y la cadencia no supere 10 frames por segundo ni baje de 5 cuando el análisis tarda menos de 100 ms.

#### Scenario: Análisis rápido
- **WHEN** el planificador recibe ticks cada 16 ms desde t = 0 hasta t = 1000 ms, cada análisis tarda 40 ms y `intervaloMinimoMs` es 100
- **THEN** los envíos ocurren exactamente en t = 0, 112, 224, 336, 448, 560, 672, 784 y 896

#### Scenario: Análisis lento
- **WHEN** con los mismos ticks cada análisis tarda 250 ms
- **THEN** los envíos ocurren exactamente en t = 0, 256, 512 y 768

#### Scenario: Cadencia real en el navegador
- **WHEN** con el vídeo `desenfocada-1080p` en Chromium escritorio se leen 30 medidas consecutivas `calidad:frame` de `performance`
- **THEN** la diferencia entre inicios consecutivos es de 100 ms o más y el inicio de la medida 30 menos el de la 1 es de 5800 ms o menos

### Requirement: CAL-11 Auto-captura
La captura MUST dispararse cuando `framesConsecutivos` resultados seguidos tienen score >= `umbralListo`; un resultado por debajo reinicia la cuenta. El frame capturado a resolución completa MUST revalidarse con el mismo cálculo y la misma guía; si no alcanza el umbral, la cuenta vuelve a 0 y el análisis continúa.

#### Scenario: Secuencia con interrupción
- **WHEN** con `umbralListo` 70 y `framesConsecutivos` 3 llegan los scores 80, 75, 60, 90, 91 y 92
- **THEN** las cuentas son 1, 2, 0, 1, 2 y 3, y la captura se solicita tras el sexto resultado y en ningún momento anterior

#### Scenario: Límites del umbral
- **WHEN** con los mismos umbrales llegan 70, 70, 70 en una secuencia y 69, 100, 100 en otra
- **THEN** en la primera se solicita la captura tras el tercer resultado; en la segunda no se solicita y las cuentas son 0, 1 y 2

#### Scenario: Revalidación fallida y posterior éxito
- **WHEN** tras solicitar la captura la revalidación da score 65, después llegan 88, 89 y 90, y la segunda revalidación da 85
- **THEN** tras la primera revalidación la cuenta es 0 y la pantalla sigue en `activo`; tras la segunda, la pantalla es `listo` y la captura aceptada tiene `calidad.score` 85

#### Scenario: Nunca captura sin la racha completa
- **WHEN** fast-check genera secuencias de 1 a 50 scores enteros entre 0 y 100, al menos 1000 casos, con al menos el 50 % de los casos conteniendo una racha de 3 scores >= 70
- **THEN** cada solicitud de captura ocurre justo después de 3 resultados consecutivos >= 70 posteriores al último reinicio

#### Scenario: Vídeo desenfocado nunca llega a listo
- **WHEN** con el vídeo `desenfocada-1080p` se esperan 30 medidas `calidad:frame`
- **THEN** `data-pantalla` sigue en `activo`

### Requirement: CAL-12 Feedback en tiempo real
La región de estado MUST mostrar el texto de la situación vigente según el escenario "Textos". Salvo "Listo", que es inmediato, el texto MUST cambiar solo cuando la nueva situación se repite en 2 resultados consecutivos.

#### Scenario: Textos
- **WHEN** la situación es: sin resultados aún, `acerca`, `oscuro`, `sobreexpuesto`, `reflejo`, `desenfocado`, motivo `null` sin la racha completa, y captura aceptada
- **THEN** los textos son, en ese orden, "Ubica la cédula dentro del recuadro", "Acerca la cédula", "Busca un lugar con más luz", "Hay demasiada luz", "Hay reflejo, inclina la cédula", "Desenfocado, mantén la cámara quieta", "No te muevas" y "Listo"

#### Scenario: Histéresis
- **WHEN** llegan resultados con motivos `reflejo`, `reflejo`, `desenfocado`, `reflejo`, `desenfocado`, `desenfocado`
- **THEN** los textos tras cada resultado son "Ubica la cédula dentro del recuadro", "Hay reflejo, inclina la cédula", "Hay reflejo, inclina la cédula", "Hay reflejo, inclina la cédula", "Hay reflejo, inclina la cédula" y "Desenfocado, mantén la cámara quieta"

#### Scenario: Feedback con cada vídeo
- **WHEN** se pulsa "Iniciar cámara" en los dos dispositivos con los vídeos `desenfocada-1080p`, `reflejo-1080p`, `sobreexpuesta-1080p`, `oscura-1080p` y `nitida-1080p`
- **THEN** la región de estado llega, respectivamente, a "Desenfocado, mantén la cámara quieta", "Hay reflejo, inclina la cédula", "Hay demasiada luz", "Busca un lugar con más luz" y "Listo"

### Requirement: CAL-13 Tiempo hasta listo
Con el vídeo `nitida-1080p`, el tiempo desde la pulsación de "Iniciar cámara" hasta la pantalla `listo` MUST tener p95 de 3000 ms o menos y mediana de 2000 ms o menos en 20 ejecuciones por dispositivo, y MUST publicarse en un reporte que solo contiene tiempos.

#### Scenario: Medición y umbral
- **WHEN** en cada uno de los dos dispositivos se ejecuta 20 veces, recargando la página entre ejecuciones, el flujo hasta `listo` y se lee la medida `captura:tiempo-a-listo` de `performance`
- **THEN** el p95 por rango más cercano (posición 19 de las 20 muestras ordenadas) es de 3000 ms o menos y la mediana (media de las posiciones 10 y 11) es de 2000 ms o menos

#### Scenario: Reporte sin datos de imagen
- **WHEN** termina la medición
- **THEN** existe `reports/captura/tiempo-a-listo-<proyecto>.json` con exactamente las claves `video`, `proyecto`, `n`, `muestrasMs`, `medianaMs`, `p95Ms` y `fecha`, con `n` igual a 20 y `muestrasMs` de longitud 20

### Requirement: CAL-14 Interfaz de detector de documento
El paquete MUST exponer una interfaz de detector de documento (firma en design.md, decisión 7) y un detector por defecto que devuelve la guía con `fuente: "guia"`. Con otro detector, su cuadrilátero MUST delimitar M; si no encuentra documento, el resultado MUST ser score 0, motivo `acerca` y métricas `null`.

#### Scenario: Detector por defecto
- **WHEN** el detector por defecto procesa un frame de análisis de 640x360 reducido desde un frame de 1920x1080 (la guía se calcula en el frame original según CAM-08 y se escala por 1/3, sin redondear)
- **THEN** devuelve `{ "cuadrilatero": [[190/3, 18], [1731/3, 18], [1731/3, 342], [190/3, 342]], "confianza": null, "fuente": "guia" }`, con tolerancia de 1e-9 por coordenada

#### Scenario: Detector sustituto delimita las métricas
- **WHEN** en Chromium real (Vitest browser) el Worker analiza un frame gris 128 de 100x100 con bloque 255 en [70..89]x[40..59] usando un detector de prueba que devuelve rect (0,0)-(50,100) y, aparte, uno que devuelve el cuadrilátero completo, ambos con `fuente: "modelo"`
- **THEN** con rect (0,0)-(50,100) el subscore de reflejo es 100 y `metricas.tamano` es `{ "ratio": 0.5, "subscore": 100 }`; con el completo el subscore de reflejo es 0

#### Scenario: Documento no encontrado
- **WHEN** el detector de prueba devuelve `{ "cuadrilatero": null, "confianza": 0.1, "fuente": "modelo" }`
- **THEN** el resultado es exactamente `{ "score": 0, "motivo": "acerca", "metricas": null }`

#### Scenario: Contrato de tipos
- **WHEN** se ejecuta la comprobación de tipos de Vitest sobre `packages/capture`
- **THEN** una clase con `id` y `detectar` compatibles satisface la interfaz y una sin `detectar` produce un error esperado (`@ts-expect-error`)

### Requirement: CAL-15 Interfaz de lector de códigos
El paquete MUST exponer una interfaz de lector de códigos (firma en design.md, decisión 7) que recibe una captura aceptada y devuelve los bytes crudos de cada código. Su formato MUST admitir solo `"pdf417"`, porque el QR de la cédula digital no se decodifica (principio V). En este cambio ningún componente la implementa ni la invoca.

#### Scenario: Contrato de tipos
- **WHEN** se ejecuta la comprobación de tipos de Vitest sobre `packages/capture`
- **THEN** un lector que declara el formato `"pdf417"` y devuelve `Uint8Array` satisface la interfaz, y uno que declara `"qr"` produce un error esperado (`@ts-expect-error`)

#### Scenario: Ningún decodificador en este cambio
- **WHEN** se registran las peticiones del flujo completo hasta `listo` con `nitida-1080p`
- **THEN** ninguna ruta contiene `zxing`, `barcode` ni termina en `.wasm`
