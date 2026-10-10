# Design: sdk-nativo

## Contexto

`sdk-integracion` entrega un núcleo headless web (`@lector-cedula/web`) con adaptadores y deja a las apps nativas el flujo alojado o la WebView. El usuario decidió (2026-10-09) un SDK nativo además de la WebView. Esta máquina es Windows sin Android Studio ni macOS: todo lo Android corre en Docker o en CI; todo lo iOS en GitHub Actions macOS.

## Decisiones

### 1. Dónde viven las reglas: un bundle JS único (`@lector-cedula/nucleo-js`)

Opciones evaluadas para Kotlin y Swift puros:

| Opción | Lugar de verdad | Coste | Riesgo |
|---|---|---|---|
| Port de parsers a Kotlin y Swift | Tres (TS, Kotlin, Swift) | Alto, cada cambio de formato se triplica | Divergencia silenciosa en NUIP, RH, Ñ (errores pasados) |
| Port mínimo (solo checksums) y resto en servidor | Dos | Medio | Contradice offline total |
| **Motor JS embebido que ejecuta el mismo bundle** | **Uno** | Bajo; +~1 MB por QuickJS en Android, 0 en iOS (JavaScriptCore del sistema) | Rendimiento del parser en intérprete: medido en NAT-14 |

Se elige el motor embebido. `packages/nucleo-js` compila con esbuild (MIT, ya transitiva) a un único IIFE ES2020 sin DOM ni `fetch` que expone `globalThis.LectorCedulaNucleo = { version, procesarPdf417(bytesBase64, opciones), procesarMrz(lineas, opciones), transicion(fase, evento), crearEstado(), validarOpciones(opciones) }`, todos síncronos y con entrada/salida JSON. Contiene `packages/parsers` (incluido DIVIPOL), reglas de edad y máscara de `packages/capture/src/lectura` y `maquina.ts`/`estado.ts` de `packages/web`, importados, no copiados.

- React Native: el bundle se importa como módulo JS normal y corre en Hermes.
- Capacitor: corre en la WebView (es el mismo `@lector-cedula/web`; el plugin solo sustituye las dependencias de cámara y decodificación).
- Kotlin puro: QuickJS embebido (motor MIT) con un único contexto por `Lector`, creado en un hilo propio.
- Swift puro: `JavaScriptCore` del sistema, un `JSContext` por `Lector`.

El núcleo nativo nunca interpreta campos: entrega `bytes` del PDF417 o las líneas MRZ crudas, y presenta lo que devuelve el bundle. El binding de QuickJS para Android se elige en la tarea 1.1 con `revisor-licencias` (candidatos con licencia MIT o Apache-2.0); si ninguno pasa, se compila QuickJS con JNI propio (pregunta abierta 2).

### 2. Procesamiento de imagen en nativo, con prueba diferencial

Calidad (nitidez por varianza del Laplaciano, exposición por histograma, reflejo por saturación), presencia de documento, localización de la franja MRZ, enderezado y plan de vistas (LMI-11x, LMI-12c, LMI-14x) son procesamiento de imagen, no reglas de negocio: se implementan en Kotlin/Swift por velocidad, con los mismos umbrales por omisión de CAL-08 (`docs/decisiones/2026-10-06-umbrales-calidad-captura.md`), leídos de un JSON generado desde `packages/capture/src/calidad/umbrales.ts` (un solo origen de valores). La paridad se exige con prueba diferencial contra `packages/capture` en Node sobre los mismos fixtures (NAT-03, NAT-06).

### 3. Cámara

- Android: CameraX `Preview` + `ImageAnalysis` (`STRATEGY_KEEP_ONLY_LATEST`, YUV_420_888) a 1920x1080 o superior; análisis de calidad sobre la luminancia reducida a 640 px de lado largo (CAL-01); decodificación sobre el recorte a resolución completa; `FocusMeteringAction` continuo centrado en la guía; `CameraControl.enableTorch`.
- iOS: `AVCaptureSession` preset `.hd1920x1080` o `.hd4K3840x2160` si el código queda bajo 1156 px de ancho; `focusMode = .continuousAutoFocus`, `torchMode`.
- Solo el plano Y (luminancia) se copia; el búfer se libera al terminar cada frame y las copias se ponen a cero (SDK-44).

### 3b. Headless (requisito explícito del usuario, 2026-10-09; NAT-19)

