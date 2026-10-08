# Spec Delta

## Purpose

Leer en el dispositivo la captura aceptada por la PWA (cédula amarilla por PDF417, cédula digital por MRZ TD1), mostrar el resultado enmascarado y funcionar exactamente igual sin conexión que con conexión después de la primera visita.

Convenciones de los escenarios: todas las imágenes y vídeos son SINTÉTICOS, producidos por `@lector-cedula/fixtures` (`PERSONA_BASE`: NUIP `9999123456`, serial `999912345`, `PRUEBA EJEMPLO FICTICIA LUZ`, lugar `16001`) y renderizados por `evals/sinteticos/render-mrz.mjs` y el helper de PDF417 de las pruebas; nunca datos reales. Los vídeos `.y4m` de la cámara simulada son `amarilla-1080p`, `digital-1080p` y `digital-girada-90-1080p` (tarea 1.2). "Fecha de referencia" es la fecha del dispositivo en `America/Bogota`; en E2E se fija con `page.clock` a `2026-10-06`. `data-resultado` en los escenarios designa el resultado visible: el JSON de `data-tipo` y los campos `dd[data-campo]` de `resultado`; la compilación de producción no emite ningún atributo con el resultado (revisor de privacidad). "Resultado online" es ese JSON obtenido con red; "resultado offline", el obtenido con `context.setOffline(true)`. "Historial de pantallas" es la lista de valores que toma `data-pantalla`, registrada por un `MutationObserver` de la instrumentación de la prueba (nunca código de producto); como `listo` es transitorio (OFF-19), "llegar a `listo`" significa que `listo` aparece en el historial. El "manifiesto de precaché" es `/assets/precache-manifest.<hash>.json`, generado en la compilación. Los presupuestos de tiempo de OFF-15 y de tamaño de OFF-16 son metas provisionales, no hipótesis del formato. El orden de los campos y offsets del PDF417 y de la MRZ son los de los parsers existentes; toda hipótesis de formato sigue en `docs/decisiones/hipotesis-formato.md` y este cambio no añade ninguna.

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

### Requirement: OFF-09 Resultado completo en la PWA y máscara en la CLI
La PWA MUST mostrar los campos sin máscara (decisión del usuario del 2026-10-07): `leerDocumento` y el Worker lector aceptan `enmascarar` (por defecto `true`) y la PWA pasa `false`. Los valores MUST aparecer solo como texto de los `dd` del resultado, nunca en atributos del DOM; las líneas MRZ y las correcciones no se muestran, y OFF-11 sigue igual. La máscara de LPI-06 sigue en `packages/capture`, la usan la CLI (por defecto, con `--sin-mascara`) y el servidor.

#### Scenario: Dígitos de control sin valores
- **WHEN** se enmascara un resultado MRZ con `digitosControl: { documento: { estado: "valido", leido: "7", calculado: 7 }, … }`
- **THEN** queda `digitosControl: { documento: { estado: "valido" }, … }` para los cuatro dígitos y la entrada no se muta

#### Scenario: Máscara MRZ
- **WHEN** se enmascaran los campos MRZ `{ nuip: "9999123456", serial: "999912345", apellidos: "PRUEBA EJEMPLO", nombres: "FICTICIA LUZ" }`
- **THEN** quedan `{ nuip: "********56", serial: "*******45", apellidos: "P***** E******", nombres: "F******* L**" }`

#### Scenario: Máscara PDF417 de 8 dígitos y con Ñ
- **WHEN** se enmascaran `{ numeroDocumento: "99991234", primerApellido: "MUÑOZ", segundoApellido: null, primerNombre: "ÑANDÚ", segundoNombre: "" }`
- **THEN** quedan `{ numeroDocumento: "******34", primerApellido: "M****", segundoApellido: null, primerNombre: "Ñ****", segundoNombre: "" }`

#### Scenario: Opción enmascarar
- **WHEN** se lee la amarilla y la digital sintéticas con `enmascarar: false`, y aparte sin la opción
- **THEN** con `false` los campos son `numeroDocumento` `9999123456`, `primerApellido` `PRUEBA`, `primerNombre` `FICTICIA`, y `nuip` `9999123456`, `serial` `999912345`, `apellidos` `PRUEBA EJEMPLO`, `nombres` `FICTICIA LUZ`; sin la opción, `********56` y `*******45`

#### Scenario: Pantalla de resultado de la amarilla
- **WHEN** se completa el flujo con `amarilla-1080p`
- **THEN** `data-pantalla` vale `resultado`, `data-tipo` vale `pdf417`, "Número de documento" muestra `9999123456`, "Primer apellido" `PRUEBA`, "Primer nombre" `FICTICIA`, se ven "RH" y "Lugar de nacimiento", y ningún atributo del DOM contiene esos valores

