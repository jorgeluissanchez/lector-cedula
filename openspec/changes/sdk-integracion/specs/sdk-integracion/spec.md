# Spec Delta

## Purpose

Integrar el lector de cédula en cualquier aplicativo (web, backend Node y apps nativas vía flujo alojado) sin que el integrador implemente nada del lector, con un único servidor autoalojado, resultados de confianza solo del lado servidor y sin persistir imágenes.

Convenciones de esta spec (aplican a todos los escenarios):

- Claves, autorización `AUT`, reloj (`2026-10-06T15:20:00Z`, unix `1791300000`), `PROBLEM(slug)` y `CREAR` son los de `api-validaciones-contrato` (AV-xx). `KT` = `sk_test_00000000000000000000000000000000`; `KT2` = `sk_test_11111111111111111111111111111111`.
- Configuración sintética por clave (`CLAVES_API_JSON`): `KT` con `origenes` `["https://app-a.example"]`, `retornos` `["https://app-a.example/volver", "com.ejemplo.appa://lector/retorno"]` y `secreto_webhook` `whsec_sintetico_0123456789abcdef`; `KT2` con `origenes` `["https://app-b.example"]` y `retornos` `["https://app-b.example/fin"]`.
- `SRV` = `https://api.lector-cedula.example` (valor de `URL_PUBLICA` en pruebas).
- `REC` = `https://app-a.example/lector-cedula/` (assets de `@lector-cedula/web/assets` copiados al origen del ejemplo).
- Decisión del usuario (2026-10-08, segunda): el frontal funciona 100 % offline y sin backend. `servidor` y `sesion` son opcionales; sin ellos no hay ninguna petición fuera del origen del integrador. `/sdk/v1/` del servidor (SDK-05) queda como espejo opcional de los assets, no como requisito del frontal.
- Imágenes y vídeos sintéticos de `pwa-lectura-offline` (`amarilla-1080p`, `digital-1080p`, `PERSONA_BASE`: NUIP `9999123456`, `PRUEBA EJEMPLO FICTICIA LUZ`). Ningún dato real.
- "Resultado de presentación" = objeto `detail` del evento `resultado` o retorno de `leerDocumento()`. "Resultado de confianza" = cuerpo de `GET /v1/validations/{id}` obtenido por el backend con su clave.
- Decisión del usuario (2026-10-08): el frontal es HEADLESS. Núcleo `@lector-cedula/web`; adaptadores `@lector-cedula/react`, `@lector-cedula/angular`, `@lector-cedula/vue`; componente opcional `@lector-cedula/elementos`.
- `OpcionesLector` = `{ servidor?, sesion?, recursos?, documentos?, admitirTi?, enviarMenores?, idioma? }` (`servidor` `https` o `http://localhost`; `sesion` exige `servidor`; `recursos` URL base de los assets; `idioma` solo afecta a `error.mensaje`).
- `ControladorLector` = `{ iniciar(video: HTMLVideoElement): Promise<void>, cancelar(), reintentar(), destruir(), obtenerEstado(): EstadoLector, suscribir(fn): () => void }`.
- `TRANSICIONES` (únicas permitidas): `inicio→permiso`, `permiso→activo`, `permiso→error`, `activo→listo`, `listo→activo`, `listo→leyendo`, `activo→leyendo` (captura guiada), `leyendo→resultado`, `leyendo→activo` (reintento automático), `leyendo→error`, `activo|listo→error` (fallo del análisis de calidad, código `calidad-error`), `permiso|activo|listo|leyendo→inicio` (`cancelar`), `resultado|error→permiso` (`reintentar`).
- `EstadoLector` = `{ fase, calidad: { score 0..100, motivo: "oscuro"|"sobreexpuesto"|"reflejo"|"desenfocado"|"acerca"|null } | null, guia: { video: {x,y,ancho,alto}, normalizada: {x,y,ancho,alto} } | null, contenido: "pdf417"|"mrz-td1"|"mrz-td3"|null, progreso: 0..1 | null, intento: >= 1, resultado: { tipo, campos, warnings, confiable: false, validacion_id } | null, error: { codigo, mensaje, opcion? } | null, envio: { estado: "enviando"|"enviado"|"fallido", codigo? } | null }`.
- Los tres adaptadores aceptan un segundo argumento opcional `avanzado: { deps?: DependenciasLector, crear?: (opciones, deps) => ControladorLector }` para inyectar `DEPS` o la fábrica del controlador (pruebas e integraciones avanzadas); sin él usan `crearLector`.
- `DEPS` = `DependenciasLector` falsas inyectadas (cámara, cliente de calidad, cliente lector, reloj) para pruebas sin hardware.
- El componente no introduce hipótesis de formato; las de los parsers siguen en `docs/decisiones/hipotesis-formato.md` y viajan en `warnings[]`.

## ADDED Requirements

### Requirement: SDK-01 Registro del Custom Element
El componente opcional `@lector-cedula/elementos` SHALL registrar `lector-cedula` al importarse y exportar la clase `LectorCedula`. El registro MUST ser idempotente (MUST NOT lanzar si ya existe). SHALL usar Shadow DOM `mode: "open"` y MUST NOT depender de ningún framework en runtime.

#### Scenario: Importación doble
- **WHEN** una página importa `@lector-cedula/elementos` dos veces desde dos URL distintas del mismo archivo
- **THEN** no hay excepción en consola y `customElements.get("lector-cedula") === LectorCedula` de la primera importación

#### Scenario: Sin framework
- **WHEN** se analiza el bundle `packages/elementos/dist/lector-cedula.js` y el grafo de `dependencies` de `packages/elementos/package.json`
- **THEN** no aparece ninguno de `react`, `react-dom`, `@angular/core`, `vue`, `next`, `lit`

#### Scenario: Shadow DOM
- **WHEN** se inserta `<lector-cedula></lector-cedula>` en `examples/html`
- **THEN** `elemento.shadowRoot` no es `null` y ningún estilo de la página (`* { color: red !important }`) cambia el color calculado del botón `[part="iniciar"]`

### Requirement: SDK-02 Atributos del componente
El elemento SHALL observar `sesion`, `servidor`, `recursos`, `documentos`, `admitir-ti`, `idioma` (`es`|`en`) y `tema` (`claro`|`oscuro`|`sistema`), con las mismas reglas que `OpcionesLector` (`documentos` por defecto `cedula-amarilla,cedula-digital`; valores `cedula-amarilla`, `cedula-digital`, `cedula-extranjeria`, `pasaporte`, `tarjeta-identidad`). Un valor inválido MUST emitir `error` `atributo-invalido` sin iniciar la cámara.

#### Scenario: Servidor inválido
- **WHEN** se inserta `<lector-cedula servidor="ftp://x"></lector-cedula>`
- **THEN** se emite exactamente un evento `error` con `detail` `{"codigo": "atributo-invalido", "atributo": "servidor"}` y `navigator.mediaDevices.getUserMedia` no se llama

#### Scenario: Documento desconocido
- **WHEN** `documentos="cedula-amarilla,licencia"`
- **THEN** se emite `error` con `detail` `{"codigo": "atributo-invalido", "atributo": "documentos"}`

#### Scenario: Tarjeta de identidad sin admitir-ti
- **WHEN** `documentos="tarjeta-identidad"` sin `admitir-ti`
- **THEN** se emite `error` con `detail` `{"codigo": "atributo-invalido", "atributo": "admitir-ti"}`

#### Scenario: Idioma inglés
- **WHEN** `idioma="en"`
- **THEN** el texto del botón `[part="iniciar"]` es `Scan document` y con `idioma="es"` es `Escanear documento`

#### Scenario: Tema oscuro
- **WHEN** `tema="oscuro"`
- **THEN** el host tiene el atributo de estado `data-tema-efectivo="oscuro"` y con `tema="sistema"` y `prefers-color-scheme: dark` emulado también es `oscuro`

### Requirement: SDK-03 Eventos del componente
El elemento SHALL emitir `CustomEvent` (`bubbles`, `composed`): `resultado` (`tipo`, `campos`, `warnings`, `confiable`, `validacion_id`), `error` (`codigo`, `mensaje`, `atributo`?) y `cancelado` (`motivo`). `confiable` MUST ser siempre `false` y `validacion_id` `null` sin `sesion`. `codigo` MUST ser uno de `atributo-invalido`, `camara-denegada`, `camara-no-disponible`, `motor-no-disponible`, `sesion-invalida`, `sesion-vencida`, `subida-fallida`, `lectura-fallida`.

