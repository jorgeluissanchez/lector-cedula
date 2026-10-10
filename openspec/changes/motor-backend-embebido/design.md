# Design: motor-backend-embebido

Decisiones tomadas por el orquestador por delegación del usuario (2026-10-09, instrucción "la lectura y validación deben poder correr dentro del backend del integrador"). Las que cambian comportamiento ya están en `specs/` con su escenario.

## Contexto

- La CLI `tools/leer-foto.mjs` ya compone `packages/capture` (zxing-wasm, tesseract.js, plan de giros, pista), `packages/parsers`, otros documentos y `packages/fraud` en Node. El motor Node es esa composición empaquetada como librería, con pool, límites y garantías de privacidad.
- `sdk-nativo` define `@lector-cedula/nucleo-js` (NAT-07): bundle IIFE sin DOM con `procesarPdf417` y `procesarMrz`. Java y Go reutilizan ese bundle.

## Decisiones

### D1. Node primero, en proceso, con worker_threads
`@lector-cedula/servidor` envuelve la misma función que usa la CLI (`leer(imagen)` extraída a `packages/capture/src/lectura/leer.ts` si no lo está ya) para que MOT-02 sea igualdad por construcción y la prueba de contrato atrape cualquier divergencia. Pool propio mínimo (sin dependencia nueva): N workers, cola acotada, reemplazo al caer o al agotar tiempo (`worker.terminate()` es la única cancelación fiable del OCR WASM).

### D2. Recursos sin red ni disco
- tesseract.js: `langPath` = directorio del paquete leído a memoria, `cacheMethod: "none"`, `gzip: false`, `workerPath` y `corePath` locales. `mrz.traineddata` se verifica con SHA-256 del manifiesto existente al crear el motor.
- zxing-wasm: `prepareZXingModule({ overrides: { wasmBinary } })` con el binario leído del paquete.
- Modelos de `packages/fraud`: cargados por bytes.
- Prueba: hooks `--import` (`bloquear-escrituras.mjs` existente y uno nuevo `bloquear-red.mjs` en `tools/test/ayudas/`).
- Bytes a cero: `buffer.fill(0)` en `finally` en el worker y en el hilo principal; los `ArrayBuffer` se transfieren (no se copian) al worker. Modo de prueba `__registroBuferes` solo con `NODE_ENV=test` y símbolo no exportado en tipos.

### D3. Límites antes de decodificar
Ancho y alto se leen de la cabecera (PNG IHDR, JPEG SOF, WebP VP8/VP8L) con un lector propio puro antes de entregar al decodificador (evita bombas de descompresión). Códigos de error: `formato-no-soportado`, `imagen-demasiado-grande`, `tiempo-agotado`, `motor-ocupado`, `motor-cerrado`, `motor-error-interno`, `recurso-corrupto`, `cancelado`, `opciones-invalidas`. Mismos códigos en Java y Go.

### D4. Java: ZXing core + Tess4J + Rhino
- PDF417: `com.google.zxing:core` (Apache-2.0) con `BarcodeFormat.PDF_417`, `TRY_HARDER`, y se entregan los bytes crudos (`getRawBytes`/segmentos de bytes) al bundle. Hipótesis a verificar en la tarea 3.2: que ZXing Java devuelva los mismos bytes que zxing-cpp/zxing-wasm para el payload binario de la amarilla (si no, el contrato lo detecta).
- MRZ: Tess4J (Apache-2.0) con `mrz.traineddata` cargado desde el JAR a memoria. Riesgo: Tesseract C API necesita `tessdata` en disco; si Tess4J no permite cargar el modelo desde memoria (`TessBaseAPIInit` con `data`/`data_size` de la API C), se usa tmpfs del contenedor del integrador como excepción documentada. Pregunta abierta 3.
- JNA bajo su licencia Apache-2.0 (dual LGPL-2.1/Apache-2.0).
- Motor JS: **Rhino** (MPL-2.0, en la lista permitida). GraalJS (`org.graalvm.polyglot:js-community`) está bajo UPL-1.0 (permisiva, compatible con MIT, pero no listada en el principio IV) y la VM GraalVM CE bajo GPLv2 con Classpath Exception; queda como alternativa de rendimiento que requiere decisión humana. QuickJS vía JNI descartado por tener que mantener binarios nativos por plataforma.
- Requisito del bundle para Rhino: `nucleo-js` debe compilarse a ES2017 sin `BigInt` ni `Intl` avanzado; se añade un objetivo `nucleo-js/es2017` y prueba de igualdad con Node.