#### Scenario: Pantalla de resultado de la digital
- **WHEN** se completa el flujo con `digital-1080p`
- **THEN** `data-tipo` vale `mrz`, "Número de documento" muestra `9999123456`, "Serial" `999912345`, "Apellidos" `PRUEBA EJEMPLO` y "Nombres" `FICTICIA LUZ`, y el texto visible no contiene las líneas MRZ

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

#### Scenario: Bytes a cero si el parser lanza
- **WHEN** `leerDocumento` recibe bytes de PDF417 y el parser inyectado lanza una excepción
- **THEN** la excepción se propaga y cada byte del buffer PDF417 vale 0

#### Scenario: Mensaje inválido con píxeles
- **WHEN** el manejador del Worker lector recibe un mensaje `leer` mal formado (p. ej. `id` no entero) cuyo campo `pixeles` es un `ArrayBuffer`
- **THEN** responde `null` y cada byte de ese `ArrayBuffer` vale 0

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
La PWA MUST mostrar la pantalla `error-lectura` con `data-error` y un texto fijo por código, y un botón "Intentar de nuevo" que vuelve a la cámara (`activo`). La pantalla `resultado` MUST ofrecer un botón "Leer otra" que también vuelve a `activo`; ambos ponen a cero la captura anterior. La tabla de códigos y textos está en el escenario "Mapeo de errores".

#### Scenario: Mapeo de errores
- **WHEN** se clasifica cada uno de los cuatro errores de la tabla con `clasificarErrorLectura`
- **THEN** devuelve: MRZ no encontrada tras `pdf417-no-encontrado` → `no-encontrado`, "No se encontró el código de la cédula ni la zona de lectura. Acerca el documento y evita reflejos."; `tiempo-agotado` (LMI-13) → `tiempo-agotado`, "La lectura tardó demasiado. Inténtalo de nuevo con mejor luz."; parser con `ok: false` → `no-valido`, "Se leyó un código, pero no corresponde a una cédula válida."; fallo del Worker o del WASM → `motor`, "No se pudo iniciar el lector en este dispositivo."; `menor-de-edad` (OFF-24) → `menor-de-edad`, "Este lector solo admite cédulas de ciudadanía de mayores de edad."; y cualquier otro valor (incluido `undefined`) → `motor`

#### Scenario: Tarjeta sin código legible
- **WHEN** se completa el flujo con `tarjeta-ilegible-1080p` (tarjeta con barras que no forman un PDF417 válido; una escena sin cédula ya no llega a `listo` por OFF-22): llega a `listo`, la lectura empieza sola (OFF-19) y termina
- **THEN** `data-pantalla` vale `error-lectura`, `data-error` vale `no-encontrado` y el botón "Intentar de nuevo" lleva a `data-pantalla="activo"`

### Requirement: OFF-14 Lectura fuera del hilo principal
La decodificación, el OCR y el parseo MUST ejecutarse en el Worker lector. La lectura MUST empezar sin acción del usuario al llegar a `listo` (OFF-19). Durante la lectura la pantalla `leyendo` MUST mostrar "Leyendo documento…" en una región `aria-live="polite"` y un botón "Cancelar" que aborta la lectura con `AbortSignal` y vuelve a `activo`.

#### Scenario: Hilo principal libre
- **WHEN** se mide con `PerformanceObserver` de tipo `longtask` desde que `data-pantalla` vale `leyendo` hasta `resultado` con `digital-1080p`
- **THEN** ninguna tarea larga supera 200 ms

#### Scenario: Cancelar
- **WHEN** en `leyendo` se pulsa "Cancelar"
- **THEN** `data-pantalla` vale `activo` en menos de 1 s y llega al Worker un mensaje `cancelar`; no se muestra resultado

### Requirement: OFF-15 Tiempos objetivo en Pixel 7 emulado
Con el proyecto Playwright de Pixel 7, la CPU limitada a 4x con `Emulation.setCPUThrottlingRate` y sin conexión tras la primera visita, el tiempo desde la captura aceptada hasta `resultado` (medida `lectura:tiempo`) MUST cumplir en 20 lecturas: amarilla p95 <= 1500 ms; digital p95 <= 5000 ms; digital girada 90° p95 <= 10000 ms. El arranque del Worker lector (primera lectura de la sesión) MUST quedar incluido en la medida.

