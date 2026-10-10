# Spec Delta

## Purpose

SDK móvil nativo y headless (Android Kotlin/CameraX, iOS Swift/AVFoundation, plugin Capacitor, hook React Native) para leer la cédula colombiana con cámara nativa, offline y sin persistir imágenes, con las reglas de negocio en un único bundle TypeScript compartido con la web.

Convenciones de esta spec (aplican a todos los escenarios):

- `EstadoLector`, `TRANSICIONES`, códigos de error y `envio` son los de `sdk-integracion` (SDK-27, SDK-28, SDK-38, SDK-41 a SDK-44), sin cambios.
- Fixtures sintéticos: imágenes `amarilla-1080p.png`, `digital-1080p.png` y `pasaporte-1080p.png` y sus vídeos de `e2e/videos/sinteticos/` (`PERSONA_BASE`: NUIP `9999123456`, nombre `PRUEBA EJEMPLO FICTICIA LUZ`). Ningún dato real.
- `FuenteFrames` = interfaz inyectable del núcleo nativo que entrega frames de luminancia; `FuenteFramesFalsa` entrega una lista fija de imágenes; `FuenteFramesVideo` decodifica un vídeo sintético (simulador iOS sin cámara).
- `REF` = dispositivo de gama media de referencia (pregunta abierta 1 en `design.md`).
- Sin hipótesis de formato nuevas; las de los parsers (`docs/decisiones/hipotesis-formato.md`) llegan en `warnings[]` por el bundle JS.

## ADDED Requirements

### Requirement: NAT-01 Núcleo nativo con el mismo modelo de estado
El núcleo nativo de Android y de iOS SHALL exponer un `Lector` con `iniciar(fuente?)`, `cancelar()`, `reintentar()`, `destruir()` y el estado `EstadoLector` con las mismas fases, `TRANSICIONES`, campos y códigos de error que SDK-27 y SDK-28. Las transiciones MUST calcularse con `transicion()` del bundle `nucleo-js` (NAT-07), no con una tabla nativa. `resultado.confiable` MUST ser siempre `false`.

#### Scenario: Flujo feliz con frames falsos
- **WHEN** se crea un `Lector` sin servidor con `FuenteFramesFalsa` que entrega una imagen negra (score bajo) y luego tres veces `amarilla-1080p.png`, y se llama `iniciar`
- **THEN** la secuencia de `fase` observada es exactamente `["permiso", "activo", "listo", "leyendo", "resultado"]`, `resultado.campos.nuip` es `"9999123456"`, `resultado.confiable` es `false` y `resultado.validacion_id` es `null`

#### Scenario: Permiso denegado
- **WHEN** la fuente falsa informa permiso de cámara denegado
- **THEN** la secuencia es `["permiso", "error"]` y `error.codigo` es `"camara-denegada"` con `mensaje` no vacío

#### Scenario: Fallo del análisis de calidad
- **WHEN** en fase `activo` el analizador de calidad lanza una excepción
- **THEN** la secuencia termina en `activo→error`, `error.codigo` es `"calidad-error"` y la fuente de frames quedó cerrada

#### Scenario: Secuencias arbitrarias
- **WHEN** se generan (Kotest property en Kotlin, fast-check sobre el bundle) secuencias de hasta 50 eventos entre `iniciar`, `cancelar`, `reintentar`, `destruir`, frames, éxito y fallo
- **THEN** cada par consecutivo de fases pertenece a `TRANSICIONES` y ninguna llamada lanza

### Requirement: NAT-02 Cámara nativa de alta resolución
El núcleo SHALL abrir la cámara trasera a 1920x1080 o más, con enfoque automático continuo centrado en la guía, y SHALL exponer `linterna(encendida: Boolean)`. Al `cancelar`, `destruir` o pasar a `error`, la cámara MUST liberarse.

#### Scenario: Resolución mínima
- **WHEN** en el emulador Android API 34 con cámara `videofile` se llama `iniciar`
- **THEN** el primer frame de análisis tiene ancho >= 1920 y alto >= 1080

#### Scenario: Enfoque continuo
- **WHEN** la cámara pasa a `activo`
- **THEN** en Android se envió una `FocusMeteringAction` sin cancelación automática con el punto en el centro de `guia`; en iOS `focusMode` es `.continuousAutoFocus`

