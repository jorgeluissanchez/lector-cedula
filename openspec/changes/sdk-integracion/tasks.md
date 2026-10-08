# Tasks

Reglas: TDD (principio II), la prueba se ve fallar antes de implementar. Datos sintéticos (`PERSONA_BASE`, números `9999...`). Pruebas nombradas `SDK-xx <escenario>`. Comandos `U`, `B`, `E(x)`, `C`, `S`, `SC`, `Z`, `T`, `G`, `M`, `LH`, `L`, `P`, `V` y umbrales en `design.md`, `## Pruebas`. Cada tarea es un PR pequeño. E2E con los agentes `playwright-test-planner` (plan en `e2e/planes/sdk-*.md`), `-generator` y `-healer`. Dependencias nuevas pasan por `revisor-licencias`; tareas de servidor, captura o datos por `revisor-privacidad`. Dependen de `api-validaciones-contrato` y `motor-real-servidor` fusionados para las fases 3 y 4.

## Fase 1. Paquete servidor Node (independiente del frontal)

- [ ] 1.1 Crear `packages/servidor` (`@lector-cedula/servidor`, MIT, `0.1.0`, sin `dependencies`, `exports` con subrutas) con `verificarWebhook`. Cubre SDK-18, SDK-20. Tipos: **unitaria** (vectores de AV-26), **propiedad**, **mutación**. Verificación: `U` y `M`.
- [ ] 1.2 `crearCliente`, `crearSesion`, `obtenerResultado`, `suprimir`, `ErrorLector` con `fetch` inyectable. Cubre SDK-18, SDK-19 (unitarias con `fetch` falso). Tipos: **unitaria**, **mutación**. Verificación: `U`, `M`.
- [ ] 1.3 `manejarWebhook` y adaptadores `express`, `nest`, `next`, `fastify` con lectura de bytes crudos. Cubre SDK-21 (unitarias con `Request` construidas). Tipos: **unitaria**, **mutación**; **licencias** (tipos de frameworks como devDependencies). Verificación: `U`, `M`, `L`.

## Fase 2. Servidor: multi-aplicativo, sesión alojada y recursos del motor

- [ ] 2.1 Configuración por clave en `CLAVES_API_JSON` (`origenes`, `retornos`, `secreto_webhook`, compatibilidad con la forma anterior, rechazo de `*`) y CORS por clave con 403 `origin-not-allowed`. Cubre SDK-16. Tipos: **unitaria**, **propiedad** (Hypothesis), **seguridad** (ruff S). Verificación: `S`. Revisor: `revisor-privacidad`.
- [ ] 2.2 `return_url` y `hosted_url` en el contrato OpenAPI y en `POST /v1/validations`; token alojado de propósito distinto. Cubre SDK-13. Tipos: **unitaria**, **propiedad**, **lint de contrato** (Spectral), **contrato** (Schemathesis). Verificación: `S`, `SC`.
- [ ] 2.3 Rechazo de campos no imagen en la subida (`unexpected_field`). Cubre SDK-17. Tipos: **unitaria**, **contrato**. Verificación: `S`, `SC`.
- [ ] 2.4 Ruta `/sdk/v1/{archivo}` con cabeceras inmutables y CORS por clave; declarar la ruta en el contrato y mantener la paridad AV-01. Cubre SDK-05. Tipos: **unitaria**, **contrato**. Verificación: `S`, `SC`.
- [ ] 2.5 Prueba de contrato del paquete servidor contra `api-pruebas` en Docker: `crearSesion`, errores tipados, idempotencia y diferencial de firma de webhooks reales con un receptor local; adaptadores reciben el webhook del sandbox. Cubre SDK-19, SDK-20 (diferencial), SDK-21. Tipos: **contrato**, **integración**. Verificación: `C` (describe con `{ timeout: 60_000 }`).

## Fase 3. Componente web y API headless

