# Testing: herramientas y skills para que ninguna spec improvise pruebas (2026-10-06)

**Pregunta.** Qué skills/agentes de Claude Code y qué herramientas concretas por tipo de prueba debe exigir toda spec del lector de cédula, con licencia, comando e instalación.

**Respuesta corta.** Base ya instalada y suficiente para el 80 %: Vitest + fast-check + Stryker + Playwright 1.63 (con cámara falsa) + @axe-core/playwright + superpowers 6.4.2. Faltan: Vitest browser mode (Workers/WASM), Schemathesis y Hypothesis (Docker) para la API, gitleaks/osv-scanner/Semgrep/ZAP en Docker, onnxruntime-node para golden tests de modelos, y augraphy (MIT) para distorsiones de documentos. Los Playwright Test Agents sirven pero chocan con `specs/` de Spec Kit: configurar sus planes en `e2e/planes/`.

**Leyenda.** [V] verificado en fuente primaria (código instalado en `node_modules`, caché del plugin, archivos del repo). [E] estimado o tomado de conocimiento previo (corte jun-2026) sin re-verificar hoy en la web: **verificar licencia con `licencia-check` antes de instalar**.

> Limitación de esta nota: la verificación web en vivo (WebSearch/WebFetch) se delegó y no llegó a tiempo. Todo lo marcado [E] queda pendiente de una segunda pasada del `investigador` con fuente primaria. Lo marcado [V] se comprobó en esta máquina.

## Estado actual del repo [V]

- `package.json`: vitest 3.2.7, @vitest/coverage-v8, @playwright/test 1.63.0, @stryker-mutator/core 10.0.0 + vitest-runner, fast-check 4.10.2, @axe-core/playwright 4.13.0.
- `vitest.config.ts`: cobertura v8 con umbrales 90/85/90/90 (líneas/ramas/funciones/sentencias).
- `playwright.config.ts`: `permissions: ["camera"]`, `--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`; proyectos Desktop Chrome y Pixel 7. `e2e/seed.spec.ts` y `e2e/planes/` existen.
- `.mcp.json` ya registra el servidor `playwright-test` (`cmd /c npx playwright run-test-mcp-server`), pero `.claude/agents/` **no** contiene los agentes planner/generator/healer.
- No hay `stryker.config.*` todavía. Servidor: pytest + httpx + ruff con reglas `S` (bandit) y `T20`.

## A. Skills y agentes de Claude Code

