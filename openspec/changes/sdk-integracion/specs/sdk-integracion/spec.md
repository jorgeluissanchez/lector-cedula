# Spec Delta

## Purpose

Integrar el lector de cédula en cualquier aplicativo (web, backend Node y apps nativas vía flujo alojado) sin que el integrador implemente nada del lector, con resultados de confianza solo del lado servidor y sin persistir imágenes.

Decisión del usuario (2026-10-09, modelo backend propio): la librería tiene dos partes, front headless y back. El motor (tesseract, zxing, fraude) corre en el SERVIDOR DE LA EMPRESA que usa la librería, nunca en un servidor del autor. El modelo por defecto es "front + backend propio con respuesta en vivo" (SDK-45 a SDK-52, protocolo NDJSON de MOT-20 en `motor-backend-embebido`). El microservicio con sesión, `hosted_url`, webhooks firmados y página alojada (SDK-05, SDK-13 a SDK-21, SDK-23, SDK-38, SDK-40, SDK-42) es el **modo opcional microservicio**: se conserva, pero no es el camino por omisión.

Convenciones de esta spec (aplican a todos los escenarios):

- Claves, autorización `AUT`, reloj (`2026-10-06T15:20:00Z`, unix `1791300000`), `PROBLEM(slug)` y `CREAR` son los de `api-validaciones-contrato` (AV-xx). `KT` = `sk_test_00000000000000000000000000000000`; `KT2` = `sk_test_11111111111111111111111111111111`.
- Configuración sintética por clave (`CLAVES_API_JSON`): `KT` con `origenes` `["https://app-a.example"]`, `retornos` `["https://app-a.example/volver", "com.ejemplo.appa://lector/retorno"]` y `secreto_webhook` `whsec_sintetico_0123456789abcdef`; `KT2` con `origenes` `["https://app-b.example"]` y `retornos` `["https://app-b.example/fin"]`.
- `SRV` = `https://api.lector-cedula.example` (valor de `URL_PUBLICA` en pruebas).
- `REC` = `https://app-a.example/lector-cedula/` (assets de `@lector-cedula/web/assets` copiados al origen del ejemplo).
- Decisión del usuario (2026-10-08, segunda): el frontal funciona 100 % offline y sin backend. `servidor` y `sesion` son opcionales; sin ellos no hay ninguna petición fuera del origen del integrador. `/sdk/v1/` del servidor (SDK-05) queda como espejo opcional de los assets, no como requisito del frontal.
- Imágenes y vídeos sintéticos de `pwa-lectura-offline` (`amarilla-1080p`, `digital-1080p`, `PERSONA_BASE`: NUIP `9999123456`, `PRUEBA EJEMPLO FICTICIA LUZ`). Ningún dato real.
- "Resultado de presentación" = objeto `detail` del evento `resultado` o retorno de `leerDocumento()`. "Resultado de confianza" = cuerpo de `GET /v1/validations/{id}` obtenido por el backend con su clave.
- Decisión del usuario (2026-10-08): el frontal es HEADLESS. Núcleo `@lector-cedula/web`; adaptadores `@lector-cedula/react`, `@lector-cedula/angular`, `@lector-cedula/vue`; componente opcional `@lector-cedula/elementos`.
- `OpcionesLector` = `{ modo?, umbralesAuto?, streaming?, tiempoColaMs?, backend?, encabezadosBackend?, intentosVerificacion?, tiempoLimiteMs?, inactividadMs?, autoIniciar?, servidor?, sesion?, recursos?, documentos?, admitirTi?, enviarMenores?, idioma? }` (`backend` URL del endpoint de la empresa, SDK-45; `intentosVerificacion` por omisión 3; `tiempoLimiteMs` por omisión 30 000; `inactividadMs` por omisión 15 000; `autoIniciar` por omisión `false`; `servidor` `https` o `http://localhost`, solo modo opcional microservicio; `sesion` exige `servidor`; `backend` es excluyente con `servidor`/`sesion`; `recursos` URL base de los assets; `idioma` solo afecta a `error.mensaje`).
- `DEPS` incluye por omisión señales de dispositivo potente y en línea (8 GB, 8 núcleos, SIMD, `4g`), de modo que `modo: "auto"` con `backend` decide `front-back` (SDK-57).
- `BACK` = servidor de prueba local en `https://localhost:5173/api/cedula` (mismo origen que la página) que implementa el protocolo NDJSON de MOT-20 con guiones fijos: `ok` (eventos `recibido`, `leyendo` 0.5, `fraude`, `comparando`, `resultado` ok con el documento de `PERSONA_BASE`), `rechazo:<motivo>`, `503`, `colgado` (abre el stream y no emite nada), `basura` (línea `{no-json`).
- `ControladorLector` = `{ iniciar(video: HTMLVideoElement): Promise<void>, cancelar(), reintentar(), destruir(), obtenerEstado(): EstadoLector, suscribir(fn): () => void }`.
- `TRANSICIONES` (únicas permitidas): `inicio→permiso`, `permiso→activo`, `permiso→error`, `activo→listo`, `listo→activo`, `listo→leyendo`, `activo→leyendo` (captura guiada), `leyendo→resultado`, `leyendo→activo` (reintento automático), `leyendo→error`, `activo|listo→error` (fallo del análisis de calidad, código `calidad-error`), `permiso|activo|listo|leyendo→inicio` (`cancelar`), `resultado|error→permiso` (`reintentar`); con `backend` (SDK-46): `leyendo→verificando`, `verificando→resultado` (backend ok), `verificando→activo` (rechazo con intentos restantes), `verificando→error` (intentos agotados o fallo de transporte), `verificando→inicio` (`cancelar`); en modo `back` (SDK-56): `listo→verificando`; con confirmación diferida (SDK-58): `resultado→verificando`; con `autoIniciar` (SDK-49): `permiso→inicio` también cuando la cámara no se pudo abrir sin gesto.
- `EstadoLector` = `{ fase, calidad: { score 0..100, motivo: "oscuro"|"sobreexpuesto"|"reflejo"|"desenfocado"|"acerca"|null } | null, guia: { video: {x,y,ancho,alto}, normalizada: {x,y,ancho,alto} } | null, contenido: "pdf417"|"mrz-td1"|"mrz-td3"|null, progreso: 0..1 | null, intento: >= 1, resultado: { tipo, campos, warnings, confiable: boolean, validacion_id } | null, error: { codigo, mensaje, opcion?, causa? } | null, envio: { estado: "enviando"|"enviado"|"fallido", codigo? } | null, verificacion: { etapa: "recibido"|"leyendo"|"fraude"|"comparando", progreso: 0..1 | null } | null, rechazo: { motivo: "no-coincide"|"fraude"|"ilegible"|"menor-de-edad"|"documento-no-admitido"|"demasiado-grande"|"tiempo-agotado"|"ocupado"|"error-interno", diferencias?: string[] } | null, intentosVerificacion: { usados: >= 0, maximo: >= 1 } | null, modo: "front"|"back"|"front-back" | null, modoMotivo: string | null }`.
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

