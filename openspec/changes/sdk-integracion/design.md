# Design: sdk-integracion

## Contexto

El lector existe como PWA (`apps/pwa`, en Vercel) y como API (`server/`, Dokploy; contrato en `api-validaciones-contrato`, rutas `/v1/validations` en inglés). El usuario pide reutilizarlo en varios aplicativos y frameworks sin que el integrador implemente nada del lector. Las siete decisiones del orquestador (2026-10-08) están en `proposal.md`; aquí se fija cómo.

Nota de nombres: el encargo dice `POST /v1/validaciones`; el contrato existente usa `POST /v1/validations` (AV-01). Esta spec usa la ruta existente; no se crea un alias.

## Decisiones

1. **Capas.** `packages/parsers` y `packages/capture` (motor, Worker lector, WASM) son el núcleo. `packages/web` solo añade el Custom Element, la carga diferida y `leerDocumento` (que reutiliza `leerDocumento` de `packages/capture/src/lectura/leer.ts`). La PWA en modo sesión y el componente comparten el mismo motor; no hay segunda implementación.
2. **Custom Element sin librería.** Clase nativa `HTMLElement`, Shadow DOM abierto, estilos con `adoptedStyleSheets` y `::part()` (`iniciar`, `estado`, `video`, `cancelar`) para personalizar. Sin Lit para cumplir 60 KB y cero dependencias (SDK-01, SDK-04).
3. **Tipos para frameworks.** `packages/web` exporta `HTMLElementTagNameMap["lector-cedula"]`, `JSX.IntrinsicElements` (React 19 y Next) y un `CUSTOM_ELEMENTS_SCHEMA` documentado para Angular (SDK-12).
4. **Next.** Componente cliente con `"use client"` que hace `import("@lector-cedula/web")` en `useEffect`; nunca se evalúa en el servidor (SDK-12).
5. **Motor servido por el microservicio.** Los recursos con hash se copian en la imagen del servidor bajo `/sdk/v1/` y los sirve FastAPI con `StaticFiles` y cabeceras inmutables (SDK-05). La ruta usa la versión mayor; versiones menores conviven por hash.
6. **Caché offline propia del componente** (Cache Storage, no service worker), porque el componente vive en el origen del integrador y no puede registrar un service worker allí sin su permiso (SDK-06).
7. **Página alojada `/v/{token}`.** La compilación de `apps/pwa` en modo sesión (`VITE_MODO=sesion`) se copia en la imagen del servidor y se sirve en `/v/`. El servidor valida el token antes de entregar el HTML (pantalla `sesion-invalida` renderizada en el mismo HTML con un parámetro de estado). Así hay un único servidor (decisión 4) y Vercel sigue sirviendo la PWA pública independiente.
8. **Tokens.** `hosted_url` usa un token HMAC distinto del de subida (propósito `alojada` frente a `subida` en el mensaje firmado) con la misma expiración. La página obtiene la `upload.url` intercambiando el token alojado en `POST /v/{token}/inicio` (una vez), y no la expone en la URL.
9. **Retornos.** Lista exacta por clave, sin prefijos ni comodines, para evitar redirect abierto (T4). Solo `validation_id` y `estado` viajan en la URL.
10. **Configuración por clave.** `CLAVES_API_JSON` pasa de `{ "<hash>": "<modo>" }` (si así está) a objetos `{ hash, modo, origenes, retornos, secreto_webhook }`, con migración que acepta la forma anterior (sin orígenes ni retornos). Validación al arrancar (SDK-16).
11. **Paquete servidor.** Solo `fetch`, `crypto.subtle`, `TextEncoder`; comparación en tiempo constante propia sobre `Uint8Array` del mismo largo. Adaptadores en subrutas (`exports`) para que nadie cargue código de otro framework; Express y Fastify reciben los tipos como `peerDependencies` opcionales solo de tipos (SDK-18 a SDK-21).
12. **Clientes generados.** `openapitools/openapi-generator-cli` por digest en Docker, salida en `clientes/` ignorada por git; compilación con imágenes oficiales (`node`, `gradle`, `swift`, `python`) por digest (SDK-23).
13. **Confianza.** El `detail` del evento lleva `confiable: false` como recordatorio explícito. El servidor ignora todo lo que no sea imagen (SDK-17) y re-lee con su motor (`motor-real-servidor`). Modelo de amenazas en `docs/sdk/modelo-amenazas.md` (SDK-22).
14. **Publicación.** Workflow `publicar-sdk.yml` disparado por tag `sdk-v*`, entorno `npm-publicacion` con revisores obligatorios; el token lo configura el humano. Ninguna tarea de agente publica (SDK-24).

## Riesgos

