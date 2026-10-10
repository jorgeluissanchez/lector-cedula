# Spec Delta

## Purpose

Motor de lectura de la cédula colombiana embebible en el backend del integrador (Node, Java, Go), en el mismo proceso, offline, sin disco y con resultado idéntico a la CLI `leer-foto --sin-mascara`; más la opción `enviarA` del SDK web para que el front suba la imagen al backend propio, comparación cliente-servidor, webhooks opcionales y sidecar de respaldo.

Decisión del usuario (2026-10-09, modelo backend propio): la librería tiene dos partes, front headless (`@lector-cedula/web` y adaptadores, `sdk-integracion`) y back (`@lector-cedula/servidor`, que absorbe el motor). El motor (tesseract, zxing, fraude) corre en el SERVIDOR DE LA EMPRESA que usa la librería, nunca en un servidor del autor. El modelo por defecto es front + backend propio con respuesta en vivo por NDJSON (MOT-19 a MOT-24). Webhooks (MOT-16) y sidecar (MOT-17) son opcionales.

Convenciones (aplican a todos los escenarios):

- Fixtures sintéticos: `amarilla-1080p.png`, `digital-1080p.png`, `pasaporte-1080p.png` y `ti-1080p.png` (tarjeta de identidad) generados con la skill `fixture-sintetico`; `PERSONA_BASE`: NUIP `9999123456`, nombre `PRUEBA EJEMPLO FICTICIA LUZ`. Ningún dato real.
- `CLI(x)` = salida JSON de `npm run leer-foto -- --sin-mascara --resultado x` (el RESULTADO; decisión del orquestador del 2026-10-10: la CLI usa `@lector-cedula/motor` y su salida de siempre, sin `--resultado`, es un formato de presentación derivado del RESULTADO).
- `RESULTADO` = el `ResultadoLectura` unificado de `@lector-cedula/capture` sin máscara (`tipoDocumento`, `fuente`, `campos`, `warnings`, `menorDeEdad?`, y los obsoletos `tipo`, `intento`, `resultado`) más `confiable: false` y `riesgo` (señal de `@lector-cedula/fraud` o `null`). Sin documento válido: `{ ok: false, error: { codigo, tipo?, digitosValidos? }, confiable: false, riesgo: null }` con `codigo` `sin-lectura`, `imagen-ilegible`, `pdf417-no-valido`, `mrz-no-valida`, `menor-de-edad`, `ti-mayor-de-edad` o `documento-no-admitido`.
- `REF_SRV` = máquina de referencia de servidor: contenedor Linux x64 con 2 vCPU y 2 GiB (pregunta abierta 2 en `design.md`).
- Sin hipótesis de formato nuevas; las de los parsers ([docs/decisiones/hipotesis-formato.md](../../../../../docs/decisiones/hipotesis-formato.md)) llegan en `warnings[]` sin cambios.

## ADDED Requirements

### Requirement: MOT-01 API Node en proceso
`@lector-cedula/motor` (paquete aparte, decisión del orquestador del 2026-10-09: `@lector-cedula/servidor` queda ligero y lo carga como `peerDependency` opcional) SHALL exportar `crearMotor(opciones?)` que devuelve `{ leerDocumento(imagen: Uint8Array | Buffer, opciones?): Promise<RESULTADO>, cerrar(): Promise<void> }` y un atajo `leerDocumento(imagen, opciones?)` que usa un motor compartido perezoso. La imagen MAY ser PNG, JPEG o WebP. `resultado.confiable` MUST ser `false`.

#### Scenario: Cédula amarilla
- **WHEN** se llama `leerDocumento(readFileSync("amarilla-1080p.png"))`
- **THEN** `resultado.tipoDocumento` es `"cedula-ciudadania"`, `resultado.fuente` es `"pdf417"`, `resultado.campos.nuip` es `"9999123456"`, `resultado.confiable` es `false` y `resultado.riesgo` es un objeto

#### Scenario: Cédula digital
- **WHEN** se llama `leerDocumento` con `digital-1080p.png`
- **THEN** `resultado.tipoDocumento` es `"cedula-ciudadania"`, `resultado.fuente` es `"mrz-td1"`, `resultado.campos.nuip` es `"9999123456"` y `resultado.resultado.valido` es `true` (todos los checksums MRZ válidos)

#### Scenario: MRZ con dígito de control inválido
- **WHEN** se lee la digital sintética con la variante `cd-compuesto-alterado`
- **THEN** resuelve `{ ok: false, error: { codigo: "mrz-no-valida", tipo: "mrz", digitosValidos: 3 }, confiable: false, riesgo: null }`

#### Scenario: Imagen ilegible y sin documento
- **WHEN** se leen los primeros 200 bytes de la amarilla (cabecera PNG válida, contenido roto) y un PNG blanco de 800x600
- **THEN** el primero da `error.codigo` `"imagen-ilegible"` y el segundo `{ codigo: "sin-lectura", tipo: "mrz" }`

#### Scenario: Formato no soportado
- **WHEN** se llama `leerDocumento(new Uint8Array([0x25, 0x50, 0x44, 0x46]))` (cabecera PDF)
- **THEN** la promesa se rechaza con un `ErrorMotor` cuyo `codigo` es `"formato-no-soportado"`

#### Scenario: Entrada arbitraria
- **WHEN** fast-check genera 1000 `Uint8Array` de 0 a 4096 bytes
- **THEN** cada llamada resuelve un `RESULTADO` o rechaza con un `ErrorMotor` de código conocido; nunca un error sin `codigo` ni un proceso caído

### Requirement: MOT-02 Contrato con la CLI
Para toda imagen, la salida de `leerDocumento` (Node, Java y Go) MUST ser igual, campo a campo y con `riesgo`, a `CLI(imagen)`. La CLI `leer-foto` MUST leer con `@lector-cedula/motor` (una sola implementación); su salida sin `--resultado` conserva el formato de LPI-06, LPI-08 y DC-10, derivado del RESULTADO. `--resultado` exige `--sin-mascara` (si no, código 64).

