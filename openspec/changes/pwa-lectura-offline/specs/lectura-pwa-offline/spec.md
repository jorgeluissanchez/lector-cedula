# Spec Delta

## Purpose

Leer en el dispositivo la captura aceptada por la PWA (cédula amarilla por PDF417, cédula digital por MRZ TD1), mostrar el resultado enmascarado y funcionar exactamente igual sin conexión que con conexión después de la primera visita.

Convenciones de los escenarios: todas las imágenes y vídeos son SINTÉTICOS, producidos por `@lector-cedula/fixtures` (`PERSONA_BASE`: NUIP `9999123456`, serial `999912345`, `PRUEBA EJEMPLO FICTICIA LUZ`, lugar `16001`) y renderizados por `evals/sinteticos/render-mrz.mjs` y el helper de PDF417 de las pruebas; nunca datos reales. Los vídeos `.y4m` de la cámara simulada son `amarilla-1080p`, `digital-1080p` y `digital-girada-90-1080p` (tarea 1.2). "Fecha de referencia" es la fecha del dispositivo en `America/Bogota`; en E2E se fija con `page.clock` a `2026-10-06`. "Resultado online" es el JSON de `data-resultado` obtenido con red; "resultado offline", el obtenido con `context.setOffline(true)`. El "manifiesto de precaché" es `/assets/precache-manifest.<hash>.json`, generado en la compilación. Los presupuestos de tiempo de OFF-15 y de tamaño de OFF-16 son metas provisionales, no hipótesis del formato. El orden de los campos y offsets del PDF417 y de la MRZ son los de los parsers existentes; toda hipótesis de formato sigue en `docs/decisiones/hipotesis-formato.md` y este cambio no añade ninguna.

## ADDED Requirements

### Requirement: OFF-01 Precaché completa en la primera visita
El service worker MUST precachear en su evento `install`, en una sola caché llamada `lector-<version>`, todos los recursos que la lectura necesita: el shell de CAM-01, el Worker de calidad, el Worker lector, `zxing_reader.wasm`, el worker de tesseract.js, el core de tesseract.js (variantes `simd-lstm` y `lstm`, JS y WASM), `mrz.traineddata` y la tabla DIVIPOL. Todos MUST emitirse bajo `/assets/` con hash de contenido en el nombre. El service worker MUST NOT activarse si falta alguno.

#### Scenario: Lista de precarga
- **WHEN** se compila con `npm run build -w apps/pwa` y se lee el manifiesto de precaché
- **THEN** sus entradas contienen `/`, `/index.html`, `/manifest.webmanifest`, los iconos y exactamente una ruta que cumple cada una de `^/assets/calidad\.worker-[^/]+\.js$`, `^/assets/lector\.worker-[^/]+\.js$`, `^/assets/zxing_reader-[^/]+\.wasm$`, `^/assets/tesseract-worker-[^/]+\.js$`, `^/assets/tesseract-core-simd-lstm-[^/]+\.wasm$`, `^/assets/tesseract-core-lstm-[^/]+\.wasm$`, `^/assets/tesseract-core-simd-lstm-[^/]+\.js$`, `^/assets/tesseract-core-lstm-[^/]+\.js$`, `^/assets/mrz-[^/]+\.traineddata$` y `^/assets/divipol-[^/]+\.js$`

#### Scenario: Todo en caché antes de la primera lectura
- **WHEN** se visita `/` con conexión y se espera a que `navigator.serviceWorker.controller` deje de ser `null` sin pulsar "Iniciar cámara"
- **THEN** cada ruta del manifiesto de precaché tiene respuesta en `caches.open("lector-<version>")` con estado 200

#### Scenario: Activación bloqueada si falta un recurso
- **WHEN** en la primera visita una ruta de Playwright responde 404 a la petición de `mrz-*.traineddata`
- **THEN** el registro queda sin service worker activo (`navigator.serviceWorker.controller` es `null` tras 2 recargas), no existe ninguna caché `lector-*` y el indicador de OFF-03 muestra "Sin conexión no disponible todavía"

