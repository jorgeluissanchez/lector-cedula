---
name: estrategia-pruebas
description: Estrategia de pruebas obligatoria del proyecto - qué tipos de prueba exige cada componente, con qué herramienta, comando y umbral, y cómo se escribe la sección "Pruebas" de una spec. Cárgala SIEMPRE al redactar una spec o tasks.md, al implementar una tarea y al verificarla. Evita improvisar pruebas.
---

# Estrategia de pruebas

Fuente y evidencia: `docs/investigacion/04-testing-herramientas-y-skills.md`. Principio II de la constitución: sin prueba automática no hay tarea terminada.

## 1. Regla para specs (spec-writer)

Toda spec (Spec Kit `specs/NNN/spec.md` u OpenSpec `openspec/changes/<c>/design.md`) MUST incluir una sección `## Pruebas` con esta tabla, una fila por requisito y tipo de prueba:

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| NF-02 | Propiedad | fast-check | `npx vitest run packages/parsers` | numRuns >= 1000, 0 excepciones |

Y cada tarea de `tasks.md` MUST nombrar los tipos de prueba que entrega y el comando que la verifica. El `verificador` rechaza una entrega si falta la sección, si un requisito no tiene fila o si un comando no se ejecutó.

## 2. Matriz obligatoria por componente

| Componente | Tipos obligatorios | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| Parsers (`packages/parsers`) | Unitaria con literales de la spec; propiedad (round-trip, checksums, no lanza); fuzz de bytes; mutación; casos de "errores pasados" | Vitest, fast-check, Stryker | `npx vitest run packages/parsers`, `npm run test:mutacion` | Ramas >= 95 %; mutation score >= 85 % (break 80); numRuns >= 1000 |
| Evals de campo | Golden sintético por tipo de documento | `eval-campo` | `npm run eval:quick` | Sin regresión frente a `baseline.json` |
| Captura web (`packages/capture`, `apps/pwa`) | Unitaria de calidad (blur, glare, exposición); Workers y WASM en navegador real; E2E con vídeo sintético; accesibilidad; regresión visual; rendimiento | Vitest browser mode, Playwright, @axe-core/playwright, Lighthouse CI | `npm run test:e2e` | E2E verde en Chromium y Pixel 7; 0 violaciones axe serious o critical; p95 a resultado válido <= 3 s |
| OCR cliente (`packages/ocr`) | Golden dataset; metamórficas; diferencial navegador contra Node; latencia | Vitest, onnxruntime-node, `eval-campo` | `npm run eval` | CER por campo <= 2 % |
| Antifraude y modelos (`packages/fraud`) | Métricas en dataset de evaluación; metamórficas; golden de salidas; licencia del modelo | corredor de `evals/`, onnxruntime-node | `npm run eval` | AUC document liveness >= 0,95 (DLC-2021); FAR y FRR reportados; `models/manifest.json` completo |
| API servidor (`server/`) | Unitaria y propiedad; contrato OpenAPI; SAST; DAST; carga | pytest + Hypothesis, Schemathesis, ruff S + Semgrep, OWASP ZAP, carga (herramienta pendiente) | `docker compose -f server/compose.yaml run --rm pruebas` | 0 fallos Schemathesis `--checks all`; 0 alertas ZAP High; p95 < 3 s |
| App móvil (`apps/mobile`) | E2E nativo + WebView; permisos de cámara; smoke en dispositivo real | Appium + WebdriverIO (pendiente de verificar) | `npx wdio run wdio.android.conf.ts` | Flujo de captura verde en emulador; checklist iOS por release |
| Repositorio e infraestructura | Secretos; vulnerabilidades; licencias; privacidad | gitleaks, osv-scanner, `licencia-check`, `privacidad-check` | `npm run check` + escáneres en Docker | 0 secretos; 0 High/Critical sin excepción documentada |

### Estado de herramientas (verificado el 2026-10-06)

**Instaladas y funcionando:** Vitest 3.2, fast-check 4.10, Playwright 1.63 (Chromium con cámara simulada), Stryker 10 con vitest-runner (`npm run test:mutacion`, break 85), @axe-core/playwright 4.13.

**Aprobadas para instalar cuando la fase las necesite** (licencia verificada):

| Uso | Herramienta | Licencia | Nota |
|---|---|---|---|
| Workers y WASM en navegador | `@vitest/browser-playwright` | MIT | Vitest 5.0.3 es la versión actual; subir de 3.2 requiere revisar la migración. Stryker no soporta browser mode. |
| Modelos ONNX en pruebas | `onnxruntime-node` 1.30 | MIT | Misma versión que onnxruntime-web. |
| Fuzzing guiado por cobertura | `@jazzer.js/core` 4.0 | Apache-2.0 | CLI independiente (no se integra con Vitest). |
| Contrato de API | Schemathesis 4.29 (Docker `schemathesis/schemathesis`) | MIT | En Docker Desktop usar `host.docker.internal`. Dredd está archivado: no usar. |
| Lint de OpenAPI | Spectral 6.17 o `@redocly/cli` | Apache-2.0 / MIT | Spectral permite prohibir campos con PII en respuestas. |
| Carga | Artillery 2.0 (MPL-2.0) o Locust 2.46 (MIT, Docker) | | k6 es AGPL: solo como herramienta interna si se justifica. |
| Regresión visual | `toHaveScreenshot` de Playwright, siempre en `mcr.microsoft.com/playwright:v1.63.0-noble` | Apache-2.0 | Lost Pixel está archivado; BackstopJS sin releases. |
| Rendimiento web | Lighthouse CI 0.15 | Apache-2.0 | Presupuestos de tamaño de WASM y LCP. |
| Seguridad | gitleaks, osv-scanner, OWASP ZAP, Trivy (Docker) | MIT / Apache-2.0 | **Trivy tuvo un compromiso de cadena de suministro en marzo de 2026 (CVE-2026-33634): fijar imagen por digest y Actions por SHA.** Semgrep CE es LGPL y sus reglas solo para uso interno, con `--metrics=off`. ruff con reglas S en lugar de Bandit. |
| Distorsiones de imagen | augraphy (MIT), torchvision v2 (BSD-3), kornia (Apache-2.0) en Docker | | **AlbumentationsX es AGPL**; albumentations está archivado. Deepchecks es AGPL. |
| PII en fixtures y logs | Presidio 2.2 (`ghcr.io/data-privacy-stack/presidio-analyzer`, MIT) | | Ya no está en mcr.microsoft.com. No trae reconocedor de cédula colombiana: hay que escribirlo. |
| Móvil | Appium 3.8 + uiautomator2 / xcuitest + WebdriverIO 10 | Apache-2.0 / MIT | Contexto `WEBVIEW_<pkg>`. Detox no sirve para Capacitor. |