#### Scenario: Igualdad en los fixtures
- **WHEN** `npm run motor:contrato` ejecuta el motor Node (pool, mismo presupuesto de OCR que la CLI) y la CLI sobre los fixtures sintéticos generados en memoria: amarilla, amarilla de 8 dígitos, amarilla con lugar desconocido, digital, digital con el dígito compuesto alterado y PNG sin documento (`evals/fixtures/` no tiene imágenes)
- **THEN** para el 100 % de las imágenes `JSON.stringify(motor) === JSON.stringify(CLI)` tras ordenar claves, y el guion imprime `motor-contrato: 6 fixtures, 0 diferencias`

#### Scenario: El contrato detecta divergencias
- **WHEN** el comparador recibe un volcado del motor con `campos.nuip` alterado a `"9999123457"`
- **THEN** sale con código 1 e imprime la ruta `campos.nuip` y el nombre del fixture, sin imprimir el valor

### Requirement: MOT-03 Reutilización sin bifurcar reglas
El motor Node MUST importar `packages/capture`, `packages/parsers`, las reglas de edad y tarjeta de identidad, otros documentos y `packages/fraud`, sin copiar su lógica. Java y Go MUST decidir todo número, fecha y regla en el bundle `@lector-cedula/nucleo-js` (NAT-07); el código Java o Go solo entrega bytes PDF417 crudos y líneas MRZ crudas.

#### Scenario: Sin reglas duplicadas en Node
- **WHEN** se ejecuta la prueba estática sobre `packages/motor/src`
- **THEN** no hay ninguna definición de checksum MRZ, tabla DIVIPOL ni cálculo de edad (búsqueda de los identificadores `digitoVerificador`, `DIVIPOL`, `calcularEdad` definidos fuera de import da 0 coincidencias)

#### Scenario: Sin decisiones nativas en Java y Go
- **WHEN** se ejecuta la prueba estática sobre `motor/java/src/main` y `motor/go` (sin `_test.go`)
- **THEN** no aparece ninguna expresión regular de NUIP ni cálculo de checksum (patrones `\d{10}`, `7, 3, 1`, `[7,3,1]` dan 0 coincidencias)

### Requirement: MOT-04 Pool de worker_threads
El motor Node SHALL ejecutar decodificación, OCR y fraude en un pool de `worker_threads` con `hilos` (por omisión `max(1, os.availableParallelism() - 1)`) y una cola acotada `colaMaxima` (por omisión 64). Con la cola llena, `leerDocumento` MUST rechazar con `"motor-ocupado"` sin encolar. `cerrar()` MUST terminar los workers y rechazar las lecturas pendientes con `"motor-cerrado"`.

#### Scenario: Concurrencia acotada
- **WHEN** con `hilos: 2` se lanzan 8 lecturas simultáneas de `amarilla-1080p.png`
- **THEN** las 8 resuelven con `nuip` `"9999123456"` y el máximo de lecturas en curso observado por el contador del pool es 2

#### Scenario: Cola llena
- **WHEN** con `hilos: 1, colaMaxima: 2` se lanzan 4 lecturas simultáneas
- **THEN** exactamente 1 (la cuarta) rechaza con `codigo` `"motor-ocupado"` y las otras 3 (1 en curso y 2 en cola) resuelven

#### Scenario: Cierre
- **WHEN** se llama `cerrar()` con 3 lecturas pendientes
- **THEN** las 3 rechazan con `"motor-cerrado"`, `worker.threadId` de cada worker emitió `exit` y una nueva `leerDocumento` rechaza con `"motor-cerrado"`

#### Scenario: Worker caído
- **WHEN** un worker termina de forma inesperada (prueba con `process.exit(1)` inyectado) durante una lectura
- **THEN** esa lectura rechaza con `"motor-error-interno"`, el pool lo reemplaza y la siguiente lectura resuelve

### Requirement: MOT-05 Límites
El motor SHALL aplicar límites configurables con estos valores por omisión: `bytesMaximos` 10 485 760, `pixelesMaximos` 40 000 000 (validados con la cabecera antes de decodificar), `tiempoMaximoMs` 15 000 por lectura y `llamadasOcrMaximas` 12 por lectura.

#### Scenario: Demasiados bytes
- **WHEN** se llama con un búfer de 10 485 761 bytes
- **THEN** rechaza con `"imagen-demasiado-grande"` sin crear ningún worker task (contador de tareas igual a 0)

#### Scenario: Bomba de descompresión
- **WHEN** se llama con un PNG sintético de 40 KB cuya cabecera declara 20 000 x 20 000 píxeles
- **THEN** rechaza con `"imagen-demasiado-grande"` y la memoria residente del proceso no crece más de 64 MiB

#### Scenario: Tiempo agotado
- **WHEN** con `tiempoMaximoMs: 1` se lee `digital-1080p.png`
- **THEN** rechaza con `"tiempo-agotado"`, el worker se termina y se reemplaza, y la siguiente lectura con el valor por omisión resuelve

#### Scenario: Tope de OCR
- **WHEN** con `llamadasOcrMaximas: 2` se lee una imagen sintética sin documento
- **THEN** el contador de llamadas a `recognize` es <= 2 y el resultado trae `error.codigo` `"sin-lectura"`

### Requirement: MOT-06 Sin red
El motor (Node, Java, Go) MUST NOT abrir conexiones de red. Los recursos (`zxing_reader.wasm`, `mrz.traineddata`, worker de tesseract.js, modelos de `packages/fraud`) MUST cargarse desde el paquete; `mrz.traineddata` MUST verificarse por SHA-256 contra el manifiesto antes de usarse.

#### Scenario: Red bloqueada
- **WHEN** se ejecuta `leerDocumento` sobre los 4 fixtures en un proceso Node con `--import` de un hook que hace lanzar `net.connect`, `tls.connect`, `http.request`, `https.request`, `fetch` y `dns.lookup`
- **THEN** las 4 lecturas resuelven y stderr no contiene la marca `RED-PROHIBIDA`

#### Scenario: Traineddata alterado
- **WHEN** el archivo `mrz.traineddata` del paquete tiene un byte cambiado
- **THEN** `crearMotor()` rechaza con `"recurso-corrupto"` y no se ejecuta ningún OCR

#### Scenario: Java y Go sin red
- **WHEN** las pruebas de contrato de Java y Go corren en un contenedor con `--network none`
- **THEN** pasan en verde