### Requirement: OFF-02 Integridad SHA-256 de la precaché
Cada entrada del manifiesto de precaché MUST declarar `ruta`, `bytes` y `sha256` (64 hex en minúsculas) del archivo emitido. El service worker MUST calcular el SHA-256 de cada respuesta con `crypto.subtle.digest` antes de guardarla y MUST NOT guardar ni activar si algún digest o tamaño no coincide.

#### Scenario: Manifiesto coherente con la compilación
- **WHEN** se recalcula con `node:crypto` el SHA-256 y el tamaño de cada archivo de `apps/pwa/dist` listado en el manifiesto
- **THEN** cada `sha256` y cada `bytes` coinciden con los declarados, y cada archivo de `dist/assets` aparece en el manifiesto salvo el propio manifiesto y los `.map`

#### Scenario: Recurso alterado
- **WHEN** en la primera visita una ruta de Playwright devuelve `zxing_reader-*.wasm` con su primer byte cambiado y mismo tamaño
- **THEN** no existe ninguna caché `lector-*`, no hay service worker activo y la consola del service worker registra `integridad-fallida` con la ruta afectada y sin contenido del archivo

#### Scenario: Función de verificación
- **WHEN** se llama `verificarEntrada({ ruta: "/assets/a.bin", bytes: 3, sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" }, bytes "abc")` y con los bytes "abd"
- **THEN** devuelve `{ ok: true }` y `{ ok: false, motivo: "integridad-fallida", ruta: "/assets/a.bin" }`

### Requirement: OFF-03 Indicador de disponibilidad sin conexión
La pantalla `inicio` MUST mostrar un estado con `role="status"` y atributo `data-offline` con uno de dos valores: `lista` con el texto "Lista para usar sin conexión" cuando el service worker activo confirma que todas las entradas del manifiesto están en caché y verificadas, y `pendiente` con el texto "Sin conexión no disponible todavía" en cualquier otro caso.

#### Scenario: Primera visita completa
- **WHEN** se visita `/` con conexión y el service worker termina de activarse
- **THEN** `expect.poll` observa `data-offline="lista"` y el texto exacto "Lista para usar sin conexión"

#### Scenario: Navegador sin service worker
- **WHEN** la instrumentación elimina `navigator.serviceWorker` antes de cargar `/`
- **THEN** `data-offline` vale `pendiente` y la lectura con conexión sigue funcionando (el flujo de OFF-06 con `amarilla-1080p` llega a `resultado`)

### Requirement: OFF-04 Sin red durante la lectura y sin terceros
Desde la carga de `/` hasta la pantalla `resultado`, la PWA MUST NOT hacer peticiones a otro origen, y desde "Iniciar cámara" hasta `resultado` MUST NOT hacer ninguna petición que llegue a la red (todas se sirven desde la caché del service worker). tesseract.js MUST configurarse con `workerPath`, `corePath` y `langPath` del mismo origen y `cacheMethod: "none"`. El servidor de respaldo MUST NOT invocarse: la PWA no tiene URL de servidor configurada en este cambio.

#### Scenario: Sin terceros
- **WHEN** se registra `page.on("request")` y `context.on("request")` (incluye Workers y service worker) durante el flujo completo con `digital-1080p` con conexión
- **THEN** 0 peticiones tienen un origen distinto del de la página; ninguna URL contiene `jsdelivr`, `unpkg`, `cdn` ni `tessdata`

#### Scenario: Lectura servida desde caché
- **WHEN** tras la primera visita se registran las respuestas desde "Iniciar cámara" hasta `resultado` con `amarilla-1080p` y luego con `digital-1080p`, con conexión
- **THEN** cada respuesta tiene `response.fromServiceWorker() === true` y el servidor de vista previa registra 0 peticiones en ese tramo