| Skill / agente | URL | Licencia | Qué hace | Instalación | Python | Encaje |
|---|---|---|---|---|---|---|
| superpowers `test-driven-development` (+ `writing-good-tests.md`) | https://github.com/obra/superpowers | MIT [V] | Ciclo rojo-verde-refactor obligatorio; "cada prueba nombra el fallo que atrapa", expectativas literales, mocks solo si la dependencia real es lenta/externa. En 6.4.2 `testing-anti-patterns` ya no existe como skill separada: su contenido está en `writing-good-tests.md` [V] | Ya instalado: `/plugin marketplace add obra/superpowers-marketplace` + `/plugin install superpowers@superpowers-marketplace` [V] | No | Alto: obligatorio para `implementador` |
| superpowers `systematic-debugging` (+ `condition-based-waiting.md`) | idem | MIT [V] | Sustituir timeouts por espera de condición; `find-polluter.sh` para pruebas que contaminan estado [V] | idem | No | Alto para E2E de cámara y Workers (flaky) |
| superpowers `verification-before-completion` | idem | MIT [V] | Prohíbe declarar terminado sin ejecutar la verificación | idem | No | Alto para `verificador` |
| Playwright Test Agents (planner, generator, healer) | https://playwright.dev/docs/test-agents | Apache-2.0 [V] | `npx playwright init-agents --loop=claude` escribe `.claude/agents/playwright-test-planner.md`, `playwright-test-generator.md`, `playwright-test-healer.md`; **sobrescribe** `.mcp.json` con `playwright-test`; crea `specs/README.md` si no existe `specs/`; crea `<testDir>/seed.spec.ts` si no hay seed; con `--prompts` añade `.claude/prompts/playwright-test-{plan,generate,heal,coverage}.md` [V: `node_modules/playwright/lib/agents/generateAgents.js`] | `npx playwright init-agents --loop=claude --prompts` | No | Alto, con dos ajustes: (1) los planes van a `e2e/planes/`, no a `specs/` (reservado a Spec Kit); (2) borrar `specs/README.md` si se crea. El planner usa `model: sonnet` en su frontmatter [V] |
| Playwright MCP | https://github.com/microsoft/playwright-mcp | Apache-2.0 [E] | Navegador controlable por snapshots de accesibilidad para exploración manual por el agente | `claude mcp add playwright -- npx @playwright/mcp@latest` [E] | No | Medio: el MCP `playwright-test` ya cubre el ciclo de pruebas; usar este solo para exploración |
| Playwright CLI + skill | https://github.com/microsoft/playwright-cli | Apache-2.0 [E] | CLI pensada para agentes (menos tokens que MCP) con skill instalable | `npm i -g @playwright/cli` y `playwright-cli install --skills` [E, verificar] | No | Medio |
| anthropics/skills `webapp-testing` | https://github.com/anthropics/skills/tree/main/skills/webapp-testing | Apache-2.0 [E] | Guía + `scripts/with_server.py` para levantar servidor y probar con Playwright **Python** | `/plugin marketplace add anthropics/skills` + `/plugin install example-skills@anthropic-agent-skills` [E] | **Sí** | Bajo: depende de Python local (bloqueado). Sustituido por Playwright Test Agents en TS |
| trailofbits/skills (`property-based-testing`, `semgrep`/static-analysis, `testing-handbook`, `sharp-edges`, `differential-review`) | https://github.com/trailofbits/skills | CC BY-SA 4.0 [E] | Guías de PBT (propiedades: round-trip, idempotencia, oráculo), Semgrep/CodeQL, fuzzing | `/plugin marketplace add trailofbits/skills` + `/plugin install <skill>@trailofbits` [E] | Parcial (Semgrep vía Docker) | Alto `property-based-testing` (aplica a fast-check en parsers); medio el resto |
| Semgrep MCP / plugin | https://github.com/semgrep/mcp | MIT (servidor) / LGPL-2.1 (motor CE) [E] | Escaneo SAST desde el agente | Preferir Docker: ver B | Sí (Docker) | Medio |
| Subagentes `test-automator` / `qa-expert` | https://github.com/wshobson/agents, https://github.com/VoltAgent/awesome-claude-code-subagents | MIT [E] | Prompts genéricos de QA | Copiar el `.md` a `.claude/agents/` | No | Bajo: genéricos; mejor la skill propia propuesta abajo |
| Catálogos (skills.sh `npx skills add`, claudemarketplaces.com, mdskills.ai, awesome-claude-skills) | https://skills.sh, https://github.com/travisvn/awesome-claude-skills | varias [E] | Índices; calidad desigual, muchos de un solo autor | — | — | Solo descubrimiento. **Riesgo**: una skill de terceros ejecuta código con los permisos del agente; leer entera antes de instalar |

**Conclusión A.** No hay en los catálogos una skill madura de mutation testing, contract testing, visual regression o "test strategy" que supere a una skill propia [E]. Recomendación: crear la skill de proyecto `estrategia-pruebas` (la matriz de la sección C con comandos y umbrales) y que `spec-writer` la cargue para rellenar una sección obligatoria "Pruebas" en cada spec, y `verificador` la use como checklist.

## B. Herramientas por tipo de prueba