#### Scenario: Resultado de la amarilla
- **WHEN** en `examples/html` con `amarilla-1080p` y sin `sesion` la lectura termina
- **THEN** hay exactamente un evento `resultado`, capturado en `document`, con `detail.tipo` `"cedula-amarilla"`, `detail.campos.nuip` `"9999123456"`, `detail.confiable` `false` y `detail.validacion_id` `null`

#### Scenario: Cancelación con Escape
- **WHEN** la cámara está activa y el usuario pulsa `Escape`
- **THEN** se emite `cancelado` con `detail` `{"motivo": "usuario"}`, todas las pistas del `MediaStream` quedan en `readyState` `"ended"` y no se emite `resultado`

#### Scenario: Cámara denegada
- **WHEN** el contexto de Playwright no concede el permiso `camera`
- **THEN** se emite `error` con `detail.codigo` `"camara-denegada"`

#### Scenario: Desconexión libera la cámara
- **WHEN** el elemento se quita del DOM durante la captura
- **THEN** `expect.poll` confirma que todas las pistas están en `"ended"` y no se emite ningún evento posterior

### Requirement: SDK-04 Carga inicial acotada y motor diferido
La entrada del componente opcional (núcleo incluido) MUST pesar <= 61 440 bytes gzip nivel 9. El Worker lector, los WASM, `mrz.traineddata` y DIVIPOL SHALL distribuirse en `@lector-cedula/web/assets`, fuera de la entrada JS, y MUST cargarse solo bajo demanda desde `recursos` (por omisión, la URL que resuelve el bundler del integrador con `new URL("./assets/", import.meta.url)`). El servidor MUST NOT ser necesario.

#### Scenario: Presupuesto de tamaño
- **WHEN** se ejecuta `npm run check:tamano-sdk` sobre la compilación de producción
- **THEN** informa el tamaño gzip de la entrada de `@lector-cedula/elementos` y termina con código 0 si es <= 61 440 bytes y con código 1 si es mayor (verificado con un fixture de 61 441 bytes)

#### Scenario: Sin peticiones al montar
- **WHEN** se inserta el elemento (o se llama `crearLector`) y no se inicia la lectura
- **THEN** `page.on("request")` no registra ninguna petición a `REC`

#### Scenario: Recursos desde la URL configurada
- **WHEN** se inicia la lectura con `recursos: REC` y sin `servidor`
- **THEN** toda petición del motor tiene URL que empieza por `REC` y ninguna va a un origen distinto de `https://app-a.example`

#### Scenario: Assets dentro del paquete npm
- **WHEN** se ejecuta `npm pack --dry-run --json` en `packages/web`
- **THEN** la lista contiene `assets/manifest.json`, al menos un `.wasm` y `mrz.traineddata`, y las listas de `packages/react`, `packages/angular`, `packages/vue` y `packages/elementos` no contienen `.wasm` ni `.traineddata`

### Requirement: SDK-05 Servicio de recursos del motor
El servidor SHALL servir los recursos del motor en `GET /sdk/v1/<archivo-con-hash>` con `Cache-Control: public, max-age=31536000, immutable`, `Cross-Origin-Resource-Policy: cross-origin` y `Access-Control-Allow-Origin` igual al `Origin` solo si ese origen está en los `origenes` de alguna clave configurada. Un archivo inexistente MUST responder 404 `PROBLEM(not-found)`.

#### Scenario: Origen permitido
- **WHEN** se pide `GET /sdk/v1/<wasm>` con `Origin: https://app-a.example`
- **THEN** la respuesta es 200 con `Access-Control-Allow-Origin: https://app-a.example`, `Content-Type: application/wasm` y `Cache-Control: public, max-age=31536000, immutable`

#### Scenario: Origen no configurado
- **WHEN** se pide el mismo recurso con `Origin: https://intruso.example`
- **THEN** la respuesta no contiene la cabecera `Access-Control-Allow-Origin`

#### Scenario: Solo recursos del motor y CORS solo en 200
- **WHEN** existe `notas-1a2b.txt` en el directorio y se pide, y se pide `no-existe.wasm` con `Origin: https://app-a.example`
- **THEN** ambas respuestas son 404 `PROBLEM(not-found)` sin `Access-Control-Allow-Origin` (solo se sirven `.wasm`, `.js` y `.mjs`; `DIRECTORIO_SDK` debe ser una ruta absoluta o el servidor no arranca)

### Requirement: SDK-06 Caché offline del motor
Tras verificar los recursos (SDK-39), el núcleo SHALL guardarlos en la Cache Storage `lector-cedula-sdk-<version>`, SHALL poder leer sin red, MUST borrar las cachés de otras versiones y MUST NOT cachear imágenes ni resultados. Para recargar la página sin red, el paquete SHALL ofrecer `precacheLector(recursos)` en `@lector-cedula/web/sw` para el service worker del integrador.

#### Scenario: Segunda lectura sin red
- **WHEN** tras una lectura con red se ejecuta `context.setOffline(true)` y se repite la lectura con `amarilla-1080p` sin `servidor` ni `sesion`
- **THEN** el estado llega a `resultado` con `resultado.campos.nuip` `"9999123456"`

#### Scenario: Contenido de la caché
- **WHEN** se enumeran las claves de todas las cachés tras la lectura
- **THEN** todas las URL empiezan por `REC` y ninguna respuesta tiene `Content-Type` `image/*` o `application/json` salvo `REC + "manifest.json"`

#### Scenario: Limpieza de versiones previas
- **WHEN** existe la caché `lector-cedula-sdk-0.0.1` y se carga la versión `0.1.0`
- **THEN** tras la primera lectura `caches.keys()` es exactamente `["lector-cedula-sdk-0.1.0"]`

#### Scenario: Recarga sin red con el service worker del paquete
- **WHEN** `examples/vanilla` registra un service worker que llama `precacheLector(REC)`, se carga una vez con red, se activa `context.setOffline(true)` y se recarga la página
- **THEN** la página carga y una lectura de `amarilla-1080p` llega a `resultado` con NUIP `"9999123456"`

### Requirement: SDK-07 Precarga opcional del motor
`@lector-cedula/web` SHALL exportar `precargarMotor({ recursos? }): Promise<void>` que descarga, verifica y compila el motor sin pedir la cámara. Tras resolverse, la primera lectura MUST NOT hacer peticiones de red del motor ni de los módulos diferidos del núcleo (dependencias por omisión), que `precargarMotor` también carga.

#### Scenario: Precarga y lectura
- **WHEN** se llama `await precargarMotor({ recursos: REC })` y luego se lee `amarilla-1080p`
- **THEN** `getUserMedia` no se llamó durante la precarga y entre `iniciar` y `resultado` no hay peticiones a `REC`

#### Scenario: Precarga sin red
- **WHEN** en un ejemplo compilado se llama `precargarMotor({ recursos: REC })`, se corta la red y se lee `amarilla-1080p`
- **THEN** la lectura termina en `resultado` sin pedir ningún chunk JavaScript (el módulo de dependencias por omisión ya se cargó en la precarga)

#### Scenario: Recursos no disponibles en la precarga
- **WHEN** `REC` responde 404 a `manifest.json`
- **THEN** la promesa se rechaza con un `Error` cuyo `codigo` es `"motor-no-disponible"`

### Requirement: SDK-08 API headless leerDocumento
`@lector-cedula/web` SHALL exportar `leerDocumento(entrada, opciones): Promise<ResultadoLectura>` donde `entrada` es `Blob`, `ImageBitmap` o `ImageData` y `opciones` incluye `recursos?`, `documentos`, `admitirTi` y `senal` (`AbortSignal`). El resultado MUST ser igual, campo a campo, al `detail` del evento `resultado` para la misma imagen. Sin código legible MUST rechazar con `codigo` `"lectura-fallida"`. MUST NOT usar la cámara ni el DOM.

#### Scenario: Mismo objeto que el estado
- **WHEN** se llama `leerDocumento(png_amarilla_sintetica, { recursos: REC })` y se lee el mismo PNG con `crearLector` sin servidor
- **THEN** el valor resuelto es igual con `toStrictEqual` a `obtenerEstado().resultado` en fase `resultado`

#### Scenario: Diferencial con el componente
- **WHEN** se llama `leerDocumento(png_amarilla_sintetica, { recursos: REC })` y se lee el mismo PNG con el componente
- **THEN** ambos resultados son iguales con `toStrictEqual`

#### Scenario: Imagen sin documento
- **WHEN** la entrada es un PNG de 1280x800 relleno de gris `#808080`
- **THEN** la promesa se rechaza con `codigo` `"lectura-fallida"`