### Requirement: SDK-18 Paquete de servidor Node con cliente sin motor
`@lector-cedula/servidor` SHALL depender solo de paquetes `@lector-cedula/*` (motor en proceso, MOT-19; decisión del usuario del 2026-10-09). Su subruta `@lector-cedula/servidor/cliente` (modo opcional microservicio) SHALL exportar `crearCliente({ servidor, clave, fetch? })` con `crearSesion`, `obtenerResultado` y `suprimir`, sin importar el motor y usable en Node >= 20 y runtimes con `fetch` y `crypto.subtle`. La clave MUST NOT aparecer en errores, `toString()` ni `JSON.stringify`.

#### Scenario: Sin dependencias
- **WHEN** se lee `packages/servidor/package.json` y se analiza el grafo de importaciones de `packages/servidor/src/cliente.ts`
- **THEN** cada clave de `dependencies` empieza por `@lector-cedula/` y el grafo de `cliente.ts` no alcanza `packages/servidor/src/motor/**`

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
`obtenerEstado()` y `suscribir` SHALL entregar `EstadoLector` inmutable (`Object.isFrozen`). `resultado.confiable` MUST ser `false` salvo en fase `resultado` tras un evento final `ok: true` del backend propio (SDK-46), único caso en que es `true`. Cada cambio MUST producir un objeto nuevo y `suscribir` MUST NOT notificar si el estado no cambió.

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