### D5. Go: gozxing + gosseract + goja
- `github.com/makiuchi-d/gozxing` (Apache-2.0) tiene lector PDF417 (`pdf417.NewPDF417Reader`); verificar en la tarea 4.1 que expone bytes crudos.
- `github.com/otiai10/gosseract/v2` (MIT) requiere cgo y libtesseract; `SetTessdataPrefix` exige disco: misma pregunta abierta 3. Alternativa pura Go: no existe OCR de calidad equivalente.
- `github.com/dop251/goja` (MIT) ejecuta el bundle ES2017.
- Módulo en `motor/go` del mismo repo; versión por tag `motor/go/vX.Y.Z` (tarea humana).

### D6. Comparación cliente-servidor
`compararConCliente` es pura, compara solo una lista cerrada de campos y devuelve rutas sin valores (evita filtrar datos en logs del integrador). La decisión (aceptar, rechazar, revisión manual) es del integrador; el motor no decide.

### D7. enviarA en el SDK web (RETIRADA el 2026-10-09: sustituida por la opción `backend`, SDK-45; se conserva el texto como historia)
Reutiliza `enviarCaptura` y las funciones puras de `envio.ts`; el destino se valida con la misma regla de origen que SDK-42 (mismo origen de la página en vez de `servidor`). Código nuevo `destino-invalido` para no confundir con `sesion-invalida`. Excluyente con `servidor`/`sesion` para que no haya dos rutas de subida.

### D8. Webhooks
Solo metadatos (tipo, coincide, nivel de riesgo, código); firma HMAC-SHA256 con `node:crypto` en el formato AV-26 (`X-Lector-Signature: t=<unix>,v1=<hex>` sobre `<t>.<cuerpo>`, tolerancia 300 s, MOT-26) para que el receptor rechace repeticiones, con `verificarFirmaWebhook` exportado (`timingSafeEqual`); reintento ninguno (el integrador ya tiene el resultado síncrono). Es la única red permitida y solo si se configura.

### D9. Sidecar
Plan B para lenguajes sin motor (PHP, .NET, Ruby) o para aislar memoria: el contenedor de `server/` en red `internal: true`, sin puertos públicos, `read_only: true`, `tmpfs` con `noexec`.

## Licencias (a confirmar por `revisor-licencias` antes de instalar)

| Componente | Licencia declarada | Estado |
|---|---|---|
| ZXing core (Java) | Apache-2.0 | Permitida |
| Tess4J | Apache-2.0 | Permitida; revisar dependencias transitivas (lept4j Apache-2.0, JNA dual, commons-io Apache-2.0, jai-imageio-core: BSD con cláusula nuclear, verificar o excluir) |
| Rhino | MPL-2.0 | Permitida |
| GraalJS | UPL-1.0 (+ GPLv2-CPE en GraalVM CE) | No listada: requiere decisión humana; no adoptada |
| gozxing | Apache-2.0 | Permitida (verificar LICENSE en el módulo) |
| gosseract v2 | MIT | Permitida; enlaza libtesseract Apache-2.0 y Leptonica BSD-2 |
| goja | MIT | Permitida |
| Express, NestJS | MIT | Permitidas (solo en ejemplos) |
| JUnit 5 | EPL-2.0 | Solo prueba; misma pregunta abierta que `sdk-nativo` |

## Fases

- **Fase 0** (Node núcleo): extracción de la función común, `@lector-cedula/servidor`, pool, límites, sin red ni disco, contrato con la CLI.
- **Fase 1** (Node integración): comparación, ejemplos Express/Nest/Next, `enviarA` en web, webhooks, benchmark.
- **Fase 2** (Java).
- **Fase 3** (Go).
- **Fase 4** (sidecar, avisos, cierre y revisión de producto).

## Pruebas

Comandos:

- `UN` = `npx vitest run packages/servidor packages/protocolo packages/motor`
- `UW` = `npx vitest run packages/web`
- `MU` = `npx stryker run stryker.servidor.config.mjs` (manejador y protocolo) y `npx stryker run stryker.motor.config.mjs` (motor) (y `packages/web/src/envio.ts` en MOT-15)
- `CT` = `npm run motor:contrato` (acepta `--lenguaje java|go`; `--comparar <motor.json> <cli.json>` compara dos volcados)
- `BE` = `npm run motor:bench`
- `E2` = `npx playwright test --project=backend-chromium --project=backend-pixel7 --workers=1` (servidor del ejemplo Express en el puerto 4195)
- `EX` = `npx vitest run examples/backend-express examples/backend-nest examples/backend-next` (Next se compila con `next build --webpack`)
- `JV` = `docker compose -f motor/java/compose.yaml run --rm pruebas` (Maven, JUnit 5, PIT, `--network none`, `--read-only`)
- `GO` = `docker compose -f motor/go/compose.yaml run --rm pruebas` (`go test -race ./...`, `--network none`, `--read-only`)
- `SC` = `npx vitest run examples/sidecar` (estática) y `docker compose -f examples/sidecar/compose.yaml up --abort-on-container-exit humo`
- `L` = `npm run check:licencias`; `P` = `npm run check:privacidad`; `E` = `npm run eval:quick`

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| MOT-01 | Unitaria | Vitest | `UN` | 4 escenarios verdes |
| MOT-01 | Propiedad (no lanza sin código) | fast-check | `UN` | numRuns >= 1000, 0 errores sin `codigo` |
| MOT-01 | Fuzz de bytes (Jazzer.js descartado por el orquestador el 2026-10-10: fast-check basta) | fast-check | `UN` (`packages/motor/test/motor.test.ts`, `cabeceras.test.ts`) | numRuns >= 1000, 0 errores sin código |
| MOT-02 | Contrato | script propio + Vitest | `CT` | 100 % igual; volcado alterado sale con 1 |
| MOT-02 | Evals | `eval-campo` | `E` | Sin regresión frente a `baseline.json` |
| MOT-03 | Análisis estático | Vitest (búsqueda en fuentes) | `UN`, `JV`, `GO` | 0 coincidencias |
| MOT-04 | Unitaria y concurrencia | Vitest | `UN` (`timeout: 60_000`) | 4 escenarios verdes |
| MOT-04 | Mutación | Stryker | `MU` | score >= 85 % (break 80) |
| MOT-05 | Unitaria y seguridad (bomba) | Vitest | `UN` | 4 escenarios; RSS < +64 MiB |
| MOT-05 | Propiedad (cabeceras) | fast-check | `UN` | numRuns >= 1000; dims leídas = dims generadas |
| MOT-06 | Privacidad (red bloqueada) | hook `bloquear-red.mjs` + Vitest | `UN`, `JV`, `GO` | 0 marcas `RED-PROHIBIDA`; contenedores `--network none` verdes |
| MOT-06 | Unitaria (SHA-256) | Vitest | `UN` | `recurso-corrupto` con 1 byte alterado |
| MOT-07 | Privacidad (disco) | `bloquear-escrituras.mjs` | `UN`, `JV`, `GO` | 0 `ESCRITURA-PROHIBIDA`; `--read-only` verde |
| MOT-07 | Unitaria (búferes a cero) | Vitest | `UN` | 100 % de búferes a cero, también en error |
| MOT-07, MOT-08 | Privacidad estática | `privacidad-check` | `P` | 0 hallazgos |
| MOT-08 | Unitaria (logs) | Vitest | `UN`, `JV`, `GO` | 0 apariciones de datos sintéticos |
| MOT-09 | Golden | Vitest | `UN`, `CT` | `riesgo` igual a la CLI |
| MOT-09 | Unitaria e integración (entrada del fraude: amarilla, digital, tarjeta de identidad, otros documentos) | Vitest (`packages/motor/test/fraude-entrada.test.ts`) | `UN` | 5/5 escenarios |
| MOT-10 | Unitaria (tabla literal) | Vitest | `UN` | 3 escenarios |
| MOT-10 | Propiedad | fast-check | `UN` | numRuns >= 1000, 0 excepciones |
| MOT-10 | Mutación | Stryker | `MU` | >= 85 % |
| MOT-11 | Rendimiento | script propio | `BE` | p95 amarilla <= 1500 ms, digital <= 2500 ms, frío <= 4000 ms en `REF_SRV` |
| MOT-12 | Compatibilidad | Vitest + matriz Node 20/22/24 en Docker | `UN`, `EX` | ESM, CJS, Next y edge verdes |
| MOT-13 | Integración HTTP (NDJSON de punta a punta con el manejador real) | Vitest + `fetch` contra el servidor del ejemplo | `EX` | 4 escenarios en cada ejemplo (Express, Nest, Next) |
| MOT-13 | Seguridad | gitleaks, osv-scanner | `npm run check` | 0 secretos, 0 High/Critical |
| MOT-15 | Tipos (`@ts-expect-error`) | tsc | `npx tsc -p packages/web/test/tipos --noEmit` | 0 errores |
| MOT-15 | E2E front + back | Playwright (agentes planner/generator/healer, cámara simulada) | `E2` | Chromium y Pixel 7 verdes |
| MOT-15 | Accesibilidad | @axe-core/playwright | `E2` | 0 serious/critical en el ejemplo |
| MOT-14 | Contrato | `CT --lenguaje java|go` | `CT`, `JV`, `GO` | 100 % igual a la CLI |
| MOT-14 | Unitaria y concurrencia | JUnit 5, `go test -race` | `JV`, `GO` | 0 fallos, 0 carreras |
| MOT-14 | Mutación | PIT (Java), go-mutesting si su licencia pasa | `JV`, `GO` | >= 80 % en código no generado |
| MOT-16 | Unitaria (HMAC, sin datos) | Vitest + servidor local | `UN` | 5 escenarios (`packages/motor/test/webhook*.test.ts`) |
| MOT-26 | Unitaria (vectores AV-26 literales, ventana, cabecera mal formada) y propiedad | Vitest + fast-check | `npx vitest run packages/motor/test/webhook-unidad.test.ts` | 4 escenarios; numRuns 1000; mutación del webhook >= 85 % |
| MOT-17 | Estática y humo | Vitest + Docker compose | `SC` | escenarios verdes |
| MOT-18 | Licencias | `licencia-check` ampliado a Maven y Go | `L` | fixtures GraalJS y GPL fallan; árbol real pasa |
| MOT-18 | Avisos | Vitest sobre artefactos | `UN`, `JV`, `GO` | 4 entradas presentes |
| MOT-19 | Unitaria (`manejar`, binario, 405) | Vitest | `UN` | 4/4 escenarios |
| MOT-19 | Integración por adaptador (Express, Nest, Next, Fastify) | Vitest | `UN` (`timeout: 60_000`) | secuencias iguales a `manejar` |
| MOT-19 | Mutación de `servidor/src/manejador/**` | Stryker | `MU` | >= 85 % (break 80) |
| MOT-20 | Unitaria (orden, en vivo con pool falso) | Vitest | `UN` | 4/4 escenarios |
| MOT-20 | Contrato de esquema | JSON Schema (`protocolo-ndjson.schema.json`) + Vitest | `UN` | 100 % de líneas válidas en 200 respuestas |
| MOT-20 | Propiedad (entradas multipart arbitrarias: siempre un único evento final, nunca lanza) | fast-check | `UN` | numRuns >= 1000 |
| MOT-21 | Unitaria (confirmación exactamente una vez) | Vitest | `UN` | 4/4 escenarios |
| MOT-21 | Mutación | Stryker | `MU` | >= 85 % |
| MOT-22 | Unitaria (tabla de motivos) | Vitest | `UN` | 2/2 escenarios, 9 motivos |
| MOT-23 | Privacidad (red, disco, búferes, eventos sin datos) | hooks `bloquear-red.mjs`, `bloquear-escrituras.mjs` + Vitest | `UN`, `P` | 0 marcas; 100 % búferes a cero |
| MOT-23 | Seguridad (413 antes de leer todo, cuerpo truncado, multipart malformado) | Vitest + fuzz con fast-check | `UN` | numRuns >= 1000, un único evento final, 0 excepciones |
| MOT-24 | Contrato de protocolo Java y Go | `CT --protocolo` | `CT`, `JV`, `GO` | 100 % igual al manejador Node |
| MOT-25 | Unitaria (Accept, `?streaming=0`) e igualdad entre protocolos | Vitest | `UN` | 3/3 escenarios; 100 % igualdad |
| MOT-27 | Unitaria (tabla literal de campos rechazados y aceptados) y propiedad diferencial validador contra esquema JSON (Ajv) | Vitest + fast-check | `npx vitest run packages/protocolo/test/mot-27-campos.test.ts` | 36/36; numRuns >= 1000 sin discrepancias, entre 5 % y 95 % de campos aceptados |