#### Scenario: Cancelación
- **WHEN** se aborta `senal` antes de que termine
- **THEN** la promesa se rechaza con un `DOMException` de nombre `"AbortError"`

### Requirement: SDK-09 Tiempos de lectura
La medida `lector-cedula:tiempo` SHALL ir de la entrada en fase `leyendo` a la fase `resultado` (como la PWA en OFF-15) y SHALL cumplir los presupuestos de OFF-15 (amarilla p95 <= 1500 ms, digital p95 <= 5000 ms en Pixel 7 emulado con CPU 4x, 20 lecturas) con el motor ya precargado. La descarga en frío del motor (~20 MB, sin precarga ni caché, red emulada "Fast 4G") se mide aparte e informa su duración como anotación del E2E, sin umbral bloqueante hasta medir en dispositivos reales.

#### Scenario: Amarilla en caliente
- **WHEN** se hacen 20 lecturas de `amarilla-1080p` en `examples/vanilla` tras `precargarMotor`
- **THEN** el p95 de la medida `lector-cedula:tiempo` (de `leyendo` a `resultado`) es <= 1500 ms

#### Scenario: Descarga en frío informada
- **WHEN** en un contexto nuevo sin caché con red "Fast 4G" se ejecuta `precargarMotor`
- **THEN** el E2E anota la duración de la descarga (`descarga-fria-ms`) y no falla por su valor

### Requirement: SDK-10 Accesibilidad del componente
Cada estado visible del componente (`inicio`, `camara`, `leyendo`, `resultado`, `error`) MUST tener 0 violaciones axe `serious` o `critical`; los controles MUST ser operables con teclado y los cambios de estado MUST anunciarse en una región `aria-live="polite"` dentro del Shadow DOM.

#### Scenario: Axe por estado
- **WHEN** se analiza con `@axe-core/playwright` cada estado en `examples/html` con `idioma="es"` y `tema="oscuro"`
- **THEN** hay 0 violaciones `serious` o `critical`

#### Scenario: Anuncio de estado
- **WHEN** la lectura pasa a `leyendo`
- **THEN** la región `[part="estado"][aria-live="polite"]` contiene `Leyendo documento`

### Requirement: SDK-11 Privacidad del componente
El núcleo (`crearLector`), los adaptadores, el componente y `leerDocumento` MUST NOT escribir imágenes, fotogramas ni campos del documento en `localStorage`, `sessionStorage`, IndexedDB, Cache Storage ni cookies, MUST NOT llamar `console.*` con datos del documento y MUST NOT enviar imágenes a la red salvo a la `upload.url` de una sesión (SDK-14). Al emitir `resultado`, `cancelado` o `error`, MUST liberar los buffers de píxeles y detener la cámara.

#### Scenario: Sin almacenamiento local
- **WHEN** termina una lectura sin `sesion`
- **THEN** `localStorage.length` y `sessionStorage.length` son 0, `indexedDB.databases()` devuelve `[]`, `document.cookie` es `""` y ninguna caché contiene `9999123456` al buscarlo en sus cuerpos

#### Scenario: Sin envío de imagen sin sesión
- **WHEN** termina una lectura sin `sesion`
- **THEN** ninguna petición registrada tiene método `POST` ni cuerpo `multipart/form-data`

#### Scenario: Consola limpia
- **WHEN** se capturan los mensajes de consola de una lectura completa
- **THEN** ninguno contiene `9999123456` ni `FICTICIA`

### Requirement: SDK-12 Ejemplos por framework con UI propia
El repositorio SHALL incluir ejemplos web en `examples/html` (componente opcional), `vanilla` (núcleo), `react`, `next`, `angular` y `vue` (adaptadores), y de backend en `express`, `nest` y `fastify` (`@lector-cedula/servidor`). Los ejemplos headless MUST dibujar su propia UI, distinta entre sí y sin `<lector-cedula>`. Cada ejemplo web MUST mostrar `[data-prueba="nuip"]`, `[data-prueba="fase"]` y `[data-prueba="guia"]`.

#### Scenario: Lectura en cada framework
- **WHEN** se ejecuta el E2E `e2e/sdk/ejemplos.spec.ts` con `amarilla-1080p` contra cada uno de `html`, `vanilla`, `react`, `next`, `angular` y `vue`
- **THEN** en los seis `[data-prueba="nuip"]` muestra `9999123456`

#### Scenario: UI personalizada distinta por framework
- **WHEN** el E2E toma, en fase `activo`, el `getComputedStyle` de `[data-prueba="guia"]` (`border-color`, `border-radius`) y el texto de `[data-prueba="iniciar"]` en `vanilla`, `react`, `angular` y `vue`
- **THEN** las cuatro tuplas son distintas dos a dos, coinciden con las declaradas en `examples/<x>/estilo-esperado.json` y ningún documento contiene un elemento `lector-cedula` ni una hoja de estilo cuyo `href` o `ownerNode` provenga de `@lector-cedula/*`

#### Scenario: Next sin errores de hidratación
- **WHEN** se carga `examples/next` compilado con `next build` y `next start`
- **THEN** la consola no contiene `Hydration`, `window is not defined`, `navigator is not defined` ni `document is not defined`, y `next build` termina con código 0

#### Scenario: Núcleo compatible con bundlers
- **WHEN** se analizan las fuentes de `packages/web/src` y se compila `examples/next` con `next build` (Turbopack)
- **THEN** ningún archivo contiene `new URL(<literal>, import.meta.url)`, la compilación termina con código 0 y los recursos por omisión son la carpeta `assets/` junto al módulo, resuelta en tiempo de ejecución

#### Scenario: Tipos de los adaptadores
- **WHEN** se ejecuta la comprobación de tipos de `examples/react` y `examples/next` (`tsc --noEmit`), `examples/angular` (`ng build`) y `examples/vue` (`vue-tsc --noEmit`)
- **THEN** las cuatro terminan con código 0 usando los tipos `EstadoLector` y `OpcionesLector` exportados por `@lector-cedula/web`

### Requirement: SDK-13 Sesión alojada en la creación
`POST /v1/validations` SHALL aceptar el campo opcional `return_url` y la respuesta SHALL incluir `hosted_url` con forma `<URL_PUBLICA>/v/<token>`, donde `<token>` cumple `^[A-Za-z0-9_-]{43,}$`, está firmado con `SECRETO_SUBIDA`, identifica la validación, vence con `upload.expires_at` y no es igual al token de `upload.url`. `return_url` MUST pertenecer exactamente a la lista `retornos` de la clave; si no, 422 con `pointer` `/return_url` y `code` `return_url_not_allowed`.

#### Scenario: Creación con retorno permitido
- **WHEN** se hace `CREAR` con `return_url` `"https://app-a.example/volver"` y `KT`
- **THEN** la respuesta es 201, `hosted_url` cumple `^https://api\.lector-cedula\.example/v/[A-Za-z0-9_-]{43,}$` y `return_url` es `"https://app-a.example/volver"`

#### Scenario: Subclaves por propósito
- **WHEN** se emiten el token de `upload.url` y el de `hosted_url` para la misma validación
- **THEN** cada uno se firma con una subclave HKDF-SHA256 distinta derivada de `SECRETO_SUBIDA` (información `lector-cedula/subida` y `lector-cedula/alojada`) y el formato del token de subida (54 caracteres) no cambia

#### Scenario: Retorno de otra clave
- **WHEN** se hace `CREAR` con `return_url` `"https://app-b.example/fin"` y `KT`
- **THEN** la respuesta es 422 `PROBLEM(invalid-request)` con `errors` `[{"pointer": "/return_url", "code": "return_url_not_allowed"}]`

#### Scenario: Deeplink nativo
- **WHEN** se hace `CREAR` con `return_url` `"com.ejemplo.appa://lector/retorno"` y `KT`
- **THEN** la respuesta es 201

#### Scenario: Sin retorno
- **WHEN** se hace `CREAR` sin `return_url`
- **THEN** la respuesta es 201 con `return_url` `null` y `hosted_url` presente

#### Scenario: Estado terminal
- **WHEN** la validación creada con `return_url` llega a un estado terminal y se consulta con `KT`
- **THEN** `hosted_url` es `null` (como `upload`) y `return_url` se conserva

### Requirement: SDK-14 Página alojada en modo sesión
`GET /v/{token}` SHALL servir la PWA en modo sesión: lee en el dispositivo, sube a `upload.url` (AV-07) y navega a `return_url` solo con `validation_id` y `estado` (`completada`|`cancelada`). Un token inválido o vencido MUST mostrar `data-pantalla="sesion-invalida"` sin pedir la cámara. El HTML MUST llevar CSP sin `unsafe-eval` (salvo `wasm-unsafe-eval`), `Referrer-Policy: no-referrer` y `Cache-Control: no-store`.

