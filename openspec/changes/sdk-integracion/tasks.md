# Tasks

Reglas: TDD (principio II), la prueba se ve fallar antes de implementar. Datos sintéticos (`PERSONA_BASE`, números `9999...`). Pruebas nombradas `SDK-xx <escenario>`. Comandos `U`, `B`, `E(x)`, `C`, `S`, `SC`, `Z`, `T`, `G`, `M`, `LH`, `L`, `P`, `V` y umbrales en `design.md`, `## Pruebas`. Cada tarea es un PR pequeño. E2E con los agentes `playwright-test-planner` (plan en `e2e/planes/sdk-*.md`), `-generator` y `-healer`. Dependencias nuevas pasan por `revisor-licencias`; tareas de servidor, captura o datos por `revisor-privacidad`. Dependen de `api-validaciones-contrato` y `motor-real-servidor` fusionados para la fase 4 y las pruebas `C`; las fases 3, 3b y 3c no requieren servidor.

Orden revisado por las decisiones del usuario del 2026-10-09 (modelo backend propio, `design.md`): la fase B va primero. Las fases 1, 2 y 4 pasan a ser el **modo opcional microservicio** (SDK-52): lo hecho no se toca y lo pendiente de ellas tiene menor prioridad. Comandos `UB`, `EB(x)` y `TB` en `design.md`.

## Fase B. Modelo por defecto: front + backend propio (prioridad)

- [ ] B.1 `packages/web/src/protocolo.ts` (subruta `@lector-cedula/web/protocolo`, pura, sin DOM): tipos de eventos, `protocolo-ndjson.schema.json`, lector de líneas NDJSON incremental con `TextDecoder` en modo stream y validación de eventos. Lo usan el núcleo y `@lector-cedula/servidor` (MOT-20). Cubre SDK-48 (propiedad de fragmentación y bytes arbitrarios), SDK-54 (`protocolo-invalido`). Tipos: **unitaria**, **propiedad** (numRuns >= 1000), **mutación**. Verificación: `UB`, `M`.
- [ ] B.2 `decidirModo(senales, umbrales)` pura y lectura de señales del navegador (`deviceMemory`, `hardwareConcurrency`, WASM SIMD, `connection`, micro-medición opcional). Cubre SDK-57. Tipos: **unitaria** (tabla de 8 casos literal), **propiedad** (totalidad, `fc.statistics`), **mutación**. Verificación: `UB`, `M`.
- [ ] B.3 Núcleo: opciones `backend`, `encabezadosBackend`, `modo`, `streaming`, `intentosVerificacion`, `tiempoLimiteMs`, `inactividadMs`; fase `verificando` y nuevas `TRANSICIONES`; envío automático multipart; `verificacion`, `rechazo`, `intentosVerificacion`, `modo`, `modoMotivo` en el estado; fallos de transporte con `AbortController`; menores; `confiable: true` solo tras `ok`. Cubre SDK-28 (enmienda), SDK-45, SDK-46, SDK-47, SDK-48, SDK-53, SDK-54, SDK-55, SDK-59. Tipos: **unitaria** con `DEPS`, `fetch` y `ReadableStream` falsos y reloj falso, **propiedad** de la máquina, **mutación**, **privacidad** (copias a cero). Verificación: `UB`, `M`, `P`. Revisor: `revisor-privacidad`.
- [ ] B.4 Adaptadores React, Vue y Angular: `autoIniciar` al vincular el vídeo (nunca en servidor), opciones nuevas y estado de verificación. Cubre SDK-49, SDK-50. Tipos: **unitaria**, **SSR**, **presupuesto**, **mutación**. Verificación: `UB`, `A`, `T`, `M`.
- [ ] B.5 Confirmación diferida sin red: cola de una imagen solo en memoria, evento `online`, `tiempoColaMs`, `cola-vencida`, puesta a cero en `destruir`. Cubre SDK-58. Tipos: **unitaria**, **navegador** (sin persistencia), **privacidad**. Verificación: `UB`, `B`, `P`. Revisor: `revisor-privacidad`.
- [ ] B.6 Modo `back` ligero: grafo de importación sin motor pesado (calidad y presencia ligeras), marcado `pesado` en `manifest.json`, medición del tamaño real y fijación de `PRESUPUESTO_BACK` en `design.md` (medido + 10 %, tope 300 KiB gzip), `check:tamano-sdk -- --modo back` con fixture que falla. Cubre SDK-56. Tipos: **unitaria**, **presupuesto de tamaño**, **E2E de red**. Verificación: `UB`, `TB`, `EB(modo-back-red)`. Revisor: `revisor-licencias` si cambia el reparto de assets.
- [ ] B.7 E2E con el ejemplo Express de `motor-backend-embebido` (tarea 1.2): secuencia con backend real, los 4 modos con `streaming` on/off, auto sin red, ejemplos Express/Nest/Next con front React y axe. Plan en `e2e/planes/sdk-backend-propio.md` con `playwright-test-planner`. Depende de A.1 a A.3 y 1.2 a 1.4 de `motor-backend-embebido`. Cubre SDK-46 (E2E), SDK-51, SDK-58 (E2E), SDK-60. Tipos: **E2E** (Chromium y Pixel 7), **accesibilidad**, **privacidad**. Verificación: `EB(backend)`, `EB(modos)`, `EB(ejemplos-backend)`, `P`.
- [ ] B.8 Documentación: `docs/sdk/README.md` con el modelo backend propio primero (front, `crearLectorServidor` en Express/Nest/Next, protocolo, modos, `autoIniciar`) y la sección "Modo opcional: microservicio"; prueba en `tools/test/docs-sdk.test.mjs`. Cubre SDK-52, SDK-25. Tipos: **análisis estático**, **regresión** del modo opcional. Verificación: `U`.