### Requirement: OFF-05 Caché solo de recursos estáticos
Las únicas cachés MUST ser `lector-<version>` (y, durante una actualización, la de la versión anterior). Sus claves MUST ser exactamente las rutas del manifiesto de precaché. El service worker MUST NOT guardar respuestas en tiempo de ejecución.

#### Scenario: Claves tras leer
- **WHEN** se completan una lectura de `amarilla-1080p` y una de `digital-1080p` y se listan todas las cachés y todas sus claves
- **THEN** hay 1 caché, sus claves (como ruta) son igual, como conjunto, a las rutas del manifiesto de precaché, y cada ruta cumple `^/(index\.html|manifest\.webmanifest|sw\.js|iconos/[^/]+\.png|assets/[^/]+)?$`

### Requirement: OFF-06 Lector de documento con detección automática
El Worker lector MUST recibir los píxeles RGBA de la `CapturaAceptada` (transferidos) y seguir el orden de `tools/leer-foto.mjs`: primero `decodificarPdf417Imagen`; solo si el error es `pdf417-no-encontrado`, `crearLectorMrz` con el plan de LMI-12b y el presupuesto de LMI-13. Otro error del PDF417 MUST devolverse sin intentar la MRZ. MUST exponer un `LectorCodigos` con `formatos` igual a `["pdf417"]`.

#### Scenario: Amarilla sintética
- **WHEN** se lee en el Worker lector la imagen PDF417 sintética de `PERSONA_BASE` (semilla 1)
- **THEN** el resultado tiene `tipo: "pdf417"` y la MRZ no se intentó (0 llamadas al OCR)

#### Scenario: Digital sintética
- **WHEN** se lee la foto sintética de la MRZ TD1 de `PERSONA_BASE` (semilla 1)
- **THEN** el resultado tiene `tipo: "mrz"` después de exactamente 1 intento de PDF417 con error `pdf417-no-encontrado`

#### Scenario: Error de PDF417 distinto de no encontrado
- **WHEN** el decodificador inyectado devuelve `{ ok: false, error: "imagen-ilegible" }`
- **THEN** el resultado es `{ ok: false, error: "imagen-ilegible" }` y el OCR tiene 0 llamadas

### Requirement: OFF-07 Nunca decodificar el QR
El lector MUST pedir a zxing-wasm únicamente el formato `PDF417` y MUST NOT exponer ni registrar contenido de ningún otro simbolismo. El tipo `FormatoCodigo` MUST seguir siendo solo `"pdf417"`.

#### Scenario: Opciones de zxing
- **WHEN** se espía la llamada a `readBarcodes` del decodificador durante la lectura de la amarilla sintética
- **THEN** su opción `formats` es exactamente `["PDF417"]`

#### Scenario: Imagen con solo un QR
- **WHEN** se lee una imagen sintética 1000x630 que contiene únicamente un QR con el texto `SINTETICO-QR` y ninguna MRZ
- **THEN** el resultado es un error de lectura (`pdf417-no-encontrado` seguido de `mrz-no-encontrada` o `tiempo-agotado`) y la cadena `SINTETICO-QR` no aparece en el resultado, en el DOM ni en la consola

### Requirement: OFF-08 Parseo y DIVIPOL en el dispositivo
El PDF417 MUST interpretarse con `parsearPdf417Amarilla(bytes, { divipol: buscarDivipol })` y la MRZ con `parsearMrzCedulaDigital` con la fecha de referencia. El lugar de nacimiento MUST resolverse como en LPI-08 (`lugarNacimiento` con `codigo`, `departamento` y `municipio`, o `null` con el warning `lugar-nacimiento-no-resuelto`). La tabla DIVIPOL MUST cargarse desde la precaché.