### Requirement: MOT-07 Sin disco y bytes a cero
El motor MUST NOT crear, modificar ni borrar archivos (tesseract.js con `cacheMethod: "none"`). Las copias internas de la imagen y los búferes de píxeles MUST ponerse a cero al terminar cada lectura, también ante error. El búfer recibido del llamador MUST NOT modificarse salvo con `opciones.borrarEntrada: true`, que lo pone a cero.

#### Scenario: Escrituras prohibidas
- **WHEN** se ejecutan las 4 lecturas en un proceso Node con `--import tools/test/ayudas/bloquear-escrituras.mjs`
- **THEN** las 4 resuelven y stderr no contiene `ESCRITURA-PROHIBIDA`

#### Scenario: Copias a cero
- **WHEN** tras una lectura (y tras una lectura que rechaza con `"tiempo-agotado"`) se inspeccionan los búferes registrados por el modo de prueba `__registroBuferes`
- **THEN** cada búfer registrado contiene solo bytes 0

#### Scenario: Entrada del llamador
- **WHEN** se lee un búfer `b` sin opciones y luego otro `c` con `borrarEntrada: true`
- **THEN** `b` es idéntico a su copia previa y `c` contiene solo bytes 0

#### Scenario: Java y Go sin disco
- **WHEN** las pruebas de contrato de Java y Go corren en un contenedor con sistema de archivos de solo lectura (`--read-only`, sin tmpfs)
- **THEN** pasan en verde

### Requirement: MOT-08 Logs sin datos personales
El motor MUST NOT escribir en consola ni en el logger inyectado ningún campo del documento, línea MRZ, payload ni imagen. El logger opcional `opciones.registro` SHALL recibir solo eventos `{ evento, duracionMs, codigo? }`.

#### Scenario: Consola limpia
- **WHEN** se leen los 4 fixtures con un logger que captura todo y con `console.*` interceptado
- **THEN** ninguna salida contiene `9999123456`, `PRUEBA`, `FICTICIA` ni `<<`

### Requirement: MOT-09 Señal de riesgo
El resultado SHALL incluir `riesgo` de `packages/fraud` igual al de la CLI (`--resultado`). `opciones.fraude: false` MUST omitir el análisis y devolver `riesgo: null`. En el servidor el análisis SHALL recibir la imagen completa como único frame (entrada aceptada por el orquestador el 2026-10-10) y solo la cédula y la tarjeta de identidad leídas por PDF417 (`tipo: "amarilla"`) o MRZ TD1 (`tipo: "digital"`) producen señal; otros documentos MUST dar `riesgo: null`.

#### Scenario: Con y sin fraude
- **WHEN** se lee `amarilla-1080p.png` con opciones por omisión y luego con `fraude: false`
- **THEN** el primero trae `riesgo` igual a `CLI(...).riesgo` y el segundo `riesgo` `null` con los demás campos iguales

#### Scenario: Entrada del fraude para la amarilla
- **WHEN** se lee `amarilla-1080p.png` (fuente `pdf417`) con opciones por omisión
- **THEN** `packages/fraud` recibe `frames` con un único elemento (la imagen completa decodificada), `cuadrilatero` `[{x:0,y:0},{x:w-1,y:0},{x:w-1,y:h-1},{x:0,y:h-1}]` con `w` y `h` de la imagen, `cuadrilateroAproximado: true` (FRA-20 omite las señales geométricas), `cara: "reverso"`, `tipo: "amarilla"` y `datos.pdf417` con `nuip` `"9999123456"`, `fechaNacimiento` y `codigoLugar` (departamento más municipio) del PDF417

#### Scenario: Entrada del fraude para la digital
- **WHEN** se lee `digital-1080p.png` (fuente `mrz-td1`) con opciones por omisión
- **THEN** `packages/fraud` recibe el mismo `frames`, `cuadrilatero`, `cuadrilateroAproximado: true` y `cara: "reverso"` que con la amarilla, `tipo: "digital"` y `datos.mrz.lineas` igual a `lineasCorregidas` de la lectura MRZ

#### Scenario: Tarjeta de identidad con señal
- **WHEN** se lee con `admitirTarjetaIdentidad: true` la imagen sintética de un PDF417 con fecha de nacimiento `2014-05-10` (`tipoDocumento` `"tarjeta-identidad"`, fuente `pdf417`), o una lectura de tarjeta de identidad con fuente `mrz-td1`
- **THEN** `packages/fraud` recibe la misma entrada que la amarilla (con `tipo: "amarilla"` y `datos.pdf417`) o que la digital (con `tipo: "digital"` y `datos.mrz.lineas`), respectivamente, y el resultado trae `riesgo` distinto de `null`

#### Scenario: Otros documentos sin señal
- **WHEN** se lee `pasaporte-1080p.png` con opciones por omisión
- **THEN** `packages/fraud` no se invoca y el resultado trae `riesgo: null`

### Requirement: MOT-10 Comparación con el cliente
`@lector-cedula/servidor` SHALL exportar `compararConCliente(servidor: RESULTADO, cliente: unknown)` que devuelve `{ coincide: boolean, diferencias: string[] }`; `diferencias` MUST listar solo rutas de campo, sin valores. Compara exactamente `tipo`, `campos.nuip`, `campos.apellidos`, `campos.nombres`, `campos.fechaNacimiento`, `campos.sexo` y `campos.rh` (`CamposDocumento`, OD-22a). Un `cliente` que no valida el esquema MUST dar `coincide: false` y `diferencias: ["cliente-invalido"]`.

#### Scenario: Coinciden
- **WHEN** se compara el resultado del servidor de `amarilla-1080p.png` con el resultado del SDK web del mismo fixture
- **THEN** devuelve `{ coincide: true, diferencias: [] }`

#### Scenario: Origen del tipo
- **WHEN** el servidor trae `tipoDocumento` `"cedula-ciudadania"` y el cliente trae `tipo` `"cedula-ciudadania"` (`ResultadoPresentacion` del SDK web) o, sin `tipo`, `tipoDocumento` `"cedula-ciudadania"` (`ResultadoLectura`), con los mismos campos
- **THEN** ambos casos devuelven `{ coincide: true, diferencias: [] }`, y con `tipo` `"pasaporte"` en el cliente `diferencias` contiene `"tipo"`