### Requirement: SDK-45 Opción backend del front
`crearLector` SHALL aceptar `backend: string`, URL del endpoint de la empresa: ruta relativa, mismo origen, `https:` de otro origen o `http://localhost`/`http://127.0.0.1`. Otro valor, o `backend` junto a `servidor`/`sesion`, da fase `error` `{ codigo: "opcion-invalida", opcion: "backend" }` sin red. La petición MUST usar `credentials: "same-origin"`, `cache: "no-store"` y `redirect: "error"`, y SHALL añadir `encabezadosBackend` (objeto o función async). Aplica SDK-44.

#### Scenario: Backend relativo válido
- **WHEN** en `https://localhost:5173` se crea `crearLector({ backend: "/api/cedula" }, DEPS)`
- **THEN** el estado inicial es fase `inicio` con `error` `null`

#### Scenario: Esquema inválido
- **WHEN** se crea `crearLector({ backend: "http://empresa.example/cedula" }, DEPS)` o `crearLector({ backend: "ftp://x" }, DEPS)`
- **THEN** la fase es `error`, `error.codigo` es `"opcion-invalida"`, `error.opcion` es `"backend"` y el `fetch` falso no recibió ninguna llamada

#### Scenario: Excluyente con el modo microservicio
- **WHEN** se crea `crearLector({ backend: "/api/cedula", servidor: "https://api.lector-cedula.example" }, DEPS)`
- **THEN** la fase es `error` con `error.codigo` `"opcion-invalida"` y `error.opcion` `"backend"`

#### Scenario: Cabeceras propias
- **WHEN** `encabezadosBackend` es `async () => ({ Authorization: "Bearer prueba-sintetica" })` y se completa una lectura contra `BACK` (guion `ok`)
- **THEN** la única petición a `/api/cedula` lleva `Authorization: Bearer prueba-sintetica` y `Accept: application/x-ndjson`, con `credentials` `"same-origin"` y `redirect` `"error"`

### Requirement: SDK-46 Envío automático y fase verificando
Con `backend`, al terminar la lectura local el núcleo SHALL publicar el resultado local (`confiable: false`), enviar sin acción del usuario la imagen al backend (MOT-20) y pasar a `verificando`, reflejando cada evento en `estado.verificacion = { etapa, progreso }`. Con el evento final `ok: true` SHALL pasar a `resultado` con el `documento` del backend y `confiable: true`, `verificacion` y `rechazo` en `null`, y liberar la cámara. No existe una acción de "enviar".

#### Scenario: Secuencia completa con el backend
- **WHEN** con `DEPS` (lector falso con `PERSONA_BASE`) y `fetch` dirigido a `BACK` guion `ok` se llama `iniciar(video)`
- **THEN** la secuencia de `fase` es exactamente `["permiso", "activo", "listo", "leyendo", "verificando", "resultado"]`, la secuencia de `verificacion.etapa` observada es `["recibido", "leyendo", "fraude", "comparando"]` con `progreso` `0.5` en `leyendo`, y el estado final tiene `resultado.confiable` `true` y `resultado.campos.nuip` `"9999123456"`

#### Scenario: Resultado local instantáneo antes de la verificación
- **WHEN** el primer estado con fase `verificando` llega al suscriptor
- **THEN** `estado.resultado.confiable` es `false`, `estado.resultado.campos.nuip` es `"9999123456"` y `estado.verificacion` no es `null`

#### Scenario: Una sola petición por intento
- **WHEN** se completa una lectura con `BACK` guion `ok`
- **THEN** hubo exactamente 1 petición `POST /api/cedula` con `Content-Type` `multipart/form-data` que contiene las partes `imagen` y `cliente`, y ninguna petición fuera del origen

#### Scenario: Sin backend el comportamiento previo no cambia
- **WHEN** se crea `crearLector({}, DEPS)` y se completa una lectura
- **THEN** la secuencia es `["permiso", "activo", "listo", "leyendo", "resultado"]`, `resultado.confiable` es `false` y `verificacion` es `null`

### Requirement: SDK-47 Rechazo y reintento automático
Ante el evento final `ok: false`, el núcleo SHALL exponer `estado.rechazo = { motivo, diferencias? }` y, con intentos restantes, volver solo a `activo` con la cámara abierta. Al agotar `intentosVerificacion` (por omisión 3, entero 1..10; fuera de rango da `opcion-invalida`) SHALL pasar a `error` `"verificacion-rechazada"`, conservar el último `rechazo` y liberar la cámara. `diferencias` solo lleva rutas de campo (MOT-10). Un `motivo` fuera de la lista es `protocolo-invalido`.