#### Scenario: Linterna
- **WHEN** se llama `linterna(true)` y luego `linterna(false)` en un dispositivo con flash (o su fuente falsa)
- **THEN** el control de cámara recibió `enableTorch(true)` y `enableTorch(false)` en ese orden; sin flash, `linterna(true)` no lanza y no cambia `fase`

#### Scenario: Liberación
- **WHEN** se llama `cancelar()` en fase `activo`
- **THEN** la fase es `inicio` y la cámara está cerrada (`CameraX` sin casos de uso vinculados; `AVCaptureSession.isRunning` `false`)

#### Scenario: Cancelación de la corrutina en Kotlin
- **WHEN** en Kotlin se cancela la corrutina que ejecuta `iniciar` mientras la fuente se abre (`permiso`) o entrega frames (`activo`)
- **THEN** el efecto es el de `cancelar()`: la fase es `inicio` y la fuente de frames quedó cerrada

### Requirement: NAT-03 Calidad nativa con paridad web
El núcleo SHALL calcular un `score` 0-100 y un `motivo` (`oscuro`, `sobreexpuesto`, `reflejo`, `desenfocado`, `acerca` o `null`) sobre la luminancia reducida a 640 px de lado largo, con los umbrales por omisión de CAL-08 leídos de un JSON generado desde `packages/capture/src/calidad/umbrales.ts`. Para la misma imagen, la diferencia con `packages/capture` MUST ser <= 2 puntos y el `motivo` MUST coincidir.

#### Scenario: Imagen nítida
- **WHEN** se analiza `amarilla-1080p.png`
- **THEN** `score` >= 70 y `motivo` es `null`

#### Scenario: Imagen oscura
- **WHEN** se analiza `amarilla-1080p.png` con el brillo multiplicado por 0,1
- **THEN** `motivo` es `"oscuro"` y `score` < 70

#### Scenario: Reflejo
- **WHEN** se analiza `amarilla-1080p.png` con un disco de luminancia 255 que cubre el 15 % del cuadrilátero
- **THEN** `motivo` es `"reflejo"`

#### Scenario: Desenfoque
- **WHEN** se analiza `amarilla-1080p.png` con desenfoque gaussiano sigma 6 (en píxeles del frame 1920x1080)
- **THEN** en el score de CAL-07 `motivo` es `"desenfocado"` y `score` < 70

#### Scenario: Desenfoque con documento presente (captura guiada)
- **WHEN** se evalúa esa misma imagen como el Lector, con la presencia guiada de OFF-22/OFF-25 (documento presente y varianza del Laplaciano >= `laplacianoMinimoGuiado`)
- **THEN** `score` es exactamente `umbralListo` y `motivo` es `null`, igual que `packages/capture` en Node para la misma imagen; con sigma 10 `motivo` es `"desenfocado"`

#### Scenario: Paridad con la web
- **WHEN** se analizan con el núcleo nativo y con `packages/capture` en Node los fixtures de calidad de `e2e/videos/sinteticos/`
- **THEN** para el 100 % de las imágenes `|score_nativo - score_ts| <= 2` y el `motivo` es idéntico

### Requirement: NAT-04 Presencia de documento y guía
El núcleo SHALL detectar si hay un documento en la guía y SHALL publicar `guia` en coordenadas del frame y normalizadas (0..1) como SDK-28. Sin documento, la fase MUST NOT pasar a `listo`.

#### Scenario: Guía normalizada
- **WHEN** el frame es 1920x1080 y la guía es `{ x: 192, y: 216, ancho: 1536, alto: 648 }`
- **THEN** `estado.guia.normalizada` es `{ x: 0.1, y: 0.2, ancho: 0.8, alto: 0.6 }`

#### Scenario: Sin documento
- **WHEN** la fuente entrega 30 frames del vídeo `sin-documento-1080p`
- **THEN** la fase permanece `activo` y `estado.calidad.motivo` es `"acerca"`

#### Scenario: Documento presente
- **WHEN** la fuente entrega 3 frames de `amarilla-1080p.png`
- **THEN** la fase pasa a `listo`