#### Scenario: Igual que la CLI
- **WHEN** se escribe la imagen sintética de la amarilla y la de la digital en un directorio temporal fuera del repo, se ejecuta `npm run leer-foto -- --fecha-referencia 2026-10-06 <ruta>` y se ejecuta la función `leerDocumento` del paquete en Node sobre los mismos píxeles con la misma fecha
- **THEN** para cada imagen, el `resultado` de `leerDocumento` es `toStrictEqual` al campo `resultado` del JSON de la CLI (ambos enmascarados), incluido `lugarNacimiento`

#### Scenario: Lugar desconocido
- **WHEN** se lee la amarilla sintética con `PERSONA_BASE + { departamento: "99", municipio: "999" }`
- **THEN** `campos.lugarNacimiento` es `null` y `warnings` contiene `lugar-nacimiento-no-resuelto`

### Requirement: OFF-09 Resultado enmascarado
La PWA MUST mostrar y exponer en `data-resultado` solo el resultado enmascarado con la máscara de la CLI (LPI-06), implementada una sola vez en `packages/capture` e importada por `tools/leer-foto.mjs`: NUIP y serial conservan los 2 últimos caracteres; cada palabra de nombres y apellidos conserva su primera letra; `lineasCorregidas` y `correcciones` son `null`. La PWA MUST NOT ofrecer modo sin máscara.

#### Scenario: Máscara MRZ
- **WHEN** se enmascaran los campos MRZ `{ nuip: "9999123456", serial: "999912345", apellidos: "PRUEBA EJEMPLO", nombres: "FICTICIA LUZ" }`
- **THEN** quedan `{ nuip: "********56", serial: "*******45", apellidos: "P***** E******", nombres: "F******* L**" }`

#### Scenario: Máscara PDF417 de 8 dígitos y con Ñ
- **WHEN** se enmascaran `{ numeroDocumento: "99991234", primerApellido: "MUÑOZ", segundoApellido: null, primerNombre: "ÑANDÚ", segundoNombre: "" }`
- **THEN** quedan `{ numeroDocumento: "******34", primerApellido: "M****", segundoApellido: null, primerNombre: "Ñ****", segundoNombre: "" }`

#### Scenario: Pantalla de resultado de la amarilla
- **WHEN** se completa el flujo con `amarilla-1080p`
- **THEN** `data-pantalla` vale `resultado`, el elemento "Número de documento" muestra `********56`, el texto visible no contiene `9999123456`, `PRUEBA` ni `FICTICIA`, y `data-tipo` vale `pdf417`

#### Scenario: Pantalla de resultado de la digital
- **WHEN** se completa el flujo con `digital-1080p`
- **THEN** `data-tipo` vale `mrz`, "Número de documento" muestra `********56` y "Serial" muestra `*******45`, y el texto visible no contiene `999912345` ni las líneas MRZ

### Requirement: OFF-10 Lectura girada
La PWA MUST leer la cédula digital capturada con la tarjeta girada 90° o 270° con el mismo resultado que sin giro, usando el plan de giros existente (LMI-12, LMI-14b).

#### Scenario: Digital girada en E2E
- **WHEN** se completa el flujo con `digital-girada-90-1080p`
- **THEN** `data-pantalla` vale `resultado` y `data-resultado` es igual, como JSON, al obtenido con `digital-1080p`

#### Scenario: Giro 270 en el Worker
- **WHEN** se lee en el Worker lector la foto sintética de la digital girada 270° (semilla 1)
- **THEN** el resultado es `toStrictEqual` al de la misma foto sin giro

### Requirement: OFF-11 Nada persiste
La PWA MUST NOT escribir en `localStorage`, `sessionStorage`, IndexedDB, cookies ni `CacheStorage` (fuera de la precaché) ningún dato leído ni imagen. Tras leer, el Worker lector MUST poner a cero los píxeles recibidos y los bytes del PDF417, y la PWA MUST llamar `liberar()` de la `CapturaAceptada`. Al pulsar "Leer otra" o al pasar la página a `hidden`, el resultado MUST desaparecer del DOM y del estado.

