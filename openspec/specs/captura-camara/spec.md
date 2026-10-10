# captura-camara Specification

## Purpose
Capturar en el navegador del celular, como PWA instalable, el vídeo en vivo de la cámara trasera con la resolución necesaria para leer la cédula, guiar el encuadre y garantizar que ningún frame se persista ni salga del dispositivo.

Convenciones de los escenarios: "la PWA" es la compilación de producción de `apps/pwa` servida en `http://localhost:4173` (contexto seguro). Los vídeos (`nitida-1080p`, `desenfocada-1080p`, `reflejo-1080p`, `sobreexpuesta-1080p`, `oscura-1080p`, `nitida-720p`) son escenas sintéticas generadas con ffmpeg (design.md, decisión 11) que alimentan la cámara simulada de Chromium; no contienen ninguna cédula ni dato real. "Instrumentación" es código de la prueba inyectado con `page.addInitScript` (espías y sustituciones), nunca código de producto. "Los dos dispositivos" son los proyectos de Playwright de Chromium escritorio (1280x720) y Pixel 7 (412x839). Las pantallas de la PWA son `inicio`, `activo`, `pausado`, `listo` y `error`; cada una expone su nombre en el atributo `data-pantalla` de su contenedor.

## Requirements

### Requirement: CAM-01 Aplicación instalable con shell sin conexión
La PWA SHALL servir un manifiesto web válido y registrar un service worker que guarde en caché solo los recursos estáticos de la compilación, de modo que la pantalla `inicio` cargue sin conexión después de la primera visita. El service worker MUST NOT guardar ninguna otra respuesta.

#### Scenario: Manifiesto
- **WHEN** se pide `GET /manifest.webmanifest`
- **THEN** la respuesta es 200, se interpreta como JSON y contiene `"name": "Lector de cédula"`, `"short_name": "Cédula"`, `"lang": "es"`, `"start_url": "/"`, `"display": "standalone"` y en `icons` al menos una entrada con `"sizes": "192x192"` y otra con `"sizes": "512x512"`, ambas con `"type": "image/png"`

#### Scenario: Shell sin conexión
- **WHEN** se visita `/`, se espera a que `navigator.serviceWorker.controller` deje de ser `null`, se activa `context.setOffline(true)` y se recarga la página
- **THEN** el botón con nombre accesible "Iniciar cámara" es visible y `data-pantalla` vale `inicio`

#### Scenario: Caché limitada a recursos estáticos
- **WHEN** se completa el flujo desde "Iniciar cámara" hasta `listo` con el vídeo `nitida-1080p` y se listan las claves de todas las cachés de `CacheStorage`
- **THEN** cada URL es del mismo origen y su ruta cumple `^/(index\.html|manifest\.webmanifest|sw\.js|iconos/[^/]+\.png|assets/[^/]+)?$`

#### Scenario: Worker de calidad precacheado
- **WHEN** se calcula la lista de precarga del service worker a partir de los nombres emitidos por la compilación
- **THEN** contiene `/`, `/index.html`, `/manifest.webmanifest`, los iconos y todos los archivos de `assets/`, incluido el chunk `assets/calidad.worker-*.js` (requisito offline, OFF-01 del cambio `pwa-lectura-offline`), y nada más

#### Scenario: Análisis sin conexión
- **WHEN** se visita `/`, se espera a que `navigator.serviceWorker.controller` deje de ser `null`, se activa `context.setOffline(true)`, se recarga y se pulsa "Iniciar cámara" con el vídeo `nitida-1080p`
- **THEN** `data-pantalla` llega a `listo`

### Requirement: CAM-02 Contexto seguro y soporte de cámara
Antes de pedir la cámara, la PWA MUST comprobar `window.isSecureContext` y la existencia de `navigator.mediaDevices.getUserMedia`. Si falta alguno, MUST mostrar la pantalla `error` con el código y el texto del escenario y MUST NOT invocar `getUserMedia`. El contexto inseguro tiene prioridad sobre la falta de soporte.

#### Scenario: Evaluación del entorno
- **WHEN** se evalúa el entorno con (`isSecureContext`, `getUserMedia` disponible) igual a (true, true), (true, false), (false, true) y (false, false)
- **THEN** los resultados son, en ese orden, `apto`, `sin-soporte`, `contexto-inseguro` y `contexto-inseguro`