#### Scenario: Flujo completo con retorno
- **WHEN** se crea una sesión sandbox con `return_url` `"https://app-a.example/volver"`, se abre `hosted_url` con `amarilla-1080p` y termina la lectura
- **THEN** la página navega a `https://app-a.example/volver?validation_id=<id>&estado=completada` y la URL no contiene `9999123456`

#### Scenario: Cancelación
- **WHEN** el usuario pulsa `[data-accion="cancelar"]`
- **THEN** navega a `return_url` con `estado=cancelada` y la validación sigue en `pending`

#### Scenario: Token alterado
- **WHEN** se abre `hosted_url` con el último carácter del token cambiado
- **THEN** se muestra `data-pantalla="sesion-invalida"` y `getUserMedia` no se llama

#### Scenario: Token vencido
- **WHEN** el reloj del servidor avanza a `2026-10-06T15:35:01Z` y se abre `hosted_url`
- **THEN** se muestra `data-pantalla="sesion-invalida"`

#### Scenario: La redirección solo lleva identificador y estado
- **WHEN** termina la lectura (o se cancela) en `hosted_url` con `return_url` `"https://app-a.example/volver"`
- **THEN** la URL de destino tiene exactamente los parámetros `validation_id` y `estado`, sin fragmento, y no contiene el token, campos del documento ni `9999123456`

#### Scenario: Aviso de autorización en la página alojada
- **WHEN** se abre `hosted_url` de una validación de cédula y luego una de tarjeta de identidad
- **THEN** antes de pedir la cámara se muestra `[data-aviso="autorizacion"]` con el texto de `autorizacion.version_texto`, y para la tarjeta de identidad además `[data-aviso="autorizacion-reforzada"]` (menor de edad)

#### Scenario: Cabeceras de la página alojada
- **WHEN** se pide `GET /v/{token}` con un token válido y con uno inválido
- **THEN** ambas respuestas llevan `Cache-Control: no-store` y `Referrer-Policy: no-referrer`

#### Scenario: Retorno a deeplink
- **WHEN** la sesión tiene `return_url` `"com.ejemplo.appa://lector/retorno"` y termina la lectura
- **THEN** Playwright registra un intento de navegación a `com.ejemplo.appa://lector/retorno?validation_id=<id>&estado=completada`

### Requirement: SDK-15 Lector en modo sesión
Con la opción `sesion` del núcleo (`crearLector({ sesion })`, el token de `hosted_url`) o el atributo `sesion` del componente opcional, el lector SHALL subir las imágenes de la captura aceptada a la `upload.url` de esa sesión y SHALL emitir `resultado` con `validacion_id` igual al `id` de la validación. El resultado de presentación MUST NOT reemplazar al de confianza: el componente MUST NOT recibir del servidor los campos del documento.

#### Scenario: Subida con sesión
- **WHEN** el componente con `sesion=<token de KT>` en `https://app-a.example` lee `amarilla-1080p`
- **THEN** hay exactamente una petición `POST` a `/v1/validations/<id>/images`, `detail.validacion_id` es `<id>` y `GET /v1/validations/<id>` con `KT` devuelve `status` terminal

#### Scenario: Origen no permitido para la clave
- **WHEN** el mismo componente se sirve desde `https://app-b.example`
- **THEN** la subida responde 403 `PROBLEM(origin-not-allowed)` y se emite `error` con `codigo` `"subida-fallida"`

### Requirement: SDK-16 Configuración multi-aplicativo por clave
`CLAVES_API_JSON` SHALL admitir por clave los campos `origenes` (lista de orígenes exactos `https://host[:puerto]`), `retornos` (lista de URL exactas `https` o con esquema personalizado de la forma `^[a-z][a-z0-9+.-]*://`) y `secreto_webhook`. Las peticiones de navegador (con `Origin`) autenticadas por clave o por token MUST rechazarse con 403 `PROBLEM(origin-not-allowed)` si el `Origin` no está en `origenes` de la clave correspondiente. Un comodín (`*`) MUST rechazarse al arrancar.

#### Scenario: Comodín en la configuración
- **WHEN** el servidor arranca con `origenes` `["*"]` en una clave
- **THEN** el proceso termina con código distinto de 0 y el mensaje contiene `origenes` sin incluir ninguna clave ni secreto

#### Scenario: Preflight por origen
- **WHEN** se hace `OPTIONS` a `upload.url` de una validación de `KT` con `Origin: https://app-b.example`
- **THEN** la respuesta no contiene `Access-Control-Allow-Origin`

#### Scenario: Petición de servidor sin Origin
- **WHEN** se hace `CREAR` con `KT` sin cabecera `Origin`
- **THEN** la respuesta es 201

#### Scenario: Forma anterior de la configuración
- **WHEN** una entrada de `CLAVES_API_JSON` solo tiene `sha256` y `secreto_webhook`
- **THEN** el servidor arranca, los orígenes de esa clave son los de `ORIGENES_CORS` (vacío si no está definida) y cualquier `return_url` da 422 `return_url_not_allowed`

### Requirement: SDK-17 El cliente no aporta datos del documento
La subida de imágenes MUST rechazar cualquier parte o campo distinto de `front`, `back` y `selfie` (por ejemplo `document`, `nuip`, `resultado`) con 422 `PROBLEM(invalid-request)`. El resultado de confianza SHALL calcularse solo en el servidor a partir de las imágenes recibidas, en memoria.

#### Scenario: Campo de resultado inyectado
- **WHEN** se sube a `upload.url` un `multipart/form-data` con `front` = `IMG_JPEG` y un campo `document` = `{"nuip":"9999000001"}`
- **THEN** la respuesta es 422 con `errors` `[{"pointer": "/document", "code": "unexpected_field"}]` y la validación sigue en `pending`

#### Scenario: Parte de archivo con otro nombre
- **WHEN** se sube una parte de archivo (con `filename`) de nombre distinto de `front`, `back` y `selfie`
- **THEN** la respuesta es 422 con `code` `unexpected_part` (AV-10 sin cambios); `unexpected_field` se reserva a campos de texto, sin `filename`

### Requirement: SDK-18 Paquete de servidor Node sin dependencias
`@lector-cedula/servidor` SHALL tener `dependencies` vacío, funcionar en Node >= 20 y en runtimes con `fetch` y `crypto.subtle` estándar, y exportar `crearCliente({ servidor, clave, fetch? })` con los métodos `crearSesion(entrada)`, `obtenerResultado(id)` y `suprimir(id)`. La clave MUST NOT aparecer en errores, `toString()` ni `JSON.stringify` del cliente.

#### Scenario: Sin dependencias
- **WHEN** se lee `packages/servidor/package.json`
- **THEN** `dependencies` es `{}` o no existe

#### Scenario: Clave oculta
- **WHEN** se hace `JSON.stringify(crearCliente({ servidor: SRV, clave: KT }))` y se provoca un error de red
- **THEN** ninguna de las dos salidas contiene `sk_test_`

### Requirement: SDK-19 crearSesion
`crearSesion({ autorizacion, tipoDocumento, urlRetorno?, urlWebhook?, claveIdempotencia? })` SHALL hacer `POST /v1/validations` con `Authorization: Bearer <clave>`, `Idempotency-Key` (la dada o un UUID v4 generado) y devolver `{ id, urlAlojada, expiraEn, sandbox }`. Un error RFC 9457 MUST convertirse en `ErrorLector` con `estado`, `tipo` (el slug) y `errores`.

#### Scenario: Contrato contra el servidor real
- **WHEN** contra `api-pruebas` en Docker se llama `crearSesion({ autorizacion: AUT, tipoDocumento: "co_national-id-2000", urlRetorno: "https://app-a.example/volver" })` con `KT`
- **THEN** devuelve `id` con patrón `^val_[0-9a-f]{32}$`, `urlAlojada` con patrón `^https://api\.lector-cedula\.example/v/` y `sandbox` `true`

#### Scenario: Error tipado
- **WHEN** se llama con `urlRetorno` `"https://app-b.example/fin"` y `KT`
- **THEN** se rechaza con `ErrorLector` de `estado` 422, `tipo` `"invalid-request"` y `errores` `[{"pointer": "/return_url", "code": "return_url_not_allowed"}]`