#### Scenario: No coincide y reintenta
- **WHEN** con `intentosVerificacion: 3` el primer envío recibe `rechazo:no-coincide` con `diferencias` `["campos.nuip"]` y el segundo recibe `ok`
- **THEN** la secuencia de fases contiene `verificando→activo` y termina en `verificando→resultado`; tras el primer envío `estado.rechazo` es `{ motivo: "no-coincide", diferencias: ["campos.nuip"] }`; el estado final tiene `rechazo` `null`, `intentosVerificacion` `{ usados: 2, maximo: 3 }` y `resultado.confiable` `true`

#### Scenario: Tope agotado
- **WHEN** con `intentosVerificacion: 2` ambos envíos reciben `rechazo:fraude`
- **THEN** la fase final es `error` con `error.codigo` `"verificacion-rechazada"`, `estado.rechazo.motivo` es `"fraude"`, hubo exactamente 2 peticiones y las pistas de la cámara falsa están en `"ended"`

#### Scenario: Cada motivo vuelve a activo
- **WHEN** para cada motivo de `["no-coincide", "fraude", "ilegible", "menor-de-edad", "documento-no-admitido", "demasiado-grande", "tiempo-agotado", "ocupado", "error-interno"]` el primer envío recibe ese rechazo con `intentosVerificacion: 3`
- **THEN** la fase siguiente a `verificando` es `activo` y `estado.rechazo.motivo` es el motivo enviado

#### Scenario: Motivo desconocido
- **WHEN** el evento final trae `{ "etapa": "resultado", "ok": false, "rechazo": { "motivo": "otro" } }`
- **THEN** la fase es `error` con `error.codigo` `"protocolo-invalido"` (SDK-48)

### Requirement: SDK-48 Cliente del protocolo en vivo
El núcleo SHALL leer la respuesta con `fetch` y `ReadableStream` (`getReader()` y `TextDecoder` en modo stream), dividiendo por salto de línea, tolerando líneas partidas y vacías; MUST NOT usar WebSocket, EventSource ni sondeo. La respuesta MUST ser 200 con `Content-Type` `application/x-ndjson`. `cancelar()` y `destruir()` en `verificando` MUST abortar la petición (`AbortController`) y poner a cero la copia de la imagen. Los fallos de transporte siguen SDK-54.

#### Scenario: Líneas partidas entre fragmentos
- **WHEN** el `ReadableStream` falso entrega primero los bytes de `{"etapa":"recibido"}` + salto de línea + `{"etapa":"lei` y después `do","progreso":0.5}` + dos saltos de línea + `{"etapa":"resultado","ok":true,"documento":<PERSONA_BASE>}` + salto de línea
- **THEN** `verificacion.etapa` pasa por `"recibido"` y `"leyendo"` y la fase final es `resultado` con `confiable` `true`

#### Scenario: Backend 503
- **WHEN** `BACK` responde con el guion `503`
- **THEN** la fase final es `error` con `error.codigo` `"backend-no-disponible"`, `estado.resultado.confiable` es `false` con `campos.nuip` `"9999123456"` y no hubo un segundo envío

#### Scenario: Backend colgado
- **WHEN** `BACK` responde con el guion `colgado`, `inactividadMs: 200` y un reloj falso que avanza 201 ms
- **THEN** la fase es `error` con `error.codigo` `"backend-tiempo-agotado"` y la señal pasada a `fetch` tiene `aborted` `true`

#### Scenario: Línea que no es JSON
- **WHEN** `BACK` responde con el guion `basura`
- **THEN** la fase es `error` con `error.codigo` `"protocolo-invalido"` y la señal de la petición está abortada

#### Scenario: Content-Type incorrecto
- **WHEN** el backend responde 200 con `Content-Type: text/html`
- **THEN** la fase es `error` con `error.codigo` `"protocolo-invalido"`

#### Scenario: Cancelar durante la verificación
- **WHEN** en fase `verificando` se llama `cancelar()`
- **THEN** la fase pasa a `inicio`, la señal de la petición está abortada, las pistas están en `"ended"` y los píxeles de la copia del envío son todos cero