## Revisores

- `revisor-licencias`: Tess4J y transitivas, Rhino, GraalJS (decisión), gozxing, gosseract, goja, Express, Nest, JUnit, go-mutesting.
- `revisor-privacidad`: motor (red, disco, búferes, logs), `enviarA`, webhooks, ejemplos y sidecar.
- `eval-runner` y `revisor-producto` al cierre (benchmark-comercial: Microblink BlinkID Verify, Regula Document Reader en servidor).

## Riesgos

- Tesseract nativo exige `tessdata` en disco (pregunta abierta 3).
- ZXing Java y gozxing pueden diferir de zxing-cpp en PDF417 dañados: el contrato lo detecta; si difiere, el resultado Java/Go puede tener menor tasa de lectura (se mide con evals y se documenta).
- Rhino es más lento que GraalJS; el bundle solo procesa unos KB, impacto esperado < 50 ms (se mide en `BE` Java).

## Preguntas abiertas (decisión humana)

1. ¿Se admite UPL-1.0 (GraalJS) en la lista del principio IV? Requiere enmienda de la constitución. Mientras tanto, Rhino.
2. Máquina de referencia `REF_SRV` (propuesta: 2 vCPU, 2 GiB, x64) y si se mide también arm64.
3. Si Tess4J/gosseract no cargan el modelo desde memoria: ¿se acepta escribir `mrz.traineddata` (no es dato personal) en tmpfs del contenedor del integrador como excepción documentada a MOT-07?
4. Publicación: cuenta Sonatype Central para `io.github.jorgeluissanchez`, clave GPG, nombre del scope npm `@lector-cedula` y ruta del módulo Go (depende del nombre final del repositorio en GitHub).
5. JUnit 5 (EPL-2.0) solo en pruebas: misma pregunta que `sdk-nativo`.