- 60 KB gzip incluye UI, máquina de estados, cargador y textos en dos idiomas; si no cabe, se separan los textos `en` en un chunk diferido (no se sube el presupuesto sin decisión humana).
- Cache Storage de terceros: Safari puede purgarla tras 7 días sin uso; la lectura vuelve a descargar el motor (aceptado).
- WebView de Android sin permisos de cámara configurados por el integrador: documentado en `nativo.md`; Custom Tabs es la opción recomendada.
- Dependencias con la API: `api-validaciones-contrato` y `motor-real-servidor` siguen en curso; las tareas del servidor de este cambio dependen de que estén fusionadas.
- Los frameworks de ejemplo amplían mucho `node_modules`; se instalan como workspaces separados solo para E2E.

## Pruebas

Según el principio II y las filas "Captura web", "API servidor" y "Repositorio e infraestructura" de la matriz de `.claude/skills/estrategia-pruebas/SKILL.md`. Comandos:

- `U` = `npx vitest run packages/web packages/servidor tools` (unitarias, propiedades, análisis estático de archivos)
- `B` = `npm run test:browser -- packages/web` (Vitest browser mode, Chromium: Worker, WASM, Cache Storage)
- `E(x)` = `npx playwright test e2e/sdk/<x>.spec.ts` (proyectos `sdk-chromium` y `sdk-pixel7`, cámara simulada con los `.y4m` de `pwa-lectura-offline`)
- `C` = `docker compose -f server/compose.yaml up -d --wait api-pruebas && npx vitest run packages/servidor/test/contrato` (contrato del paquete contra la API real)
- `S` = `docker compose -f server/compose.yaml run --rm pruebas` (pytest + Hypothesis del servidor)
- `SC` = Schemathesis `--checks all` en Docker contra `http://host.docker.internal:8000/openapi.json`
- `Z` = OWASP ZAP API scan en Docker contra `api-pruebas`
- `T` = `npm run check:tamano-sdk`
- `G` = `npm run clientes:generar`
- `M` = `npm run test:mutacion` (añade `packages/servidor/src/**/*.ts` y `packages/web/src/{atributos,eventos,cargador}.ts` a `mutate`)
- `LH` = `npx @lhci/cli autorun --config=examples/html/lighthouserc.json`
- `L` = `npm run check:licencias`; `P` = `npm run check:privacidad`; `V` = `npm run check:versiones`

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| SDK-01 | Unitaria (registro idempotente, Shadow DOM) | Vitest browser | `B` | 3/3 escenarios verdes |
| SDK-01 | Análisis estático del bundle | Vitest | `U` | 0 frameworks en bundle y `dependencies` |
| SDK-02 | Unitaria por atributo | Vitest browser | `B` | 5/5 escenarios |
| SDK-02 | Propiedad (valores arbitrarios de atributo nunca lanzan; inválido siempre da `error`) | fast-check | `B` | numRuns >= 1000, 0 excepciones |
| SDK-02 | Mutación de `atributos.ts` | Stryker | `M` | >= 85 % (break 80) |
| SDK-03 | E2E con cámara simulada | Playwright | `E(componente)` | 4/4 escenarios en Chromium y Pixel 7 |
| SDK-03 | Mutación de `eventos.ts` | Stryker | `M` | >= 85 % |
| SDK-04 | Presupuesto de tamaño (con fixture que falla) | script + Vitest | `T`, `U` | entrada <= 61 440 B gzip |
| SDK-04 | E2E de red (sin peticiones al montar, origen único) | Playwright | `E(carga)` | 0 peticiones fuera de `<servidor>/sdk/v1/` |
| SDK-04 | Rendimiento web | Lighthouse CI | `LH` | TBT <= 200 ms, transferencia inicial JS <= 61 440 B |
| SDK-05 | Unitaria de cabeceras y CORS | pytest | `S` | 2/2 escenarios |
| SDK-05 | Contrato | Schemathesis | `SC` | 0 fallos |
| SDK-06 | E2E offline | Playwright | `E(offline)` | 3/3 escenarios |
| SDK-07 | E2E de precarga | Playwright | `E(carga)` | 0 peticiones del motor tras precarga |
| SDK-08 | Diferencial componente frente a headless | Playwright + Vitest browser | `E(headless)`, `B` | igualdad estricta en 100 % de fixtures |
| SDK-08 | Metamórfica (rotación ±3°, brillo ±20 %, JPEG 70) | Vitest browser | `B` | misma salida; nunca un NUIP distinto |
| SDK-09 | Rendimiento (20 lecturas) | Playwright, CPU 4x | `E(rendimiento)` | caliente p95 <= 1500 ms; frío p95 <= 4500 ms |
| SDK-10 | Accesibilidad por estado | @axe-core/playwright | `E(accesibilidad)` | 0 serious/critical |
| SDK-10 | Regresión visual (claro, oscuro) | `toHaveScreenshot` en imagen Playwright | `E(visual)` | diff 0 píxeles fuera de `maxDiffPixelRatio` 0,01 |
| SDK-11 | E2E de privacidad (almacenamiento, red, consola) | Playwright | `E(privacidad)` | 0 apariciones de `9999123456` |
| SDK-11 | Control de privacidad | `privacidad-check` | `P` | 0 hallazgos |
| SDK-12 | E2E por framework | Playwright | `E(ejemplos)` | 5/5 frameworks verdes en Chromium; html y react en Pixel 7 |
| SDK-12 | Tipos | tsc, ng build, next build | `npm run build -w examples/*` | código 0 |
| SDK-13 | Unitaria y propiedad (token alojado distinto, firma y expiración) | pytest + Hypothesis | `S` | 4/4 escenarios; max_examples 1000 |
| SDK-13 | Contrato | Schemathesis, Spectral | `SC` | 0 fallos; lint 0 resultados |
| SDK-14 | E2E del flujo alojado | Playwright | `E(alojado)` | 5/5 escenarios |
| SDK-14 | DAST de `/v/` | OWASP ZAP | `Z` | 0 alertas High |
| SDK-15 | E2E del componente con sesión | Playwright + `api-pruebas` | `E(sesion)` | 2/2 escenarios |
| SDK-16 | Unitaria de configuración y CORS | pytest | `S` | 3/3 escenarios |
| SDK-16 | Propiedad (orígenes arbitrarios no listados nunca reciben ACAO) | Hypothesis | `S` | max_examples 1000, 0 fugas |
| SDK-17 | Unitaria | pytest | `S` | 1/1 escenario; validación sigue `pending` |
| SDK-18 | Unitaria | Vitest | `U` | 2/2 escenarios |
| SDK-19 | Contrato contra la API en Docker | Vitest + `api-pruebas` | `C` | 3/3 escenarios |
| SDK-19 | Mutación | Stryker | `M` | >= 85 % |
| SDK-20 | Unitaria con vectores de AV-26 | Vitest | `U` | 5/5 escenarios |
| SDK-20 | Propiedad (round-trip, alteración, nunca lanza) | fast-check | `U` | numRuns >= 1000, proporción útil > 50 % |
| SDK-20 | Diferencial con la firma del servidor Python | Vitest + `api-pruebas` | `C` | 100 % de webhooks reales verifican |
| SDK-20 | Mutación | Stryker | `M` | >= 85 % |
| SDK-21 | Integración por adaptador (servidor sandbox entrega el webhook) | Vitest + Docker | `C` | 4 adaptadores x 3 escenarios |
| SDK-22 | Análisis estático de docs y bundles | Vitest | `U` | 0 claves, T1 a T7 presentes |
| SDK-23 | Generación y compilación (más fixture roto) | openapi-generator en Docker | `G` | código 0; fixture roto distinto de 0 |
| SDK-24 | Análisis estático de versiones y workflow | Vitest | `V`, `U` | código 0; fixture sin CHANGELOG da 1 |
| SDK-25 | Sincronía de snippets | Vitest | `U` | 100 % de bloques idénticos |
| SDK-26 | Licencias y privacidad | `licencia-check`, `privacidad-check` | `L`, `P` | 0 infracciones |
| Todos | Secretos y vulnerabilidades | gitleaks, osv-scanner (Docker) | `npm run check` + escáneres | 0 secretos; 0 High/Critical |