#### Scenario: Medida desde listo
- **WHEN** se completa una lectura con `amarilla-1080p`
- **THEN** existe exactamente una medida `lectura:tiempo` de `performance`, que empieza al llegar a `listo` (cuando la lectura empieza sola, OFF-19) y termina al mostrarse `resultado`

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

### Requirement: OFF-19 Lectura automática al llegar a listo
Al aceptarse la captura, la PWA MUST pasar por `listo` (cámara y análisis detenidos, CAM-10) y empezar la lectura en el mismo momento, sin ninguna acción del usuario: `listo` es transitorio hacia `leyendo`. `listo` MUST NOT mostrar el botón "Repetir"; la vuelta a la cámara se hace desde `resultado` ("Leer otra"), desde `error-lectura` ("Intentar de nuevo") o con "Cancelar" en `leyendo`. Decisión del usuario del 2026-10-07 (como Truora y Veriff).

#### Scenario: Transición automática
- **WHEN** se completa el flujo con `amarilla-1080p` sin pulsar ningún botón después de "Iniciar cámara"
- **THEN** el historial de pantallas contiene, en este orden, `activo`, `listo`, `leyendo` y `resultado`, y existe la medida `lectura:tiempo` de `performance`

#### Scenario: Estados de la máquina de pantallas
- **WHEN** se aplica el reductor de pantallas a `listo` con el evento `leyendo`, a `leyendo` con `leida` (resultado correcto), a `leyendo` con `leida` (error `mrz-no-encontrada` de tipo `mrz`), a `leyendo` con `leida` (`cancelada`), y a `leyendo`, `resultado` y `error-lectura` con `oculta`
- **THEN** se obtienen `leyendo`, `resultado` con el resultado enmascarado, `error-lectura` con código `no-encontrado`, `leyendo` sin cambio, e `inicio` en los tres casos de `oculta`


### Requirement: OFF-20 Atribución de datos y licencias de terceros
La PWA MUST ofrecer una pantalla `licencias` ("Acerca de y licencias"), alcanzable desde `inicio` y desde `resultado`, que funciona sin conexión, con la atribución de los datos DIVIPOL y DIVIPOLA bajo CC BY-SA 4.0 y un enlace a `/assets/THIRD_PARTY_LICENSES.txt`. La compilación MUST generar ese archivo con los textos de licencia de los componentes redistribuidos y MUST incluirlo en la precaché. Veredicto condicional del revisor de licencias (condiciones C1 a C3).

#### Scenario: Pantalla de licencias
- **WHEN** en `inicio` se pulsa "Acerca de y licencias", y en `resultado` de la amarilla se pulsa el enlace "Fuentes: DANE y Registraduría (CC BY-SA 4.0)" junto a "Lugar de nacimiento"
- **THEN** en ambos casos `data-pantalla` vale `licencias` y el texto visible contiene: "DANE", "DIVIPOLA Códigos municipios", "gdxc-w37w", "Material adaptado: solo pares de códigos DIVIPOL-DIVIPOLA", "Registraduría Nacional del Estado Civil", "vh8b-jfhg", "AZERBAIYAN", "VIETNAM", "SINGAPUR", "88195", "88480", "se ofrece tal cual", "sin aval", "CC BY-SA 4.0" y "MIT"; hay un enlace a `https://creativecommons.org/licenses/by-sa/4.0/legalcode.es` y otro a `/assets/THIRD_PARTY_LICENSES.txt`; y el botón "Volver" regresa a la pantalla anterior con el mismo `data-resultado`

#### Scenario: Avisos de terceros en la compilación
- **WHEN** se compila con `npm run build -w apps/pwa`
- **THEN** existe `dist/assets/THIRD_PARTY_LICENSES.txt`, su ruta está en el manifiesto de precaché, y contiene "Apache License", "Version 2.0", "tesseract.js", "tesseract.js-core", "zxing-wasm", "zxing-cpp", "Preact", "Leptonica", "BSD-3-Clause", "tesseract-mrz", la fuente y el `sha256` de `models/manifest.json` y "MIT License"

#### Scenario: Licencias sin conexión
- **WHEN** tras la primera visita con `data-offline="lista"` se activa `context.setOffline(true)`, se recarga, se abre "Acerca de y licencias" y se pide `/assets/THIRD_PARTY_LICENSES.txt`
- **THEN** la pantalla se muestra y la respuesta es 200 servida por el service worker

#### Scenario: axe en la pantalla de licencias
- **WHEN** se ejecuta `AxeBuilder` en `licencias` en Chromium escritorio y Pixel 7
- **THEN** 0 violaciones con impacto `serious` o `critical`