## Decisiones del usuario, 2026-10-09 (modelo backend propio)

Decididas por el usuario y trasladadas a la spec con escenarios (SDK-45 a SDK-60 en `sdk-integracion`; MOT-13, MOT-15, MOT-19 a MOT-25 en `motor-backend-embebido`).

1. **Dos partes, front headless y back.** El motor (tesseract, zxing, fraude) corre en el servidor de la empresa que usa la librería, nunca en un servidor del autor. `@lector-cedula/servidor` absorbe el antiguo `@lector-cedula/motor` (MOT-01 pasa a `@lector-cedula/servidor`; SDK-18 enmendado: dependencias solo `@lector-cedula/*` y subruta `/cliente` sin motor).
2. **Modelo por defecto: front + backend propio con respuesta en vivo.** Opción `backend` en `@lector-cedula/web` y adaptadores (SDK-45), envío automático tras la lectura local, fase `verificando` con `estado.verificacion` (SDK-46), rechazo con vuelta automática a `activo` y tope `intentosVerificacion` (SDK-47), `autoIniciar` (SDK-49). El botón solo abre la cámara.
3. **Protocolo en vivo NDJSON** (`application/x-ndjson`) con `fetch` + `ReadableStream`, `AbortController`, `tiempoLimiteMs` e `inactividadMs`; sin WebSocket ni sondeo (SDK-48, SDK-54, MOT-20). Respuesta JSON única opcional con `streaming: false` / `Accept: application/json` / `?streaming=0` (SDK-59, MOT-25).
4. **Back**: `crearLectorServidor({ alConfirmar, limites, fraude, comparar })` con `.express()`, `.nest()`, `.next()`, `.fastify()` y `.manejar(Request): Response` (MOT-19); motor en proceso con `worker_threads`; compara con el cliente (MOT-10) y llama `alConfirmar` solo si ok (MOT-21); motivos de rechazo cerrados (MOT-22); sin red, sin disco, bytes a cero (MOT-23). Java y Go emiten el mismo protocolo (MOT-24).
5. **Modo opcional microservicio**: sesión, `hosted_url`, webhooks firmados, página alojada y `crearCliente` se conservan sin cambios y se reetiquetan como opcionales (SDK-52). Lo ya implementado (fases 1, 2 y 4) no se toca.
6. **Modos (corrección del usuario, 2026-10-09):** `modo: "front" | "back" | "front-back"`; en `front-back` (doble validación) el back siempre corre y `validacion: "estricta" | "auto"` solo decide si el front lee localmente (con `auto` y dispositivo débil no lee ni envía `cliente`). El modo `auto` y `decidirModo` se retiraron (ver `sdk-integracion`). Para el servidor: sin `cliente` el manejador valida igual y no compara (MOT-19, escenario "Sin lectura local del cliente"). `back` captura con análisis ligero sin descargar el motor pesado (SDK-56). Sin red: `front` y confirmación al volver la red con cola solo en memoria (SDK-58).