### Requirement: NAT-05 PDF417 nativo con zxing-cpp
El núcleo SHALL decodificar el PDF417 con zxing-cpp (binding nativo) habilitando solo el formato `PDF417`, sobre el recorte a resolución completa, y SHALL entregar los bytes crudos al bundle JS (`procesarPdf417`). MUST NOT decodificar códigos QR (principio V). Los bytes MUST NOT registrarse en logs.

#### Scenario: Amarilla sintética
- **WHEN** se decodifica `amarilla-1080p.png`
- **THEN** los bytes son idénticos a los que produce `decodificarPdf417Imagen` de `packages/capture` sobre la misma imagen, y `procesarPdf417` devuelve `campos.nuip` `"9999123456"`

#### Scenario: QR de la digital ignorado
- **WHEN** se decodifica el anverso sintético de la digital, que contiene un QR
- **THEN** el decodificador no devuelve ningún resultado y la configuración de formatos contiene exactamente `["PDF417"]`

#### Scenario: Robustez metamórfica
- **WHEN** se decodifica `amarilla-1080p.png` rotada ±3°, con blur sigma 1 o brillo ±20 %
- **THEN** los bytes son idénticos a los de la imagen original o no hay resultado; nunca un NUIP distinto

#### Scenario: Sin datos en logs
- **WHEN** se captura Logcat (Android) u `OSLog` (iOS) durante la decodificación de `amarilla-1080p.png`
- **THEN** ninguna línea contiene `9999123456` ni `PRUEBA`

#### Scenario: Un intento por frame con las opciones de la web
- **WHEN** el núcleo decodifica un frame
- **THEN** hace una sola lectura del frame completo a resolución completa, en luminancia `aGris` (BT.601 entera con el redondeo de `Math.round`), con las opciones efectivas del intento `original` de `decodificarPdf417Imagen` (`tryHarder`, `tryRotate`, `tryInvert`, `tryDownscale`, `maxNumberOfSymbols` 1); si no hay un PDF417 válido no hay lectura de ese frame y el lector sigue con el siguiente; la luminancia y los bytes no entregados quedan a cero

#### Scenario: Dependencia admitida por coordenada exacta
- **WHEN** `privacidad-check` (OD-40) revisa `native/**/build.gradle.kts`
- **THEN** admite `io.github.zxing-cpp:android` solo por esa coordenada exacta y sigue fallando ante cualquier otra dependencia que contenga `zxing`

### Requirement: NAT-06 MRZ nativa con Tesseract
El núcleo SHALL leer MRZ TD1 (cédula digital, tarjeta de identidad) y TD3 (pasaporte) con Tesseract nativo y el mismo `mrz.traineddata` (BSD-3) que la web, aplicando localización de franja, enderezado y el plan de vistas y giros de `lectura-mrz-imagen` (LMI-11x, LMI-12c, LMI-14x). SHALL entregar las líneas crudas a `procesarMrz` del bundle JS. Las líneas MUST coincidir con las de `packages/capture` para los mismos fixtures.

#### Scenario: Digital TD1
- **WHEN** se lee `digital-1080p.png`
- **THEN** `estado.contenido` es `"mrz-td1"` y `resultado.campos.nuip` es `"9999123456"`

#### Scenario: Pasaporte TD3
- **WHEN** se lee `pasaporte-1080p.png`
- **THEN** `estado.contenido` es `"mrz-td3"` y las dos líneas tienen 44 caracteres

#### Scenario: Giro de 180°
- **WHEN** se lee `digital-1080p.png` girada 180°
- **THEN** el resultado es idéntico al de la imagen sin girar

#### Scenario: Paridad de líneas
- **WHEN** se leen con el núcleo nativo y con `packages/capture` en Node todos los fixtures MRZ de `evals/` sintéticos
- **THEN** las líneas MRZ son idénticas en el 100 % de los casos

#### Scenario: Mismo modelo
- **WHEN** se calcula el SHA-256 del `mrz.traineddata` empaquetado en el AAR y en el XCFramework
- **THEN** coincide con el de `@lector-cedula/web/assets/manifest.json`

### Requirement: NAT-07 Reglas en un único bundle JS
`@lector-cedula/nucleo-js` SHALL ser un único IIFE ES2020 sin DOM ni E/S que expone `globalThis.LectorCedulaNucleo` (`version`, `procesarPdf417`, `procesarMrz`, `transicion`, `crearEstado`, `validarOpciones`, síncronos, JSON), construido por importación desde `packages/parsers`, `packages/capture/src/lectura` y `packages/web`. El código Kotlin y Swift MUST NOT contener reglas de campos (NUIP, fechas, RH, sexo, DIVIPOL, checksums, edad). Motores: Hermes, WebView, QuickJS y JavaScriptCore.