### Requirement: OFF-21 Aviso de privacidad, autorización y textos legales
Antes de abrir la cámara, `inicio` MUST mostrar el aviso de privacidad corto y una casilla de autorización (finalidad "verificar identidad") sin marcar, que habilita "Iniciar cámara". La autorización MUST NOT persistirse (OFF-11); la prueba, si se exige, la registra el servidor o el integrador. La PWA MUST enlazar los textos legales, disponibles sin conexión, y mostrar un descargo en `resultado` (escenarios). Decisión del usuario del 2026-10-07.

#### Scenario: Origen de los textos
- **WHEN** se compila la PWA
- **THEN** los textos salen de `docs/legal/publicacion/*.md` o, si no existen, de los borradores de `docs/legal/` con sus `[MARCADORES]` visibles; y en los escenarios de este cambio y de `captura-camara`, "pulsar Iniciar cámara" incluye marcar antes la casilla

#### Scenario: Casilla obligatoria
- **WHEN** se carga `/`
- **THEN** es visible el título del aviso de la fuente ("Su privacidad" en `docs/legal/publicacion/aviso-privacidad.md`; "Tu privacidad" en el borrador), la casilla cuyo nombre accesible es el texto de autorización de la fuente (empieza por "Autorizo"; por defecto "Autorizo el tratamiento de mis datos para verificar mi identidad") no está marcada y el botón "Iniciar cámara" está deshabilitado; al marcarla se habilita y al desmarcarla se deshabilita de nuevo

#### Scenario: Alcance visible
- **WHEN** se carga `/`
- **THEN** `inicio` muestra el texto exacto "Solo para cédulas de ciudadanía de mayores de edad."

#### Scenario: Autorización no persistida
- **WHEN** se marca la casilla, se recarga la página y se inspeccionan `localStorage`, `sessionStorage`, `indexedDB.databases()` y `document.cookie`
- **THEN** la casilla vuelve a estar sin marcar, el botón está deshabilitado y el almacenamiento está vacío como en OFF-11

#### Scenario: Textos legales sin conexión
- **WHEN** tras la primera visita con `data-offline="lista"` se activa `context.setOffline(true)`, se recarga y se siguen los enlaces "Política de tratamiento" y "Términos de uso"
- **THEN** cada página carga con estado 200 servida por el service worker, contiene el título del documento y sus rutas están en el manifiesto de precaché

#### Scenario: Descargo en el resultado
- **WHEN** se completa el flujo con `amarilla-1080p`
- **THEN** la pantalla `resultado` contiene el descargo de la fuente (`## Descargo` de `docs/legal/publicacion/descargo-y-enlaces.md`; por defecto "No es una verificación oficial de la Registraduría."), que incluye "no es una verificación oficial de la Registraduría"

#### Scenario: axe en inicio con el aviso y en las páginas legales
- **WHEN** se ejecuta `AxeBuilder` en `inicio` y en las páginas de política y términos en Chromium escritorio y Pixel 7
- **THEN** 0 violaciones con impacto `serious` o `critical`

### Requirement: OFF-22 Presencia de documento antes de listo
El Worker de calidad de la PWA MUST impedir `listo` si en la guía no hay una tarjeta con proporción ID-1 (horizontal o vertical, tolerancia 20 %) y contenido de cédula (patrón PDF417 o franja MRZ con evidencia LMI-14): en ese caso el score queda por debajo del umbral con motivo `acerca` ("Acerca la cédula"). La búsqueda solo corre en frames que ya superan el umbral o cuyo único subscore por debajo del umbral es la nitidez con la varianza del Laplaciano >= `LAPLACIANO_MINIMO_GUIADO` (OFF-25). El contenido PDF417 se reconoce por el patrón nítido (bloques de 8x8 con bordes verticales fuertes) o, si no hay MRZ, por el patrón suave: al menos el 8 % de bloques de 8x8 con borde vertical medio >= 1,5, 1,5 veces más energía horizontal que vertical y todas sus filas de píxeles con al menos la mitad de la energía horizontal media (sobrevive a desenfoque, ruido y JPEG; los renglones de texto dejan filas vacías). Los bordes de la tarjeta se buscan con diferencias a 2 píxeles para tolerar un borde desenfocado. Reporte del usuario del 2026-10-07: la captura se disparaba con cualquier escena nítida.

#### Scenario: Escenas sin cédula
- **WHEN** se evalúa la presencia en frames de análisis de 640x360 nítidos de una cara dibujada, una pared, una hoja en blanco con proporción ID-1 y una hoja con renglones de texto
- **THEN** ninguno tiene presencia, y en el Worker de calidad con la presencia activada la pared da score < 70 y motivo `acerca`