El SDK nativo es headless igual que el web: el integrador dibuja toda la UI. Lo único visual que expone es la vista previa de cámara sin decoración, que el integrador posiciona y dimensiona: `<VistaCamara lector={...} />` en React Native, `PreviewView` (y el composable `VistaCamara(lector, modifier)`) en Android, `AVCaptureVideoPreviewLayer` envuelta en `VistaCamaraUIView` en iOS. Ningún overlay, guía, texto, botón, color ni animación del SDK. En Capacitor la vista previa nativa se renderiza DETRÁS de la WebView transparente; el HTML/CSS del integrador queda encima. El estado se expone con el mismo modelo que la web: hook en RN y Capacitor, `StateFlow<EstadoLector>` en Kotlin, `@Published var estado` y `AsyncStream<EstadoLector>` en Swift.

### 4. React Native: módulo propio, no VisionCamera

Usar VisionCamera supondría una segunda implementación de cámara (y de calidad) distinta del núcleo Kotlin/Swift que usan Capacitor y las librerías puras, y rompería la paridad. `@lector-cedula/react-native` es un módulo de Nueva Arquitectura (TurboModule + Fabric view) que envuelve el mismo núcleo nativo; el hook `useLectorCedula` replica la firma de `@lector-cedula/react` y su estado lo produce la máquina del bundle JS en Hermes.

### 5. Capacitor: vista nativa bajo la WebView

`@lector-cedula/capacitor` registra un `DependenciasLector` para `@lector-cedula/web` cuyas cámara y lectores llaman al plugin. La vista previa nativa se dibuja detrás de la WebView transparente en el rectángulo que indica el integrador (`iniciar(elemento)` mide el `getBoundingClientRect` del elemento). La API pública es exactamente `crearLector(opciones)` de la web; `iniciar` acepta un `HTMLElement` cualquiera además de `HTMLVideoElement`. No se depende de `@capgo/camera-preview`.

### 6. Sin QR, PDF417 solamente

zxing-cpp se configura con `BarcodeFormat.PDF417` únicamente; el QR de la cédula digital no se decodifica (principio V). ML Kit, si el integrador lo añade, se configura con `FORMAT_PDF417` únicamente y solo como segundo intento tras zxing-cpp (skill `captura-movil`).

### 7. Distribución

- Android: AAR `co.lectorcedula:lector-cedula-android` (núcleo + QuickJS + bundle en `assets/`), `minSdk` 24, ABI `arm64-v8a`, `armeabi-v7a`, `x86_64`. Complemento `co.lectorcedula:lector-cedula-mlkit`.
- iOS: paquete SwiftPM `LectorCedula` con `XCFramework` binario de Tesseract/Leptonica y zxing-cpp, iOS 15+. Complemento `LectorCedulaMLKit`.
- Los paquetes npm (`capacitor`, `react-native`) llevan los binarios por referencia a esos artefactos; la publicación queda fuera de alcance y requiere confirmación humana.

### 8. CI sin Android Studio ni macOS local

- `docker/android-sdk/Dockerfile`: imagen fijada por digest con JDK 21 (Temurin, GPL+CE solo como herramienta, no se redistribuye), `cmdline-tools`, `platforms;android-36`, NDK fijado y CMake. Corre `./gradlew assemble testDebugUnitTest lint` desde Windows con `docker run`.
- Emulador: no hay KVM anidado en Docker Desktop sobre Windows. Las pruebas instrumentadas y el humo corren en GitHub Actions `ubuntu-24.04` con KVM y `reactivecircus/android-emulator-runner` (Apache-2.0) fijado por SHA; cámara simulada con `-camera-back videofile:` o `imagefile:` desde los vídeos sintéticos de `e2e/videos`.
- iOS: GitHub Actions `macos-15` con `xcodebuild test` en simulador. El simulador no tiene cámara: el núcleo expone `FuenteFrames` inyectable y el humo usa una fuente de prueba que lee los fotogramas del vídeo sintético (skill `estrategia-pruebas`, "Cámara en cada plataforma").

## Hipótesis

Este cambio no introduce hipótesis de formato nuevas. Las de los parsers siguen en `docs/decisiones/hipotesis-formato.md` y llegan en `warnings[]` porque el bundle JS es el mismo parser. Hipótesis técnicas (no de formato), a confirmar por pruebas: (H-N1) zxing-cpp nativo decodifica el 100 % de los fixtures que decodifica zxing-wasm; (H-N2) Tesseract nativo con `mrz.traineddata` produce las mismas líneas que tesseract-wasm para las mismas vistas.

## Riesgos

- Tamaño del AAR (Tesseract + Leptonica + zxing-cpp + QuickJS por 3 ABI): se informa y se usa el mismo criterio que la web (falla si crece > 10 % frente a la versión anterior); sin límite absoluto hasta decisión humana.
- Rendimiento medido en emulador no representa gama media: el umbral bloqueante se mide en el dispositivo de referencia (pregunta abierta 1); en CI solo se informa.
- Paridad de calidad WASM frente a nativo: diferencias de redondeo; tolerancia explícita de ±2 puntos de score y mismo motivo.
- Swift en CI macOS consume minutos de pago si el repositorio es privado.

