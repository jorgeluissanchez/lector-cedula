# Tasks

Reglas: TDD (principio II), la prueba se ve fallar antes de implementar. Datos sintéticos (`PERSONA_BASE`, NUIP `9999123456`). Pruebas nombradas `MOT-xx <escenario>`. Comandos (`UN`, `UW`, `MU`, `CT`, `BE`, `E2`, `EX`, `JV`, `GO`, `SC`, `L`, `P`, `E`) y umbrales en `design.md`, `## Pruebas`. Cada tarea es un PR pequeño. Dependencias nuevas pasan por `revisor-licencias` antes de instalarse; tareas de red, disco, envío o datos por `revisor-privacidad`. Pruebas que lanzan procesos o workers declaran `{ timeout: 60_000 }`. Toda decisión que cambie comportamiento se traslada a `specs/` con su escenario.

Orden revisado por las decisiones del usuario del 2026-10-09 (modelo backend propio, `design.md`): primero el manejador de servidor y el protocolo (fase A, con motor falso inyectable), luego el motor real (fase 0) y los ejemplos con front React (fase 1). El paquete es `@lector-cedula/servidor` (absorbe `@lector-cedula/motor`). El front (`backend`, `modo`, `verificando`) está en `sdk-integracion`, fase B; el protocolo compartido vive en `@lector-cedula/web/protocolo` (tarea B.1 de `sdk-integracion`).

## Fase A. Manejador de servidor con motor en proceso (prioridad)

- [ ] A.1 `crearLectorServidor` con `manejar(Request): Response`, lectura multipart y binario (`X-Lector-Cliente`), emisión NDJSON en vivo, JSON único por `Accept`/`?streaming=0`, `compararConCliente` integrado, `alConfirmar` solo si ok y tabla de motivos; motor inyectable (pool falso) para no depender de la fase 0. Depende de B.1 de `sdk-integracion`. Cubre MOT-19 (manejar, binario, 405), MOT-20, MOT-21, MOT-22, MOT-25, MOT-10 (si no existe aún, se implementa aquí). Tipos: **unitaria**, **contrato de esquema**, **propiedad**, **mutación**. Verificación: `UN`, `MU`.
- [ ] A.2 Adaptadores `.express()`, `.nest()`, `.next()`, `.fastify()` sobre `manejar`, con flush por evento (sin búfer de compresión) y cancelación al cerrar la conexión. Cubre MOT-19 (adaptadores equivalentes), MOT-21 (cliente cancela). Tipos: **integración**, **mutación**, **licencias** (frameworks como devDependencies). Verificación: `UN`, `MU`, `L`. Revisor: `revisor-licencias`.
- [ ] A.3 Privacidad del manejador: 413 antes de leer el cuerpo completo, búferes a cero en éxito/rechazo/cancelación, eventos intermedios sin datos, fuzz de multipart. Cubre MOT-23. Tipos: **privacidad**, **seguridad**, **fuzz**. Verificación: `UN`, `P`, fuzz de `design.md`. Revisor: `revisor-privacidad`.

## Fase 0. Motor Node en proceso (dentro de `@lector-cedula/servidor`)