#### Scenario: Cédulas sintéticas
- **WHEN** se evalúa la presencia en la amarilla, la digital y la digital girada 90 grados sintéticas de `PERSONA_BASE` colocadas en la guía
- **THEN** las tres tienen presencia, con contenido `pdf417` la amarilla y `mrz` las digitales

#### Scenario: Cédulas sintéticas degradadas y escenas degradadas
- **WHEN** se evalúa la presencia en la amarilla con contraste al 20 %, la digital y la digital girada 90 grados de `PERSONA_BASE` en la guía, degradadas con desenfoque gaussiano (sigma 1, 1,5 y 1 px del frame de análisis), ruido +-4 y JPEG de calidad 50, y en la cara, la pared, la hoja en blanco y la hoja con texto con la misma degradación (sigma 1)
- **THEN** las tres cédulas tienen presencia y ninguna de las cuatro escenas la tiene

#### Scenario: Coste
- **WHEN** se mide la evaluación en Node sobre el frame de análisis
- **THEN** tarda menos de 20 ms sin tarjeta o con PDF417 y menos de 150 ms cuando busca la MRZ

#### Scenario: Vídeo sin cédula en E2E
- **WHEN** se pulsa "Iniciar cámara" con el vídeo `sin-documento-1080p` (cara dibujada y pared nítidas) y se analizan al menos 30 frames
- **THEN** `listo` no aparece en el historial de pantallas, el feedback es "Acerca la cédula" y `amarilla-1080p` y `digital-1080p` sí llegan a `listo` (OFF-19)

### Requirement: OFF-23 Presupuesto corto de lectura en la PWA
El Worker lector de la PWA MUST usar un presupuesto de MRZ de 12 llamadas OCR y 15 000 ms (en lugar de 40 y 60 000 de LMI-13), aprovechando el orden por evidencia, y la pantalla `leyendo` MUST mostrar el progreso (segundos transcurridos) fuera de la región `aria-live`.

#### Scenario: Presupuesto
- **WHEN** se leen las constantes del Worker lector de la PWA
- **THEN** `maxLlamadasOcr` es 12 y `tiempoLimiteMs` es 15000

#### Scenario: Error rápido con una tarjeta ilegible
- **WHEN** se completa el flujo con `tarjeta-ilegible-1080p` (tarjeta con barras que no forman un PDF417 válido)
- **THEN** llega a `error-lectura` y "Intentar de nuevo" vuelve a `activo`; mientras lee, `leyendo` muestra un contador de segundos

### Requirement: OFF-24 Solo cédulas de ciudadanía de mayores de edad
El lector MUST admitir solo cédulas de ciudadanía de mayores de edad; la tarjeta de identidad (TI) MUST NOT admitirse. En la MRZ, un código de documento distinto de `IC` + `COL` se rechaza con `no-es-cedula-digital` (MZ). En el PDF417 no hay forma fiable de distinguir una TI (hipótesis H10 de `docs/decisiones/hipotesis-formato.md`), así que `leerDocumento` MUST aplicar la regla de edad a ambos tipos: si en la `fechaReferencia` la persona no ha cumplido 18 años, devuelve `{ ok: false, tipo, error: "menor-de-edad" }` sin campos. Quien nace el 29 de febrero cumple años el 1 de marzo en años no bisiestos.

#### Scenario: Exactamente 18 años
- **WHEN** se lee la amarilla sintética (y, aparte, la digital) con `fechaNacimiento` `2008-10-06` y `fechaReferencia` `2026-10-06`
- **THEN** el resultado es `ok: true`

#### Scenario: Un día menos de 18 años
- **WHEN** se lee la amarilla sintética (y, aparte, la digital) con `fechaNacimiento` `2008-10-07` y `fechaReferencia` `2026-10-06`
- **THEN** el resultado es `{ ok: false, tipo: "pdf417" | "mrz", error: "menor-de-edad" }` y los bytes del PDF417 quedan a cero

#### Scenario: Tarjeta de identidad en PDF417
- **WHEN** se lee un PDF417 sintético con el layout de la amarilla (H10) de una persona de 12 años
- **THEN** el resultado es `menor-de-edad`

#### Scenario: Tarjeta de identidad en MRZ
- **WHEN** se parsean líneas MRZ sintéticas cuyo código de documento no es `IC` (p. ej. `IT` o `TI`)
- **THEN** el parser devuelve `{ ok: false, motivo: "no-es-cedula-digital" }`