| Tipo | Herramienta | Licencia | Comando | Nota |
|---|---|---|---|---|
| Unitarias TS | Vitest 3.2.7 (Vitest 4 disponible [E]) | MIT [V] | `npx vitest run` | Mantener 3.x hasta migrar browser mode |
| Propiedades / fuzz TS | fast-check 4.10.2 | MIT [V] | `fc.assert(fc.property(...), { numRuns: 1000 })` | También como fuzzer de bytes: `fc.uint8Array({maxLength: 2048})` contra el parser PDF417 (nunca lanza excepción no tipada, nunca devuelve campos sin validar) |
| Unitarias Python | pytest + httpx | MIT [V] | `docker compose -f server/compose.yaml run --rm pruebas` | Ya configurado |
| Propiedades Python | Hypothesis (+ hypothesis-jsonschema) | MPL-2.0 [E] | añadir al grupo `dev` de `pyproject.toml` | Permitida (MPL) |
| Mutación TS | StrykerJS 10 + vitest-runner | Apache-2.0 [V instalado] | `npx stryker run` con `thresholds: { high: 90, low: 80, break: 80 }` | Falta `stryker.config.json`; ejecutar en CI nocturno o `--incremental` |
| Mutación Python | mutmut 3.x | BSD-3 [E] | en Docker `uv run mutmut run` | cosmic-ray (MIT) más lento [E] |
| Fuzzing | Jazzer.js | Apache-2.0, estado de mantenimiento dudoso [E] | — | Preferir fast-check; Atheris (Apache-2.0) solo en Docker para el re-decode del servidor [E]. zxing-cpp tiene fuzzers en OSS-Fuzz [E] |
| Contrato API | Schemathesis 4.x | MIT [E] | `docker run --rm --network host schemathesis/schemathesis:stable run http://localhost:8000/openapi.json --checks all` | Genera casos desde el OpenAPI de FastAPI; principal |
| Lint OpenAPI | @redocly/cli o Spectral | MIT / Apache-2.0 [E] | `npx @redocly/cli lint openapi.json` | Contrato SDK<->servidor versionado |
| Contrato consumidor | Pact (pact-js) | MIT [E] | — | Opcional: solo si hay terceros consumidores. Dredd: abandonado [E], no usar |
| E2E web | Playwright 1.63 | Apache-2.0 [V] | `npx playwright test` | Ver receta de cámara abajo |
| Workers/WASM | Vitest browser mode, provider Playwright | MIT [E] | Vitest 3: `npm i -D @vitest/browser`; Vitest 4: `@vitest/browser-playwright` [E] | Prueba zxing-wasm, onnxruntime-web y Workers reales en Chromium |
| Móvil Capacitor | Appium 2/3 (UiAutomator2, XCUITest) + WebdriverIO | Apache-2.0 / MIT [E] | `npx wdio` con `@wdio/appium-service` | Único con cambio de contexto NATIVE_APP <-> WEBVIEW. Maestro (Apache-2.0) bueno para flujos nativos simples [E]. **Detox no sirve** (solo React Native) |
| Cámara emulador Android | Emulator virtual scene / imagen propia | — | `emulator -avd <avd> -camera-back virtualscene` y colocar imagen sintética de cédula en la escena [E] | Simulador iOS no tiene cámara: probar captura iOS con dispositivo real o inyectando imagen por el plugin en modo test |
| Regresión visual | Playwright `toHaveScreenshot` | Apache-2.0 [V] | correr en `mcr.microsoft.com/playwright:v1.63.0-noble` para fuentes estables [E] | `maxDiffPixelRatio: 0.01`. Lost Pixel / reg-suit / BackstopJS no aportan sobre esto [E] |
| Accesibilidad | @axe-core/playwright 4.13 | MPL-2.0 [V instalado] | `new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()` | 0 violaciones serious/critical. pa11y es LGPL [E], innecesario |
| Rendimiento web | Lighthouse CI (@lhci/cli) | Apache-2.0 [E] | `npx @lhci/cli autorun` | Presupuestos: performance >= 0,9, a11y >= 0,95, JS inicial <= 300 KB gzip (WASM diferido) |
| Latencia de inferencia | `performance.mark` en Playwright + `vitest bench` | MIT [V] | `npx vitest bench` | p95 por etapa (detección, decode, OCR) en CPU throttling 4x |
| Carga API | k6 | AGPL-3.0 [E] | `docker run --rm -i grafana/k6 run - < carga.js` | Herramienta interna no distribuida: tolerable, no entra en el producto. Alternativa limpia: autocannon (MIT) o Locust (MIT, Docker) |
| SAST | Semgrep CE | LGPL-2.1 motor; reglas del registry bajo "Semgrep Rules License" (no OSI) [E] | `docker run --rm -v "$(pwd -W):/src" semgrep/semgrep semgrep scan --config p/typescript --config p/python --error` | Uso interno OK |
| DAST | OWASP ZAP | Apache-2.0 [E] | `docker run --rm -t ghcr.io/zaproxy/zaproxy:stable zap-api-scan.py -t http://host.docker.internal:8000/openapi.json -f openapi` | Antes de cada release del servidor |
| Dependencias | npm audit, osv-scanner v2 | — / Apache-2.0 [E] | `npm audit --omit=dev --audit-level=high`; `docker run --rm -v "$(pwd -W):/src" ghcr.io/google/osv-scanner scan -r /src` | osv cubre también `uv.lock` |
| Imágenes Docker | Trivy | Apache-2.0 [E] | `docker run --rm -v //var/run/docker.sock:/var/run/docker.sock aquasec/trivy image --severity HIGH,CRITICAL --exit-code 1 <imagen>` | **Fijar versión por digest**: hubo incidentes de cadena de suministro con acciones de Trivy [E, verificar] |
| Secretos | gitleaks | MIT [E] | `docker run --rm -v "$(pwd -W):/repo" zricethezav/gitleaks:latest detect -s /repo` | Hook pre-commit en CI |
| Python SAST | ruff reglas `S` (bandit) | MIT [V configurado] | ya en `compose.yaml` | Bandit aparte no aporta |
| PII en fixtures/logs | `tools/privacidad-check.mjs` propio + Presidio | MIT [E] | `docker run -p 5002:3000 mcr.microsoft.com/presidio-analyzer` | Presidio con reconocedor regex propio para cédula (6-10 dígitos), NUIP y MRZ; útil sobre logs del servidor. detect-secrets (Apache-2.0) redundante con gitleaks |
| Modelos ONNX | onnxruntime-node | MIT [E] | `npm i -D onnxruntime-node` | Golden tests en Vitest: misma entrada -> salida con tolerancia; mismo resultado que onnxruntime-web (diferencial) |
| Distorsiones | augraphy (documentos, MIT) [E]; kornia (Apache-2.0); torchvision v2 (BSD) | — | en Docker | **albumentations**: su sucesor AlbumentationsX cambió a AGPL/comercial en 2025 [E, verificar]; imgaug archivado [E]. Para JS: distorsiones propias con canvas/OpenCV.js en `fixture-sintetico` |
| Validación de modelos | Deepchecks (AGPL [E]), Giskard (Apache-2.0, enfocado en LLM desde v3 [E]) | — | — | No adoptar; basta un runner propio de métricas en `evals/` |