#### Scenario: Sin globals de navegador
- **WHEN** se evalúa el bundle con `node:vm` en un contexto sin `window`, `document`, `fetch` ni `XMLHttpRequest`
- **THEN** no lanza y `LectorCedulaNucleo.version` es igual a `version` de `packages/nucleo-js/package.json`

#### Scenario: Igualdad entre motores
- **WHEN** se llama `procesarPdf417` y `procesarMrz` con los bytes y líneas de todos los fixtures sintéticos en Node, QuickJS (JUnit) y JavaScriptCore (XCTest)
- **THEN** las tres salidas JSON son idénticas byte a byte

#### Scenario: Sin reglas en nativo
- **WHEN** se analizan las fuentes `native/**/*.kt` y `native/**/*.swift`
- **THEN** no aparecen las cadenas `"AB+"`, `"O-"`, `calcularDigitoVerificador`, `checksum`, `divipol` ni `mayorDeEdad` fuera de pruebas

#### Scenario: Errores pasados
- **WHEN** se procesan los payloads sintéticos de errores pasados (RH `AB+` y `O-`, sexo `F` con `M` en el nombre, Ñ, orden de apellidos) en QuickJS y JavaScriptCore
- **THEN** los campos coinciden con los literales de la skill `formato-cedula` y con la salida en Node

### Requirement: NAT-08 Contrato con la CLI
Para la misma imagen sintética, el resultado del núcleo nativo (`tipo`, `campos`, `warnings`) MUST ser idéntico al de `npm run leer-foto -- --sin-mascara` con la misma `--fecha-referencia`.

#### Scenario: Igualdad con la CLI
- **WHEN** `npm run nativo:contrato` compara los volcados de `KJ` y `SX` con la CLI sobre `amarilla-1080p.png`, `digital-1080p.png` y `pasaporte-1080p.png` con `--fecha-referencia 2026-10-09`
- **THEN** los tres pares son iguales con igualdad estricta, y un volcado alterado en un carácter hace fallar el comando con código distinto de 0

### Requirement: NAT-09 Plugin Capacitor con la API web
`@lector-cedula/capacitor` SHALL exportar `crearLector(opciones, avanzado?)` con la misma firma, `OpcionesLector`, `ControladorLector` y `EstadoLector` que `@lector-cedula/web`, implementado como `DependenciasLector` nativas para el núcleo web. `iniciar` SHALL aceptar cualquier `HTMLElement` cuyo rectángulo define dónde va la vista previa. Fuera de Android e iOS (web), MUST delegar en `@lector-cedula/web`.

#### Scenario: Misma API
- **WHEN** se compilan con `tsc` los tipos públicos de `@lector-cedula/capacitor` contra los de `@lector-cedula/web`
- **THEN** `OpcionesLector`, `EstadoLector` y `ControladorLector` son mutuamente asignables

#### Scenario: Flujo con puente falso
- **WHEN** el puente nativo falso emite permiso concedido, calidad 40, 90, 90, 90 y los bytes PDF417 de `PERSONA_BASE`
- **THEN** la secuencia de fases es `["permiso", "activo", "listo", "leyendo", "resultado"]` y `resultado.campos.nuip` es `"9999123456"`

#### Scenario: Rectángulo de la preview
- **WHEN** se llama `iniciar(div)` con un `div` en `{ x: 10, y: 20, width: 300, height: 400 }` CSS px y `devicePixelRatio` 2
- **THEN** el puente recibió `{ x: 20, y: 40, ancho: 600, alto: 800 }` en píxeles físicos

#### Scenario: Plataforma web
- **WHEN** `Capacitor.getPlatform()` es `"web"`
- **THEN** `crearLector` usa `@lector-cedula/web` y el puente nativo no recibe llamadas