### Requirement: OFF-25 Captura guiada por la presencia de la cédula
Con la presencia activada (OFF-22), el Worker de calidad MUST dar `score` = `umbralListo` y `motivo` `null` a un frame cuyo único subscore bajo el umbral es la nitidez, con varianza del Laplaciano >= `LAPLACIANO_MINIMO_GUIADO` (12) y presencia de cédula; sin presencia, motivo `acerca`; con varianza < 12, `desenfocado`, el único caso que muestra "Desenfocado". CAL-11 no cambia. Motivo: reporte del 2026-10-07 en Android real; calibración en `docs/decisiones/2026-10-07-captura-guiada-nitidez.md`.

#### Scenario: Cédulas degradadas a nivel de celular real
- **WHEN** el Worker de calidad con presencia analiza la amarilla (contraste 20 %, sigma 1), la digital (sigma 1,5) y la digital girada 90 grados (sigma 1) degradadas como en OFF-22, cuya varianza está entre `LAPLACIANO_MINIMO_GUIADO` y 152
- **THEN** cada resultado tiene `score` 70 y `motivo` `null`, y sin la presencia activada el motivo es `desenfocado` con `score` < 70

#### Scenario: Escenas sin cédula siguen sin disparar
- **WHEN** el Worker de calidad con presencia analiza la cara, la pared, la hoja en blanco y la hoja con texto, nítidas y degradadas con sigma 1
- **THEN** ningún resultado llega a 70 y ninguno con varianza >= `LAPLACIANO_MINIMO_GUIADO` tiene motivo `desenfocado`

#### Scenario: Desenfoque extremo
- **WHEN** el Worker de calidad con presencia analiza la digital degradada con sigma 3,5 (varianza < `LAPLACIANO_MINIMO_GUIADO`)
- **THEN** el resultado tiene `score` < 70 y `motivo` `desenfocado`

#### Scenario: Vídeos suaves en E2E
- **WHEN** se pulsa "Iniciar cámara" con `amarilla-suave-1080p` (contraste de la tarjeta al 20 %, `gblur` sigma 2,5 y ruido) o `digital-suave-1080p` (`gblur` sigma 5 y ruido), cuya varianza en el frame de análisis es < 152
- **THEN** el historial de pantallas contiene `listo` y `data-pantalla` llega a `resultado`

### Requirement: OFF-26 Reintento silencioso de la lectura
Si la lectura falla con `no-encontrado`, `no-valido` o `tiempo-agotado` (OFF-13), la PWA MUST volver a `activo` sin mostrar el error y capturar otro frame, hasta 3 lecturas o 20 000 ms desde el inicio de la primera; agotado el tope, muestra `error-lectura` con el último código. `menor-de-edad` y `motor` se muestran sin reintento. Nunca hay más de una lectura en curso. Los botones de la PWA reinician la cuenta.

#### Scenario: Política de reintentos
- **WHEN** se registran lecturas fallidas `no-valido` en t = 0 y t = 1000 ms y una tercera en t = 2000 ms; aparte, una `no-encontrado` en t = 0 y otra en t = 20 000 ms; aparte, una `menor-de-edad` en t = 0; y aparte, una lectura correcta tras un fallo
- **THEN** las decisiones son `reintentar`, `reintentar`, `mostrar`; `reintentar`, `mostrar`; `mostrar`; y `mostrar` para la correcta, y un intento nuevo con la cuenta reiniciada vuelve a `reintentar`

#### Scenario: Reductor
- **WHEN** se aplica el reductor de pantallas a `leyendo` con el evento `reintento`, y a `resultado` con `reintento`
- **THEN** se obtienen `activo` sin aviso y `resultado` sin cambio

#### Scenario: Tarjeta ilegible
- **WHEN** se completa el flujo con `tarjeta-ilegible-1080p`
- **THEN** `leyendo` aparece al menos dos veces en el historial de pantallas, separadas por `activo`, y termina en `error-lectura` con `data-error` `no-encontrado`

### Requirement: OFF-27 Pista de tipo desde la presencia
El Worker de calidad con presencia MUST devolver, junto al resultado del frame, el `contenido` detectado (`"pdf417"`, `"mrz"` o `null` si la presencia no se evaluó o no hay cédula). La PWA MUST pasar el `contenido` del frame de revalidación aceptado como `pista` hasta `leerDocumento` (cliente, mensaje `leer` y manejador del Worker lector). Con `pista`, `leerDocumento` MUST empezar por ese lector y probar el otro solo como respaldo cuando el primero devuelve "no encontrado" (`pdf417-no-encontrado` o `mrz-no-encontrada`); con `respaldo: false` no hay respaldo. Sin `pista` (o con un valor distinto de `"pdf417"` y `"mrz"` en el mensaje), el orden es el de OFF-06. Si ningún lector encuentra nada, el error es el del último lector intentado, con su `tipo`; `{ tipo: "pdf417", error: "pdf417-no-encontrado" }` se clasifica `no-encontrado` (amplía la tabla de OFF-13). Reporte del usuario del 2026-10-08: la lectura tardaba de 7 a 12 s porque la digital pasaba siempre por todos los intentos del PDF417.