## Fase 1. Paquete servidor Node (modo opcional microservicio; independiente del frontal)

- [x] 1.1 Crear `packages/servidor` (`@lector-cedula/servidor`, MIT, `0.1.0`, sin `dependencies`, `exports` con subrutas) con `verificarWebhook`. Cubre SDK-18, SDK-20. Tipos: **unitaria** (vectores de AV-26), **propiedad**, **mutación**. Verificación: `U` y `M`.
- [x] 1.2 `crearCliente`, `crearSesion`, `obtenerResultado`, `suprimir`, `ErrorLector` con `fetch` inyectable. Cubre SDK-18, SDK-19 (unitarias con `fetch` falso). Tipos: **unitaria**, **mutación**. Verificación: `U`, `M`.
- [x] 1.3 `manejarWebhook` y adaptadores `express`, `nest`, `next`, `fastify` con lectura de bytes crudos. Cubre SDK-21 (unitarias con `Request` construidas). Tipos: **unitaria**, **mutación**; **licencias** (tipos de frameworks como devDependencies). Verificación: `U`, `M`, `L`.

## Fase 2. Servidor: multi-aplicativo, sesión alojada y recursos del motor (modo opcional microservicio)

- [x] 2.1 Configuración por clave en `CLAVES_API_JSON` (`origenes`, `retornos`, `secreto_webhook`, compatibilidad con la forma anterior, rechazo de `*`) y CORS por clave con 403 `origin-not-allowed`. Cubre SDK-16. Tipos: **unitaria**, **propiedad** (Hypothesis), **seguridad** (ruff S). Verificación: `S`. Revisor: `revisor-privacidad`.
- [x] 2.2 `return_url` y `hosted_url` en el contrato OpenAPI y en `POST /v1/validations`; token alojado de propósito distinto. Cubre SDK-13. Tipos: **unitaria**, **propiedad**, **lint de contrato** (Spectral), **contrato** (Schemathesis). Verificación: `S`, `SC`.
- [x] 2.3 Rechazo de campos no imagen en la subida (`unexpected_field`). Cubre SDK-17. Tipos: **unitaria**, **contrato**. Verificación: `S`, `SC`.
- [x] 2.4 Ruta `/sdk/v1/{archivo}` con cabeceras inmutables y CORS por clave; declarar la ruta en el contrato y mantener la paridad AV-01. Cubre SDK-05. Tipos: **unitaria**, **contrato**. Verificación: `S`, `SC`.
- [x] 2.5 Prueba de contrato del paquete servidor contra `api-pruebas` en Docker: `crearSesion`, errores tipados, idempotencia y diferencial de firma de webhooks reales con un receptor local; adaptadores reciben el webhook del sandbox. Cubre SDK-19, SDK-20 (diferencial), SDK-21. Tipos: **contrato**, **integración**. Verificación: `C` (describe con `{ timeout: 60_000 }`).