#### Scenario: Nulo, ausente y no primitivo
- **WHEN** el servidor trae `campos.rh` ausente y el cliente `campos.rh` `null`; y en otra llamada el cliente trae `campos.nuip` `["9999123456"]` con el servidor en `"9999123456"`
- **THEN** la primera devuelve `{ coincide: true, diferencias: [] }` (`null` y ausente son iguales) y la segunda `{ coincide: false, diferencias: ["campos.nuip"] }` (un valor no primitivo nunca coincide)

#### Scenario: Campos fuera de la lista no se comparan
- **WHEN** el cliente añade a campos coincidentes `campos.fechaExpedicion` `"2020-01-01"`, `campos.lugarNacimiento` `{ "x": 1 }` y `campos.paisEmisor` `"XXX"` que el servidor no trae
- **THEN** devuelve `{ coincide: true, diferencias: [] }` (ningún lector produce fecha de expedición, así que no se compara)

#### Scenario: NUIP manipulado en el cliente
- **WHEN** el cliente trae `campos.nuip` `"9999123457"` y `campos.rh` `"B+"` (servidor `"AB+"`)
- **THEN** devuelve `{ coincide: false, diferencias: ["campos.nuip", "campos.rh"] }`

#### Scenario: Cliente basura
- **WHEN** fast-check genera 1000 valores con `fc.anything()` como cliente
- **THEN** la función nunca lanza y `diferencias` nunca contiene un valor que no sea una ruta de la lista o `"cliente-invalido"`

### Requirement: MOT-11 Rendimiento en servidor
En `REF_SRV`, con motor caliente y `hilos: 2`, el p95 por lectura MUST ser <= 1 500 ms para la amarilla y <= 2 500 ms para la digital sobre 200 lecturas, y el arranque en frío (`crearMotor` hasta primera lectura) <= 4 000 ms. Java y Go MUST cumplir los mismos umbrales.

#### Scenario: Benchmark Node
- **WHEN** `npm run motor:bench` corre 200 lecturas de cada fixture en `REF_SRV`
- **THEN** el informe JSON trae `p95_amarilla_ms <= 1500`, `p95_digital_ms <= 2500` y `frio_ms <= 4000`, y sale con código 1 si alguno falla

#### Scenario: Informe evaluable
- **WHEN** `npm run motor:bench -- --evaluar <informe.json>` recibe un informe con `p95_digital_ms` 2600, o con un valor ausente, o con `lecturas_fallidas` mayor que 0 (lecturas que no dan el NUIP `9999123456`)
- **THEN** sale con código 1 e imprime `umbral superado: <clave>` por cada clave; un informe en los umbrales exactos sale con 0. Fuera de `REF_SRV` (`maquina` del informe) el resultado es orientativo

### Requirement: MOT-12 Compatibilidad de runtimes Node
El paquete SHALL funcionar en Node 20, 22 y 24, en ESM y CommonJS, y en route handlers de Next con `export const runtime = "nodejs"`. En runtime `edge`, la importación MUST fallar con un error que diga `"@lector-cedula/servidor requiere runtime nodejs"`.

#### Scenario: ESM y CJS
- **WHEN** un script ESM (`import`) y uno CJS (`require`) leen `amarilla-1080p.png`
- **THEN** ambos obtienen `nuip` `"9999123456"`

#### Scenario: Next route handler
- **WHEN** `examples/backend-next` construido con `next build --webpack` (Turbopack empaqueta los paquetes enlazados del monorepo) recibe `POST /api/cedula` con `amarilla-1080p.png` en multipart
- **THEN** responde 200 con `nuip` `"9999123456"`

#### Scenario: Edge
- **WHEN** se evalúa el paquete con la condición de exportación `edge-light`
- **THEN** lanza un error con el mensaje `"@lector-cedula/servidor requiere runtime nodejs"`

### Requirement: MOT-13 Ejemplos Express, Nest y Next con front React
`examples/backend-express`, `examples/backend-nest` y `examples/backend-next` SHALL montar `crearLectorServidor` en `POST /api/cedula` con su manejador (`.express()`, `.nest()`, `.next()`) y servir desde el mismo origen un front React con `backend: "/api/cedula"` (SDK-51). Sus `alConfirmar` solo guardan en memoria el NUIP de la última confirmación para la prueba; MUST NOT registrar el cuerpo y MUST documentar la autorización del titular (Ley 1581).

#### Scenario: Express coincide
- **WHEN** se envía `amarilla-1080p.png` con `cliente` igual al resultado local del mismo fixture
- **THEN** el último evento es `{"etapa":"resultado","ok":true,...}` con `documento.campos.nuip` `"9999123456"` y `alConfirmar` se llamó 1 vez

#### Scenario: Nest con cliente manipulado
- **WHEN** se envía `amarilla-1080p.png` con `cliente.campos.nuip` `"9999123457"` a Nest
- **THEN** el último evento es `{"etapa":"resultado","ok":false,"rechazo":{"motivo":"no-coincide","diferencias":["campos.nuip"]}}` y `alConfirmar` no se llamó

#### Scenario: Next route handler con digital
- **WHEN** `examples/backend-next` construido con `next build` recibe `digital-1080p.png` con su `cliente`
- **THEN** el último evento tiene `ok` `true` y `documento.campos.nuip` `"9999123456"`

#### Scenario: Demasiado grande
- **WHEN** se envía una imagen de 10 485 761 bytes a cualquiera de los tres
- **THEN** responde 413 y el motor no se invocó

### Requirement: MOT-14 Librerías Java y Go
Java 17+ SHALL exponer `MotorCedula.crear(Opciones)` (`AutoCloseable`) con `leerDocumento(byte[])`; Go SHALL exponer `motor.Nuevo(Opciones)` con `LeerDocumento(ctx, []byte)` y `Cerrar()`. Ambas MUST cumplir MOT-02, MOT-05 (mismos códigos), MOT-06, MOT-07 y MOT-08, ser seguras en concurrencia y respetar la cancelación.

#### Scenario: Contrato Java
- **WHEN** `npm run motor:contrato -- --lenguaje java` ejecuta la librería Java en Docker sobre los fixtures
- **THEN** el 100 % coincide con `CLI`