- [ ] 3.1 Crear `packages/web` (`@lector-cedula/web`, MIT, `0.1.0`): Custom Element, Shadow DOM, atributos, textos `es`/`en`, temas, `::part`, tipos para JSX y Angular. Instalar `@vitest/browser@3.2.7` si aún no está (aprobado). Cubre SDK-01, SDK-02. Tipos: **unitaria** y **propiedad** en navegador, **análisis estático**, **mutación**. Verificación: `B`, `U`, `M`, `L`.
- [ ] 3.2 Cargador diferido del motor desde `<servidor>/sdk/v1/`, `precargarMotor`, presupuesto `npm run check:tamano-sdk` con fixture de 61 441 B. Cubre SDK-04, SDK-07. Tipos: **unitaria**, **presupuesto de tamaño**, **mutación**. Verificación: `T`, `U`, `B`, `M`.
- [ ] 3.3 Cámara, máquina de estados, eventos, `aria-live`, liberación de recursos; reutiliza `packages/capture`. Cubre SDK-03, SDK-10, SDK-11. Tipos: **E2E** (Chromium y Pixel 7), **accesibilidad**, **regresión visual**, **privacidad**. Verificación: `E(componente)`, `E(accesibilidad)`, `E(visual)`, `E(privacidad)`, `P`. Revisor: `revisor-privacidad`.
- [ ] 3.4 Caché offline `lector-cedula-sdk-<version>` con limpieza de versiones. Cubre SDK-06. Tipos: **E2E offline**. Verificación: `E(offline)`.
- [ ] 3.5 `leerDocumento` headless con `AbortSignal`. Cubre SDK-08. Tipos: **diferencial**, **metamórfica**, **unitaria**. Verificación: `B`, `E(headless)`.
- [ ] 3.6 Medidas `lector-cedula:tiempo` y E2E de rendimiento en caliente y en frío; Lighthouse CI de `examples/html`. Cubre SDK-09, SDK-04 (LH). Tipos: **rendimiento**. Verificación: `E(rendimiento)`, `LH`.

## Fase 4. Flujo alojado y modo sesión

- [ ] 4.1 Modo sesión de `apps/pwa` (`VITE_MODO=sesion`), servido por el servidor en `/v/{token}` con CSP, `no-store`, pantalla `sesion-invalida`, intercambio `POST /v/{token}/inicio` y retorno con `validation_id` y `estado`. Cubre SDK-14. Tipos: **E2E** con `api-pruebas`, **unitaria** (pytest de la ruta), **DAST**. Verificación: `E(alojado)`, `S`, `Z`. Revisor: `revisor-privacidad`.
- [ ] 4.2 Atributo `sesion` del componente: subida a `upload.url` y `validacion_id`. Cubre SDK-15. Tipos: **E2E** con `api-pruebas`. Verificación: `E(sesion)`.

## Fase 5. Ejemplos, clientes generados y documentación

- [ ] 5.1 `examples/html`, `react`, `angular`, `vue`, `next` como workspaces con `[data-prueba="nuip"]`. Cubre SDK-12, SDK-22 (sin decisiones en cliente, sin claves). Tipos: **E2E por framework**, **tipos**, **análisis estático**, **licencias**. Verificación: `E(ejemplos)`, `npm run build -w examples/*`, `U`, `L`. Revisor: `revisor-licencias`.
- [ ] 5.2 `examples/express`, `nest`, `fastify` con `crearSesion`, webhook y `obtenerResultado`. Cubre SDK-21, SDK-22. Tipos: **integración** con `api-pruebas`. Verificación: `C`, `L`.
- [ ] 5.3 `npm run clientes:generar` (openapi-generator por digest en Docker, cuatro lenguajes, compilación en Docker, fixture de contrato roto) y job de CI. Cubre SDK-23. Tipos: **generación y compilación**, **licencias**. Verificación: `G`, `L`. Revisor: `revisor-licencias`.
- [ ] 5.4 `docs/sdk/` (README, ocho guías, `nativo.md`, `modelo-amenazas.md`) y `tools/test/docs-sdk.test.mjs` (snippets sincronizados, T1 a T7 con IDs). Cubre SDK-22, SDK-25. Tipos: **análisis estático**. Verificación: `U`.

## Fase 6. Versionado, publicación y cierre

- [ ] 6.1 `CHANGELOG.md` por paquete, `npm run check:versiones` con fixture que falla, inclusión de `packages/web`, `packages/servidor` y `examples` en `check:privacidad` y `check:licencias`. Cubre SDK-24 (versiones), SDK-26. Tipos: **análisis estático**, **licencias**, **privacidad**. Verificación: `V`, `L`, `P`.
- [ ] 6.2 Workflow `.github/workflows/publicar-sdk.yml` (tag `sdk-v*`, entorno `npm-publicacion`, `--provenance`) y prueba estática del workflow. Cubre SDK-24. Tipos: **análisis estático**, **secretos** (gitleaks). Verificación: `U`, `npm run check`. **Requiere confirmación humana**: crear el entorno protegido y el token de npm; ningún agente publica.
- [ ] 6.3 Cierre: `npm run check`, `npm run test:e2e`, `S`, `SC`, `Z`, `eval:quick` sin regresión; `verificador` y `pr-test-analyzer` en paralelo; `revisor-producto` contra `benchmark-comercial` (componente, flujo alojado, SDK de backend). Cubre todos. Verificación: todos los comandos de `design.md` en verde.
