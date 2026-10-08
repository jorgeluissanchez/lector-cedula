# Spec Delta

## Purpose

Integrar el lector de cédula en cualquier aplicativo (web, backend Node y apps nativas vía flujo alojado) sin que el integrador implemente nada del lector, con un único servidor autoalojado, resultados de confianza solo del lado servidor y sin persistir imágenes.

Convenciones de esta spec (aplican a todos los escenarios):

- Claves, autorización `AUT`, reloj (`2026-10-06T15:20:00Z`, unix `1791300000`), `PROBLEM(slug)` y `CREAR` son los de `api-validaciones-contrato` (AV-xx). `KT` = `sk_test_00000000000000000000000000000000`; `KT2` = `sk_test_11111111111111111111111111111111`.
- Configuración sintética por clave (`CLAVES_API_JSON`): `KT` con `origenes` `["https://app-a.example"]`, `retornos` `["https://app-a.example/volver", "com.ejemplo.appa://lector/retorno"]` y `secreto_webhook` `whsec_sintetico_0123456789abcdef`; `KT2` con `origenes` `["https://app-b.example"]` y `retornos` `["https://app-b.example/fin"]`.
- `SRV` = `https://api.lector-cedula.example` (valor de `URL_PUBLICA` en pruebas).
- Imágenes y vídeos sintéticos de `pwa-lectura-offline` (`amarilla-1080p`, `digital-1080p`, `PERSONA_BASE`: NUIP `9999123456`, `PRUEBA EJEMPLO FICTICIA LUZ`). Ningún dato real.
- "Resultado de presentación" = objeto `detail` del evento `resultado` o retorno de `leerDocumento()`. "Resultado de confianza" = cuerpo de `GET /v1/validations/{id}` obtenido por el backend con su clave.
- El componente no introduce hipótesis de formato; las de los parsers siguen en `docs/decisiones/hipotesis-formato.md` y viajan en `warnings[]`.

## ADDED Requirements

### Requirement: SDK-01 Registro del Custom Element
`@lector-cedula/web` SHALL registrar el elemento `lector-cedula` al importar su entrada `@lector-cedula/web` (efecto lateral único) y SHALL exportar la clase `LectorCedula`. El registro MUST ser idempotente: si `customElements.get("lector-cedula")` ya existe, MUST NOT lanzar. El elemento SHALL usar Shadow DOM `mode: "open"` y MUST NOT depender de ningún framework en runtime.

#### Scenario: Importación doble
- **WHEN** una página importa `@lector-cedula/web` dos veces desde dos URL distintas del mismo archivo
- **THEN** no hay excepción en consola y `customElements.get("lector-cedula") === LectorCedula` de la primera importación

#### Scenario: Sin framework
- **WHEN** se analiza el bundle `dist/lector-cedula.js` y el grafo de `dependencies` de `packages/web/package.json`
- **THEN** no aparece ninguno de `react`, `react-dom`, `@angular/core`, `vue`, `next`, `lit`

#### Scenario: Shadow DOM
- **WHEN** se inserta `<lector-cedula servidor="SRV"></lector-cedula>` en `examples/html`
- **THEN** `elemento.shadowRoot` no es `null` y ningún estilo de la página (`* { color: red !important }`) cambia el color calculado del botón `[part="iniciar"]`

### Requirement: SDK-02 Atributos del componente
El elemento SHALL observar `sesion` (opcional), `servidor` (`https` o `http://localhost`, obligatorio), `documentos` (comas; valores `cedula-amarilla`, `cedula-digital`, `cedula-extranjeria`, `pasaporte`, `tarjeta-identidad`; defecto `cedula-amarilla,cedula-digital`), `admitir-ti` (booleano), `idioma` (`es`|`en`, defecto `es`) y `tema` (`claro`|`oscuro`|`sistema`, defecto `sistema`). Un valor inválido MUST emitir `error` `atributo-invalido` sin iniciar la cámara.

#### Scenario: Servidor ausente
- **WHEN** se inserta `<lector-cedula></lector-cedula>`
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
El archivo de entrada `dist/lector-cedula.js` más sus importaciones estáticas MUST pesar <= 61 440 bytes tras gzip nivel 9. El Worker lector, `zxing_reader.wasm`, el core de tesseract.js, `mrz.traineddata` y la tabla DIVIPOL MUST cargarse solo bajo demanda desde `<servidor>/sdk/v<mayor>/` y MUST NOT incluirse en el paquete npm.

#### Scenario: Presupuesto de tamaño
- **WHEN** se ejecuta `npm run check:tamano-sdk` sobre la compilación de producción
- **THEN** informa el tamaño gzip de la entrada y termina con código 0 si es <= 61 440 bytes y con código 1 si es mayor (verificado con un fixture de 61 441 bytes)