#### Scenario: Contrato Go
- **WHEN** `npm run motor:contrato -- --lenguaje go` ejecuta la librería Go en Docker sobre los fixtures
- **THEN** el 100 % coincide con `CLI`

#### Scenario: Concurrencia y cancelación Go
- **WHEN** 8 goroutines leen `amarilla-1080p.png` con `go test -race` y una novena usa un `ctx` cancelado
- **THEN** las 8 devuelven `nuip` `"9999123456"`, el detector de carreras no informa nada y la novena devuelve un error con código `"cancelado"`

#### Scenario: Concurrencia Java
- **WHEN** 8 hilos leen `amarilla-1080p.png` con la misma instancia
- **THEN** los 8 devuelven `nuip` `"9999123456"`

### Requirement: MOT-15 El front usa la opción backend
El envío del front al backend propio SHALL hacerse solo con la opción `backend` de `@lector-cedula/web` (SDK-45 a SDK-54 de `sdk-integracion`). La opción `enviarA` propuesta antes queda retirada (decisión del usuario, 2026-10-09) y MUST NOT existir en `OpcionesLector`.

#### Scenario: Sin enviarA en los tipos
- **WHEN** la prueba de tipos compila `crearLector({ enviarA: { url: "/cedula" } })` con `// @ts-expect-error`
- **THEN** `tsc --noEmit` no informa error (la directiva se consume porque `enviarA` no existe)

#### Scenario: Front y back de punta a punta
- **WHEN** en Playwright la página del ejemplo Express usa `backend: "/api/cedula"` con el vídeo de la amarilla
- **THEN** el estado final tiene `resultado.confiable` `true` y hubo exactamente 1 petición a `/api/cedula`

### Requirement: MOT-16 Webhooks opcionales
(Opcional; ver MOT-21.) `crearMotor({ webhook: { url, secreto } })` SHALL, tras cada lectura, enviar un único `POST url` (mejor esfuerzo, sin reintentos) con `{ evento: "lectura", tipo, riesgo_nivel, codigo? }`, sin campos personales, firmado según MOT-26. Única excepción a MOT-06; `url` MUST ser `https` (o `http` de `localhost`, `127.0.0.1` o `[::1]`) y `secreto` no vacío. Un fallo del webhook MUST NOT afectar al resultado.

#### Scenario: Firma verificable
- **WHEN** con `secreto` `"secreto-de-prueba"` se lee `amarilla-1080p.png` y un servidor local recibe el webhook
- **THEN** la cabecera `X-Lector-Signature` recibida cumple `^t=[0-9]+,v1=[0-9a-f]{64}$`, su `v1` es igual a `HMAC-SHA256("secreto-de-prueba", t + "." + cuerpo)`, `t` está a 300 s o menos del reloj, `verificarFirmaWebhook(cuerpo, cabecera, "secreto-de-prueba")` devuelve `true` y el cuerpo no contiene `9999123456` ni `PRUEBA`

#### Scenario: Webhook caído
- **WHEN** el webhook responde 500
- **THEN** `leerDocumento` resuelve igual que sin webhook

#### Scenario: URL insegura
- **WHEN** `webhook.url` es `"http://ejemplo.test/hook"`
- **THEN** `crearMotor` lanza con `"opciones-invalidas"`

#### Scenario: Lectura fallida o que lanza
- **WHEN** con webhook se lee `sin-documento-1080p.png`, y con `bytesMaximos: 10` se lee `amarilla-1080p.png`
- **THEN** el primer cuerpo es `{ evento: "lectura", tipo: null, riesgo_nivel: null, codigo }` con el `error.codigo` del resultado, y el segundo lleva `codigo` `"imagen-demasiado-grande"` mientras `leerDocumento` rechaza con ese código

#### Scenario: Decisiones de envío
- **WHEN** se configura `webhook` y se lee un documento
- **THEN** el envío no se espera (no retrasa `leerDocumento`), se aborta a los 5 000 ms, no sigue redirecciones y no se reintenta; `coincide` no aplica al motor (lo calcula el manejador) y se omite

### Requirement: MOT-26 Firma antirrepetición del webhook
El webhook SHALL llevar `X-Lector-Signature: t=<unix>,v1=<hex>` (formato AV-26): `<hex>` es el HMAC-SHA256 hexadecimal minúscula, con `secreto`, de `<unix>` + `.` + cuerpo exacto; no se envía `X-Lector-Firma`. `@lector-cedula/motor` SHALL exportar `verificarFirmaWebhook(cuerpo, cabecera, secreto, ahora?)`: `true` solo si algún `v1` coincide (con `timingSafeEqual`) y `|ahora - t| <= 300` (`TOLERANCIA_WEBHOOK_S`); MUST NOT lanzar. Decisión de revisor-privacidad (2026-10-10).

#### Scenario: Vector de firma
- **WHEN** se firma el cuerpo de AV-25 (232 bytes) con secreto `"whsec_sintetico_0123456789abcdef"` y `t` `1791300000`
- **THEN** la cabecera es `t=1791300000,v1=1b3358c314ebcad6047166133405e2be0692e92e52d17606840183a58d5711df` y `verificarFirmaWebhook` con `ahora` `1791300000` devuelve `true`

#### Scenario: Cuerpo alterado o secreto distinto
- **WHEN** se verifica esa cabecera con el cuerpo cambiado en un byte, o con otro secreto
- **THEN** `verificarFirmaWebhook` devuelve `false`

#### Scenario: Repetición fuera de ventana
- **WHEN** se verifica la cabecera válida con `ahora` `1791300000 + 300` y `1791300000 - 300`, y luego con `1791300000 + 301` y `1791300000 - 301`
- **THEN** los dos primeros devuelven `true` y los dos últimos `false`

#### Scenario: Cabecera mal formada
- **WHEN** la cabecera es `undefined`, `""`, `"v1=<hex>"`, `"t=1791300000"`, `"t=abc,v1=<hex>"`, `"t=1791300000,v1=<hex en mayúsculas>"`, `"t=1791300000,v1=<63 hex>"`, `"sha256=<hex>"`, `"t=1,t=1791300000,v1=<hex>"` o un valor que no es cadena
- **THEN** `verificarFirmaWebhook` devuelve `false` sin lanzar