- [ ] 0.1 Extraer (si no existe) la función de lectura común que usa `tools/leer-foto.mjs` y crear `packages/servidor/src/motor` con `crearMotor`/`leerDocumento` en el hilo principal; la CLI pasa a usarla. Cubre MOT-01, MOT-03 (estática), MOT-09; enmienda SDK-18 (estática del grafo de `cliente.ts`). Tipos: **unitaria**, **propiedad**, **análisis estático**, **golden**. Verificación: `UN`, `E`.
- [ ] 0.2 `npm run motor:contrato` (Node) con volcado alterado que falla. Cubre MOT-02. Tipos: **contrato**, **evals**. Verificación: `CT`, `E`.
- [ ] 0.3 Recursos sin red: carga por bytes de wasm, traineddata (SHA-256), worker y modelos; hook `tools/test/ayudas/bloquear-red.mjs` con su prueba. Cubre MOT-06. Tipos: **privacidad**, **unitaria**. Verificación: `UN`, `npx vitest run tools`, `P`. Revisor: `revisor-privacidad`.
- [ ] 0.4 Sin disco y búferes a cero (`cacheMethod: "none"`, `finally` con `fill(0)`, `borrarEntrada`), logs sin datos. Cubre MOT-07, MOT-08. Tipos: **privacidad**, **unitaria**, **mutación**. Verificación: `UN`, `MU`, `P`. Revisor: `revisor-privacidad`.
- [ ] 0.5 Lector de cabeceras PNG/JPEG/WebP y límites (bytes, píxeles, tiempo, OCR). Cubre MOT-05. Tipos: **unitaria**, **propiedad**, **seguridad** (bomba), **fuzz**. Verificación: `UN`, fuzz de `design.md`.
- [ ] 0.6 Pool de `worker_threads` (cola, cierre, reemplazo, cancelación por `AbortSignal` del manejador) y conexión del pool real a `crearLectorServidor`. Cubre MOT-04, MOT-05 (tiempo con terminate), MOT-22 (`ocupado`, `tiempo-agotado` con pool real). Tipos: **unitaria**, **concurrencia**, **mutación**. Verificación: `UN`, `MU`.

## Fase 1. Ejemplos con front React e integración Node

- [ ] 1.1 Compatibilidad ESM/CJS, Node 20/22/24 y error en edge (`"@lector-cedula/servidor requiere runtime nodejs"`). Cubre MOT-12 (salvo Next). Tipos: **compatibilidad**. Verificación: `UN`.
- [ ] 1.2 `examples/backend-express` con `crearLectorServidor(...).express()` en `POST /api/cedula` y front React (`backend: "/api/cedula"`, `autoIniciar: true`) del mismo origen. Cubre MOT-13 (Express), SDK-51 (Express). Tipos: **integración HTTP**, **seguridad**. Verificación: `EX`, `npm run check`. Revisores: `revisor-licencias` (Express), `revisor-privacidad`.
- [ ] 1.3 `examples/backend-nest` (`.nest()`) con el mismo front React. Cubre MOT-13 (Nest), SDK-51 (Nest). Tipos: **integración HTTP**. Verificación: `EX`. Revisor: `revisor-licencias` (Nest).
- [ ] 1.4 `examples/backend-next` (route handler `runtime = "nodejs"` con `.next()` y página React). Cubre MOT-12 (Next), MOT-13 (Next), SDK-51 (Next). Tipos: **integración HTTP**. Verificación: `EX`.
- [ ] 1.5 E2E front + back (Playwright, vídeo sintético, ejemplo Express) con plan en `e2e/planes/sdk-backend-propio.md`. Depende de B.3 de `sdk-integracion`. Cubre MOT-15 (E2E y tipos). Tipos: **E2E**, **accesibilidad**, **tipos**. Verificación: `E2`, `npx tsc -p packages/web/test/tipos --noEmit`.
- [ ] 1.6 Webhooks firmados opcionales. Cubre MOT-16. Tipos: **unitaria**, **privacidad**. Verificación: `UN`, `P`. Revisor: `revisor-privacidad`.
- [ ] 1.7 `npm run motor:bench` e informe en `REF_SRV`. Cubre MOT-11 (Node). Tipos: **rendimiento**. Verificación: `BE`.

## Fase 2. Java