## Fase 3. Núcleo headless y migración de la PWA

Orden revisado por las decisiones del usuario del 2026-10-08 (`design.md`). No depende de la fase 2: el núcleo funciona sin servidor.

- [x] 3.1 Crear `packages/web` (`@lector-cedula/web`, MIT, `0.1.0`, `sideEffects: false`) con `maquina.ts` (función pura de `TRANSICIONES`), `estado.ts` (`EstadoLector` inmutable, guía normalizada, sin notificaciones redundantes) y tipos públicos. Cubre SDK-27, SDK-28. Tipos: **unitaria**, **propiedad** (fast-check, numRuns >= 1000), **mutación**. Verificación: `U`, `M`.
- [x] 3.2 `controlador.ts` con `DependenciasLector` inyectables y dependencias por omisión sobre `packages/capture` (importación dinámica en `iniciar`): `iniciar`, `cancelar`, `reintentar`, `destruir`, reintentos y pista de tipo. Instalar `@vitest/browser@3.2.7` si aún no está (aprobado). Cubre SDK-27, SDK-28, SDK-30, SDK-29 (sin DOM ni CSS, importación en Node). Tipos: **unitaria**, **navegador** (MutationObserver), **mutación**. Verificación: `U`, `B`, `M`. Revisor: `revisor-privacidad`.
- [x] 3.3 Assets en `@lector-cedula/web/assets` con `manifest.json` SHA-256, cargador desde `recursos` con verificación de integridad, caché `lector-cedula-sdk-<version>`, `precargarMotor`, `@lector-cedula/web/sw` (`precacheLector`) y `leerDocumento` con `AbortSignal`; presupuesto `npm run check:tamano-sdk` (núcleo 30 720 B con fixture de 30 721 B). Cubre SDK-04 (assets), SDK-06, SDK-07, SDK-08, SDK-29 (tamaño), SDK-39. Tipos: **unitaria**, **presupuesto de tamaño**, **diferencial**, **metamórfica**, **mutación**. Verificación: `T`, `U`, `B`, `M`. Revisor: `revisor-licencias` (redistribución de WASM y traineddata).
- [x] 3.4 `examples/vanilla` (UI propia, sin servidor) y E2E del núcleo: liberación de cámara, offline sin servidor, cero peticiones a otros orígenes, recurso alterado, recarga con el service worker del paquete, privacidad. Cubre SDK-30, SDK-37, SDK-06, SDK-39, SDK-11. Tipos: **E2E** (Chromium y Pixel 7), **privacidad**. Verificación: `E(nucleo)`, `E(sin-servidor)`, `E(offline)`, `E(privacidad)`, `P`.
- [x] 3.5b Hallazgos de `revisor-privacidad` sobre el envío: `upload.url` del mismo origen, menores sin envío salvo `enviarMenores`, copias a cero, autorización del titular documentada y E2E de servidor 503 sin rastro; además SDK-41 (`activo|listo→error`) y `permiso→inicio`. Cubre SDK-30, SDK-38, SDK-41 a SDK-44. Tipos: **unitaria**, **E2E**, **privacidad**. Verificación: `U`, `E(sin-servidor)`, `P`.
- [x] 3.5 Envío opcional al microservicio (`envio`, códigos de fallo, resultado local conservado) con servidor falso. Cubre SDK-38 (unitaria), SDK-15 (lógica). Tipos: **unitaria**, **mutación**. Verificación: `U`, `M`. Revisor: `revisor-privacidad`.
- [ ] 3.6 Migrar `apps/pwa` a consumir el núcleo (con `crearLector` directo; pasa a `@lector-cedula/react` cuando 3b.1 se fusione) sin cambio de comportamiento. Cubre SDK-35. Tipos: **análisis estático** de imports, **regresión E2E**, **evals**. Verificación: `U`, `npm run test:e2e`, `npm run eval:quick`. Revisor: `revisor-privacidad`.
- [x] 3.7 Medidas `lector-cedula:tiempo` y E2E de rendimiento en caliente y en frío sobre `examples/vanilla`. Cubre SDK-09. Tipos: **rendimiento**. Verificación: `E(rendimiento)`.