### Requirement: MOT-17 Sidecar de respaldo
`examples/sidecar/compose.yaml` SHALL ejecutar el microservicio de `server/` junto al backend del integrador en una red interna de compose, sin `ports:` publicados (o solo `127.0.0.1:`), con sistema de archivos de solo lectura y tmpfs sin ejecución.

#### Scenario: Sin puertos públicos
- **WHEN** la prueba estática analiza `examples/sidecar/compose.yaml`
- **THEN** el servicio del lector no tiene `ports` o cada uno empieza por `127.0.0.1:`, tiene `read_only: true` y la red es `internal: true`

#### Scenario: Humo
- **WHEN** se levanta el compose y el contenedor del backend de ejemplo envía `amarilla-1080p.png` al sidecar
- **THEN** recibe `nuip` `"9999123456"`

### Requirement: MOT-18 Licencias y avisos
Las dependencias de producción del motor en Node, Java y Go MUST estar en la lista del principio IV. GraalJS (UPL-1.0) y QuickJS vía JNI MUST NOT usarse sin una decisión humana registrada en `docs/decisiones/`. JNA MUST usarse bajo su opción Apache-2.0. Cada artefacto SHALL incluir `THIRD_PARTY_NOTICES` con Tesseract, Leptonica, ZXing/zxing-cpp, Rhino o goja y `mrz.traineddata` (BSD-3).

#### Scenario: Control de licencias
- **WHEN** se ejecuta `npm run check:licencias` con el fixture de prueba que añade `org.graalvm.polyglot:js-community` al `pom.xml` y otro con un módulo Go GPL
- **THEN** ambos casos fallan con código 1 y el árbol real pasa

#### Scenario: Avisos
- **WHEN** se inspecciona el tarball npm, el JAR y el módulo Go
- **THEN** cada uno contiene `THIRD_PARTY_NOTICES` con las entradas `tesseract`, `leptonica`, `zxing` y `mrz.traineddata`

### Requirement: MOT-19 crearLectorServidor
`@lector-cedula/servidor` SHALL exportar `crearLectorServidor({ alConfirmar, limites?, fraude?, comparar? })` que devuelve `{ manejar(req: Request): Promise<Response>, express(), nest(), next(), fastify(), cerrar() }`. SHALL correr el motor en proceso (pool de `worker_threads`, MOT-04) en el servidor de la empresa que integra la librería y MUST NOT contactar ningún servidor del autor ni otra red (MOT-06).

#### Scenario: Manejador estándar
- **WHEN** se llama `manejar(new Request("http://localhost/api/cedula", { method: "POST", body: <multipart con imagen amarilla-1080p.png y cliente> }))`
- **THEN** la `Response` tiene estado 200, `Content-Type` `application/x-ndjson; charset=utf-8`, `Cache-Control` `no-store` y su último evento es `{"etapa":"resultado","ok":true,...}` con `documento.campos.nuip` `"9999123456"`

#### Scenario: Adaptadores equivalentes
- **WHEN** la misma petición se envía a una app Express con `.express()`, a un controlador Nest con `.nest()`, a un route handler de Next con `.next()` y a Fastify con `.fastify()`
- **THEN** las cuatro respuestas contienen la misma secuencia de eventos que `manejar`

#### Scenario: Cuerpo binario
- **WHEN** el cuerpo es el PNG crudo con `Content-Type: image/png` y la cabecera `X-Lector-Cliente` con el resultado local en base64url
- **THEN** la secuencia de eventos es igual a la del caso multipart

#### Scenario: Método no permitido
- **WHEN** se envía `GET` al manejador
- **THEN** responde 405 con `Allow: POST` sin invocar el motor

#### Scenario: Sin lectura local del cliente (modo front-back con dispositivo débil)
- **WHEN** el multipart trae solo `imagen` (sin `cliente`) o el binario llega sin `X-Lector-Cliente`
- **THEN** el manejador valida igual: la lista de `etapa` es `["recibido", "leyendo", "fraude", "resultado"]` (sin `comparando`), el final es `ok: true` y `alConfirmar` se llama 1 vez con `contexto.comparacion` `null`

#### Scenario: Petición mal formada
- **WHEN** el `Content-Type` no es `multipart/form-data`, `image/*` ni `application/octet-stream`, o el cuerpo no trae imagen
- **THEN** responde 415 (tipo no admitido) o 400 (sin imagen, multipart roto) con un único JSON `{"etapa":"resultado","ok":false,"rechazo":{"motivo":"ilegible"}}` y `Cache-Control: no-store`, sin invocar el motor

#### Scenario: Sin motor instalado
- **WHEN** `crearLectorServidor` se llama sin `motor` y `@lector-cedula/motor` no está instalado
- **THEN** lanza `ErrorServidor` con `codigo` `"motor-no-instalado"` y un mensaje que incluye `npm install @lector-cedula/motor`

#### Scenario: Origen del motor
- **WHEN** se llama `crearLectorServidor({ alConfirmar, motor })` con un motor falso inyectado, y en otra prueba sin `motor` con `@lector-cedula/motor` instalado
- **THEN** con el inyectado no se resuelve ni importa `@lector-cedula/motor`; sin él se importa `@lector-cedula/motor` una sola vez, en la primera lectura, y se usa su `crearMotor`; `cerrar()` cierra el motor en ambos casos

#### Scenario: Motor como peerDependency opcional
- **WHEN** se lee `packages/servidor/package.json`
- **THEN** `peerDependencies` incluye `@lector-cedula/motor` y `peerDependenciesMeta["@lector-cedula/motor"].optional` es `true`

### Requirement: MOT-20 Protocolo NDJSON en vivo
La respuesta SHALL ser un stream NDJSON (un objeto JSON por línea, UTF-8, terminado en salto de línea) con eventos `{ etapa: "recibido"|"leyendo"|"fraude"|"comparando", progreso? }` en ese orden, omitiendo las etapas que no aplican, y exactamente un evento final `{ etapa: "resultado", ok, documento?, riesgo?, rechazo? }`. Cada evento SHALL enviarse en cuanto ocurre (sin búfer). Los tipos y el esquema viven en `@lector-cedula/protocolo`. Java y Go (MOT-24) MUST emitir el mismo protocolo.