#### Scenario: Sin peticiones al montar
- **WHEN** se inserta el elemento con `servidor` válido y no se pulsa `[part="iniciar"]`
- **THEN** no hay ninguna petición de red a `/sdk/v1/` registrada por `page.on("request")`

#### Scenario: Recursos desde el servidor configurado
- **WHEN** se pulsa `[part="iniciar"]` con `servidor="https://api.lector-cedula.example"`
- **THEN** toda petición del motor tiene URL que empieza por `https://api.lector-cedula.example/sdk/v1/` y ninguna va a otro origen

#### Scenario: Paquete npm sin binarios del motor
- **WHEN** se ejecuta `npm pack --dry-run --json` en `packages/web`
- **THEN** la lista de archivos no contiene ninguno con extensión `.wasm` ni `.traineddata`

### Requirement: SDK-05 Servicio de recursos del motor
El servidor SHALL servir los recursos del motor en `GET /sdk/v1/<archivo-con-hash>` con `Cache-Control: public, max-age=31536000, immutable`, `Cross-Origin-Resource-Policy: cross-origin` y `Access-Control-Allow-Origin` igual al `Origin` solo si ese origen está en los `origenes` de alguna clave configurada. Un archivo inexistente MUST responder 404 `PROBLEM(not-found)`.

#### Scenario: Origen permitido
- **WHEN** se pide `GET /sdk/v1/<wasm>` con `Origin: https://app-a.example`
- **THEN** la respuesta es 200 con `Access-Control-Allow-Origin: https://app-a.example`, `Content-Type: application/wasm` y `Cache-Control: public, max-age=31536000, immutable`

#### Scenario: Origen no configurado
- **WHEN** se pide el mismo recurso con `Origin: https://intruso.example`
- **THEN** la respuesta no contiene la cabecera `Access-Control-Allow-Origin`

### Requirement: SDK-06 Caché offline del motor
Tras la primera lectura completa, el componente SHALL guardar los recursos del motor en la Cache Storage `lector-cedula-sdk-<version>` y SHALL poder leer sin red en la misma origen. Al cambiar de versión MUST borrar las cachés `lector-cedula-sdk-*` de otras versiones. La caché MUST NOT contener imágenes ni resultados.

#### Scenario: Segunda lectura sin red
- **WHEN** tras una lectura con red se ejecuta `context.setOffline(true)` y se repite la lectura con `amarilla-1080p` sin `sesion`
- **THEN** se emite `resultado` con `detail.campos.nuip` `"9999123456"`

#### Scenario: Contenido de la caché
- **WHEN** se enumeran las claves de todas las cachés tras la lectura
- **THEN** todas las URL empiezan por `<servidor>/sdk/v1/` y ninguna respuesta tiene `Content-Type` `image/*` o `application/json`

#### Scenario: Limpieza de versiones previas
- **WHEN** existe la caché `lector-cedula-sdk-0.0.1` y se carga la versión `0.1.0`
- **THEN** tras la primera lectura `caches.keys()` es exactamente `["lector-cedula-sdk-0.1.0"]`

### Requirement: SDK-07 Precarga opcional del motor
`@lector-cedula/web` SHALL exportar `precargarMotor({ servidor }): Promise<void>` que descarga y compila el motor sin pedir la cámara. Tras resolverse, la primera lectura MUST NOT hacer peticiones de red del motor.

#### Scenario: Precarga y lectura
- **WHEN** se llama `await precargarMotor({ servidor: SRV })` y luego se lee `amarilla-1080p`
- **THEN** `getUserMedia` no se llamó durante la precarga y entre el clic en `[part="iniciar"]` y `resultado` no hay peticiones a `/sdk/v1/`

#### Scenario: Servidor caído en la precarga
- **WHEN** `/sdk/v1/` responde 503
- **THEN** la promesa se rechaza con un `Error` cuyo `codigo` es `"motor-no-disponible"`

### Requirement: SDK-08 API headless leerDocumento
`@lector-cedula/web` SHALL exportar `leerDocumento(entrada, opciones): Promise<ResultadoLectura>` donde `entrada` es `Blob`, `ImageBitmap` o `ImageData` y `opciones` incluye `servidor`, `documentos`, `admitirTi` y `senal` (`AbortSignal`). El resultado MUST ser igual, campo a campo, al `detail` del evento `resultado` para la misma imagen. Sin código legible MUST rechazar con `codigo` `"lectura-fallida"`. MUST NOT usar la cámara ni el DOM.