Evals: este cambio no toca parsers; `npm run eval:quick` MUST seguir sin regresión.

## Decisiones del orquestador por delegación del usuario (2026-10-08)

- Ruta: se usa la existente `/v1/validations` (AV-01), sin alias.
- La página alojada `/v/{token}` la sirve el microservicio (un solo servidor); la PWA pública sigue aparte.
- Caché del componente en Cache Storage propio, sin service worker en el origen del integrador.
- Los añadidos al contrato van como SDK-xx; se fusionan en las specs principales al archivar.
- Nombres: scope npm `@lector-cedula` y Custom Element `<lector-cedula>`; si el scope no está libre al publicar, se usa `@jorgeluissanchez/lector-cedula-*` sin cambiar el elemento.
- Publicación npm y entorno protegido: tarea humana, fuera del alcance de los agentes.
- `CLAVES_API_JSON`: se acepta la migración compatible (el formato anterior sigue válido).
- Presupuesto de 60 KB gzip: solo textos en español; otros idiomas se cargan bajo demanda.
- Apps nativas: basta la guía `nativo.md`; la prueba de humo con Appium queda para la fase de SDK nativos.
- Clientes generados: solo se compilan en CI; su publicación en Maven, SwiftPM o PyPI queda para después.
- Meta de rendimiento en frío (OFF-15 + 3 s en Fast 4G): provisional hasta medir en dispositivos reales.