#### Scenario: Orden de eventos
- **WHEN** se procesa `amarilla-1080p.png` con `cliente` y opciones por omisión
- **THEN** la lista de `etapa` es `["recibido", "leyendo", "fraude", "comparando", "resultado"]` y todo `progreso` presente está en `[0, 1]` y no decrece

#### Scenario: Eventos en vivo
- **WHEN** el pool falso tarda 500 ms en leer y el cliente de prueba lee el cuerpo como stream
- **THEN** el evento `recibido` llega al cliente antes de 100 ms desde el envío

#### Scenario: Sin fraude ni cliente
- **WHEN** `crearLectorServidor({ alConfirmar, fraude: false })` recibe solo la imagen
- **THEN** la lista de `etapa` es `["recibido", "leyendo", "resultado"]`

#### Scenario: Esquema de los eventos
- **WHEN** cada línea de 200 respuestas generadas con fixtures y rechazos se valida contra `protocolo-ndjson.schema.json`
- **THEN** el 100 % valida y hay exactamente un evento `resultado` por respuesta, siempre el último

#### Scenario: Sin comparación
- **WHEN** el multipart trae solo `imagen` (el front no envía su lectura local, modo `front-back` con dispositivo débil), o trae `cliente` pero el lector se creó con `comparar: false`
- **THEN** en ambos casos la lista de `etapa` es `["recibido", "leyendo", "fraude", "resultado"]` (sin `comparando`)

#### Scenario: Contenido del evento final
- **WHEN** se procesa `amarilla-1080p.png` con `cliente` coincidente, luego con `fraude: false`, y luego con un `cliente` de `campos.nuip` `"9999123457"`
- **THEN** el primer final es `ok: true` con `riesgo` igual al del motor y `documento` igual a la lectura del servidor en camelCase sin `ok` ni `riesgo` (con `tipoDocumento`, `campos` obligatorio, `warnings`) y `confiable: true`; el segundo es `ok: true` con `riesgo: null`; el tercero es `ok: false` con solo las claves `etapa`, `ok` y `rechazo`

#### Scenario: Eventos intermedios sin datos
- **WHEN** se procesa `amarilla-1080p.png` con `cliente`
- **THEN** todo evento salvo el último tiene solo las claves `etapa` y, opcionalmente, `progreso`

#### Scenario: Protocolo compartido sin dependencias
- **WHEN** se leen `packages/protocolo/package.json` y las importaciones de `packages/web/src` y `packages/servidor/src`
- **THEN** `@lector-cedula/protocolo` no declara `dependencies` y tanto el front (`packages/web`) como el back (`packages/servidor`) importan de él los tipos del protocolo

### Requirement: MOT-27 Tipos de los campos en el protocolo
`validarEvento` y `protocolo-ndjson.schema.json` SHALL comprobar que las claves de `documento.campos` definidas por `CamposDocumento` (SDK-65) respetan sus tipos cuando están presentes; las claves ausentes y las adicionales se admiten (compatibilidad: solo se estrecha lo que la salida real ya cumplía).

#### Scenario: Tipos de los campos del documento
- **WHEN** `validarEvento` y `protocolo-ndjson.schema.json` reciben un `resultado` con `ok: true` cuyo `documento.campos` trae, por separado, `sexo: "masculino"`, `rh: "C+"`, `lugarNacimiento: { codigo: "16001" }`, `fechaNacimiento: "17/05/1990"`, `nuip: 9999123456` (número) o `apellidos: null`
- **THEN** ambos lo rechazan; y aceptan `campos: {}`, campos con claves adicionales (`fechaExpedicion: "2020-01-01"`) y los campos de la amarilla sintética con `sexo: "F"`, `rh: "AB-"`, `lugarNacimiento: null` y `fechaVencimiento: null`

### Requirement: MOT-21 Confirmación solo si ok
`alConfirmar(documento, contexto)` SHALL llamarse exactamente una vez y antes de emitir el evento final cuando el resultado es `ok: true`, y MUST NOT llamarse en ningún rechazo, error ni cancelación. `contexto` lleva `{ riesgo, comparacion, peticion: Request }`. Si `alConfirmar` lanza, el evento final SHALL ser `ok: false` con `rechazo.motivo` `"error-interno"` y el mensaje MUST NOT viajar al cliente.

#### Scenario: Confirmación
- **WHEN** se procesa `amarilla-1080p.png` con un `cliente` coincidente
- **THEN** `alConfirmar` se llamó 1 vez con `documento.campos.nuip` `"9999123456"` y `documento.confiable` `true`

#### Scenario: Rechazo sin confirmación
- **WHEN** el `cliente` trae `campos.nuip` `"9999123457"`
- **THEN** `alConfirmar` no se llamó

#### Scenario: alConfirmar lanza
- **WHEN** `alConfirmar` lanza `new Error("detalle-interno-sintetico")`
- **THEN** el evento final es `{"etapa":"resultado","ok":false,"rechazo":{"motivo":"error-interno"}}` y la respuesta no contiene `detalle-interno-sintetico`

#### Scenario: Cliente cancela
- **WHEN** el cliente aborta la petición durante `leyendo`
- **THEN** la tarea del pool se cancela, `alConfirmar` no se llama y los búferes de la imagen están a cero

### Requirement: MOT-22 Motivos de rechazo
El evento final `ok: false` SHALL llevar `rechazo.motivo` de esta lista cerrada: `no-coincide` (MOT-10), `fraude`, `ilegible`, `menor-de-edad`, `documento-no-admitido`, `demasiado-grande`, `tiempo-agotado`, `ocupado` o `error-interno` (MOT-21). El riesgo MUST NOT rechazar salvo que la empresa configure `fraude: { bloquearSi }` (coherente con FRA-04).

#### Scenario: Lista cerrada de motivos
- **WHEN** se lee `MOTIVOS_RECHAZO` de `@lector-cedula/protocolo`
- **THEN** es exactamente `["no-coincide", "fraude", "ilegible", "menor-de-edad", "documento-no-admitido", "demasiado-grande", "tiempo-agotado", "ocupado", "error-interno"]` en cualquier orden

#### Scenario: No coincide con diferencias
- **WHEN** el `cliente` trae `campos.nuip` `"9999123457"` y el servidor lee `"9999123456"`
- **THEN** el evento final es `{"etapa":"resultado","ok":false,"rechazo":{"motivo":"no-coincide","diferencias":["campos.nuip"]}}`