#### Scenario: Diferencial con el componente
- **WHEN** se llama `leerDocumento(png_amarilla_sintetica, { servidor: SRV })` y se lee el mismo PNG con el componente
- **THEN** ambos resultados son iguales con `toStrictEqual`

#### Scenario: Imagen sin documento
- **WHEN** la entrada es un PNG de 1280x800 relleno de gris `#808080`
- **THEN** la promesa se rechaza con `codigo` `"lectura-fallida"`

#### Scenario: Cancelación
- **WHEN** se aborta `senal` antes de que termine
- **THEN** la promesa se rechaza con un `DOMException` de nombre `"AbortError"`

### Requirement: SDK-09 Tiempos de lectura
La lectura con el componente y con `leerDocumento` SHALL cumplir los presupuestos de OFF-15 (amarilla p95 <= 1500 ms, digital p95 <= 5000 ms en Pixel 7 emulado con CPU 4x, 20 lecturas) con el motor ya precargado, y la lectura en frío (sin precarga ni caché) MUST quedar en p95 <= OFF-15 + 3000 ms con red emulada "Fast 4G".

#### Scenario: Amarilla en caliente
- **WHEN** se hacen 20 lecturas de `amarilla-1080p` en `examples/html` tras `precargarMotor`
- **THEN** el p95 de la medida `lector-cedula:tiempo` es <= 1500 ms

#### Scenario: Amarilla en frío
- **WHEN** se hacen 20 lecturas en contextos nuevos sin caché con red "Fast 4G"
- **THEN** el p95 es <= 4500 ms

### Requirement: SDK-10 Accesibilidad del componente
Cada estado visible del componente (`inicio`, `camara`, `leyendo`, `resultado`, `error`) MUST tener 0 violaciones axe `serious` o `critical`; los controles MUST ser operables con teclado y los cambios de estado MUST anunciarse en una región `aria-live="polite"` dentro del Shadow DOM.

#### Scenario: Axe por estado
- **WHEN** se analiza con `@axe-core/playwright` cada estado en `examples/html` con `idioma="es"` y `tema="oscuro"`
- **THEN** hay 0 violaciones `serious` o `critical`

#### Scenario: Anuncio de estado
- **WHEN** la lectura pasa a `leyendo`
- **THEN** la región `[part="estado"][aria-live="polite"]` contiene `Leyendo documento`

### Requirement: SDK-11 Privacidad del componente
El componente y `leerDocumento` MUST NOT escribir imágenes, fotogramas ni campos del documento en `localStorage`, `sessionStorage`, IndexedDB, Cache Storage ni cookies, MUST NOT llamar `console.*` con datos del documento y MUST NOT enviar imágenes a la red salvo a la `upload.url` de una sesión (SDK-14). Al emitir `resultado`, `cancelado` o `error`, MUST liberar los buffers de píxeles y detener la cámara.

#### Scenario: Sin almacenamiento local
- **WHEN** termina una lectura sin `sesion`
- **THEN** `localStorage.length` y `sessionStorage.length` son 0, `indexedDB.databases()` devuelve `[]`, `document.cookie` es `""` y ninguna caché contiene `9999123456` al buscarlo en sus cuerpos

#### Scenario: Sin envío de imagen sin sesión
- **WHEN** termina una lectura sin `sesion`
- **THEN** ninguna petición registrada tiene método `POST` ni cuerpo `multipart/form-data`

#### Scenario: Consola limpia
- **WHEN** se capturan los mensajes de consola de una lectura completa
- **THEN** ninguno contiene `9999123456` ni `FICTICIA`

### Requirement: SDK-12 Ejemplos por framework
El repositorio SHALL incluir apps de ejemplo mínimas en `examples/html`, `examples/react`, `examples/angular`, `examples/vue` y `examples/next` (client component con `"use client"` e importación dinámica sin SSR) que usan solo `@lector-cedula/web` publicado desde el workspace, y en `examples/express`, `examples/nest` y `examples/fastify` que usan solo `@lector-cedula/servidor`. Cada ejemplo web MUST mostrar el `nuip` recibido en un elemento `[data-prueba="nuip"]`.

#### Scenario: Lectura en cada framework
- **WHEN** se ejecuta el E2E `e2e/sdk/ejemplos.spec.ts` con `amarilla-1080p` contra cada uno de `html`, `react`, `angular`, `vue` y `next`
- **THEN** en los cinco `[data-prueba="nuip"]` muestra `9999123456`

#### Scenario: Next sin errores de hidratación
- **WHEN** se carga `examples/next` compilado con `next build` y `next start`
- **THEN** la consola no contiene `Hydration` ni `customElements is not defined` y `next build` termina con código 0