### Requirement: NAT-10 Hook React Native
`@lector-cedula/react-native` SHALL exportar `useLectorCedula(opciones, avanzado?)` con el mismo retorno que `@lector-cedula/react` (`estado`, `iniciar`, `cancelar`, `reintentar`, `lector`) y el componente `VistaCamara`, sobre un módulo nativo propio (TurboModule y vista Fabric) que envuelve el núcleo NAT-01. MUST NOT depender de `react-native-vision-camera`. Al desmontar, el lector MUST destruirse.

#### Scenario: Estado inicial
- **WHEN** se renderiza un componente que llama `useLectorCedula({})` con el módulo nativo falso
- **THEN** `estado.fase` es `"inicio"` y `estado.resultado` es `null`

#### Scenario: Resultado
- **WHEN** el módulo falso emite la secuencia del flujo feliz de NAT-01
- **THEN** el componente se re-renderiza con `estado.fase` `"resultado"` y `estado.resultado.campos.nuip` `"9999123456"`

#### Scenario: Desmontaje
- **WHEN** se desmonta el componente en fase `activo`
- **THEN** el módulo falso recibió `destruir` una vez

#### Scenario: Sin VisionCamera
- **WHEN** se lee `packages/react-native/package.json`
- **THEN** `dependencies` y `peerDependencies` no contienen `react-native-vision-camera`

### Requirement: NAT-11 Librerías Kotlin y Swift
La librería Android (`co.lectorcedula:lector-cedula-android`) SHALL exponer `Lector(contexto, opciones)` con `estado: StateFlow<EstadoLector>`, y la iOS (`LectorCedula`, SwiftPM) `Lector(opciones)` como `ObservableObject` con `@Published var estado` y `var estados: AsyncStream<EstadoLector>`. Ambas SHALL exponer `leerDocumento(imagen)` sin cámara. Su API pública MUST estar registrada (`apiDump` en Android) y un cambio no declarado MUST fallar.

#### Scenario: StateFlow
- **WHEN** en Kotlin se recogen los valores de `lector.estado` durante el flujo feliz de NAT-01
- **THEN** el último valor tiene `fase` `RESULTADO` y `resultado.campos["nuip"]` `"9999123456"`

#### Scenario: AsyncStream
- **WHEN** en Swift se itera `lector.estados` durante el flujo feliz de NAT-01
- **THEN** el último valor tiene `fase == .resultado` y `@Published estado` es igual a ese valor

#### Scenario: leerDocumento sin cámara
- **WHEN** se llama `leerDocumento` con `digital-1080p.png`
- **THEN** devuelve el mismo `ResultadoPresentacion` que la CLI (NAT-08) y no se abrió la cámara

### Requirement: NAT-12 Envío opcional con las reglas web
Con `servidor` y `sesion`, el núcleo nativo SHALL aplicar SDK-38 (resultado local primero, `envio` con sus códigos), SDK-42 (`upload.url` del mismo origen y segura), SDK-43 (menores sin envío salvo `enviarMenores`) y SDK-44 (copias a cero). La lógica de decisión (validación de opciones y de `upload.url`, regla de menores) MUST vivir en el bundle JS; el nativo solo hace la petición HTTP.

#### Scenario: Servidor caído
- **WHEN** con `servidor` `https://api.lector-cedula.example` y `sesion` válida el servidor falso rechaza la conexión y se lee `amarilla-1080p.png`
- **THEN** la fase es `resultado`, `resultado.validacion_id` es `null` y `envio` es `{"estado": "fallido", "codigo": "servidor-no-disponible"}`

#### Scenario: upload.url de otro origen
- **WHEN** `POST /v/{sesion}/inicio` responde `upload.url` `https://otro.example/subir`
- **THEN** solo hubo una petición y `envio` es `{"estado": "fallido", "codigo": "sesion-invalida"}`

#### Scenario: Menor sin envío
- **WHEN** el resultado tiene `tipoDocumento` `tarjeta-identidad` y no se pasa `enviarMenores`
- **THEN** no hay ninguna petición de subida y `envio` es `{"estado": "fallido", "codigo": "menor-no-enviado"}`

#### Scenario: Sesión sin servidor
- **WHEN** se crea el lector con `sesion` y sin `servidor`
- **THEN** la fase inicial es `error` con `error.codigo` `"opcion-invalida"` y `error.opcion` `"servidor"`