## Pruebas

Según el principio II y las filas "App móvil", "Captura web", "Parsers", "Evals" y "Repositorio e infraestructura" de la matriz de `.claude/skills/estrategia-pruebas/SKILL.md`. Comandos:

- `KJ` = `docker run --rm -v "$(pwd -W):/work" -w /work/native/android lector-android-sdk ./gradlew testDebugUnitTest` (JUnit sobre JVM; zxing-cpp y Tesseract cargados como bibliotecas del host Linux compiladas en la misma imagen)
- `KI` = workflow `nativo-android.yml`, job `instrumentadas`: `./gradlew connectedDebugAndroidTest` en emulador API 34 x86_64 (GitHub Actions con KVM)
- `KH` = workflow `nativo-android.yml`, job `humo`: `npx wdio run native/android/humo/wdio.android.conf.ts` (Appium 3 + uiautomator2) con `-camera-back videofile:<y4m>`
- `KM` = `docker run ... ./gradlew pitest` (mutación de Kotlin con PIT, Apache-2.0; en CI, `gh workflow run nativo-android.yml -f pit=true` reparte `:nucleo:pitest` en fragmentos de clases disjuntas con `-PpitClases`/`-PpitExcluir` y `tools/pit-resumen.mjs` suma los `mutations.xml` con el umbral)
- `KB` = `./gradlew :benchmark:connectedBenchmarkAndroidTest` (Jetpack Microbenchmark) en el dispositivo de referencia
- `SX` = workflow `nativo-ios.yml`: `xcodebuild test -scheme LectorCedulaCore -destination 'platform=iOS Simulator,name=iPhone 16'`
- `SH` = workflow `nativo-ios.yml`, job `humo`: `xcodebuild test -scheme HumoEjemplo` con `FuenteFramesVideo`
- `SB` = `xcodebuild test -scheme Rendimiento` en el dispositivo de referencia iOS (`XCTMetric`)
- `CT` = `npm run nativo:contrato` (compara la salida JSON del núcleo nativo, volcada por las pruebas `KJ`/`SX` a `scratchpad`, con `npm run leer-foto -- --sin-mascara` sobre los mismos fixtures; describe con `{ timeout: 60_000 }`)
- `NJ` = `npx vitest run packages/nucleo-js packages/capacitor packages/react-native`
- `NM` = `npm run test:mutacion` con `packages/nucleo-js/src/**/*.ts`, `packages/capacitor/src/**/*.ts` y `packages/react-native/src/**/*.ts` en `mutate`
- `RN` = workflow `nativo-android.yml`, job `react-native`: build de `examples/react-native` y humo Appium
- `CP` = workflow `nativo-android.yml`, job `capacitor`: build de `examples/ionic-nativo` y humo Appium en contexto nativo y `WEBVIEW_<pkg>`
- `TN` = `npm run check:tamano-nativo` (bundle `nucleo-js` <= 409 600 B gzip con fixture de 409 601 B que falla; informa AAR y XCFramework y falla si crecen > 10 %)
- `L` = `npm run check:licencias` (amplía el control a `native/android/**/build.gradle.kts` y `native/ios/Package.resolved`); `P` = `npm run check:privacidad` (amplía reglas a Kotlin y Swift); `E` = `npm run eval:quick`

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| NAT-01 | Unitaria de la API de estado y transiciones | JUnit 5, XCTest | `KJ`, `SX` | 4/4 escenarios por plataforma |
| NAT-01 | Propiedad (secuencias de eventos solo dan `TRANSICIONES`) | Kotest property (Apache-2.0, decisión 3 del orquestador), fast-check sobre el bundle | `KJ`, `NJ` | tries >= 1000, 0 transiciones fuera de la lista |
| NAT-01 | Mutación | PIT, Stryker | `KM`, `NM` | >= 85 % (break 80) |
| NAT-02 | Instrumentada de cámara (resolución, enfoque, linterna, liberación) | AndroidX Test | `KI` | 4/4 escenarios |
| NAT-02 | Unitaria con `FuenteFrames` falsa | XCTest | `SX` | 4/4 escenarios |
| NAT-03 | Unitaria de calidad con fixtures sintéticos | JUnit, XCTest | `KJ`, `SX` | 5/5 escenarios |
| NAT-03 | Diferencial nativo frente a `packages/capture` (fixtures y transformaciones de los escenarios: brillo 0,1/0,8/1,2, disco 15 %, sigma 6) | Vitest + volcado JSON | `CT` | |score nativo - score TS| <= 2 y mismo `motivo` en 100 % de fixtures |
| NAT-03 | Metamórfica (brillo ±20 %, JPEG 70, rotación ±3°) sobre el score de CAL-07 | Kotest | `KJ` | motivo estable (brillo +20 % que satura más de `fraccionSaturadaMax` de la guía: motivo `reflejo` o `sobreexpuesto`); score de distorsión fuerte < 70 |
| NAT-04 | Unitaria de presencia y guía | JUnit, XCTest | `KJ`, `SX` | 3/3 escenarios |
| NAT-05 | Unitaria de la orquestación (binding falso: solo PDF417, copias a cero, sin salida, contenido MRZ) | Kotest | `KJ` | 6/6 escenarios |
| NAT-05 | Diferencial de la luminancia frente a `aGris` de `packages/capture` (oráculo TS en QuickJS) | Kotest property | `KJ` | 1000 casos, igualdad exacta |
| NAT-05 | Unitaria con el binario real (amarilla, QR ignorado, sin datos en Logcat) | AndroidX Test (JUnit 4) en emulador, XCTest | `KI`, `SX` | 4/4 escenarios |
| NAT-05 | Diferencial de bytes frente a `decodificarPdf417Imagen` sobre el mismo frame | oráculo generado en el mismo run + AndroidX Test | `KI` (`CT` desde la tarea 1.6) | bytes idénticos en `amarilla-1080p` |
| NAT-05 | Metamórfica (rotación ±3°, blur sigma 1, brillo ±20 %) | AndroidX Test en emulador | `KI` | mismos bytes o sin resultado; nunca un NUIP distinto |
| NAT-05 | Análisis estático (solo `PDF_417`, sin logs) y excepción exacta de OD-40 | Vitest | `NJ`, `npx vitest run tools/test` | 0 hallazgos; 3/3 casos que fallan |
| NAT-06 | Unitaria MRZ TD1/TD3 y plan de giros | JUnit, XCTest | `KJ`, `SX` | 5/5 escenarios |
| NAT-06 | Diferencial de vistas y líneas frente a `packages/capture` | Vitest + volcado JSON | `CT` | mismas líneas en 100 % de fixtures MRZ |
| NAT-06 | Diferencial en proceso del plan de vistas (giro, método, caja y huella de la vista del OCR) frente a `packages/capture` en QuickJS | Kotest + oráculo `dist/oraculo-mrz.js` | `KJ` | igualdad exacta en 100 % de tarjetas generadas |
| NAT-06 | Unitaria de `evaluarTextoMrz` y diferencial con el bucle web | Vitest + fast-check | `NJ` | numRuns >= 1000, igualdad estricta |
| NAT-06 | Mutación del plan, la vista del OCR y el bucle MRZ | PIT | `KM` (`-PpitClases=io.github.jorgeluissanchez.lectorcedula.mrz.*`) | >= 85 % |
| NAT-16 | Sin libjpeg ni libpng en el AAR, la biblioteca del host y el informe | `tools/nativo/sin-jpeg-png.mjs` (Vitest) | `KJ` (CI) y `npx vitest run tools` | 0 hallazgos; fixtures con libpngx.so y jpeg_std_error fallan |
| NAT-16 | Fuentes C/C++ vendorizadas registradas y sin códecs | `licencia-check` | `L` | 0 fuentes sin registrar, sin SHA-256 o con jpeg/png |
| NAT-07 | Análisis estático (sin reglas en nativo) | Vitest sobre fuentes | `NJ` | 0 apariciones de patrones prohibidos |
| NAT-07 | Unitaria del bundle (sin DOM, síncrono, JSON) | Vitest en Node sin globals de navegador | `NJ` | 4/4 escenarios |
| NAT-07 | Mismo bundle en QuickJS y JavaScriptCore | JUnit, XCTest | `KJ`, `SX` | igualdad estricta con Node en 100 % de fixtures |
| NAT-08 | Contrato nativo frente a la CLI | Vitest | `CT` | igualdad estricta de `campos` y `warnings` en 100 % de fixtures; `eval:quick` sin regresión |
| NAT-08 | Evals | `eval-campo` | `E` | sin regresión frente a `baseline.json` |
| NAT-09 | Unitaria del plugin con puente falso | Vitest | `NJ` | 4/4 escenarios |
| NAT-09 | Humo Capacitor en emulador | Appium + WebdriverIO | `CP` | lectura de `amarilla-1080p` y `digital-1080p` sin red |
| NAT-10 | Unitaria del hook | Vitest + `@testing-library/react-native` (MIT) | `NJ` | 4/4 escenarios |
| NAT-10 | Humo React Native en emulador | Appium + WebdriverIO | `RN` | lectura de `amarilla-1080p` sin red |
| NAT-11 | Unitaria de la API pública Kotlin y Swift | JUnit, XCTest | `KJ`, `SX` | 3/3 escenarios por plataforma |
| NAT-11 | Compatibilidad binaria de la API | binary-compatibility-validator (Apache-2.0) | `KJ` (`apiCheck`) | 0 cambios no declarados |
| NAT-12 | Unitaria del envío (reusa escenarios SDK-38, SDK-42 a SDK-44) | JUnit, XCTest, Vitest | `KJ`, `SX`, `NJ` | 5/5 escenarios por plataforma |
| NAT-12 | Mutación del envío | PIT, Stryker | `KM`, `NM` | >= 85 % |
| NAT-13 | Instrumentada de privacidad (sin archivos nuevos, sin red) | AndroidX Test | `KI` | 0 archivos creados; 0 sockets abiertos sin `servidor` |
| NAT-13 | Análisis estático del manifiesto y de fuentes | Vitest + `privacidad-check` | `NJ`, `P` | 0 hallazgos; manifiesto sin `INTERNET` |
| NAT-13 | Unitaria de copias a cero | JUnit, XCTest | `KJ`, `SX` | 100 % de búferes a cero |
| NAT-14 | Rendimiento en dispositivo de referencia | Jetpack Microbenchmark, XCTMetric | `KB`, `SB` | amarilla p95 < 500 ms; digital p95 < 2000 ms (20 lecturas) |
| NAT-14 | Rendimiento informativo en emulador | AndroidX Test | `KI` | se informa p95; no bloquea |
| NAT-15 | Análisis del árbol de dependencias | Gradle `dependencies`, `Package.resolved` | `KJ`, `NJ` | 0 artefactos `com.google.mlkit` en el núcleo |
| NAT-15 | Unitaria del complemento ML Kit | JUnit | `KJ` | 2/2 escenarios |
| NAT-16 | Licencias | `licencia-check` | `L` | 0 dependencias fuera de la lista |
| NAT-16 | Avisos de terceros | Vitest | `NJ` | `THIRD_PARTY_NOTICES` lista 100 % de componentes nativos |
| NAT-17 | Humo emulador Android | Appium + WebdriverIO | `KH` | 3/3 documentos sintéticos leídos sin red |
| NAT-17 | Humo simulador iOS | XCTest con `FuenteFramesVideo` | `SH` | 3/3 documentos sintéticos leídos |
| NAT-18 | Presupuesto de tamaño con fixture que falla | script + Vitest | `TN`, `NJ` | bundle <= 409 600 B gzip; artefactos <= +10 % |
| NAT-19 | Instrumentada de jerarquía de vistas (solo la preview) | AndroidX Test (Espresso), XCTest | `KI`, `SX` | 1 vista hija en Android; 1 subcapa en iOS; 0 vistas con texto |
| NAT-19 | Unitaria de `VistaCamara` RN (sin hijos ni estilos propios) | `@testing-library/react-native` | `NJ` | 0 hijos; `style` igual al del integrador |
| NAT-19 | Humo Capacitor: WebView transparente encima de la preview | Appium | `CP` | WebView con fondo transparente y z-order superior; 0 vistas nativas del SDK además de la preview |
| NAT-19 | E2E de ejemplos con UI distinta por plataforma | Appium + capturas | `KH`, `CP`, `RN`, `SH` | 4 ejemplos con `estilo-esperado.json` distinto dos a dos |
| Todos | Secretos y vulnerabilidades | gitleaks, osv-scanner (Docker) | `npm run check` | 0 secretos; 0 High/Critical sin excepción |