#### Scenario: Tipos para JSX y plantillas
- **WHEN** se ejecuta la comprobación de tipos de `examples/react` (`tsc --noEmit`) y de `examples/angular` (`ng build`)
- **THEN** ambas terminan con código 0 usando las declaraciones de tipos del elemento exportadas por `@lector-cedula/web` (`HTMLElementTagNameMap` y `JSX.IntrinsicElements`)

### Requirement: SDK-13 Sesión alojada en la creación
`POST /v1/validations` SHALL aceptar el campo opcional `return_url` y la respuesta SHALL incluir `hosted_url` con forma `<URL_PUBLICA>/v/<token>`, donde `<token>` cumple `^[A-Za-z0-9_-]{43,}$`, está firmado con `SECRETO_SUBIDA`, identifica la validación, vence con `upload.expires_at` y no es igual al token de `upload.url`. `return_url` MUST pertenecer exactamente a la lista `retornos` de la clave; si no, 422 con `pointer` `/return_url` y `code` `return_url_not_allowed`.

#### Scenario: Creación con retorno permitido
- **WHEN** se hace `CREAR` con `return_url` `"https://app-a.example/volver"` y `KT`
- **THEN** la respuesta es 201, `hosted_url` cumple `^https://api\.lector-cedula\.example/v/[A-Za-z0-9_-]{43,}$` y `return_url` es `"https://app-a.example/volver"`

#### Scenario: Retorno de otra clave
- **WHEN** se hace `CREAR` con `return_url` `"https://app-b.example/fin"` y `KT`
- **THEN** la respuesta es 422 `PROBLEM(invalid-request)` con `errors` `[{"pointer": "/return_url", "code": "return_url_not_allowed"}]`

#### Scenario: Deeplink nativo
- **WHEN** se hace `CREAR` con `return_url` `"com.ejemplo.appa://lector/retorno"` y `KT`
- **THEN** la respuesta es 201

#### Scenario: Sin retorno
- **WHEN** se hace `CREAR` sin `return_url`
- **THEN** la respuesta es 201 con `return_url` `null` y `hosted_url` presente

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

#### Scenario: Retorno a deeplink
- **WHEN** la sesión tiene `return_url` `"com.ejemplo.appa://lector/retorno"` y termina la lectura
- **THEN** Playwright registra un intento de navegación a `com.ejemplo.appa://lector/retorno?validation_id=<id>&estado=completada`

### Requirement: SDK-15 Componente en modo sesión
Con el atributo `sesion` (el token de `hosted_url`), el componente SHALL subir las imágenes de la captura aceptada a la `upload.url` de esa sesión y SHALL emitir `resultado` con `validacion_id` igual al `id` de la validación. El resultado de presentación MUST NOT reemplazar al de confianza: el componente MUST NOT recibir del servidor los campos del documento.

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

### Requirement: SDK-17 El cliente no aporta datos del documento
La subida de imágenes MUST rechazar cualquier parte o campo distinto de `front`, `back` y `selfie` (por ejemplo `document`, `nuip`, `resultado`) con 422 `PROBLEM(invalid-request)`. El resultado de confianza SHALL calcularse solo en el servidor a partir de las imágenes recibidas, en memoria.

#### Scenario: Campo de resultado inyectado
- **WHEN** se sube a `upload.url` un `multipart/form-data` con `front` = `IMG_JPEG` y un campo `document` = `{"nuip":"9999000001"}`
- **THEN** la respuesta es 422 con `errors` `[{"pointer": "/document", "code": "unexpected_field"}]` y la validación sigue en `pending`

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
`@lector-cedula/web` y `@lector-cedula/servidor` SHALL seguir semver, empezar en `0.1.0` y tener `CHANGELOG.md` con una sección `## <version>` por versión publicada. La ruta del motor (`/sdk/v<mayor>/`) MUST cambiar solo con la versión mayor. La publicación MUST ejecutarse solo en un workflow con un entorno protegido que exige aprobación humana y con `npm publish --provenance`; ningún agente MUST tener el token.

#### Scenario: CHANGELOG coherente
- **WHEN** se ejecuta `npm run check:versiones`
- **THEN** termina con código 0 si cada `package.json` tiene su `version` como sección en su `CHANGELOG.md` y con código 1 si falta (verificado con un fixture)

#### Scenario: Publicación protegida
- **WHEN** se analiza `.github/workflows/publicar-sdk.yml`
- **THEN** el job de publicación declara `environment: npm-publicacion`, `permissions.id-token: write`, el comando contiene `--provenance` y ningún otro workflow referencia `NPM_TOKEN`

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
- **THEN** termina con código 0 y su salida lista `packages/web`, `packages/servidor` y `examples` entre las rutas analizadas