#### Scenario: Idempotencia
- **WHEN** se llama dos veces con `claveIdempotencia` `"idem-0001"` y la misma entrada
- **THEN** ambos `id` son iguales

### Requirement: SDK-20 verificarWebhook
`verificarWebhook({ cuerpo, firma, secreto, ahora?, tolerancia? })` SHALL verificar `X-Lector-Signature` según AV-26 con comparación en tiempo constante y tolerancia por defecto de 300 s, y devolver `{ valido: true, evento }` o `{ valido: false, motivo }` con `motivo` en `firma-ausente`, `formato-invalido`, `firma-incorrecta`, `fuera-de-tolerancia`, `cuerpo-invalido`. `cuerpo` MUST ser los bytes exactos (`Uint8Array` o `string`); MUST NOT lanzar con ninguna entrada.

#### Scenario: Vector 1 de AV-26
- **WHEN** se verifica el cuerpo de 232 bytes de AV-25 con su firma del vector 1, secreto `whsec_sintetico_0123456789abcdef` y `ahora` `1791300000`
- **THEN** devuelve `valido` `true` y `evento.data.status` `"success"`

#### Scenario: Cuerpo alterado
- **WHEN** se cambia `"success"` por `"failure"` en el cuerpo y se usa la firma original
- **THEN** devuelve `{ "valido": false, "motivo": "firma-incorrecta" }`

#### Scenario: Repetición tardía
- **WHEN** se verifica el vector 1 con `ahora` `1791300301`
- **THEN** devuelve `{ "valido": false, "motivo": "fuera-de-tolerancia" }`

#### Scenario: Cabecera ausente o rota
- **WHEN** `firma` es `undefined` y luego `"v1=abc"`
- **THEN** devuelve `motivo` `"firma-ausente"` y `"formato-invalido"` respectivamente

#### Scenario: Propiedad nunca lanza y detecta alteraciones
- **WHEN** fast-check genera 1000 pares de cuerpo binario y secreto, firma con la referencia de AV-26, verifica y luego altera un byte
- **THEN** la verificación del original es `valido` `true`, la del alterado `valido` `false`, y con entradas arbitrarias (`fc.anything()`) nunca lanza

### Requirement: SDK-21 Adaptadores de framework
`@lector-cedula/servidor` SHALL exportar `manejarWebhook({ secreto, alRecibir }): (Request) => Promise<Response>` y adaptadores de una línea en `/express` (`webhookExpress`), `/nest` (`WebhookLectorModule.registrar`), `/next` (`webhookNext`, `POST` de route handler) y `/fastify` (`webhookFastify`). Todos MUST verificar sobre los bytes crudos y responder 204 si `alRecibir` resuelve, 400 con firma inválida (sin llamar `alRecibir`) y 500 si rechaza, sin datos en el cuerpo.

#### Scenario: Webhook válido en cada adaptador
- **WHEN** el servidor sandbox entrega `validation.completed` firmado a `examples/express`, `examples/nest`, `examples/next` y `examples/fastify`
- **THEN** cada uno responde 204 y `alRecibir` se llamó exactamente una vez con `evento.data.validation_id` igual al `id` creado

#### Scenario: Firma inválida
- **WHEN** se envía el mismo cuerpo con un byte de la firma cambiado a cada adaptador
- **THEN** cada uno responde 400 y `alRecibir` no se llamó

#### Scenario: Cuerpo ya parseado por middleware
- **WHEN** en `examples/express` se registra `express.json()` global antes del adaptador
- **THEN** el adaptador sigue respondiendo 204 al webhook válido (usa su propio lector de bytes crudos para su ruta)

### Requirement: SDK-22 Resultado de confianza solo en el backend
Docs y ejemplos SHALL obtener el resultado de confianza con `obtenerResultado(id)` en el backend tras el webhook; ningún ejemplo MUST decidir con el `detail` de `resultado`. `docs/sdk/modelo-amenazas.md` MUST tener `## Activos`, `## Fronteras de confianza`, `## Amenazas` y `## Mitigaciones`, con las amenazas T1 a T7 (lista en el escenario) y el requisito que mitiga cada una.

#### Scenario: Estructura del modelo de amenazas
- **WHEN** se ejecuta la prueba `tools/test/docs-sdk.test.mjs`
- **THEN** encuentra las cuatro secciones y `T1` manipulación en el cliente, `T2` repetición de webhook, `T3` robo del token, `T4` redirect abierto, `T5` clave en el navegador, `T6` suplantación de origen y `T7` cámara inyectada, y cada línea de amenaza cita al menos un ID que existe en esta spec (`SDK-\d{2}`) o en `api-validaciones-contrato` (`AV-\d{2}`)

#### Scenario: Ejemplos sin decisiones en el cliente
- **WHEN** se buscan en `examples/{react,angular,vue,next,html}` llamadas `fetch` o envíos que incluyan `detail.campos`
- **THEN** no hay coincidencias

#### Scenario: Clave nunca en el frontal
- **WHEN** se buscan `sk_test_` y `sk_live_` en los bundles compilados de los ejemplos web y en `packages/web/dist`
- **THEN** no hay coincidencias

### Requirement: SDK-23 Clientes generados desde OpenAPI
CI SHALL generar desde `server/openapi/api-validaciones.yaml` clientes `typescript-fetch`, `kotlin`, `swift5` y `python` con `openapitools/openapi-generator-cli` fijada por digest y compilarlos (`tsc`, Gradle, `swift build`, `compileall`), todo en Docker y sin versionarlos en git. Las rutas nuevas (`/v/{token}`, `/sdk/v1/{archivo}`) MUST declararse en el contrato manteniendo la paridad de AV-01.

#### Scenario: Generación y compilación
- **WHEN** se ejecuta `npm run clientes:generar`
- **THEN** termina con código 0 y existen `clientes/typescript`, `clientes/kotlin`, `clientes/swift` y `clientes/python` compilados

#### Scenario: Contrato roto
- **WHEN** se ejecuta el mismo comando con un contrato fixture que referencia un esquema inexistente
- **THEN** termina con código distinto de 0

### Requirement: SDK-24 Versionado y publicación
Los paquetes `@lector-cedula/*` SHALL seguir semver desde `0.1.0` con `CHANGELOG.md` (una sección `## <version>` por versión). La parte mayor de `/sdk/v<mayor>/` y de la caché MUST cambiar solo con la versión mayor. La publicación MUST ejecutarse solo en un workflow con entorno protegido con aprobación humana y `npm publish --provenance`; ningún agente MUST tener el token.

#### Scenario: CHANGELOG coherente
- **WHEN** se ejecuta `npm run check:versiones`
- **THEN** termina con código 0 si cada `package.json` tiene su `version` como sección en su `CHANGELOG.md` y con código 1 si falta (verificado con un fixture)

#### Scenario: Publicación protegida
- **WHEN** se analiza `.github/workflows/publicar-sdk.yml`
- **THEN** el job de publicación declara `environment: npm-publicacion`, `permissions.id-token: write`, el comando contiene `--provenance` y ningún otro workflow referencia `NPM_TOKEN`

#### Scenario: Tarball sin artefactos de compilación
- **WHEN** se ejecuta `npm pack --dry-run --json --ignore-scripts` en `packages/web`
- **THEN** la lista no contiene `dist/.tsbuildinfo`

### Requirement: SDK-25 Documentación por framework
`docs/sdk/` SHALL contener `README.md` (elección de modo: componente, headless o alojado), una guía por cada uno de `html`, `react`, `angular`, `vue`, `next`, `express`, `nest`, `fastify`, y `nativo.md` con el flujo alojado en Kotlin (Custom Tabs), Swift (`ASWebAuthenticationSession` o `SFSafariViewController`), React Native y Flutter. Cada bloque de código marcado `<!-- ejemplo: <ruta> -->` MUST ser idéntico al archivo referenciado de `examples/`.

#### Scenario: Snippets sincronizados
- **WHEN** se ejecuta `tools/test/docs-sdk.test.mjs`
- **THEN** cada bloque marcado coincide byte a byte con su archivo y falla si se altera una línea del archivo de ejemplo

#### Scenario: Guías completas
- **WHEN** se listan los archivos de `docs/sdk/`
- **THEN** existen `README.md`, `html.md`, `react.md`, `angular.md`, `vue.md`, `next.md`, `express.md`, `nest.md`, `fastify.md`, `nativo.md` y `modelo-amenazas.md`

### Requirement: SDK-26 Licencias y privacidad del SDK
Toda dependencia nueva (runtime o de ejemplos) MUST estar en la lista permitida y pasar `npm run check:licencias`; los paquetes publicados MUST declarar `"license": "MIT"`. `npm run check:privacidad` MUST cubrir `packages/web`, `packages/servidor` y `examples/` sin hallazgos.