#### Scenario: Origen HTTP que no es localhost
- **WHEN** la PWA se abre en `http://lector.test/` (ruta de Playwright que reenvía cada petición al servidor de vista previa), con un espía de instrumentación sobre `getUserMedia`, y se pulsa "Iniciar cámara"
- **THEN** `data-pantalla` vale `error`, el contenedor tiene `data-error="contexto-inseguro"`, el texto visible incluye exactamente "La cámara solo funciona en una conexión segura (HTTPS)." y el espía registra 0 llamadas

#### Scenario: Navegador sin getUserMedia
- **WHEN** la instrumentación elimina `navigator.mediaDevices.getUserMedia` y se pulsa "Iniciar cámara"
- **THEN** el contenedor tiene `data-error="sin-soporte"` y el texto visible incluye exactamente "Este navegador no permite usar la cámara."

### Requirement: CAM-03 Solicitud de la cámara trasera
La PWA MUST pedir la cámara solo al pulsar "Iniciar cámara", con una única llamada a `getUserMedia` con las restricciones exactas del escenario, y MUST mostrar el stream en un único `<video>` en línea y sin audio.

#### Scenario: Sin cámara antes de la acción del usuario
- **WHEN** la página termina de cargar (evento `load`) con un espía de instrumentación sobre `getUserMedia` y no se pulsa ningún botón
- **THEN** el espía registra 0 llamadas y `data-pantalla` vale `inicio`

#### Scenario: Restricciones exactas
- **WHEN** se pulsa "Iniciar cámara" con el espía activo y el vídeo `nitida-1080p`
- **THEN** el espía registra exactamente 1 llamada cuyo argumento es profundamente igual a `{ "audio": false, "video": { "facingMode": { "ideal": "environment" }, "width": { "ideal": 1920 }, "height": { "ideal": 1080 } } }`

#### Scenario: Vídeo en línea
- **WHEN** `data-pantalla` vale `activo`
- **THEN** la página contiene exactamente un elemento `<video>`, con los atributos `playsinline` y `autoplay`, la propiedad `muted` en `true`, y su `srcObject` tiene 1 pista de vídeo y 0 pistas de audio

### Requirement: CAM-04 Resolución mínima
Tras obtener la pista, la PWA MUST leer su resolución con `getSettings()`. Si el lado largo es menor que 1920 o el corto menor que 1080, MUST mostrar un aviso persistente con la resolución obtenida y MUST continuar el análisis.

#### Scenario: Clasificación de resoluciones
- **WHEN** se evalúan las resoluciones (ancho x alto) 1920x1080, 1080x1920, 3840x2160, 1280x720 y 1440x1080
- **THEN** los resultados son, en ese orden, `suficiente`, `suficiente`, `suficiente`, `baja` y `baja`

#### Scenario: Cámara de 1280x720
- **WHEN** se pulsa "Iniciar cámara" con el vídeo `nitida-720p`
- **THEN** es visible un aviso con el texto exacto "Tu cámara entrega 1280x720; se necesitan 1920x1080 para leer el código." y la PWA llega a `data-pantalla="listo"`

#### Scenario: Cámara de 1920x1080
- **WHEN** se pulsa "Iniciar cámara" con el vídeo `nitida-1080p` y `data-pantalla` vale `activo`
- **THEN** no existe ningún elemento cuyo texto contenga "Tu cámara entrega"

### Requirement: CAM-05 Errores de cámara
Si `getUserMedia` rechaza, la PWA MUST mostrar la pantalla `error` con el código y el texto que corresponden al `name` del error según el escenario de clasificación, junto con el botón "Reintentar", que MUST volver a pedir la cámara.

#### Scenario: Clasificación de errores
- **WHEN** se clasifican rechazos con `name` igual a `NotAllowedError`, `SecurityError`, `NotFoundError`, `OverconstrainedError`, `NotReadableError`, `AbortError` y `TypeError`, y el valor `"x"` (que no es un error)
- **THEN** los códigos son, en ese orden, `permiso-denegado`, `permiso-denegado`, `sin-camara`, `sin-camara`, `camara-ocupada`, `camara-ocupada`, `desconocido` y `desconocido`, con los textos "Permite el acceso a la cámara para continuar." (`permiso-denegado`), "No encontramos una cámara disponible." (`sin-camara`), "La cámara está en uso por otra aplicación." (`camara-ocupada`) y "No pudimos iniciar la cámara." (`desconocido`)