## Decisiones del orquestador por delegación del usuario (2026-10-09)

1. Dispositivo de referencia: mientras no haya uno físico, NAT-14 se informa sin bloquear; el umbral se vuelve bloqueante cuando el usuario aporte un dispositivo de gama media (Android e iOS).
2. Bindings de QuickJS y Tesseract: tarea previa con `revisor-licencias`; si ninguno pasa, se compilan con JNI o puente propio.
3. Pruebas Kotlin con Kotest y su módulo de propiedades (Apache-2.0); no se usan JUnit 5 ni jqwik (EPL-2.0).
4. CI: el repositorio es público, así que los runners macOS de GitHub Actions no cuestan minutos. Coordenadas: `io.github.jorgeluissanchez` en Maven Central (no exige dominio propio) y SwiftPM desde el repositorio. La publicación queda para el usuario.
5. Tamaño del bundle `nucleo-js`: se mide en la fase 0 y se fija el tope en la medida más un 10 %.
6. El antifraude nativo va en un cambio posterior.
7. ABIs: `arm64-v8a` y `x86_64` (emulador); se excluye `armeabi-v7a`. `minSdk` 24.
8. La decisión C de `sdk-integracion/design.md` queda sustituida por este cambio.

## Registro de la fase 0 (2026-10-09)