## Fase 3b. Adaptadores React, Angular y Vue

Cada tarea añade sus devDependencies de prueba tras `revisor-licencias`.

- [x] 3b.1 `packages/react` (`useLectorCedula`, `"use client"`, `useSyncExternalStore`, `getServerSnapshot`) con React Testing Library y `renderToString`. Cubre SDK-31, SDK-34. Tipos: **unitaria**, **SSR**, **presupuesto**, **mutación**, **licencias**. Verificación: `U`, `T`, `M`, `L`.
- [x] 3b.2 `packages/angular` (`injectLectorCedula`, signals, `DestroyRef`, zoneless, `PLATFORM_ID`) con TestBed. Cubre SDK-32, SDK-34. Tipos: **unitaria**, **presupuesto**, **licencias**. Verificación: `A`, `T`, `L`.
- [x] 3b.3 `packages/vue` (`useLectorCedula`, `shallowRef`, `onBeforeUnmount`) con Vue Test Utils y `vue/server-renderer`. Cubre SDK-33, SDK-34. Tipos: **unitaria**, **SSR**, **presupuesto**, **mutación**, **licencias**. Verificación: `U`, `T`, `M`, `L`.
- [x] 3b.4 `examples/react`, `next`, `angular` y `vue` con UI propia distinta (`estilo-esperado.json`), sin servidor por defecto, y E2E de ejemplos (lectura, UI distinta, SSR de Next, offline sin servidor). Cubre SDK-12, SDK-37, SDK-22 (sin decisiones en cliente, sin claves). Tipos: **E2E por framework**, **tipos**, **licencias**. Verificación: `E(ejemplos)`, `E(sin-servidor)`, `npm run build -w examples/*`, `L`.

## Fase 3c. Componente opcional

- [ ] 3c.1 `packages/elementos` (`@lector-cedula/elementos`) sobre `crearLector`: Custom Element, Shadow DOM, atributos (incluidos `recursos` y `servidor` opcional), eventos, textos `es`, temas, `::part` y variables CSS; presupuesto 61 440 B. Cubre SDK-01, SDK-02, SDK-03, SDK-04 (componente), SDK-36. Tipos: **unitaria** y **propiedad** en navegador, **presupuesto**, **mutación**. Verificación: `B`, `U`, `T`, `M`.
- [ ] 3c.2 `examples/html` y E2E del componente: eventos, accesibilidad por estado, regresión visual, privacidad; Lighthouse CI. Cubre SDK-03, SDK-10, SDK-11, SDK-36, SDK-04 (LH). Tipos: **E2E**, **accesibilidad**, **regresión visual**, **privacidad**, **rendimiento**. Verificación: `E(componente)`, `E(accesibilidad)`, `E(visual)`, `E(privacidad)`, `LH`, `P`. Revisor: `revisor-privacidad`.

## Fase 4. Flujo alojado y modo sesión (modo opcional microservicio)

Depende de la fase 2.