#### Scenario: Licencias del workspace
- **WHEN** se ejecuta `npm run check:licencias` con los ejemplos instalados
- **THEN** termina con código 0

#### Scenario: Privacidad de los nuevos paquetes
- **WHEN** se ejecuta `npm run check:privacidad`
- **THEN** termina con código 0 y su salida lista `packages/web`, `packages/react`, `packages/angular`, `packages/vue`, `packages/elementos`, `packages/servidor` y `examples` entre las rutas analizadas

#### Scenario: Licencias dentro del tarball
- **WHEN** se ejecuta `npm pack --dry-run --json --ignore-scripts` en `packages/web`
- **THEN** la lista contiene `LICENSE` (idéntico al MIT de la raíz), `THIRD_PARTY_LICENSES.txt` y `dist/assets/THIRD_PARTY_LICENSES.txt`, y este último figura en `dist/assets/manifest.json` con su SHA-256

#### Scenario: Avisos de terceros completos del SDK
- **WHEN** se lee `packages/web/THIRD_PARTY_LICENSES.txt` (generado por `tools/avisos-terceros.mjs`, el mismo módulo que genera el de la PWA)
- **THEN** contiene los textos completos de licencia de zxing-wasm, zxing-cpp, tesseract.js, tesseract.js-core, Tesseract OCR, Leptonica, zlib, tesseractMRZ (BSD-3-Clause, DoubangoTelecom), la tabla DIVIPOL de Eitol (MIT), jpeg-js (BSD-3-Clause) y pngjs (MIT), y la atribución CC BY-SA 4.0 de Divipole Exterior 2018 (Registraduría, `vh8b-jfhg`) con `https://creativecommons.org/licenses/by-sa/4.0/legalcode.es`, los cambios hechos, "tal cual" y sin aval; no nombra componentes que no van en el paquete (Preact, DIVIPOLA del DANE)

#### Scenario: check:licencias exige las licencias del tarball
- **WHEN** `npm run check:licencias` evalúa la lista de `npm pack --dry-run --json` de `packages/web` y a esa lista le falta `LICENSE` o `THIRD_PARTY_LICENSES.txt`
- **THEN** termina con código 1 y nombra el archivo faltante (verificado con una lista fixture); con la lista real termina con código 0

### Requirement: SDK-27 Núcleo headless crearLector
`@lector-cedula/web` SHALL exportar `crearLector(opciones: OpcionesLector, deps?: DependenciasLector): ControladorLector` sin UI ni estilos. Las fases MUST ser `inicio`, `permiso`, `activo`, `listo`, `leyendo`, `resultado` y `error`, y solo MUST ocurrir las `TRANSICIONES`. Las dependencias por omisión SHALL reutilizar `packages/capture` (cámara, Worker de calidad, Worker lector, captura guiada, pista de tipo, reintentos) sin duplicar su lógica.

#### Scenario: Flujo feliz con dependencias falsas
- **WHEN** se crea `crearLector({}, deps)` (sin servidor) con una cámara falsa que concede el permiso, un cliente de calidad que emite `score` 40, 90, 90 y un lector falso que devuelve el resultado sintético de `PERSONA_BASE`, y se llama `iniciar(video)`
- **THEN** la secuencia de `fase` recibida por `suscribir` es exactamente `["permiso", "activo", "listo", "leyendo", "resultado"]`

#### Scenario: Permiso denegado
- **WHEN** la cámara falsa rechaza con `NotAllowedError`
- **THEN** la secuencia es `["permiso", "error"]` y `obtenerEstado().error` es `{"codigo": "camara-denegada", "mensaje": "<texto no vacío>"}`

#### Scenario: Transiciones inválidas
- **WHEN** se generan con fast-check secuencias arbitrarias de hasta 50 eventos entre `iniciar`, `cancelar`, `reintentar`, `destruir`, frames de calidad, éxito y fallo del lector
- **THEN** cada par consecutivo de fases observado pertenece a la lista de transiciones permitidas y ninguna llamada lanza

#### Scenario: Servidor inválido
- **WHEN** `crearLector({ servidor: "ftp://x" }, deps)`
- **THEN** el estado inicial es fase `error` con `error` `{"codigo": "opcion-invalida", "opcion": "servidor", "mensaje": "<texto no vacío>"}` y `iniciar` no llama a la cámara

### Requirement: SDK-28 Estado expuesto por el núcleo
`obtenerEstado()` y `suscribir` SHALL entregar `EstadoLector` inmutable (`Object.isFrozen`). `resultado.confiable` MUST ser siempre `false`. Cada cambio MUST producir un objeto nuevo y `suscribir` MUST NOT notificar si el estado no cambió.

#### Scenario: Guía en ambas coordenadas
- **WHEN** el vídeo falso es de 1920x1080 y la guía de `packages/capture` es `{ x: 192, y: 216, ancho: 1536, alto: 648 }`
- **THEN** `estado.guia.normalizada` es `{ x: 0.1, y: 0.2, ancho: 0.8, alto: 0.6 }` con `toStrictEqual`

#### Scenario: Motivo de calidad
- **WHEN** el cliente de calidad falso emite `{ score: 30, motivo: "reflejo" }`
- **THEN** `estado.calidad` es `{ score: 30, motivo: "reflejo" }` y la fase sigue `activo`

#### Scenario: Contenido detectado y resultado de presentación
- **WHEN** la pista de tipo detecta `mrz-td1` y el lector falso devuelve la digital sintética sin `sesion`
- **THEN** `estado.contenido` es `"mrz-td1"`, `estado.resultado.campos.nuip` es `"9999123456"`, `estado.resultado.confiable` es `false` y `estado.resultado.validacion_id` es `null`

#### Scenario: Reintento automático
- **WHEN** el lector falso falla una vez con `lectura-fallida` y acierta en el segundo intento
- **THEN** la secuencia incluye `leyendo→activo→…→leyendo→resultado` y el estado final tiene `intento` 2

#### Scenario: Sin notificaciones redundantes
- **WHEN** el cliente de calidad emite dos veces seguidas `{ score: 30, motivo: "oscuro" }`
- **THEN** el suscriptor se llama una sola vez para ese valor

### Requirement: SDK-29 Núcleo sin UI y presupuesto
`@lector-cedula/web` MUST NOT crear ni modificar elementos del DOM (salvo `srcObject` y `play()` del `video` recibido), MUST NOT inyectar CSS ni registrar Custom Elements. Su entrada MUST pesar <= 30 720 bytes gzip nivel 9, con `"sideEffects": false`; Workers, WASM, traineddata y DIVIPOL siguen diferidos desde `recursos` (SDK-04).

#### Scenario: Sin efectos en el DOM
- **WHEN** en Vitest browser se registra un `MutationObserver` sobre `document` (subárbol, atributos) y se ejecutan `crearLector`, `iniciar(video)`, una lectura completa con dependencias falsas y `destruir`
- **THEN** las únicas mutaciones observadas son de `video`, `document.styleSheets.length` y `document.adoptedStyleSheets.length` no cambian y `customElements.get("lector-cedula")` es `undefined`

#### Scenario: Presupuesto del núcleo
- **WHEN** se ejecuta `npm run check:tamano-sdk`
- **THEN** informa el gzip de `@lector-cedula/web` y termina con código 1 con un fixture de 30 721 bytes y 0 con la compilación real si es <= 30 720 bytes

#### Scenario: Importación sin efectos
- **WHEN** se importa `@lector-cedula/web` en Node 22 sin DOM (`node -e "import('@lector-cedula/web')"`)
- **THEN** termina con código 0 sin acceder a `window`, `document` ni `navigator`

### Requirement: SDK-30 Ciclo de vida y liberación
`cancelar()` SHALL detener la cámara y los Workers de la lectura en curso y llevar a `inicio` (desde `permiso`, directamente); `reintentar()` desde `resultado` o `error` SHALL volver a `permiso` con `intento` + 1; `destruir()` SHALL liberar cámara, Workers y suscriptores, y cualquier llamada posterior MUST ser no-op sin lanzar. Ninguna notificación MUST llegar tras `destruir()`.

#### Scenario: Cancelar libera la cámara
- **WHEN** en fase `activo` se llama `cancelar()`
- **THEN** la fase es `inicio`, todas las pistas de la cámara falsa tienen `readyState` `"ended"` y el Worker falso recibió `terminate`