- **Tope del bundle `nucleo-js` (decisión 5):** medida 28 580 B gzip nivel 9 del IIFE minificado (con el `URL` propio); tope `LIMITE_NUCLEO_GZIP` = 31 439 B (medida + 10 %, redondeado hacia arriba) en `tools/tamano-nativo.mjs`, dentro del techo de 409 600 B de NAT-18, que sigue comprobándose con su fixture de 409 601 B. Registro de artefactos nativos en `native/tamanos.json` (vacío hasta el primer AAR o XCFramework).
- **`URL` propio dentro del bundle:** QuickJS no tiene `URL` y `opcionInvalida`/`urlSubidaValida` de `packages/web` la usan. esbuild inyecta `packages/nucleo-js/src/url.ts` solo dentro del IIFE (no escribe en `globalThis`). Diferencial contra la `URL` de Node (fast-check, 100 000 casos sin diferencias); única diferencia conocida y más estricta: un host no ASCII se rechaza en vez de pasar por IDNA.
- **API del bundle:** además de las seis funciones de NAT-07 expone `validarUrlSubida(url, servidor)` y `decidirEnvio(salida, opciones)` (`ninguno`, `enviar` o `no-enviar` con `menor-no-enviado`), que son la lógica de decisión que NAT-12 exige en el bundle. `procesarPdf417` y `procesarMrz` devuelven `{ ok: true, resultado, contenido, menorDeEdad }` o `{ ok: false, error: { codigo, motivo } }`; por omisión sin máscara (como `crearLector` y `leer-foto --sin-mascara`).
- **Interpretación sin imagen en `packages/capture`:** `interpretarPdf417` e `interpretarMrz` (lectura/leer.ts) e `interpretarLineasMrz` y `fechaReferenciaValida` (mrz/interpretar.ts, separado de lector.ts para no arrastrar Tesseract.js) son síncronas y las comparten `leerDocumento` y el bundle. `packages/web/src` no se modificó: el bundle importa sus módulos puros; la regla de menores del controlador web sigue en `controlador.ts` y `decidirEnvio` la replica con la misma condición (`tarjeta-identidad` o `menorDeEdad` sin `enviarMenores`). Unificarla exige tocar `packages/web/src` en una tarea aparte.
- **Gradle:** AGP 9.4.1 (Kotlin integrado), Gradle 9.8.1, módulo `:nucleo` Kotlin JVM con Kotest 6.2.5 y PIT (`info.solidsoft.pitest` 1.19.0) y librería `:lector-cedula` (AAR). `pl.droidsonroids.pitest` 0.2.27 no es compatible con AGP 9 (`libraryVariants`), así que la mutación corre en `:nucleo`, donde vivirá la lógica sin Android; `:nucleo:testDebugUnitTest` es alias de `test` para que `KJ` la incluya. JUnit Platform (EPL-2.0) entra solo como dependencia transitiva de prueba de Kotest, registrada con justificación.
- **Imagen `docker/android-sdk`:** exige `--build-arg ACEPTO_LICENCIA_ANDROID_SDK=si` porque construirla acepta la Android SDK License (fuera de la lista; solo herramienta, pendiente de `revisor-licencias`). Caché de Gradle opcional: `-v lector-gradle:/cache/gradle`.