- [x] 4.1 Modo sesión de `apps/pwa` (`VITE_MODO=sesion`, ya sobre el núcleo), servido por el servidor en `/v/{token}` con CSP, `no-store`, pantalla `sesion-invalida`, intercambio `POST /v/{token}/inicio` y retorno con `validation_id` y `estado`. Cubre SDK-14. Tipos: **E2E** con `api-pruebas`, **unitaria** (pytest de la ruta), **DAST**. Verificación: `E(alojado)`, `S`, `Z`. Revisor: `revisor-privacidad`.
- [ ] 4.2 Modo sesión del núcleo, adaptadores y componente contra `api-pruebas`: subida a `upload.url`, `validacion_id`, origen no permitido y servidor detenido. Cubre SDK-15, SDK-38 (E2E). Tipos: **E2E** con `api-pruebas`. Verificación: `E(sesion)`.
- [x] 4.3 Servidor: aceptar una sola cara (`front`) cuando la sesión viene del SDK, para retirar la excepción temporal de SDK-38 (imagen duplicada en `front` y `back`). Cubre SDK-38. Tipos: **unitaria** (pytest), **contrato**. Verificación: `S`, `SC`. Revisor: `revisor-privacidad`.

## Fase 5. Ejemplos de backend, clientes generados y documentación (5.1 y 5.2: modo opcional microservicio)

- [ ] 5.1 `examples/express`, `nest`, `fastify` con `crearSesion`, webhook y `obtenerResultado`. Cubre SDK-21, SDK-22. Tipos: **integración** con `api-pruebas`. Verificación: `C`, `L`.
- [ ] 5.2 `npm run clientes:generar` (openapi-generator por digest en Docker, cuatro lenguajes, compilación en Docker, fixture de contrato roto) y job de CI. Cubre SDK-23. Tipos: **generación y compilación**, **licencias**. Verificación: `G`, `L`. Revisor: `revisor-licencias`.
- [ ] 5.3 `docs/sdk/` (README, guías headless por framework con UI propia, copia de assets a `public/` en Vite, Next y Angular, service worker, componente opcional, `nativo.md`, `modelo-amenazas.md`) y `tools/test/docs-sdk.test.mjs` (snippets sincronizados, T1 a T7 con IDs). Cubre SDK-22, SDK-25. Tipos: **análisis estático**. Verificación: `U`.

## Fase 6. Versionado, publicación y cierre

- [ ] 6.1 `CHANGELOG.md` por paquete (`web`, `react`, `angular`, `vue`, `elementos`, `servidor`), `npm run check:versiones` con fixture que falla e inclusión de todos los paquetes y `examples` en `check:privacidad` y `check:licencias`. Cubre SDK-24 (versiones), SDK-26. Tipos: **análisis estático**, **licencias**, **privacidad**. Verificación: `V`, `L`, `P`.
- [ ] 6.2 Workflow `.github/workflows/publicar-sdk.yml` (tag `sdk-v*`, entorno `npm-publicacion`, `--provenance`) y prueba estática del workflow. Cubre SDK-24. Tipos: **análisis estático**, **secretos** (gitleaks). Verificación: `U`, `npm run check`. **Requiere confirmación humana**: crear el entorno protegido y el token de npm; ningún agente publica.
- [ ] 6.3 Cierre: `npm run check`, `npm run test:e2e`, `A`, `S`, `SC`, `Z`, `eval:quick` sin regresión; `verificador` y `pr-test-analyzer` en paralelo; `revisor-producto` contra `benchmark-comercial` (núcleo headless, adaptadores, componente, flujo alojado, SDK de backend). Cubre todos. Verificación: todos los comandos de `design.md` en verde.

Fase futura sin tareas: `@lector-cedula/react-native` (diseño en `design.md`, decisión C).

## 7. Ionic / Capacitor (decisión del orquestador por delegación del usuario, 2026-10-09)

- [ ] 7.1 `examples/ionic-angular` (Ionic + Capacitor) con `injectLectorCedula`, recursos copiados a `www/`, permisos `CAMERA` (Android) y `NSCameraUsageDescription` (iOS) y `<video playsinline>`. Cubre SDK-12 (ejemplos), SDK-37 (sin red). Tipos de prueba: **E2E** (Playwright sobre la build web del ejemplo) y **humo en emulador Android** (Appium o `adb` + WebView con cámara simulada) que lee la amarilla sintética sin red. Verificación: build del ejemplo en verde; E2E en verde; informe del humo en emulador. Documentar en `docs/sdk/ionic.md`.