#### Scenario: Destruir durante la lectura
- **WHEN** en fase `leyendo` se llama `destruir()` y luego el lector falso resuelve
- **THEN** el suscriptor no recibe más llamadas y `iniciar`, `cancelar` y `reintentar` posteriores no lanzan

#### Scenario: Cancelar durante el permiso
- **WHEN** se llama `cancelar()` mientras la cámara falsa aún no responde al permiso
- **THEN** la secuencia de fases es exactamente `["permiso", "inicio"]` y las pistas de la cámara falsa están en `"ended"`

#### Scenario: Reintentar tras error
- **WHEN** en fase `error` con `intento` 1 se llama `reintentar()`
- **THEN** la siguiente fase es `permiso` y `intento` es 2

### Requirement: SDK-31 Adaptador React y Next
`@lector-cedula/react` SHALL exportar `useLectorCedula(opciones)` que devuelve `{ videoRef, estado, iniciar, cancelar, reintentar }` vía `useSyncExternalStore`. MUST llevar `"use client"`, MUST NOT tocar APIs del navegador en render ni en servidor (`getServerSnapshot` da fase `inicio`) y MUST llamar `destruir()` al desmontar. `react >=18` SHALL ser `peerDependency`.

#### Scenario: Render en servidor
- **WHEN** se ejecuta `renderToString` de un componente que usa `useLectorCedula({})` en Node sin DOM
- **THEN** no lanza y el HTML contiene `data-fase="inicio"`

#### Scenario: Estado reactivo
- **WHEN** con React Testing Library y dependencias falsas se pulsa el botón que llama `iniciar()`
- **THEN** el texto de `[data-prueba="fase"]` recorre `permiso`, `activo`, `listo`, `leyendo` y `resultado`, y `[data-prueba="nuip"]` muestra `9999123456`

#### Scenario: Desmontaje
- **WHEN** se desmonta el componente en fase `activo`
- **THEN** el controlador recibió `destruir` y las pistas de la cámara falsa están en `"ended"`

### Requirement: SDK-32 Adaptador Angular
`@lector-cedula/angular` SHALL exportar `injectLectorCedula(opciones)` que devuelve `{ video(el), estado: Signal<EstadoLector>, iniciar, cancelar, reintentar }`, standalone y sin requerir `zone.js`. MUST destruir con `DestroyRef` y, en plataforma servidor, MUST NOT crear el controlador. `@angular/core` SHALL ser `peerDependency`.

#### Scenario: Signal reactiva sin zone
- **WHEN** en TestBed sin zone.js y con dependencias falsas se llama `iniciar()`
- **THEN** tras `fixture.whenStable()` el texto de `[data-prueba="fase"]` es `resultado` y `[data-prueba="nuip"]` muestra `9999123456`

#### Scenario: Destrucción
- **WHEN** se destruye el fixture en fase `activo`
- **THEN** el controlador recibió `destruir`

#### Scenario: Plataforma servidor
- **WHEN** se instancia el componente con `PLATFORM_ID` `"server"`
- **THEN** `estado().fase` es `"inicio"` y la fábrica del controlador no se llamó

### Requirement: SDK-33 Adaptador Vue
`@lector-cedula/vue` SHALL exportar `useLectorCedula(opciones): { videoRef: Ref<HTMLVideoElement | null>, estado: Readonly<ShallowRef<EstadoLector>>, iniciar, cancelar, reintentar }`, crear el controlador en `onMounted` y llamar `destruir()` en `onBeforeUnmount`. En SSR (`renderToString` de `vue/server-renderer`) MUST NOT tocar APIs del navegador. `vue` SHALL ser `peerDependency` (`>=3.3`).

#### Scenario: Ref reactiva
- **WHEN** con Vue Test Utils y dependencias falsas se llama `iniciar()`
- **THEN** tras `flushPromises()` `[data-prueba="fase"]` es `resultado` y `[data-prueba="nuip"]` muestra `9999123456`

#### Scenario: SSR
- **WHEN** se ejecuta `renderToString` del componente de prueba en Node
- **THEN** no lanza y el HTML contiene `data-fase="inicio"`

#### Scenario: Desmontaje
- **WHEN** se llama `wrapper.unmount()` en fase `activo`
- **THEN** el controlador recibió `destruir`

### Requirement: SDK-34 Adaptadores finos sin UI
Cada adaptador (`@lector-cedula/react`, `@lector-cedula/angular`, `@lector-cedula/vue`) MUST pesar <= 3 072 bytes gzip nivel 9 excluyendo el núcleo y el framework, MUST declarar el framework y `@lector-cedula/web` como `peerDependencies`, MUST tener `dependencies` vacías y MUST NOT exportar componentes con marcado ni estilos (solo el hook o la función de inyección y tipos reexportados).

#### Scenario: Presupuesto de adaptadores
- **WHEN** se ejecuta `npm run check:tamano-sdk`
- **THEN** informa el gzip de cada adaptador y termina con código 1 con un fixture de 3 073 bytes y 0 si los tres son <= 3 072 bytes

#### Scenario: Manifiestos
- **WHEN** se leen los `package.json` de los tres adaptadores
- **THEN** `dependencies` es `{}` o ausente, `peerDependencies` contiene `@lector-cedula/web` y su framework, y ningún archivo de `dist/` contiene `<style`, `adoptedStyleSheets` ni `customElements.define`

### Requirement: SDK-35 La PWA consume el núcleo
`apps/pwa` (pública y modo sesión) SHALL obtener fase, calidad, guía, contenido, progreso, intento, resultado y error exclusivamente de `crearLector` de `@lector-cedula/web` (vía `@lector-cedula/react` si usa React); MUST NOT importar directamente `packages/capture/src/navegador/*` ni `flujo/autocaptura`. Los E2E existentes de la PWA MUST seguir en verde sin cambiar sus umbrales.

#### Scenario: Sin acceso directo a la captura
- **WHEN** se analizan los imports de `apps/pwa/src/**/*.{ts,tsx}`
- **THEN** ninguno resuelve a `packages/capture/src/navegador/` ni a `packages/capture/src/flujo/autocaptura`, y al menos uno importa `@lector-cedula/web` o `@lector-cedula/react`

#### Scenario: Regresión de la PWA
- **WHEN** se ejecuta `npm run test:e2e` tras la migración
- **THEN** todos los E2E previos de `apps/pwa` pasan en Chromium y Pixel 7 con los mismos umbrales

### Requirement: SDK-36 Componente opcional sobre el núcleo
`@lector-cedula/elementos` SHALL implementarse solo sobre `crearLector` (sin importar `packages/capture` directamente), SHALL exponer las partes `iniciar`, `estado`, `video`, `guia`, `cancelar` y `reintentar` vía `::part()` y SHALL leer las variables CSS `--lector-color-primario`, `--lector-color-fondo`, `--lector-color-texto`, `--lector-radio` y `--lector-fuente` con valores por defecto. Mantiene SDK-01 a SDK-04, SDK-10 y SDK-15.

#### Scenario: Variable CSS
- **WHEN** la página declara `lector-cedula { --lector-color-primario: rgb(1, 2, 3) }`
- **THEN** el `background-color` calculado de `[part="iniciar"]` es `rgb(1, 2, 3)`

#### Scenario: Parte estilable
- **WHEN** la página declara `lector-cedula::part(guia) { border-radius: 7px }` y el componente está en `activo`
- **THEN** el `border-radius` calculado de `[part="guia"]` es `7px`

#### Scenario: Solo el núcleo
- **WHEN** se analizan los imports de `packages/elementos/src`
- **THEN** ninguno resuelve a `packages/capture` y al menos uno importa `crearLector` de `@lector-cedula/web`

### Requirement: SDK-37 Lectura local sin servidor
Sin `servidor` ni `sesion`, el núcleo (y cualquier adaptador o el componente) SHALL leer localmente y entregar `resultado` con `confiable: false` y `validacion_id: null`, y MUST NOT hacer ninguna petición de red a orígenes distintos del origen del integrador. Con la red cortada tras cargar la página y los recursos, la lectura MUST completarse igual. Esto MUST cumplirse en todos los ejemplos headless (`vanilla`, `react`, `next`, `angular`, `vue`) y en `html`.

#### Scenario: Lectura completa con la red cortada
- **WHEN** en cada ejemplo, sin `servidor`, se ejecuta `precargarMotor({ recursos: REC })`, luego `context.setOffline(true)` y se lee `amarilla-1080p`
- **THEN** `[data-prueba="nuip"]` muestra `9999123456` y `[data-prueba="fase"]` es `resultado` en los seis ejemplos