#### Scenario: Menores admitidos
- **WHEN** el motor devuelve la lectura de un menor de edad sin `limites.admitirMenores` y luego con `limites.admitirMenores: true`
- **THEN** el primero termina con `rechazo.motivo` `"menor-de-edad"` y el segundo con `ok: true` y `alConfirmar` llamado 1 vez

#### Scenario: Errores del motor a motivos
- **WHEN** el motor falla con `ErrorMotor` de código `imagen-demasiado-grande`, `tiempo-agotado`, `motor-ocupado` (cola llena) o `formato-no-soportado`
- **THEN** los motivos son, respectivamente, `"demasiado-grande"`, `"tiempo-agotado"`, `"ocupado"` e `"ilegible"`

#### Scenario: Tabla de motivos
- **WHEN** se procesan `sin-documento-1080p.png`, `ti-1080p.png`, `pasaporte-1080p.png` con `limites.documentos: ["cedula"]`, `amarilla-1080p.png` con riesgo falso `alto` y `fraude: { bloquearSi: "alto" }`, y `amarilla-1080p.png` con la cola llena
- **THEN** los motivos son, en orden, `"ilegible"`, `"menor-de-edad"`, `"documento-no-admitido"`, `"fraude"` y `"ocupado"`

#### Scenario: Fraude no bloquea por defecto
- **WHEN** el motor devuelve riesgo `alto` (p. ej. la amarilla sintética en grises, motivo `fotocopia`) y no hay `fraude.bloquearSi`
- **THEN** la lista de `etapa` incluye `fraude`, el final es `ok: true` con `riesgo.nivel` `"alto"` y `alConfirmar` se llama 1 vez con `contexto.riesgo.nivel` `"alto"`

#### Scenario: bloquearSi
- **WHEN** `fraude.bloquearSi` es `"medio"`, `"alto"` o una función
- **THEN** `"medio"` rechaza riesgo medio y alto, `"alto"` solo alto, la función recibe la señal completa y rechaza si devuelve `true`; si la función lanza, el motivo es `"error-interno"`; con `riesgo: null` no se evalúa

#### Scenario: Tiempo agotado
- **WHEN** `limites.tiempoMs` es 50 y el pool falso tarda 200 ms
- **THEN** el evento final es `ok: false` con `rechazo.motivo` `"tiempo-agotado"`

### Requirement: MOT-23 Privacidad del manejador
El manejador MUST leer la imagen solo en memoria, rechazar con 413 antes de terminar de leer un cuerpo mayor que `limites.bytes` (por omisión 10 MiB), poner a cero todos sus búferes al terminar (también en error o cancelación), MUST NOT escribir en disco ni registrar cuerpo, imagen ni campos, y los eventos intermedios MUST NOT contener datos del documento.

#### Scenario: Bytes a cero
- **WHEN** se procesa `amarilla-1080p.png` con éxito, con rechazo y con cancelación
- **THEN** en los tres casos cada búfer registrado por el espía de asignaciones está a cero al cerrar la respuesta

#### Scenario: Eventos intermedios sin datos
- **WHEN** se inspeccionan los eventos distintos de `resultado`
- **THEN** ninguno contiene `9999123456` ni `PRUEBA`

#### Scenario: Sin disco ni red
- **WHEN** se ejecutan las pruebas del manejador con `bloquear-escrituras.mjs` y `bloquear-red.mjs`
- **THEN** hay 0 marcas `ESCRITURA-PROHIBIDA` y 0 marcas `RED-PROHIBIDA`

### Requirement: MOT-24 Protocolo en Java y Go
Las librerías Java y Go SHALL exponer un manejador HTTP (Java: `jakarta.servlet` y Spring `HandlerFunction`; Go: `http.Handler`) con las mismas opciones (`alConfirmar`, límites, fraude, comparar) y el mismo protocolo NDJSON de MOT-20 a MOT-23.

#### Scenario: Contrato de protocolo
- **WHEN** `npm run motor:contrato -- --protocolo --lenguaje java` y `--lenguaje go` envían los fixtures y los casos de rechazo de MOT-22 a cada manejador en Docker
- **THEN** la secuencia de `etapa`, el evento final y las llamadas a `alConfirmar` son iguales a las del manejador Node en el 100 % de los casos

### Requirement: MOT-25 Respuesta sin streaming
El manejador SHALL responder un único JSON (`Content-Type: application/json`, `Cache-Control: no-store`) igual al evento final de MOT-20 cuando la petición trae `Accept: application/json` sin `application/x-ndjson`, o el parámetro `?streaming=0`; en otro caso SHALL usar NDJSON. MOT-21, MOT-22 y MOT-23 aplican igual.

#### Scenario: Accept JSON
- **WHEN** se envía `amarilla-1080p.png` con `cliente` coincidente y `Accept: application/json`
- **THEN** responde 200 `application/json` con cuerpo `{"etapa":"resultado","ok":true,...}` y `documento.campos.nuip` `"9999123456"`, y `alConfirmar` se llamó 1 vez

#### Scenario: Parámetro de consulta
- **WHEN** se envía la misma petición a `/api/cedula?streaming=0` con `Accept: */*`
- **THEN** la respuesta es `application/json` con el mismo cuerpo

#### Scenario: Igualdad entre protocolos
- **WHEN** se procesan todos los fixtures y casos de MOT-22 en ambos protocolos
- **THEN** el JSON único es igual al último evento NDJSON en el 100 % de los casos

## Pruebas

La tabla completa por requisito (tipo, herramienta, comando, umbral) está en `design.md`, sección `## Pruebas`, según la matriz de la skill `estrategia-pruebas`. Resumen: Node con Vitest + fast-check (numRuns >= 1000) + Stryker (>= 85 %) + Jazzer.js; contrato con la CLI al 100 % en Node, Java y Go (`npm run motor:contrato`); privacidad con hooks `bloquear-escrituras.mjs` y `bloquear-red.mjs` y contenedores `--network none --read-only`; E2E Playwright para `enviarA`; rendimiento `npm run motor:bench` (p95 amarilla <= 1500 ms, digital <= 2500 ms); licencias con `npm run check:licencias`.