#### Scenario: Pista MRZ
- **WHEN** se llama `leerDocumento` con `pista: "mrz"` y dependencias inyectadas cuya MRZ es válida
- **THEN** el resultado tiene `tipo: "mrz"`, el lector MRZ tiene 1 llamada y el decodificador PDF417 0

#### Scenario: Pista MRZ con respaldo
- **WHEN** se llama con `pista: "mrz"`, la MRZ devuelve `mrz-no-encontrada` y el PDF417 es válido
- **THEN** el resultado tiene `tipo: "pdf417"`, con 1 llamada a cada lector y la MRZ antes que el PDF417; si el PDF417 también devuelve `pdf417-no-encontrado`, el resultado es `{ ok: false, tipo: "pdf417", error: "pdf417-no-encontrado" }`

#### Scenario: Pista MRZ sin respaldo para otros errores
- **WHEN** se llama con `pista: "mrz"` y la MRZ devuelve `tiempo-agotado`
- **THEN** el resultado es `{ ok: false, tipo: "mrz", error: "tiempo-agotado" }` y el decodificador PDF417 tiene 0 llamadas

#### Scenario: Pista PDF417 y respaldo desactivado
- **WHEN** se llama con `pista: "pdf417"` y el PDF417 es válido; y aparte con `pista: "pdf417"`, `respaldo: false` y `pdf417-no-encontrado`
- **THEN** el primero tiene `tipo: "pdf417"` y 0 llamadas a la MRZ; el segundo es `{ ok: false, tipo: "pdf417", error: "pdf417-no-encontrado" }` con 0 llamadas a la MRZ, y `clasificarErrorLectura` lo clasifica `no-encontrado`

#### Scenario: Pista en el Worker lector
- **WHEN** el manejador del Worker lector recibe `leer` con `pista: "mrz"`, y aparte con `pista: "qr"`
- **THEN** el primero llama al lector MRZ y no al decodificador (MRZ válida); el segundo sigue el orden de OFF-06

#### Scenario: Contenido en la respuesta del Worker de calidad
- **WHEN** el Worker de calidad con presencia analiza la amarilla y la digital sintéticas en la guía, y sin presencia la amarilla
- **THEN** las respuestas tienen `contenido` `"pdf417"`, `"mrz"` y `null`

### Requirement: OFF-28 PDF417 en frames de vídeo
Para la cédula amarilla la PWA MUST leer con más detalle que el frame de análisis. (a) Al aceptar una captura con pista distinta de `"mrz"`, y antes de detener las pistas (CAM-10), si existe `ImageCapture` y su instancia tiene `takePhoto`, la PWA MUST pedir una foto con la máxima resolución de `getPhotoCapabilities()` (`imageWidth.max`, `imageHeight.max`), con un límite de 3000 ms, decodificarla en memoria con `createImageBitmap` y dibujarla en un canvas con el lado mayor <= 4096; si algo falla, usa el frame del vídeo. Las restricciones de `getUserMedia` de CAM-03 no cambian. (b) El Worker lector de la PWA MUST usar el decodificador con `realce: true`: tras los intentos de banda (LPI-11) y antes de la rejilla, sobre el recorte de la banda (o la mitad inferior de la imagen si no hay banda), los intentos `realce-x2` y `realce-x2-global` (ampliación bilineal x2, estiramiento de contraste entre los percentiles 2 y 98 y enfoque horizontal k = 3, radio 3), `realce-x3` y `realce-x3-global` (x3, k = 3, radio 4) y `realce-x1` (sin ampliar, k = 2, radio 1), con binarizador `LocalAverage` o `GlobalHistogram`, aceptados solo si el parser de la amarilla acepta los bytes; sin `realce` el orden de LPI-11 no cambia. El límite de tiempo del decodificador en la PWA es 6000 ms por frame. (c) Con pista `"pdf417"` la PWA MUST tomar hasta 5 frames de lectura antes de detener las pistas (la foto si la hay, el frame aceptado y frames consecutivos del vídeo) y leerlos en orden con la pista y `respaldo: false`: para en el primero leído o con un error que no es "no encontrado" (OFF-13) y no empieza un frame nuevo pasados 8000 ms desde el primero. Si ninguno se lee y hay pista, el respaldo de OFF-27 se hace una sola vez al final, sobre el primer frame, con el otro lector y `respaldo: false` (así el respaldo MRZ, de hasta 15 s por OFF-23, no consume el presupuesto de los frames; medido el 2026-10-08 con `amarilla-suave-1080p`). Sin pista, cada frame se lee con el orden de OFF-06. Cada frame se pone a cero tras su última lectura (el primero, tras el respaldo) y todos al terminar (OFF-11).