#### Scenario: Permiso denegado y reintento
- **WHEN** la instrumentación hace que la primera llamada a `getUserMedia` rechace con `new DOMException("denegado", "NotAllowedError")` y que las siguientes usen la cámara simulada, se pulsa "Iniciar cámara" y después "Reintentar"
- **THEN** tras la primera pulsación el contenedor tiene `data-error="permiso-denegado"` y el texto "Permite el acceso a la cámara para continuar."; tras "Reintentar", el espía registra 2 llamadas y `data-pantalla` vale `activo`

### Requirement: CAM-06 Enfoque continuo
Si `getCapabilities().focusMode` de la pista incluye `"continuous"`, la PWA MUST llamar una sola vez a `applyConstraints({ advanced: [{ focusMode: "continuous" }] })`. Si no lo incluye o `getCapabilities` no existe, MUST NOT llamar a `applyConstraints`. Un rechazo de `applyConstraints` MUST NOT cambiar la pantalla.

#### Scenario: Pista con enfoque continuo
- **WHEN** la instrumentación hace que `MediaStreamTrack.prototype.getCapabilities` devuelva `{ "focusMode": ["manual", "continuous"] }`, espía `applyConstraints` y se pulsa "Iniciar cámara"
- **THEN** `applyConstraints` se llamó exactamente 1 vez con un argumento profundamente igual a `{ "advanced": [{ "focusMode": "continuous" }] }`

#### Scenario: Pista sin enfoque continuo o sin getCapabilities
- **WHEN** `getCapabilities` devuelve `{ "focusMode": ["manual"] }` en una ejecución y no existe en otra
- **THEN** en ambas `applyConstraints` se llamó 0 veces y `data-pantalla` vale `activo`

#### Scenario: Rechazo de applyConstraints
- **WHEN** `getCapabilities` incluye `"continuous"` y `applyConstraints` rechaza con `new DOMException("x", "OverconstrainedError")`
- **THEN** `data-pantalla` vale `activo` y no existe ningún elemento con atributo `data-error`

### Requirement: CAM-07 Frame tomado del vídeo en vivo
Todo frame, de análisis o de captura, MUST obtenerse dibujando el `<video>` en un canvas con `drawImage`, a la resolución de la pista o reducido según CAL-01. La PWA MUST NOT usar `ImageCapture` aunque exista y MUST NOT ofrecer carga de imágenes desde archivo.

#### Scenario: Sin ImageCapture
- **WHEN** la instrumentación sustituye `window.ImageCapture` por un constructor que cuenta sus usos y se completa el flujo hasta `listo` con `nitida-1080p`
- **THEN** el contador vale 0

#### Scenario: Resolución del frame de captura
- **WHEN** en Chromium real (Vitest browser) se toma un frame de captura de un `<video>` alimentado por `canvas.captureStream()` de un canvas de 1920x1080 relleno con el color (40, 120, 200)
- **THEN** el frame mide 1920x1080, su buffer tiene 8294400 bytes y el píxel central difiere del color dibujado en 3 o menos por canal

#### Scenario: Resolución del frame de análisis
- **WHEN** se toma un frame de análisis del mismo `<video>`
- **THEN** el frame mide 640x360 y su buffer tiene 921600 bytes

#### Scenario: Sin carga de archivos
- **WHEN** se inspecciona el DOM en las pantallas `inicio`, `activo`, `listo` y `error`
- **THEN** en ninguna existe un elemento `input[type=file]`

#### Scenario: Motor WebKit
- **WHEN** en el proyecto de Playwright WebKit la instrumentación sustituye `getUserMedia` por `canvas.captureStream()` de un canvas de 1920x1080 que dibuja la escena nítida (design.md, decisión 11) y se pulsa "Iniciar cámara"
- **THEN** `data-pantalla` llega a `listo`

### Requirement: CAM-08 Guía de encuadre
La PWA MUST dibujar sobre el vídeo una guía rectangular centrada con proporción 85,60:53,98 (ID-1, hipótesis C01 de `docs/decisiones/hipotesis-formato.md`), con el lado largo paralelo al lado largo del frame y del mayor tamaño cuyos lados no superen el 90 % de los lados correspondientes del frame. La guía en coordenadas del frame es el cuadrilátero de análisis por defecto.