#### Scenario: Cero peticiones a otros orígenes
- **WHEN** se registran todas las peticiones con `page.on("request")` durante la carga y una lectura completa sin `servidor` en cada ejemplo
- **THEN** todas tienen origen `https://app-a.example` (el del ejemplo) y ninguna es `POST`

#### Scenario: Digital sin servidor
- **WHEN** sin `servidor` se lee `digital-1080p` con la red cortada
- **THEN** `estado.contenido` es `"mrz-td1"` y `estado.resultado.campos.nuip` es `"9999123456"`

### Requirement: SDK-38 Envío opcional al microservicio
Con `servidor` y `sesion`, el núcleo SHALL entregar primero el resultado local (`confiable: false`) y además subir las imágenes a la sesión (SDK-15). `envio.estado` SHALL ser `enviando`, `enviado` (con `validacion_id`) o `fallido` con `codigo` `servidor-no-disponible`, `subida-fallida`, `sesion-invalida`, `sesion-vencida` o `menor-no-enviado`; un fallo MUST conservar el resultado local. Sin `servidor`, `envio` es `null`.

#### Scenario: Servidor caído
- **WHEN** con `servidor: SRV` y `sesion` válida el servidor no responde (conexión rechazada) y se lee `amarilla-1080p`
- **THEN** la fase final es `resultado` con `resultado.campos.nuip` `"9999123456"`, `resultado.validacion_id` `null` y `envio` `{"estado": "fallido", "codigo": "servidor-no-disponible"}`

#### Scenario: Envío correcto
- **WHEN** con `servidor` y `sesion` de `KT` contra `api-pruebas` se lee `amarilla-1080p`
- **THEN** `envio.estado` pasa de `"enviando"` a `"enviado"` y `resultado.validacion_id` es el `id` de la validación

#### Scenario: Sesión sin servidor
- **WHEN** `crearLector({ sesion: "<token>" }, DEPS)` sin `servidor`
- **THEN** el estado inicial es fase `error` con `error.codigo` `"opcion-invalida"` y `error.opcion` `"servidor"`

### Requirement: SDK-41 Fallo del análisis de calidad
Si el análisis de calidad falla en `activo` o `listo`, el núcleo SHALL liberar cámara y Workers y pasar a `error` con `codigo` `"calidad-error"`.

#### Scenario: Fallo del análisis de calidad
- **WHEN** en fase `activo` el cliente de calidad falso rechaza
- **THEN** la secuencia termina en `activo→error`, `error.codigo` es `"calidad-error"`, las pistas están en `"ended"` y el Worker de calidad recibió `terminate`

### Requirement: SDK-42 Destino de la subida
`upload.url` devuelta por `POST {servidor}/v/{sesion}/inicio` MUST tener el mismo origen que `servidor` y ser `https` (o `http://localhost` / `http://127.0.0.1`); si no, el núcleo MUST NOT subir nada y `envio` es `fallido` con `sesion-invalida`.

#### Scenario: upload.url de otro origen
- **WHEN** `POST /v/{sesion}/inicio` devuelve `upload.url` `https://otro.example/subir` (o `http://api.lector-cedula.example/...`)
- **THEN** solo hubo una petición (la de inicio) y `envio` es `{"estado": "fallido", "codigo": "sesion-invalida"}`

### Requirement: SDK-43 Menores sin envío
Si el documento leído es `tarjeta-identidad` o trae `menorDeEdad: true`, el núcleo MUST NOT subir la imagen salvo `enviarMenores: true`; `envio` es `fallido` con `menor-no-enviado` y el resultado local se conserva.

#### Scenario: Menor de edad sin envío
- **WHEN** con `admitirTi: true`, `servidor` y `sesion`, el lector falso devuelve `tipoDocumento` `tarjeta-identidad` (o `menorDeEdad: true`) y no se pasa `enviarMenores`
- **THEN** la fase es `resultado`, no hay ninguna petición de red y `envio` es `{"estado": "fallido", "codigo": "menor-no-enviado"}`; con `enviarMenores: true` el envío ocurre

### Requirement: SDK-44 Higiene del envío
Las copias de píxeles de la captura y del envío MUST ponerse a cero al liberar (idempotente) y ante cualquier excepción de la captura; un servidor caído MUST NOT dejar datos en caché ni almacenamiento. El integrador MUST obtener la autorización del titular (Ley 1581 de 2012) antes de crear la sesión (documentado en `OpcionesLector` y `docs/sdk/`). Excepción temporal hasta la tarea 4.3: la misma imagen viaja como `front` y `back` (AV-07).

#### Scenario: Copias a cero
- **WHEN** se libera una captura con imagen de envío (una o dos veces) o la captura lanza a mitad
- **THEN** los píxeles de los frames, del frame completo y de la copia del envío son todos cero y la segunda liberación no lanza

#### Scenario: Servidor 503 sin rastro
- **WHEN** en el E2E con `servidor` y `sesion` el servidor responde 503 a todo y se lee `amarilla-1080p`
- **THEN** `envio.codigo` es `servidor-no-disponible`, el resultado local se muestra y ni Cache Storage (fuera de `lector-cedula-sdk-*`), ni `localStorage`, ni `sessionStorage`, ni IndexedDB contienen datos de la lectura

### Requirement: SDK-39 Integridad de los recursos
`@lector-cedula/web/assets/manifest.json` SHALL listar cada recurso con su `sha256` (hex). Antes de usar o cachear un recurso, el núcleo MUST verificar su SHA-256 con `crypto.subtle.digest`; si no coincide, MUST NOT usarlo ni cachearlo y la lectura MUST terminar en `error` con `codigo` `"motor-no-disponible"`. Mismo criterio que OFF-02 de `pwa-lectura-offline`.

#### Scenario: Recurso alterado
- **WHEN** Playwright intercepta `REC + <wasm>` y le cambia un byte
- **THEN** la fase final es `error` con `codigo` `"motor-no-disponible"` y la caché `lector-cedula-sdk-<version>` no contiene esa URL

#### Scenario: Manifiesto coherente
- **WHEN** se recalcula el SHA-256 de cada archivo de `packages/web/dist/assets` tras compilar
- **THEN** coincide con `manifest.json` para el 100 % de los archivos y no hay archivos sin entrada

### Requirement: SDK-40 Destinos de webhook solo para pruebas
Con `ENTORNO=pruebas`, el servidor SHALL aceptar y entregar una `webhook_url` idéntica a una URL de `WEBHOOK_DESTINOS_PRUEBA` (lista exacta `http`/`https`) aunque sea `http` o interna. Fuera de ese entorno la variable MUST detener el arranque; toda otra `webhook_url` MUST seguir AV-28, y el despliegue MUST NOT definirla.

#### Scenario: Aceptada en pruebas
- **WHEN** el servidor arranca con `ENTORNO=pruebas` y `WEBHOOK_DESTINOS_PRUEBA=http://host.docker.internal:8091/webhook`, se crea una validación sandbox con esa `webhook_url` y se sube `IMG_JPEG`
- **THEN** la creación es 201 y el receptor recibe un `POST` con `X-Lector-Signature` que `verificarWebhook` acepta con el secreto de la clave

#### Scenario: Rechazada en producción
- **WHEN** el servidor arranca con `WEBHOOK_DESTINOS_PRUEBA` definida y `ENTORNO` ausente o distinto de `pruebas`
- **THEN** el proceso termina con código distinto de 0 y el mensaje contiene `WEBHOOK_DESTINOS_PRUEBA`

#### Scenario: Destino no listado sigue rechazado por AV-28
- **WHEN** con `ENTORNO=pruebas` y la lista anterior se crea una validación con `webhook_url` `http://host.docker.internal:8092/otro`
- **THEN** la respuesta es 422 con `errors` `[{"pointer": "/webhook_url", "code": "invalid_webhook_url"}]`, y una `webhook_url` `https` no listada que resuelve a una IP interna sigue con el intento `blocked`

#### Scenario: Nunca en el despliegue
- **WHEN** se leen `server/compose.dokploy.yaml` y `server/dokploy.env.example`
- **THEN** ninguno contiene `WEBHOOK_DESTINOS_PRUEBA` ni `ENTORNO=pruebas`, y `compose.dokploy.yaml` no define `extra_hosts`

#### Scenario: ENTORNO con un valor desconocido
- **WHEN** el servidor arranca con `ENTORNO` distinto de `pruebas` (por ejemplo `produccion` o vacío)
- **THEN** el proceso termina con código distinto de 0 y el mensaje contiene `ENTORNO`; sin `ENTORNO` arranca normalmente