#### Scenario: Envío correcto
- **WHEN** el servidor falso acepta la subida y devuelve `id` `val_sintetico_01`
- **THEN** `envio.estado` pasa de `"enviando"` a `"enviado"` y `resultado.validacion_id` es `"val_sintetico_01"`

### Requirement: NAT-13 Privacidad y offline
El núcleo MUST NOT escribir imágenes, frames ni resultados en disco, caché, `SharedPreferences`, `UserDefaults` ni galería; MUST NOT abrir conexiones de red sin `servidor`; y SHALL funcionar sin red. El manifiesto de la librería Android MUST NOT declarar `INTERNET` (lo añade el integrador si usa `servidor`). Los búferes de luminancia y del envío MUST ponerse a cero al liberarse, también ante excepción.

#### Scenario: Sin archivos
- **WHEN** en el emulador se lista recursivamente `filesDir`, `cacheDir` y `externalCacheDir` de la app de ejemplo antes y después de leer `amarilla-1080p` sin servidor
- **THEN** no hay archivos nuevos ni modificados

#### Scenario: Sin red
- **WHEN** se lee `amarilla-1080p` en modo avión y sin `servidor`
- **THEN** la fase final es `resultado` y el contador de sockets de la app (`TrafficStats.getUidTxBytes`) no aumentó

#### Scenario: Manifiesto
- **WHEN** se lee el `AndroidManifest.xml` fusionado del AAR
- **THEN** solo declara `android.permission.CAMERA` y no contiene `android.permission.INTERNET`

#### Scenario: Búferes a cero
- **WHEN** se libera una captura una o dos veces, o el analizador lanza a mitad de un frame
- **THEN** todos los bytes de los búferes de luminancia y de envío son 0 y la segunda liberación no lanza

### Requirement: NAT-14 Rendimiento
En el dispositivo `REF`, el tiempo de `leyendo` a `resultado` SHALL tener p95 < 500 ms para la amarilla y p95 < 2000 ms para la digital, sobre 20 lecturas en caliente. En el emulador de CI se informa sin bloquear.

#### Scenario: Amarilla en gama media
- **WHEN** el benchmark lee 20 veces `amarilla-1080p` en `REF`
- **THEN** el p95 de `leyendo→resultado` es < 500 ms

#### Scenario: Digital en gama media
- **WHEN** el benchmark lee 20 veces `digital-1080p` en `REF`
- **THEN** el p95 de `leyendo→resultado` es < 2000 ms

#### Scenario: Informe en emulador
- **WHEN** corre `KI` en el emulador de CI
- **THEN** el informe JSON contiene `p95_amarilla_ms` y `p95_digital_ms` numéricos y el job no falla por su valor

### Requirement: NAT-15 ML Kit opcional y declarado
El núcleo MUST NOT depender de ML Kit. ML Kit SHALL ofrecerse solo en los complementos `lector-cedula-mlkit` y `LectorCedulaMLKit`, configurado solo con `PDF417` y usado como segundo intento después de zxing-cpp. Su README y `docs/sdk/nativo.md` MUST indicar que el integrador debe declararlo en su aviso de privacidad.

#### Scenario: Núcleo sin ML Kit
- **WHEN** se resuelve el árbol de dependencias de `lector-cedula-android` y `Package.resolved` de `LectorCedula`
- **THEN** no aparece ningún artefacto `com.google.mlkit` ni `GoogleMLKit`

#### Scenario: Segundo intento
- **WHEN** con el complemento instalado zxing-cpp no decodifica un frame y ML Kit falso sí
- **THEN** se usan los bytes de ML Kit y el resultado incluye `warnings` con `"pdf417-mlkit"`

#### Scenario: Solo PDF417 en ML Kit
- **WHEN** se inspecciona la configuración del escáner del complemento
- **THEN** los formatos son exactamente `[FORMAT_PDF417]`

### Requirement: NAT-16 Licencias y avisos
Toda dependencia nativa de producción MUST tener licencia de la lista permitida (principio IV) y figurar en `THIRD_PARTY_NOTICES` del AAR y del paquete SwiftPM con su licencia; `mrz.traineddata` con BSD-3 y DIVIPOL con CC BY-SA 4.0. Las dependencias solo de prueba se marcan como tales.