#### Scenario: Propiedad del lector de líneas
- **WHEN** fast-check genera una lista de eventos válidos, la serializa como NDJSON y la corta en fragmentos de tamaños arbitrarios (incluidos cortes dentro de caracteres UTF-8 multibyte como la Ñ), y por separado genera bytes arbitrarios con `fc.uint8Array()` (numRuns >= 1000 cada una)
- **THEN** en el primer caso la lista decodificada es igual a la original; en el segundo el lector termina en eventos válidos o en `protocolo-invalido`; en ninguno lanza

### Requirement: SDK-49 Apertura automática de la cámara
Con `autoIniciar: true`, los adaptadores y el componente opcional SHALL llamar a `iniciar(video)` en cuanto el vídeo esté vinculado en el navegador, nunca en servidor. Si la cámara falla en ese arranque automático, el núcleo SHALL volver a `inicio` con `error` `{ codigo: "autoinicio-fallido", causa, mensaje }` para que la UI muestre el botón; un `iniciar` posterior sigue SDK-27. Sin `autoIniciar` no se abre la cámara al montar.

#### Scenario: Arranque al montar
- **WHEN** con React Testing Library se monta un componente con `useLectorCedula({ autoIniciar: true }, { deps })` y la cámara falsa concede el permiso
- **THEN** sin ningún clic la fase recorre `permiso` y `activo`, y la cámara falsa recibió exactamente 1 llamada

#### Scenario: Navegador que exige gesto
- **WHEN** con `autoIniciar: true` la cámara falsa rechaza con `NotAllowedError`
- **THEN** la secuencia es `["permiso", "inicio"]`, `error.codigo` es `"autoinicio-fallido"`, `error.causa` es `"camara-denegada"` y una llamada posterior a `iniciar()` vuelve a pedir la cámara

#### Scenario: Sin autoIniciar
- **WHEN** se monta `useLectorCedula({}, { deps })`
- **THEN** la fase sigue en `inicio` y la cámara falsa no recibió llamadas

#### Scenario: Render en servidor con autoIniciar
- **WHEN** se ejecuta `renderToString` de un componente con `useLectorCedula({ autoIniciar: true })` en Node sin DOM
- **THEN** no lanza y el HTML contiene `data-fase="inicio"`

### Requirement: SDK-50 Adaptadores con verificación
`useLectorCedula` (React y Vue) e `injectLectorCedula` (Angular) SHALL exponer `estado.verificacion`, `estado.rechazo` y `estado.intentosVerificacion` sin transformarlos y SHALL aceptar las opciones `backend`, `encabezadosBackend`, `intentosVerificacion`, `tiempoLimiteMs`, `inactividadMs` y `autoIniciar`. Los presupuestos de SDK-29 y SDK-34 se mantienen.

#### Scenario: Estado de verificación en React
- **WHEN** con dependencias falsas y `fetch` hacia `BACK` guion `ok` se monta un componente que pinta `[data-prueba="etapa"]` con `estado.verificacion?.etapa`
- **THEN** el texto recorre `recibido`, `leyendo`, `fraude` y `comparando`, y al final `[data-prueba="confiable"]` muestra `true`

#### Scenario: Rechazo visible en Vue y Angular
- **WHEN** el backend falso responde `rechazo:ilegible` al primer envío
- **THEN** en ambos adaptadores `estado.rechazo.motivo` es `"ilegible"` y la fase siguiente es `activo`

### Requirement: SDK-51 Ejemplos front React con backend propio
`examples/backend-express`, `examples/backend-nest` y `examples/backend-next` SHALL incluir un front React con `useLectorCedula({ backend: "/api/cedula", autoIniciar: true })` y UI propia que muestre la etapa, el rechazo y el resultado confiable, servido desde el mismo origen que el backend del ejemplo (MOT-13). Ningún ejemplo MUST contactar un servidor del autor ni un origen distinto del suyo.

#### Scenario: Flujo de punta a punta en cada ejemplo
- **WHEN** en Playwright (Chromium y Pixel 7, cámara simulada con `amarilla-1080p.y4m`) se abre la página de cada ejemplo sin pulsar nada
- **THEN** la UI muestra las etapas `recibido`, `leyendo` y `comparando`, termina con `confiable` `true` y NUIP `9999123456`, y el registro de red solo tiene peticiones al origen del ejemplo

#### Scenario: Accesibilidad de los ejemplos
- **WHEN** se ejecuta axe en las fases `inicio`, `activo`, `verificando`, `resultado` y con un rechazo visible
- **THEN** hay 0 violaciones serious o critical