#### Scenario: Almacenamiento vacío
- **WHEN** se completan lecturas de `amarilla-1080p` y `digital-1080p` y se inspeccionan `localStorage.length`, `sessionStorage.length`, `indexedDB.databases()`, `document.cookie` y las claves de `CacheStorage`
- **THEN** los dos `length` son 0, `databases()` devuelve `[]`, `document.cookie` es `""` y las claves de caché son las de OFF-05

#### Scenario: Bytes a cero
- **WHEN** se ejecuta el manejador del Worker lector con un buffer de píxeles sintético y un decodificador inyectado que devuelve bytes de PDF417
- **THEN** al terminar, cada byte del buffer de píxeles y del buffer de bytes PDF417 vale 0

#### Scenario: Página oculta
- **WHEN** en `resultado` se dispara `visibilitychange` con `document.visibilityState` igual a `hidden` y luego `visible`
- **THEN** `data-pantalla` vale `inicio` y ningún elemento contiene `********56`

#### Scenario: Análisis estático
- **WHEN** se ejecuta `npm run check:privacidad`
- **THEN** no hay infracciones, y una regla nueva falla si `apps/pwa/src` o `packages/capture/src/lectura` contienen `localStorage`, `sessionStorage`, `indexedDB` o `document.cookie`

### Requirement: OFF-12 Paridad con y sin conexión
Tras una primera visita con conexión, la lectura sin conexión MUST producir exactamente el mismo resultado que con conexión, incluida la pantalla tras recargar la página sin conexión.

#### Scenario: Primera carga online, recarga offline y lectura
- **WHEN** se visita `/` con conexión, se espera `data-offline="lista"`, se lee `amarilla-1080p` y se guarda `data-resultado`; se ejecuta `context.setOffline(true)`, se recarga, se lee de nuevo; y se repite con `digital-1080p` en otro contexto
- **THEN** tras la recarga sin conexión `data-offline` vale `lista`, cada lectura offline llega a `resultado` y su `data-resultado` es idéntico, como cadena, al online

#### Scenario: Sin conexión desde el arranque del Worker
- **WHEN** tras la primera visita se activa `context.setOffline(true)`, se cierra la página, se abre una nueva en el mismo contexto y se completa el flujo con `digital-1080p`
- **THEN** llega a `resultado` con el mismo `data-resultado` que online y la consola no registra errores de red

### Requirement: OFF-13 Errores de lectura
La PWA MUST mostrar la pantalla `error-lectura` con `data-error` y un texto fijo por código, y un botón "Intentar de nuevo" que vuelve a la cámara. La tabla de códigos y textos está en el escenario "Mapeo de errores".

#### Scenario: Mapeo de errores
- **WHEN** se clasifica cada uno de los cuatro errores de la tabla con `clasificarErrorLectura`
- **THEN** devuelve: MRZ no encontrada tras `pdf417-no-encontrado` → `no-encontrado`, "No se encontró el código de la cédula ni la zona de lectura. Acerca el documento y evita reflejos."; `tiempo-agotado` (LMI-13) → `tiempo-agotado`, "La lectura tardó demasiado. Inténtalo de nuevo con mejor luz."; parser con `ok: false` → `no-valido`, "Se leyó un código, pero no corresponde a una cédula válida."; fallo del Worker o del WASM → `motor`, "No se pudo iniciar el lector en este dispositivo."; y cualquier otro valor (incluido `undefined`) → `motor`

#### Scenario: Vídeo sin documento
- **WHEN** se completa el flujo con `nitida-1080p` (patrón sin cédula) hasta `listo` y la lectura termina
- **THEN** `data-pantalla` vale `error-lectura`, `data-error` vale `no-encontrado` y el botón "Intentar de nuevo" lleva a `data-pantalla="activo"`

### Requirement: OFF-14 Lectura fuera del hilo principal
La decodificación, el OCR y el parseo MUST ejecutarse en el Worker lector. Durante la lectura la pantalla `leyendo` MUST mostrar "Leyendo documento…" en una región `aria-live="polite"` y un botón "Cancelar" que aborta la lectura con `AbortSignal` y vuelve a `activo`.