#### Scenario: Guía en coordenadas del frame
- **WHEN** se calcula la guía para frames de 1920x1080, 1280x720, 1080x1920, 3840x2160 y 1440x1080, redondeando cada lado al entero más cercano y cada posición a `Math.round((lado del frame - lado de la guía) / 2)`
- **THEN** los resultados `{ x, y, ancho, alto }` son, en ese orden, `{ 190, 54, 1541, 972 }`, `{ 126, 36, 1028, 648 }`, `{ 54, 190, 972, 1541 }`, `{ 379, 108, 3083, 1944 }` y `{ 72, 132, 1296, 817 }`

#### Scenario: Guía en pantalla
- **WHEN** el vídeo `nitida-1080p` se muestra a pantalla completa con `object-fit: contain` en los dos dispositivos
- **THEN** la caja del elemento de la guía mide, con tolerancia de 1 px CSS, `x 126,67`, `y 36`, `ancho 1027,33` y `alto 648` en Chromium escritorio, y `x 40,77`, `y 315,21`, `ancho 330,67` y `alto 208,57` en Pixel 7

#### Scenario: Apariencia de la guía
- **WHEN** dentro del contenedor `mcr.microsoft.com/playwright:v1.63.0-noble` se toma una captura de pantalla de la pantalla `activo` con el `<video>` enmascarado, con el vídeo `reflejo-1080p` y el texto "Hay reflejo, inclina la cédula" visible, en los dos dispositivos
- **THEN** la diferencia con la imagen de referencia es como máximo el 1 % de los píxeles

### Requirement: CAM-09 Accesibilidad de la captura
Cada pantalla MUST pasar axe con las etiquetas WCAG 2.0, 2.1 y 2.2 A y AA sin violaciones de impacto serious ni critical. El feedback MUST anunciarse en una única región `role="status"`, cada botón MUST medir al menos 44x44 px CSS y la guía MUST ser decorativa.

#### Scenario: axe en cada pantalla
- **WHEN** se analiza con `@axe-core/playwright` y `withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])` cada una de las pantallas `inicio`, `activo`, `pausado`, `listo` y `error` (código `permiso-denegado`) en los dos dispositivos
- **THEN** el número de violaciones con `impact` igual a `serious` o `critical` es 0 en cada análisis

#### Scenario: Región de estado única
- **WHEN** `data-pantalla` vale `activo`
- **THEN** existe exactamente un elemento con `role="status"`, tiene `aria-live="polite"` y su texto es el feedback vigente de CAL-12

#### Scenario: Botones, guía, idioma y título
- **WHEN** se miden los botones visibles de cada pantalla y se inspeccionan la guía y el documento
- **THEN** cada botón tiene ancho y alto de 44 px CSS o más, la guía tiene `aria-hidden="true"`, el elemento `html` tiene `lang="es"` y el título es "Lector de cédula"

#### Scenario: Apariencia de las pantallas
- **WHEN** dentro del contenedor `mcr.microsoft.com/playwright:v1.63.0-noble` se toman capturas de pantalla de `inicio`, `listo` y `error` (código `permiso-denegado`) con el `<video>` enmascarado, en los dos dispositivos
- **THEN** la diferencia con cada imagen de referencia es como máximo el 1 % de los píxeles

### Requirement: CAM-10 Ciclo de vida de la cámara
La PWA MUST detener todas las pistas y el análisis al llegar a `listo`, al pulsar "Cancelar" y cuando la página pasa a oculta. Tras ocultarse MUST mostrar la pantalla `pausado` y MUST reanudar solo cuando el usuario pulsa "Continuar".

#### Scenario: Pistas detenidas en listo
- **WHEN** la instrumentación guarda cada stream devuelto por `getUserMedia` y se llega a `listo` con `nitida-1080p`
- **THEN** cada pista guardada tiene `readyState` igual a `"ended"` y no existe ningún `<video>` con `srcObject` distinto de `null`

#### Scenario: Cancelar
- **WHEN** en `activo` se pulsa "Cancelar"
- **THEN** cada pista guardada tiene `readyState` igual a `"ended"` y `data-pantalla` vale `inicio`