### Receta: cámara simulada en Playwright [V parcial]

1. Generar el vídeo sintético con el generador de `fixture-sintetico` y convertirlo: `docker run --rm -v "$(pwd -W):/w" -w /w jrottenberg/ffmpeg -loop 1 -i cedula.png -t 5 -r 15 -pix_fmt yuv420p e2e/videos/cedula.y4m` [E] (Y4M 4:2:0; MJPEG también válido; el archivo se repite en bucle).
2. Proyecto Playwright aparte: `launchOptions.args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=e2e/videos/cedula.y4m']` (ya están los dos primeros [V]).
3. Para WebKit/Firefox o para variar imágenes por prueba: `page.addInitScript` que reemplace `navigator.mediaDevices.getUserMedia` por `canvas.captureStream()` dibujando la imagen sintética.
4. Asertar con espera por condición (`expect.poll` / `waitForFunction`), nunca `waitForTimeout` (skill `condition-based-waiting`).

### Pruebas metamórficas de visión [E]

Relaciones obligatorias sobre imágenes sintéticas: rotación ±3°, perspectiva leve, blur gaussiano sigma <= 1, glare fuera de la zona del código, brillo ±20 %, JPEG calidad 70 -> **la salida decodificada no cambia**; y en sentido contrario, distorsión fuerte -> el score de calidad baja y el frame se rechaza (nunca un número distinto). Implementables en Vitest con canvas/OpenCV.js y onnxruntime-node.