### Requirement: SDK-52 Modo opcional microservicio
El modo microservicio (`servidor` y `sesion`, `hosted_url`, página alojada `/v/{token}`, webhooks firmados, `crearCliente`, SDK-05, SDK-13 a SDK-21, SDK-23, SDK-38, SDK-40 y SDK-42) SHALL seguir funcionando sin cambios como modo opcional. La documentación (`docs/sdk/README.md`) MUST presentar primero el modelo "front + backend propio" y el microservicio en una sección titulada "Modo opcional: microservicio".

#### Scenario: Regresión del modo opcional
- **WHEN** se ejecutan las pruebas existentes de SDK-38 y SDK-42 (`npx vitest run packages/web/test/sdk-38-envio.test.ts`)
- **THEN** pasan sin modificar sus aserciones

#### Scenario: Orden de la documentación
- **WHEN** `tools/test/docs-sdk.test.mjs` lee `docs/sdk/README.md`
- **THEN** el encabezado del modelo backend propio aparece antes que el encabezado `Modo opcional: microservicio`

### Requirement: SDK-53 Menores en el modo backend propio
Con `backend`, si el resultado local es `tarjeta-identidad` o trae `menorDeEdad: true` y no hay `enviarMenores: true`, el núcleo MUST NOT enviar la imagen y SHALL aplicar un rechazo local `menor-de-edad` que cuenta como intento de verificación (SDK-43, SDK-47).

#### Scenario: Menor de edad sin envío
- **WHEN** con `admitirTi: true` y `backend` el lector falso devuelve `tipoDocumento` `tarjeta-identidad` y no se pasa `enviarMenores`
- **THEN** no hay ninguna petición de red, `estado.rechazo.motivo` es `"menor-de-edad"`, `intentosVerificacion.usados` es 1 y la fase vuelve a `activo`

#### Scenario: Menor con enviarMenores
- **WHEN** el mismo caso se repite con `enviarMenores: true` y `BACK` guion `ok`
- **THEN** hubo exactamente 1 petición a `/api/cedula`

### Requirement: SDK-54 Fallos de transporte del backend
Un fallo de transporte SHALL llevar a `error` conservando el resultado local (`confiable: false`), abortar la petición, poner a cero la imagen y no consumir intentos. Códigos: `backend-no-disponible` (red o 5xx), `backend-rechazo-http` (estado distinto de 200 y 413; el 413 es rechazo `demasiado-grande`), `backend-tiempo-agotado` y `protocolo-invalido` (línea no JSON, etapa desconocida, evento tras el final, fin sin final o `Content-Type` incorrecto).

#### Scenario: 413 como rechazo
- **WHEN** el backend responde 413 al primer envío con `intentosVerificacion: 3`
- **THEN** `estado.rechazo.motivo` es `"demasiado-grande"` y la fase siguiente es `activo`

#### Scenario: Estado 401
- **WHEN** el backend responde 401
- **THEN** la fase es `error` con `error.codigo` `"backend-rechazo-http"` e `intentosVerificacion.usados` es 0

#### Scenario: Stream cerrado sin evento final
- **WHEN** el backend emite `{"etapa":"recibido"}` y cierra el stream
- **THEN** la fase es `error` con `error.codigo` `"protocolo-invalido"`

#### Scenario: Tiempo total agotado
- **WHEN** con `tiempoLimiteMs: 1000` el backend emite `{"etapa":"leyendo"}` cada 100 ms sin evento final y el reloj falso avanza 1001 ms
- **THEN** la fase es `error` con `error.codigo` `"backend-tiempo-agotado"` y la señal de la petición está abortada

#### Scenario: Reintentar tras un fallo de transporte
- **WHEN** tras `backend-no-disponible` se llama `reintentar()`
- **THEN** la fase pasa a `permiso` y el siguiente envío ocurre con `intentosVerificacion.usados` 1

### Requirement: SDK-55 Opción modo
`crearLector` SHALL aceptar `modo: "front" | "back" | "front-back" | "auto"` (por omisión `"auto"`) y exponer la decisión en `estado.modo` (`"front"|"back"|"front-back"`) y `estado.modoMotivo`. `"front"`: solo lectura local, sin red, `confiable: false`. `"back"`: captura ligera y envío, resultado del backend. `"front-back"`: SDK-46. `"back"` o `"front-back"` sin `backend` dan `opcion-invalida` con `opcion: "modo"`.