#### Scenario: Frame de vídeo degradado
- **WHEN** se decodifica en Node un frame sintético de 1920x1080 de la amarilla de `PERSONA_BASE` con módulos de 2 px, giro 1 grado, desenfoque gaussiano sigma 1,3 y JPEG calidad 60, y otro con sigma 1,2 y JPEG calidad 45
- **THEN** sin `realce` ambos dan `pdf417-no-encontrado` y con `realce: true` ambos dan los bytes de `PERSONA_BASE` con un intento `realce-*`

#### Scenario: Sin lecturas falsas
- **WHEN** se decodifica con `realce: true` un frame de 1920x1080 con una tarjeta de barras verticales aleatorias que no forman un PDF417 y otro con la amarilla demasiado degradada (sigma 2,5)
- **THEN** ambos dan `pdf417-no-encontrado`

#### Scenario: Orden con realce
- **WHEN** se decodifica con `realce: true` y un lector que nunca encuentra nada una imagen de 1920x1080 con banda
- **THEN** las llamadas 12 a 16 llevan los binarizadores `LocalAverage`, `GlobalHistogram`, `LocalAverage`, `GlobalHistogram` y `LocalAverage` sobre imágenes de 2, 2, 3, 3 y 1 veces el ancho de la banda, y las siguientes son la rejilla

#### Scenario: Varios frames
- **WHEN** la secuencia de lectura con pista `pdf417` recibe 5 frames con un lector inyectado que devuelve `no-encontrado` en los dos primeros y una lectura correcta en el tercero; aparte, `no-valido` en el primero; aparte, el reloj supera 8000 ms tras el segundo; aparte, `no-encontrado` en todos; y aparte, sin pista, `no-encontrado` en todos
- **THEN** el primero da el resultado correcto con 3 lecturas con el lector `pdf417`; el segundo da `no-valido` con 1 lectura; el tercero hace 2 lecturas `pdf417` y el respaldo `mrz` sobre el primer frame; el cuarto hace 5 lecturas `pdf417` y 1 `mrz` sobre el primer frame y devuelve el resultado de la MRZ; el quinto hace 5 lecturas sin pista y ningún respaldo; en todos, los 5 frames quedan a cero

#### Scenario: Foto de alta resolución
- **WHEN** se toma el frame de lectura con un `ImageCapture` inyectado cuya `getPhotoCapabilities` da un máximo de 4000x3000; aparte, con uno cuyo `takePhoto` rechaza; aparte, sin `ImageCapture`
- **THEN** `takePhoto` recibe `{ imageWidth: 4000, imageHeight: 3000 }` y el frame tiene origen `takePhoto`; con el rechazo y sin `ImageCapture` no hay foto y se usan los frames del vídeo con origen `video`

### Requirement: OFF-29 Modo diagnóstico
Con el parámetro `debug=1` en la URL, la PWA MUST mostrar en `leyendo`, `resultado` y `error-lectura` un panel `[data-diagnostico]` con solo números y códigos: resolución de la pista de vídeo, pista de tipo, y por cada frame de lectura su origen (`takePhoto` o `video`), su resolución, el código del resultado (`ok:<tipo>:<intento>` o el código de error de `leerDocumento`) y su duración en ms, más el tiempo de la foto y el total. MUST NOT mostrar campos de la cédula ni imágenes, ni guardar nada (solo estado en memoria). Sin el parámetro, el panel no existe.

#### Scenario: Sin parámetro
- **WHEN** se lee la amarilla sintética sin `debug=1`
- **THEN** la página no contiene `[data-diagnostico]`

#### Scenario: Con parámetro
- **WHEN** se lee la amarilla sintética con `?debug=1`
- **THEN** `[data-diagnostico]` es visible, contiene `pdf417` y una resolución `<ancho>x<alto>`, no contiene `9999123456`, `PRUEBA` ni `FICTICIA` ni ningún `<img>`, `<canvas>` o `<video>`, y `localStorage` y `sessionStorage` están vacíos