- [ ] 2.1 Objetivo ES2017 de `nucleo-js` e igualdad Node vs Rhino. Depende de `sdk-nativo` 0.1. Cubre MOT-03 (Java). Tipos: **diferencial**, **unitaria**. Verificación: `JV`, `npx vitest run packages/nucleo-js`. Revisor: `revisor-licencias` (Rhino).
- [ ] 2.2 `licencia-check` ampliado a Maven y Go con fixtures GraalJS y GPL que fallan. Cubre MOT-18 (control). Tipos: **licencias**, **unitaria**. Verificación: `L`, `npx vitest run tools`.
- [ ] 2.3 PDF417 con ZXing core y MRZ con Tess4J (resolver pregunta abierta 3), sin red ni disco. Cubre MOT-06, MOT-07, MOT-08 (Java). Tipos: **unitaria**, **privacidad**. Verificación: `JV`. Revisores: `revisor-licencias` (Tess4J y transitivas), `revisor-privacidad`.
- [ ] 2.4 `MotorCedula`, límites, concurrencia y contrato Java. Cubre MOT-14 (Java), MOT-02, MOT-05. Tipos: **contrato**, **unitaria**, **mutación** (PIT). Verificación: `CT --lenguaje java`, `JV`.
- [ ] 2.5 Manejador HTTP Java (servlet y Spring) con el protocolo NDJSON/JSON. Cubre MOT-24 (Java). Tipos: **contrato de protocolo**. Verificación: `CT --protocolo --lenguaje java`, `JV`.
- [ ] 2.6 Benchmark Java y `THIRD_PARTY_NOTICES` del JAR. Cubre MOT-11, MOT-18 (Java). Tipos: **rendimiento**, **licencias**. Verificación: `JV`, `L`.
- [ ] 2.7 **Humano**: publicación Maven Central `io.github.jorgeluissanchez:lector-cedula-motor` (cuenta, GPG). Verificación: `mvn dependency:get` desde un proyecto vacío.

## Fase 3. Go

- [ ] 3.1 goja con el bundle ES2017 e igualdad con Node. Cubre MOT-03 (Go). Tipos: **diferencial**. Verificación: `GO`. Revisor: `revisor-licencias` (goja).
- [ ] 3.2 gozxing (bytes crudos PDF417) y gosseract, sin red ni disco. Cubre MOT-06, MOT-07, MOT-08 (Go). Tipos: **unitaria**, **privacidad**. Verificación: `GO`. Revisores: `revisor-licencias`, `revisor-privacidad`.
- [ ] 3.3 `motor.Nuevo`, `LeerDocumento(ctx)`, límites, `-race` y contrato Go. Cubre MOT-14 (Go), MOT-02, MOT-05. Tipos: **contrato**, **concurrencia**, **mutación**. Verificación: `CT --lenguaje go`, `GO`.
- [ ] 3.4 `http.Handler` Go con el protocolo NDJSON/JSON. Cubre MOT-24 (Go). Tipos: **contrato de protocolo**. Verificación: `CT --protocolo --lenguaje go`, `GO`.
- [ ] 3.5 Benchmark Go y avisos. Cubre MOT-11, MOT-18 (Go). Tipos: **rendimiento**, **licencias**. Verificación: `GO`, `L`.
- [ ] 3.6 **Humano**: tag `motor/go/v0.1.0` y ruta final del módulo. Verificación: `go get` desde un módulo vacío.

## Fase 4. Sidecar (opcional) y cierre

- [ ] 4.1 `examples/sidecar/compose.yaml` y documentación `docs/sdk/backend.md` (Node, Java, Go, protocolo, sidecar, Ley 1581). Cubre MOT-17. Tipos: **análisis estático**, **humo**. Verificación: `SC`. Revisor: `revisor-privacidad`.
- [ ] 4.2 Avisos del tarball npm de `@lector-cedula/servidor`. Cubre MOT-18 (Node). Tipos: **licencias**. Verificación: `UN`, `L`.
- [ ] 4.3 Cierre: `npm run check`, todos los comandos de `design.md` en verde, `eval:quick` sin regresión; `verificador` y `pr-test-analyzer` en paralelo; `eval-runner` y `revisor-producto` contra `benchmark-comercial`. Cubre todos. Verificación: todos los comandos.
- [ ] 4.4 **Humano**: publicación npm de `@lector-cedula/servidor` con el motor (ver pregunta abierta 6).