#### Scenario: Hilo principal libre
- **WHEN** se mide con `PerformanceObserver` de tipo `longtask` desde que `data-pantalla` vale `leyendo` hasta `resultado` con `digital-1080p`
- **THEN** ninguna tarea larga supera 200 ms

#### Scenario: Cancelar
- **WHEN** en `leyendo` se pulsa "Cancelar"
- **THEN** `data-pantalla` vale `activo` en menos de 1 s y llega al Worker un mensaje `cancelar`; no se muestra resultado

### Requirement: OFF-15 Tiempos objetivo en Pixel 7 emulado
Con el proyecto Playwright de Pixel 7, la CPU limitada a 4x con `Emulation.setCPUThrottlingRate` y sin conexión tras la primera visita, el tiempo desde la captura aceptada hasta `resultado` MUST cumplir en 20 lecturas: amarilla p95 <= 1500 ms; digital p95 <= 5000 ms; digital girada 90° p95 <= 10000 ms. El arranque del Worker lector (primera lectura de la sesión) MUST quedar incluido en la medida.

#### Scenario: Presupuesto
- **WHEN** se ejecuta `npx playwright test e2e/lectura/tiempos.spec.ts --project=lectura-pixel7` y se escriben las 60 medidas en `reports/lectura/tiempos.json`
- **THEN** los p95 por tipo cumplen los tres umbrales y el archivo contiene solo números y etiquetas de tipo, sin datos leídos

### Requirement: OFF-16 Tamaño de la precaché
La suma de `bytes` del manifiesto de precaché MUST ser <= 20 971 520 (20 MiB) y la carga inicial de JavaScript MUST seguir cumpliendo CAM-12 (<= 307 200 bytes de script en Lighthouse); los recursos de lectura MUST descargarse por el service worker y no por la página. La PWA MUST comprobar `navigator.storage.estimate()` antes de precachear y, si la cuota libre es menor que la suma del manifiesto, mostrar `data-offline="pendiente"` con "Sin conexión no disponible todavía".

#### Scenario: Presupuesto de bytes
- **WHEN** se suma `bytes` del manifiesto tras `npm run build -w apps/pwa`
- **THEN** la suma es <= 20971520 y el informe `reports/lectura/precache.json` lista los bytes por ruta

#### Scenario: Cuota insuficiente
- **WHEN** la instrumentación hace que `navigator.storage.estimate()` devuelva `{ quota: 1000000, usage: 0 }`
- **THEN** `data-offline` vale `pendiente` y no existe ninguna caché `lector-*`

### Requirement: OFF-17 Actualización sin romper el modo sin conexión
Una versión nueva del service worker MUST precachear y verificar todo su manifiesto antes de activarse, y la caché de la versión anterior MUST borrarse solo en `activate` de la nueva. Si la instalación nueva falla, la anterior MUST seguir sirviendo sin conexión.

#### Scenario: Actualización fallida
- **WHEN** con la versión A activa se despliega la versión B cuyo `mrz-*.traineddata` responde 404, se recarga con conexión y luego se recarga con `context.setOffline(true)` y se lee `digital-1080p`
- **THEN** la caché `lector-A` sigue existiendo, no existe `lector-B` y la lectura offline llega a `resultado`

### Requirement: OFF-18 Accesibilidad de lectura y resultado
Las pantallas `leyendo`, `resultado` y `error-lectura` MUST tener 0 violaciones serious o critical de axe, cada campo del resultado MUST tener etiqueta visible asociada y el resultado MUST anunciarse en una región `aria-live`.

#### Scenario: axe
- **WHEN** se ejecuta `AxeBuilder` en cada una de las tres pantallas en Chromium escritorio y Pixel 7
- **THEN** 0 violaciones con impacto `serious` o `critical`