## Registro de la fase 1 (2026-10-10)

- **Bundle en el núcleo JVM (tarea 1.1):** `MotorJs.desdeRecurso()` lee `lectorcedula/nucleo.js` del classpath: Gradle copia `packages/nucleo-js/dist/nucleo.js` como recurso de `:nucleo` (nunca a mano). Android empaqueta en el APK los recursos Java de los jar de las dependencias, así que el AAR no necesita una copia en `assets/`; la lectura en dispositivo se comprueba con `KI` (tareas 1.7 y 1.9). `KJ` exige antes `npm run nucleo:construir` (también en `nativo-android.yml`).
- **Lector (tarea 1.2):** `reintentar()` reabre la última fuente aunque la lectura anterior la haya cerrado (SDK-27); un frame que llega después de `cancelar()` se pone a cero sin procesarse; cancelar la corrutina de `iniciar` equivale a `cancelar()` (escenario "Cancelación de la corrutina en Kotlin" de NAT-02). La propiedad de NAT-01 usa Kotest property (decisión 3), 1000 casos en `KJ` y 100 por mutante en `KM`.
- **Calidad (tarea 1.3):** la paridad se comprueba de dos formas: el volcado de `KJ` frente a `packages/capture` en Node (`CT`, vídeos sintéticos y las transformaciones de los escenarios) y un diferencial en proceso: `npm run nucleo:construir` genera también `dist/oraculo-calidad.js` (solo pruebas, fuera del bundle y del AAR) con `packages/capture` (calidad, guía, presencia, localización MRZ) y Kotest lo evalúa en QuickJS frente al puerto Kotlin sobre escenas generadas y recortes de los vídeos, con igualdad exacta. Los escenarios "Desenfoque" de NAT-03 fijan el score de CAL-07; con presencia guiada (OFF-25) sigma 6 queda en el umbral, igual que la web (escenario añadido a la spec delta). Hallazgo en la web, sin cambiar aquí: girar el frame completo 1° basta para que `detectarPresencia` no encuentre la tarjeta en los vídeos sintéticos (`buscarTarjeta` exige bordes alineados con los ejes); el núcleo Kotlin lo reproduce por paridad. Para la mutación, `KJ` vuelca además las salidas del oráculo para semillas fijas (`build/goldens/goldens-calidad.json`) y exige que coincidan con el golden comprometido en `src/test/resources/lectorcedula/`; `CalidadGoldenNat03Test` compara el puerto con ese golden sin QuickJS y es lo que corre bajo PIT (el diferencial en vivo queda fuera de `KM` por lento).
- **PIT en Kotlin (`KM`):** `-PpitClases` y `-PpitSinPruebas` acotan la mutación por tarea; se evitan las llamadas que genera el compilador (`kotlin.jvm.internal`, `kotlin.ResultKt`), los cuerpos `invokeSuspend` y las clases `$$inlined$`. Los mutantes "replaced return value with null" de funciones `suspend` que devuelven `Unit` son equivalentes (el llamador no usa el valor). Margen de tiempo 20 s + 2x: las pruebas con frames 1080p tardan segundos.
- **PDF417 con zxing-cpp (tarea 1.4):** el wrapper oficial `io.github.zxing-cpp:android` 3.1.1 (`implementation`, no se expone en la API) en `:lector-cedula` (`LectorCodigosZxing`); la orquestación, pura, en `:nucleo` (`DecodificadorPdf417`, `Luminancia`, `OpcionesPdf417`). El binding se crea solo con `Format.PDF_417` y `DecodificadorPdf417` rechaza cualquier otra configuración (`formatos-no-admitidos`); un resultado de otro formato se descarta y se pone a cero. La luminancia (`aGris` de la web, BT.601 entera con el redondeo de `Math.round`) viaja en un `Bitmap` `ALPHA_8` (formato `Lum` del wrapper) que se borra y recicla tras cada lectura. Una lectura por frame, del frame completo a resolución completa, con las opciones efectivas del intento `original` de la web (zxing-wasm toma por omisión `tryInvert` y `tryDownscale`; el wrapper Android no, así que se fijan); la cadena de reintentos de la web (escalas, giros, banda, rejilla) no se replica: el siguiente frame es el reintento (escenario "Un intento por frame con las opciones de la web" de la spec delta).
- **Dónde corre NAT-05 (desviación de `KJ`):** el AAR de zxing-cpp solo trae bibliotecas `.so` de Android (arm64-v8a, armeabi-v7a, x86, x86_64; el AAR del SDK empaqueta solo arm64-v8a y x86_64), así que el binario real no carga en la JVM del host, y "Sin datos en logs" exige Logcat. `KJ` prueba la orquestación con un binding falso y la luminancia frente al oráculo TS; los cuatro escenarios con el binario real corren en `KI` (job `emulador` de `nativo-android.yml`; AndroidX Test, con JUnit 4 transitiva solo en `androidTest`). Compilar zxing-cpp para el host con un JNI propio se descartó: probaría un binding distinto del que se distribuye. El diferencial de bytes con la web no usa volcado: `packages/nucleo-js/scripts/generar-fixtures-pdf417.mjs` calcula en el mismo run los bytes de `decodificarPdf417Imagen` sobre el frame 0 de `amarilla-1080p` y los empaqueta como asset de prueba junto a los frames RGBA (en `lector-cedula/src/androidTest/assets/sinteticos`, ignorado por git; el DSL `sourceSets` de AGP 9 no admite añadir otro directorio de assets desde Kotlin DSL); `CT` lo absorberá en la tarea 1.6. El anverso con QR es `digital-1080p` con un QR sintético de texto fijo; el generador falla si zxing-wasm no lo lee como QR (prueba no vacía) o si la web encuentra un PDF417 en él.
- **compileSdk 36 (riesgo de la tarea 1.4):** zxing-cpp no obliga a subirlo: su `aar-metadata.properties` declara `minCompileSdk=1` (se compiló con 37, pero no lo exige) y el de `camera-core` 1.5.2, `minCompileSdk=35` y AGP >= 8.6. Lo exige `io.github.dokar3:quickjs-kt-android` 1.0.15 (tarea 1.1, `minCompileSdk=36`), que `checkDebugAndroidTestAarMetadata` detectó al compilar el primer APK. Se sube `compileSdk` a 36, el mínimo que piden las dependencias (no 37: sin necesidad, no se adelanta), y la imagen `docker/android-sdk` instala `platforms;android-36`. `minSdk` (24) no cambia: `compileSdk` no cambia el comportamiento en ejecución.
- **OD-40 y zxing-cpp:** `privacidad-check` prohibía cualquier dependencia de Gradle que contuviera `zxing` (más estricto que el texto de OD-40, que nombra `com.google.zxing`); ahora admite solo la coordenada exacta `io.github.zxing-cpp:android`, igual que `zxing-wasm` en npm (escenario "Dependencia admitida por coordenada exacta").
- **Avisos:** zxing-cpp (Apache-2.0), libzueci (BSD-3-Clause) y la rutina UTF-8 de Hoehrmann (MIT) se citan en el `THIRD_PARTY_NOTICES` del AAR en la tarea 1.10 (condición de `revisor-licencias`).
- **Tesseract nativo sin libjpeg ni libpng (tarea 1.5; decisión del orquestador por delegación del usuario, 2026-10-10):** `revisor-licencias` aprobó Tesseract4Android 4.9.0 con condición: Tesseract 5.5.1 (Apache-2.0) y Leptonica 1.85.0 (BSD-2-Clause) sí; libjpeg (IJG) y libpng (libpng-2.0) no están en la lista. Se vendoriza en `native/android/tesseract4android` (módulo Android solo nativo) la configuración de compilación de Tesseract4Android de la etiqueta 4.9.0 (commit 15c5347; `LICENSE` copiado) con este parche: (1) sin `add_subdirectory(libjpeg)` ni `libpng` y Leptonica con `HAVE_LIBJPEG`, `HAVE_LIBPNG`, `HAVE_LIBTIFF`, `HAVE_LIBZ`, `HAVE_LIBGIF`, `HAVE_LIBWEBP` y `HAVE_LIBJP2K` a 0 (sus stubs); (2) las fuentes de Tesseract y Leptonica no se copian: CMake las descarga y verifica por SHA-256 (`fuentes-nativas.json`; son byte a byte las que copia Tesseract4Android, comparadas sin diferencias salvo fin de línea); (3) bibliotecas estáticas enlazadas en una sola `liblectorcedula_ocr.so` con un JNI propio (`ocr_jni.cpp`) en lugar del JNI y las clases Java de Tesseract4Android: crea la API con el modelo en memoria (`TessBaseAPI::Init` desde búfer, sin escribir en disco), reconoce RGBA (`SetImage` de 4 bytes por píxel), pone a cero sus copias y no escribe logs; (4) NDK 28.2.13676358 y CMake 3.31.6 (los de `docker/android-sdk`) en lugar de NDK 27.2 y CMake 3.22.1; ABIs arm64-v8a y x86_64. CMake aborta si aparece un objetivo `jpeg` o `png`, `tools/nativo/sin-jpeg-png.mjs` revisa el AAR, la biblioteca del host y `dependencias-resueltas.txt`, y `check:licencias` exige que cada fuente vendorizada figure en `native/licencias-nativas.json` (sección `vendorizado`). La clase Kotlin `mrz.TesseractNativo` vive en `:nucleo`; el mismo CMake se compila para el host Linux de la imagen (g++ del sistema, solo herramienta) en `:nucleo:compilarOcrHost`, y `KJ` corre Tesseract real (`-PocrObligatorio=true` en CI).
- **MRZ nativa (tarea 1.5):** `PlanMrz`, `VistaOcr` y `LectorMrz` son el puerto literal de `localizar.ts`, `lector.ts` (plan, recorte ampliado) y `enderezar.ts`; las funciones trigonométricas usan `StrictMath` (fdlibm, como V8) y los redondeos replican `Math.round` y `Uint8ClampedArray` para que la vista sea byte a byte la de la web. La regla de cada intento la da `evaluarTextoMrz` del bundle. `mrz.traineddata` llega de `npm run modelos:mrz` como recurso de `:nucleo` (y del AAR) solo si su SHA-256 es el de `models/manifest.json` (Gradle falla si no), y `ModeloMrz` lo vuelve a verificar antes de crear Tesseract. Escenas del diferencial: `tools/nativo/fixtures-mrz.mjs` (digital 1080p derecha, 90, 180 y 270, pasaporte 1080p y el conjunto E del eval `mrz-imagen` para `PERSONA_BASE`: reverso, sus 9 distorsiones y la foto F). `CT` para MRZ: `CT_ESTRICTO=1 npx vitest run packages/nucleo-js/test/nat-06-diferencial-mrz.test.ts` tras `KJ`.