#### Scenario: Página oculta y reanudación
- **WHEN** en `activo` la instrumentación redefine `document.visibilityState` como `"hidden"` y despacha `visibilitychange`, después lo redefine como `"visible"` y lo despacha, y por último se pulsa "Continuar"
- **THEN** tras ocultarse cada pista guardada tiene `readyState` `"ended"`, `data-pantalla` vale `pausado` y es visible el texto "Cámara en pausa"; volver a `"visible"` no añade llamadas a `getUserMedia`; tras "Continuar", el espía registra exactamente una llamada más y `data-pantalla` vale `activo`

### Requirement: CAM-11 Ningún frame persiste ni sale del dispositivo
Durante todo el flujo, la PWA MUST NOT enviar por red, guardar en el navegador ni codificar como archivo ningún frame ni captura (principio III). Las únicas peticiones permitidas son GET del mismo origen a los recursos estáticos de CAM-01. Los bytes de la captura MUST ponerse a cero al pulsar "Repetir" o "Cancelar" y al ocultarse la página.

#### Scenario: Red durante el flujo completo
- **WHEN** con `nitida-1080p` se registran todas las peticiones del contexto, incluidas las del service worker, y todos los WebSockets, mientras se pulsa "Iniciar cámara", se llega a `listo`, se pulsa "Repetir" y se vuelve a llegar a `listo`
- **THEN** cada petición tiene método `GET`, el mismo origen que la PWA, `postData()` igual a `null` y una ruta que cumple la expresión de CAM-01, y el número de WebSockets es 0

#### Scenario: Almacenamiento tras el flujo
- **WHEN** termina el flujo del escenario anterior
- **THEN** `localStorage.length` es 0, `sessionStorage.length` es 0, `indexedDB.databases()` devuelve `[]`, el directorio raíz de `navigator.storage.getDirectory()` no tiene entradas, `context.cookies()` devuelve `[]` y las cachés cumplen el escenario "Caché limitada a recursos estáticos" de CAM-01

#### Scenario: Código fuente sin salidas de datos
- **WHEN** se analizan los archivos de `packages/capture/src/` y `apps/pwa/src/`
- **THEN** no aparece ninguno de `fetch(`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, `localStorage`, `sessionStorage`, `indexedDB`, `caches`, `getDirectory`, `createObjectURL`, `toBlob`, `toDataURL` ni `convertToBlob`, salvo `fetch(` y `caches` en el archivo del service worker y `convertToBlob` en `packages/capture/src/mrz/entorno.ts` (codificación PNG en memoria que el lector MRZ del cambio `leer-mrz-desde-imagen` entrega a Tesseract.js dentro del dispositivo; el resultado no se guarda ni se envía), y `npm run check:privacidad` termina con 0 hallazgos

#### Scenario: Borrado de la captura
- **WHEN** en Chromium real (Vitest browser) se libera una captura aceptada de 1920x1080
- **THEN** los 8294400 bytes de su buffer valen 0 y la captura informa `liberada: true`

### Requirement: CAM-12 Presupuesto de carga del shell
La compilación de producción MUST obtener en Lighthouse (configuración móvil por defecto) performance de 0,90 o más y accesibilidad de 0,95 o más, con 300 KB o menos de JavaScript transferido en la carga inicial. El código del Worker de calidad MUST descargarse solo después de pulsar "Iniciar cámara".

#### Scenario: Lighthouse CI
- **WHEN** se ejecuta `npx @lhci/cli autorun --config=apps/pwa/lighthouserc.json` sobre `apps/pwa/dist`
- **THEN** todas las aserciones pasan: `categories:performance` >= 0,90, `categories:accessibility` >= 0,95 y `resource-summary:script:size` <= 307200 bytes

#### Scenario: Worker diferido
- **WHEN** se registran las peticiones de la página (no las del service worker) desde la carga de `/` hasta que el botón "Iniciar cámara" es visible, y después hasta que `data-pantalla` vale `activo`
- **THEN** en el primer tramo ninguna ruta contiene `calidad.worker`, en el segundo exactamente una petición de la página la contiene, y el código del Worker no está en el chunk inicial (la precarga del service worker no cuenta como carga en ejecución)