#### Scenario: Modo front ignora el backend
- **WHEN** `crearLector({ modo: "front", backend: "/api/cedula" }, DEPS)` completa una lectura
- **THEN** la secuencia es `["permiso", "activo", "listo", "leyendo", "resultado"]`, `confiable` es `false`, `estado.modo` es `"front"` y el `fetch` falso no recibió llamadas

#### Scenario: Modo back sin backend
- **WHEN** `crearLector({ modo: "back" }, DEPS)`
- **THEN** la fase es `error` con `error.codigo` `"opcion-invalida"` y `error.opcion` `"modo"`

#### Scenario: Modo front-back
- **WHEN** `crearLector({ modo: "front-back", backend: "/api/cedula" }, DEPS)` con `BACK` guion `ok`
- **THEN** la secuencia es `["permiso", "activo", "listo", "leyendo", "verificando", "resultado"]` y `estado.modo` es `"front-back"`

### Requirement: SDK-56 Modo back ligero
En `estado.modo` `"back"` el núcleo SHALL capturar solo con el análisis ligero de calidad y presencia y pasar de `listo` a `verificando` sin fase `leyendo`, y MUST NOT descargar ni instanciar el motor pesado (WASM de zxing, tesseract, `mrz.traineddata`, modelos de fraude). La descarga total del modo back MUST ser <= `PRESUPUESTO_BACK` (fijado en `design.md`; meta 300 KiB gzip). En `verificando` `resultado` es `null`.

#### Scenario: Secuencia del modo back
- **WHEN** `crearLector({ modo: "back", backend: "/api/cedula" }, DEPS)` con `BACK` guion `ok`
- **THEN** la secuencia es `["permiso", "activo", "listo", "verificando", "resultado"]`, el lector falso no recibió llamadas y `resultado.confiable` es `true`

#### Scenario: Sin descarga del motor pesado
- **WHEN** en Playwright se completa una lectura en modo back con el ejemplo Express
- **THEN** el registro de red no contiene ningún recurso de `manifest.json` marcado `pesado` (`.wasm` de zxing, `tesseract*`, `*.traineddata`, `*.onnx`) y la suma de bytes transferidos de JS y WASM es <= `PRESUPUESTO_BACK`

#### Scenario: Presupuesto con fixture que falla
- **WHEN** `npm run check:tamano-sdk` mide el grafo de importación del modo back y un fixture de `PRESUPUESTO_BACK + 1` bytes
- **THEN** el árbol real pasa y el fixture sale con código 1

### Requirement: SDK-57 Decisión del modo auto
Con `modo: "auto"` el núcleo SHALL decidir con una función pura `decidirModo(senales, umbrales)` antes de abrir la cámara: potente y backend → `front-back`; potente sin backend → `front`; débil y backend → `back`; débil sin backend → `front` con aviso; sin red → `front` (SDK-58). Señales: `deviceMemory`, `hardwareConcurrency`, WASM SIMD, `connection.saveData`/`effectiveType` y, si `umbrales.microMedicion`, una micro-medición. Los umbrales SHALL ser configurables (`umbralesAuto`).

#### Scenario: Tabla de decisión
- **WHEN** `decidirModo` recibe, con los umbrales por omisión (`memoriaMinGb` 4, `nucleosMin` 4, `simd` requerido, `saveData` débil, `effectiveType` `"slow-2g"|"2g"` débil), los casos: (8 GB, 8 núcleos, SIMD, 4g, backend, en línea), (8, 8, SIMD, 4g, sin backend, en línea), (2, 8, SIMD, 4g, backend, en línea), (8, 2, SIMD, 4g, backend, en línea), (8, 8, sin SIMD, 4g, backend, en línea), (8, 8, SIMD, saveData, backend, en línea), (2, 2, sin SIMD, 2g, sin backend, en línea), (8, 8, SIMD, 4g, backend, sin red)
- **THEN** devuelve en orden `{modo, motivo}`: `front-back`/`"potente-con-backend"`, `front`/`"potente-sin-backend"`, `back`/`"memoria-baja"`, `back`/`"pocos-nucleos"`, `back`/`"sin-simd"`, `back`/`"ahorro-datos"`, `front`/`"debil-sin-backend"` con `aviso` `"rendimiento-bajo"`, `front`/`"sin-red"`