Decisiones del redactor por delegación (el usuario puede revertirlas):

- `backend` acepta ruta relativa, mismo origen, `https:` de otro origen (CORS a cargo de la empresa) y `http://localhost`; `credentials: "same-origin"`, `redirect: "error"` (SDK-45).
- Todos los motivos de rechazo vuelven a `activo` mientras haya intentos, también `menor-de-edad` y `documento-no-admitido` (literal de la instrucción del usuario); por omisión 3 intentos (1..10).
- Los fallos de transporte (`backend-no-disponible`, `backend-rechazo-http`, `backend-tiempo-agotado`, `protocolo-invalido`) no consumen intentos y llevan a `error` con el resultado local conservado; el 413 se trata como rechazo `demasiado-grande`.
- Con `autoIniciar`, el fallo de cámara en el arranque automático vuelve a `inicio` con `autoinicio-fallido` (transición `permiso→inicio`), no a `error`.
- Menores en modo backend: rechazo local `menor-de-edad` sin red salvo `enviarMenores` (SDK-53, coherente con SDK-43).
- `alConfirmar` que lanza da `rechazo.motivo` `error-interno` sin filtrar el mensaje (MOT-21).
- La opción `enviarA` de la propuesta anterior se retira en favor de `backend` (MOT-15).
- Cola sin red: una sola imagen, solo en memoria, vence a los 10 min (`tiempoColaMs`), código `cola-vencida`.

### Preguntas abiertas nuevas (2026-10-09)

6. Publicación: con el motor dentro, `@lector-cedula/servidor` pesa decenas de MB (WASM y traineddata). ¿Se acepta, o se publica el motor como dependencia opcional `@lector-cedula/servidor-motor` instalada aparte?
7. `PRESUPUESTO_BACK`: la meta de 300 KiB gzip es del redactor; se fija con la medición de la tarea B.6.

## Conciliación con el front (2026-10-10)

- Protocolo en camelCase como capture: `cliente = { tipo, campos }` con `fechaNacimiento`, etc.; `compararConCliente` compara `tipo` (o `tipoDocumento`) y `campos.nuip|apellidos|nombres|fechaNacimiento|sexo|rh` (MOT-10).
- El evento final `ok: true` trae `documento` con al menos `tipoDocumento`, `campos` (obligatorio, lo exigen el validador y el esquema de `@lector-cedula/protocolo`) y `warnings`, más `confiable: true` y los campos de la lectura del servidor.
- El lector NDJSON incremental del front vive en `packages/web/src/verificacion.ts`; `@lector-cedula/protocolo` solo tiene tipos, constantes, esquema, validador y el contrato del motor.

## Decisiones del orquestador por delegación del usuario (2026-10-09, cierre de preguntas)

1. Peso: el motor pesado va en `@lector-cedula/motor` (decenas de MB, con WASM y modelo); `@lector-cedula/servidor` queda ligero (protocolo, manejadores, webhooks, cliente) y carga el motor como `peerDependency` opcional. Sin motor instalado, `crearLectorServidor` falla al arrancar con un error claro.
2. JavaScript embebido en Java: Rhino (MPL-2.0); GraalJS (UPL-1.0) no se adopta sin enmendar la constitución.
3. Máquina de referencia `REF_SRV`: 2 vCPU, 2 GiB, x64; arm64 se informa sin umbral.
4. `mrz.traineddata` en tmpfs se acepta para Tess4J y gosseract: no es dato personal; las imágenes siguen sin tocar disco.
5. Pruebas Java con TestNG (Apache-2.0) y jqwik no se usa; Kotest para Kotlin.
6. Publicación Maven, npm y Go: tareas humanas.