### Cámara en cada plataforma

- **Chromium:** `--use-file-for-fake-video-capture=<archivo>` solo acepta `.y4m` (I420) o `.mjpeg`, en bucle. Un proyecto de Playwright por vídeo.
- **Firefox:** solo patrón sintético (`media.navigator.streams.fake`).
- **WebKit, y Firefox con imagen propia:** `page.addInitScript` que sustituya `getUserMedia` por `canvas.captureStream()` dibujando la imagen sintética.
- **Emulador Android:** `emulator @AVD -camera-back imagefile:<png>` o `videofile:<archivo>`.
- **Simulador iOS:** no tiene cámara. Probar en iOS solo la lógica posterior a la captura, con un modo de prueba que inyecte fotogramas, y la cámara real en dispositivo físico.

## 3. Recetas concretas (no improvises)

### Unitarias
- Un `it` por escenario de la spec, con los valores literales del escenario y `toStrictEqual` cuando la spec da el objeto completo.
- Nombre del test = ID del requisito + nombre del escenario.

### Propiedades (fast-check)
- Siempre: "nunca lanza" con `fc.string()`, `fc.string({ unit: "binary" })` y `fc.anything()` si la función recibe datos externos.
- Determinismo, idempotencia y round-trip generador -> parser cuando exista generador.
- `numRuns` >= 1000 en parsers.

### Mutación (Stryker)
- `npm run test:mutacion` sobre los archivos tocados. Un mutante superviviente es una prueba que falta, no un ruido.

### E2E (Playwright)
- Usa los agentes `playwright-test-planner` (plan en `e2e/planes/`), `playwright-test-generator` y `playwright-test-healer`.
- La cámara se simula: `--use-fake-device-for-media-stream` (ya en `playwright.config.ts`) y, para cédulas, `--use-file-for-fake-video-capture=<video.y4m>` generado desde imágenes sintéticas con ffmpeg en Docker.
- `getUserMedia` solo existe en contexto seguro: sirve la página desde HTTPS o localhost (ver `e2e/seed.spec.ts`).
- Esperas por condición (`expect.poll`, `waitForFunction`), nunca `waitForTimeout`.
- Accesibilidad con `@axe-core/playwright` en cada pantalla nueva.

### Metamórficas de visión
Sobre imágenes sintéticas: rotación ±3°, perspectiva leve, blur sigma <= 1, glare fuera del código, brillo ±20 %, JPEG calidad 70. **La salida decodificada no cambia.** Con distorsión fuerte, el score de calidad baja y el frame se rechaza; nunca aparece un número distinto.

### Servidor
- pytest + Hypothesis dentro de Docker; Schemathesis contra `/openapi.json`; ZAP API scan contra el contenedor; ruff con reglas S y T20.

## 4. Antipatrones (de superpowers `test-driven-development/writing-good-tests.md`)

- Probar mocks en vez de comportamiento.
- Escribir la prueba después y "ajustarla" a lo que el código hace.
- Esperas por tiempo fijo.
- Un test que nunca se vio fallar.
- Bajar un umbral o el baseline para que pase.

## 5. Skills complementarias

Instaladas a nivel de proyecto:

| Skill o agente | Para qué |
|---|---|
| `superpowers:test-driven-development` (incluye `writing-good-tests.md`) | Ciclo rojo-verde y calidad de cada prueba |
| `superpowers:systematic-debugging` (incluye `condition-based-waiting.md`) | Depurar fallos y esperas por condición |
| `superpowers:verification-before-completion` | No declarar éxito sin evidencia |
| `property-based-testing` (Trail of Bits) | Diseñar propiedades con fast-check: round-trip, inverso, oráculo, invariantes |
| `playwright-cli`, `playwright-trace`, `playwright-component-testing` (oficiales de Playwright 1.63) | Manejar el navegador, leer trazas, probar componentes |
| Agentes `playwright-test-planner`, `-generator`, `-healer` | Planificar, generar y reparar E2E (planes en `e2e/planes/`) |
| `pr-review-toolkit` → agente `pr-test-analyzer` (Anthropic) | Revisar cobertura y calidad de pruebas de un cambio antes del verificador |
| `fixture-sintetico`, `eval-campo`, `captura-movil` (del proyecto) | Datos, métricas y cámara |

Descartadas: `webapp-testing` de Anthropic (depende de Python local), Semgrep Guardian (envía código a la nube, binario sin licencia), skill de Deque (requiere suscripción), skills de un solo autor sin licencia clara (mizchi `stryker-js`).