#### Scenario: Señales ausentes
- **WHEN** el navegador no expone `deviceMemory` ni `connection` (Safari) y sí 8 núcleos y SIMD
- **THEN** esas señales no cuentan como débiles y el resultado con backend es `front-back`

#### Scenario: Umbrales configurables
- **WHEN** `umbralesAuto: { memoriaMinGb: 8 }` y el dispositivo tiene 4 GB con backend
- **THEN** `estado.modo` es `"back"` y `estado.modoMotivo` es `"memoria-baja"`

#### Scenario: Propiedad de totalidad
- **WHEN** fast-check genera señales arbitrarias (incluidos `undefined`, `NaN` y negativos) y umbrales válidos (numRuns >= 1000)
- **THEN** `decidirModo` nunca lanza, siempre devuelve uno de los tres modos y nunca devuelve `back` ni `front-back` sin backend

### Requirement: SDK-58 Confirmación diferida sin red
Si `modo` `auto` decide `front` por `"sin-red"` y hay `backend`, el núcleo SHALL entregar el resultado local y guardar la imagen solo en memoria; al evento `online` SHALL enviarla y pasar `resultado→verificando` (SDK-46/47). La cola MUST NOT persistir (sin Cache Storage, IndexedDB ni `localStorage`) y se pone a cero al confirmar, al `destruir()` o tras `tiempoColaMs` (por omisión 10 min).

#### Scenario: Vuelve la red
- **WHEN** con `navigator.onLine` falso se completa una lectura y después se dispara `online` con `BACK` guion `ok`
- **THEN** la secuencia termina en `["leyendo", "resultado", "verificando", "resultado"]`, el último `resultado.confiable` es `true` y hubo 1 petición

#### Scenario: Destruir con cola pendiente
- **WHEN** hay una imagen en la cola y se llama `destruir()`
- **THEN** los píxeles de la cola son cero, no hay petición al disparar `online` y ni IndexedDB ni `localStorage` ni Cache Storage (fuera de `lector-cedula-sdk-*`) contienen datos

#### Scenario: Cola vencida
- **WHEN** con `tiempoColaMs: 1000` el reloj falso avanza 1001 ms sin red
- **THEN** la cola está a cero y `estado.envio` es `{ estado: "fallido", codigo: "cola-vencida" }`

### Requirement: SDK-59 Streaming opcional
En modos con backend, `streaming` (por omisión `true`) SHALL elegir el protocolo: `true` envía `Accept: application/x-ndjson` y consume el stream (SDK-48); `false` envía `Accept: application/json` y espera una sola respuesta JSON igual al evento final de MOT-20, sin `estado.verificacion` intermedia salvo `{ etapa: "recibido", progreso: null }` al enviar.

#### Scenario: Streaming desactivado
- **WHEN** `streaming: false` con un backend que responde `application/json` `{"etapa":"resultado","ok":true,"documento":<PERSONA_BASE>}`
- **THEN** la petición lleva `Accept: application/json`, la secuencia de `verificacion.etapa` es `["recibido"]` y el resultado final tiene `confiable` `true`

#### Scenario: Respuesta incoherente con streaming desactivado
- **WHEN** `streaming: false` y el backend responde `application/x-ndjson`
- **THEN** la fase es `error` con `error.codigo` `"protocolo-invalido"`

### Requirement: SDK-60 E2E de modos
Los cuatro modos y `streaming` activado y desactivado SHALL tener E2E en Chromium y Pixel 7 sobre el ejemplo Express (SDK-51), con la cámara simulada y el backend real del ejemplo.

#### Scenario: Matriz de modos
- **WHEN** se ejecuta `e2e/sdk/modos.spec.ts` con `modo` en `front`, `back`, `front-back` y `auto` (CPU sin limitar y con `deviceMemory` 2 inyectado), cada uno con `streaming` `true` y `false` donde aplique
- **THEN** `estado.modo` final es respectivamente `front`, `back`, `front-back`, `front-back` y `back`, y el NUIP mostrado es `9999123456`

#### Scenario: Auto sin red
- **WHEN** con `context.setOffline(true)` se lee la amarilla en `auto` y luego se restablece la red
- **THEN** primero se muestra el resultado local con `modoMotivo` `"sin-red"` y después `confiable` `true`