#### Scenario: Control de licencias nativo
- **WHEN** se ejecuta `npm run check:licencias` con un fixture de `build.gradle.kts` que añade una dependencia GPL-3.0
- **THEN** el comando termina con código distinto de 0 y nombra la dependencia; sin el fixture termina con 0

#### Scenario: Avisos completos
- **WHEN** se comparan las dependencias de producción resueltas con `THIRD_PARTY_NOTICES`
- **THEN** el 100 % aparece con su licencia, incluidos zxing-cpp, Tesseract, Leptonica, QuickJS y `mrz.traineddata`

### Requirement: NAT-17 Humo en emulador y simulador
Cada plataforma SHALL tener una prueba de humo automática que lea los tres documentos sintéticos sin red: Android en emulador con cámara simulada por vídeo y iOS en simulador con `FuenteFramesVideo`.

#### Scenario: Emulador Android
- **WHEN** `KH` arranca el emulador con `-camera-back videofile:` de `amarilla-1080p`, `digital-1080p` y `pasaporte-1080p` (uno por ejecución) en modo avión
- **THEN** la app de ejemplo muestra `9999123456` en el elemento con `contentDescription` `nuip` para la amarilla y la digital, y `mrz-td3` para el pasaporte

#### Scenario: Simulador iOS
- **WHEN** `SH` ejecuta el ejemplo con `FuenteFramesVideo` de los mismos tres vídeos
- **THEN** el elemento con `accessibilityIdentifier` `nuip` muestra `9999123456` para la amarilla y la digital, y `contenido` muestra `mrz-td3` para el pasaporte

### Requirement: NAT-18 Presupuesto de tamaño
El bundle `nucleo-js` MUST pesar <= 409 600 B gzip. El AAR y el XCFramework SHALL informarse y MUST NOT crecer más de 10 % frente a la versión anterior sin decisión humana.

#### Scenario: Bundle en presupuesto
- **WHEN** `npm run check:tamano-nativo` mide el bundle real y un fixture de 409 601 B
- **THEN** el real pasa con código 0 y el fixture falla con código distinto de 0

#### Scenario: Crecimiento de artefactos
- **WHEN** el informe anterior registra un AAR de 10 000 000 B y el actual mide 11 000 001 B
- **THEN** el comando falla y nombra el artefacto

### Requirement: NAT-19 SDK headless
El SDK nativo MUST NOT dibujar UI propia: lo único visual SHALL ser la vista previa de cámara sin decoración que el integrador posiciona y dimensiona (`<VistaCamara lector={...} />` en React Native, `PreviewView` o el composable `VistaCamara` en Android, `VistaCamaraUIView` con solo `AVCaptureVideoPreviewLayer` en iOS). En Capacitor la preview SHALL ir detrás de una WebView transparente. Los ejemplos SHALL tener UI distinta por plataforma.

#### Scenario: Android solo con la preview
- **WHEN** Espresso inspecciona la jerarquía de `VistaCamara` en fase `activo`
- **THEN** contiene exactamente una `PreviewView` y ninguna `TextView`, `Button`, `ImageView` ni vista con fondo propio

#### Scenario: iOS solo con la capa de preview
- **WHEN** XCTest inspecciona `VistaCamaraUIView` en fase `activo`
- **THEN** `subviews` está vacío y `layer.sublayers` contiene exactamente un `AVCaptureVideoPreviewLayer`

#### Scenario: React Native sin hijos ni estilos propios
- **WHEN** se renderiza `<VistaCamara lector={lector} style={{ width: 300, height: 400 }} />` con el módulo falso
- **THEN** la vista nativa recibe `style` igual a `{ width: 300, height: 400 }` y no tiene hijos

#### Scenario: Capacitor detrás de la WebView
- **WHEN** en el humo `CP` la app de ejemplo está en fase `activo`
- **THEN** la WebView tiene fondo transparente y está por encima de la preview en el orden de dibujo, el HTML del integrador (`[data-prueba="guia"]`) es visible y la jerarquía nativa no contiene vistas del SDK distintas de la preview

#### Scenario: UI distinta por plataforma
- **WHEN** se comparan los `estilo-esperado.json` (color de guía, fuente, posición del texto de estado) de `examples/android-compose`, `examples/ios-swiftui`, `examples/react-native` y `examples/ionic-nativo`, medidos en el humo
- **THEN** las cuatro tuplas son distintas dos a dos