## C. Matriz obligatoria por componente

| Componente | Pruebas obligatorias | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| Parsers (`packages/parsers`) | unitarias con literales, propiedades (round-trip generador<->parser, checksums ICAO), fuzz de bytes, mutación, casos de "errores pasados" | Vitest, fast-check, Stryker | `npx vitest run packages/parsers`; `npx stryker run` | cobertura ramas >= 95 %; mutation score >= 85 % (break 80); fast-check numRuns >= 1000; 0 excepciones no tipadas en fuzz |
| Captura web (`packages/capture`, `apps/pwa`) | unitarias de calidad (blur/glare), browser mode de Workers/WASM, E2E con vídeo y4m, a11y, visual, Lighthouse | Vitest browser, Playwright, axe, LHCI | `npx vitest --browser`; `npx playwright test`; `npx @lhci/cli autorun` | E2E verde en Chromium + Pixel 7; 0 violaciones axe serious/critical; LH performance >= 0,9; tiempo a resultado válido p95 <= 3 s sobre vídeo sintético |
| OCR cliente (`packages/ocr`) | golden dataset sintético, metamórficas, diferencial web vs node, latencia | Vitest + onnxruntime-node, `eval-campo` | `npm run eval:quick` | CER por campo <= 2 %; sin regresión vs `baseline.json`; p95 por recorte documentado |
| Antifraude (`packages/fraud`, modelos) | métricas en dataset de evaluación, metamórficas, golden de salidas, licencia del modelo | runner `evals/`, onnxruntime-node | `npm run eval` | document liveness AUC >= 0,95 (DLC-2021); FAR/FRR de face match reportados; `models/manifest.json` completo |
| API servidor (`server/`) | pytest + Hypothesis, contrato Schemathesis, SAST ruff S + Semgrep, DAST ZAP, carga | Docker | `docker compose -f server/compose.yaml run --rm pruebas`; Schemathesis; ZAP; k6 | 0 fallos Schemathesis `--checks all`; 0 alertas ZAP High; p95 < 3 s a la carga objetivo; mutmut >= 70 % en validadores |
| App móvil (`apps/mobile`) | E2E nativo+WebView, permisos de cámara, captura con virtual scene, smoke en dispositivo real | Appium + WebdriverIO | `npx wdio run wdio.android.conf.ts` | flujo de captura verde en emulador Android; checklist manual iOS en dispositivo real por release |
| Infraestructura / repo | secretos, dependencias, imágenes, licencias, privacidad | gitleaks, osv-scanner, npm audit, Trivy, `licencia-check`, `privacidad-check` | ver sección B | 0 secretos; 0 vulnerabilidades High/Critical sin excepción documentada; 0 licencias prohibidas |

## Impacto en la spec

- Toda spec (Spec Kit y OpenSpec) debe incluir una sección **"Pruebas"** que, por cada requisito, nombre: tipo de prueba, herramienta, comando y umbral de la matriz C. `spec-writer` la rellena; `verificador` rechaza si falta o si el comando no se ejecutó.
- Hook `SubagentStop`: exigir además mutation score de Stryker en archivos tocados de `packages/parsers` (modo `--incremental`).

## Decisión recomendada

Adoptar la matriz C como estándar; crear la skill de proyecto `estrategia-pruebas`; instalar solo lo que falta (browser mode de Vitest, onnxruntime-node, imágenes Docker de seguridad); segunda pasada del `investigador` para convertir en [V] las filas [E] antes de añadir cualquier dependencia nueva.
