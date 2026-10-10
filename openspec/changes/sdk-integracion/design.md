# Design: sdk-integracion

## Contexto

El lector existe como PWA (`apps/pwa`, en Vercel) y como API (`server/`, Dokploy; contrato en `api-validaciones-contrato`, rutas `/v1/validations` en inglés). El usuario pide reutilizarlo en varios aplicativos y frameworks sin que el integrador implemente nada del lector. Las siete decisiones del orquestador (2026-10-08) están en `proposal.md`; aquí se fija cómo.

Nota de nombres: el encargo dice `POST /v1/validaciones`; el contrato existente usa `POST /v1/validations` (AV-01). Esta spec usa la ruta existente; no se crea un alias.

## Decisiones

1. **Capas (revisada 2026-10-08).** `packages/parsers` y `packages/capture` son el motor. `packages/web` es el núcleo headless (`crearLector`, máquina de estados con dependencias inyectables, carga diferida, caché, `leerDocumento`); `packages/react|angular|vue` son adaptadores finos sobre él; `packages/elementos` es el Custom Element opcional sobre el núcleo; la PWA consume el núcleo vía `@lector-cedula/react`. `leerDocumento` (que reutiliza `leerDocumento` de `packages/capture/src/lectura/leer.ts`). La PWA en modo sesión y el componente comparten el mismo motor; no hay segunda implementación.
2. **Custom Element opcional sin librería (`@lector-cedula/elementos`).** Clase nativa `HTMLElement`, Shadow DOM abierto, estilos con `adoptedStyleSheets` y `::part()` (`iniciar`, `estado`, `video`, `guia`, `cancelar`, `reintentar`) y variables CSS `--lector-*` (SDK-36). Sin Lit para cumplir 60 KB y cero dependencias (SDK-01, SDK-04).
3. **Tipos para frameworks.** `packages/web` exporta `OpcionesLector`, `EstadoLector`, `ControladorLector`; los adaptadores los reexportan. `packages/elementos` exporta `HTMLElementTagNameMap["lector-cedula"]` para quien use el componente.
4. **Next.** `@lector-cedula/react` lleva `"use client"`; el controlador se crea en `useEffect` y `getServerSnapshot` devuelve el estado inicial, de modo que el núcleo (con `sideEffects: false` y sin acceso a globals al importar) nunca toca APIs del navegador en el servidor (SDK-29, SDK-31).
5. **Espejo opcional del motor en el microservicio (subordinada a la decisión B del usuario: los assets van en el paquete npm y el frontal no depende del servidor).** Los recursos con hash se copian en la imagen del servidor bajo `/sdk/v1/` y los sirve FastAPI con `StaticFiles` y cabeceras inmutables (SDK-05). La ruta usa la versión mayor; versiones menores conviven por hash.
6. **Caché offline propia del núcleo** (Cache Storage, no service worker), porque el componente vive en el origen del integrador y no puede registrar un service worker allí sin su permiso (SDK-06).
7. **Página alojada `/v/{token}`.** La compilación de `apps/pwa` en modo sesión (`VITE_MODO=sesion`) se copia en la imagen del servidor y se sirve en `/v/`. El servidor valida el token antes de entregar el HTML (pantalla `sesion-invalida` renderizada en el mismo HTML con un parámetro de estado). Así hay un único servidor (decisión 4) y Vercel sigue sirviendo la PWA pública independiente.
8. **Tokens.** `hosted_url` usa un token HMAC distinto del de subida (propósito `alojada` frente a `subida` en el mensaje firmado) con la misma expiración. La página obtiene la `upload.url` intercambiando el token alojado en `POST /v/{token}/inicio` (una vez), y no la expone en la URL.
9. **Retornos.** Lista exacta por clave, sin prefijos ni comodines, para evitar redirect abierto (T4). Solo `validation_id` y `estado` viajan en la URL.
10. **Configuración por clave.** `CLAVES_API_JSON` pasa de `{ "<hash>": "<modo>" }` (si así está) a objetos `{ hash, modo, origenes, retornos, secreto_webhook }`, con migración que acepta la forma anterior (sin orígenes ni retornos). Validación al arrancar (SDK-16).
11. **Paquete servidor.** Solo `fetch`, `crypto.subtle`, `TextEncoder`; comparación en tiempo constante propia sobre `Uint8Array` del mismo largo. Adaptadores en subrutas (`exports`) para que nadie cargue código de otro framework; Express y Fastify reciben los tipos como `peerDependencies` opcionales solo de tipos (SDK-18 a SDK-21).
12. **Clientes generados.** `openapitools/openapi-generator-cli` por digest en Docker, salida en `clientes/` ignorada por git; compilación con imágenes oficiales (`node`, `gradle`, `swift`, `python`) por digest (SDK-23).
13. **Confianza.** El `detail` del evento lleva `confiable: false` como recordatorio explícito. El servidor ignora todo lo que no sea imagen (SDK-17) y re-lee con su motor (`motor-real-servidor`). Modelo de amenazas en `docs/sdk/modelo-amenazas.md` (SDK-22).
14. **Publicación.** Workflow `publicar-sdk.yml` disparado por tag `sdk-v*`, entorno `npm-publicacion` con revisores obligatorios; el token lo configura el humano. Ninguna tarea de agente publica (SDK-24).

## Riesgos

- Núcleo 30 KB: si no cabe, el cargador del Worker lector y los textos de error `en` pasan a chunks diferidos; no se sube el presupuesto sin decisión humana.
- Migrar la PWA al núcleo puede romper E2E sutiles (temporización de captura guiada); la tarea 3.4 exige los E2E previos en verde sin tocar umbrales.
- 60 KB gzip del componente opcional incluye UI, máquina de estados, cargador y textos en dos idiomas; si no cabe, se separan los textos `en` en un chunk diferido (no se sube el presupuesto sin decisión humana).
- Cache Storage de terceros: Safari puede purgarla tras 7 días sin uso; la lectura vuelve a descargar el motor (aceptado).
- WebView de Android sin permisos de cámara configurados por el integrador: documentado en `nativo.md`; Custom Tabs es la opción recomendada.
- Dependencias con la API: `api-validaciones-contrato` y `motor-real-servidor` siguen en curso; las tareas del servidor de este cambio dependen de que estén fusionadas.
- Los frameworks de ejemplo amplían mucho `node_modules`; se instalan como workspaces separados solo para E2E.

## Pruebas

Según el principio II y las filas "Captura web", "API servidor" y "Repositorio e infraestructura" de la matriz de `.claude/skills/estrategia-pruebas/SKILL.md`. Comandos:

- `U` = `npx vitest run packages/web packages/react packages/vue packages/elementos packages/servidor apps/pwa/test tools` (unitarias, propiedades, análisis estático de archivos)
- `A` = `npx ng test --project lector-cedula-angular --watch=false` (Angular TestBed, sin zone.js)
- `B` = `npm run test:browser -- packages/web packages/elementos` (Vitest browser mode, Chromium: Worker, WASM, Cache Storage)
- `E(x)` = `npx playwright test e2e/sdk/<x>.spec.ts` (proyectos `sdk-chromium` y `sdk-pixel7`, cámara simulada con los `.y4m` de `pwa-lectura-offline`)
- `C` = `docker compose -f server/compose.yaml up -d --build --wait api-pruebas && LECTOR_CONTRATO_OBLIGATORIO=1 npx vitest run packages/servidor/test/contrato` (contrato del paquete contra la API real; sin `LECTOR_CONTRATO_OBLIGATORIO=1` la suite se omite si la API no responde, para que `npm test` no dependa de Docker; con ella, falla)
- `S` = `docker compose -f server/compose.yaml run --rm pruebas` (pytest + Hypothesis del servidor)
- `SC` = Schemathesis `--checks all` en Docker contra `http://host.docker.internal:8000/openapi.json`
- `Z` = OWASP ZAP API scan en Docker contra `api-pruebas`
- `T` = `npm run check:tamano-sdk` (núcleo <= 30 720 B, cada adaptador <= 3 072 B, componente <= 61 440 B; fixtures de 30 721, 3 073 y 61 441 B que fallan; informa el tamaño de `assets/`)
- `G` = `npm run clientes:generar`
- `M` = `npm run test:mutacion` (añade `packages/servidor/src/**/*.ts` y `packages/web/src/{maquina,estado,controlador,cargador,integridad}.ts`, `packages/react/src/**/*.ts`, `packages/vue/src/**/*.ts` y `packages/elementos/src/{atributos,eventos}.ts` a `mutate`; Angular se cubre con `A`)
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
| SDK-04 | E2E de red (sin peticiones al montar, solo `REC`) | Playwright | `E(carga)` | 0 peticiones fuera del origen del integrador |
| SDK-04 | Análisis de `npm pack` (assets solo en `@lector-cedula/web`) | Vitest | `U` | 1/1 escenario |
| SDK-04 | Rendimiento web | Lighthouse CI | `LH` | TBT <= 200 ms, transferencia inicial JS <= 61 440 B |
| SDK-05 | Unitaria de cabeceras y CORS | pytest | `S` | 2/2 escenarios |
| SDK-05 | Contrato | Schemathesis | `SC` | 0 fallos |
| SDK-06 | E2E offline (incluye recarga con `precacheLector`) | Playwright | `E(offline)` | 4/4 escenarios |
| SDK-07 | E2E de precarga | Playwright | `E(carga)` | 0 peticiones del motor tras precarga |
| SDK-08 | Diferencial componente frente a headless | Playwright + Vitest browser | `E(headless)`, `B` | igualdad estricta en 100 % de fixtures |
| SDK-08 | Metamórfica (rotación ±3°, brillo ±20 %, JPEG 70) | Vitest browser | `B` | misma salida; nunca un NUIP distinto |
| SDK-09 | Rendimiento (20 lecturas) | Playwright, CPU 4x | `E(rendimiento)` | caliente p95 <= 1500 ms; frío p95 <= 4500 ms |
| SDK-10 | Accesibilidad por estado | @axe-core/playwright | `E(accesibilidad)` | 0 serious/critical |
| SDK-10 | Regresión visual (claro, oscuro) | `toHaveScreenshot` en imagen Playwright | `E(visual)` | diff 0 píxeles fuera de `maxDiffPixelRatio` 0,01 |
| SDK-11 | E2E de privacidad (almacenamiento, red, consola) | Playwright | `E(privacidad)` | 0 apariciones de `9999123456` |
| SDK-11 | Control de privacidad | `privacidad-check` | `P` | 0 hallazgos |
| SDK-12 | E2E por framework | Playwright | `E(ejemplos)` | 6/6 ejemplos verdes en Chromium; vanilla y react en Pixel 7 |
| SDK-12 | E2E de UI personalizada distinta | Playwright | `E(ejemplos)` | 4 tuplas de estilo distintas dos a dos; 0 elementos `lector-cedula` y 0 hojas de `@lector-cedula/*` en headless |
| SDK-12 | E2E SSR de Next | Playwright + `next build`/`next start` | `E(ejemplos)` | 0 mensajes `Hydration` o `* is not defined` |
| SDK-12 | Tipos | tsc, ng build, vue-tsc, next build | `npm run build -w examples/*` | código 0 |
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
| SDK-27 | Unitaria de la máquina de estados con `DEPS` | Vitest | `U` | 4/4 escenarios |
| SDK-27 | Propiedad (secuencias arbitrarias de eventos solo producen `TRANSICIONES`, nunca lanza) | fast-check | `U` | numRuns >= 1000, 0 transiciones fuera de lista |
| SDK-27 | Mutación de `maquina.ts` y `controlador.ts` | Stryker | `M` | >= 85 % (break 80) |
| SDK-28 | Unitaria del estado | Vitest | `U` | 5/5 escenarios |
| SDK-28 | Propiedad (guía normalizada en [0,1] e igual a guía/dimensiones del vídeo) | fast-check | `U` | numRuns >= 1000 |
| SDK-28 | Mutación de `estado.ts` | Stryker | `M` | >= 85 % |
| SDK-29 | Núcleo sin DOM ni CSS (MutationObserver, styleSheets) | Vitest browser | `B` | 0 mutaciones fuera de `video`; 0 hojas añadidas |
| SDK-29 | Importación en Node sin DOM | Vitest (proceso hijo, `{ timeout: 60_000 }`) | `U` | código 0 |
| SDK-29 | Presupuesto de tamaño | script + Vitest | `T`, `U` | <= 30 720 B gzip |
| SDK-30 | Unitaria de ciclo de vida | Vitest | `U` | 3/3 escenarios |
| SDK-30 | E2E de liberación con cámara simulada | Playwright | `E(nucleo)` | pistas `ended` tras `cancelar` y `destruir` en Chromium y Pixel 7 |
| SDK-31 | Unitaria con React Testing Library y SSR (`renderToString`) | Vitest + @testing-library/react | `U` | 3/3 escenarios |
| SDK-31 | Mutación | Stryker | `M` | >= 85 % |
| SDK-32 | Unitaria con TestBed zoneless y `PLATFORM_ID` servidor | Angular TestBed | `A` | 3/3 escenarios |
| SDK-33 | Unitaria con Vue Test Utils y SSR (`vue/server-renderer`) | Vitest + @vue/test-utils | `U` | 3/3 escenarios |
| SDK-33 | Mutación | Stryker | `M` | >= 85 % |
| SDK-34 | Presupuesto y análisis de manifiestos y `dist/` | script + Vitest | `T`, `U` | <= 3 072 B por adaptador; `dependencies` vacías |
| SDK-34 | Licencias de las herramientas de prueba | `licencia-check` | `L` | 0 infracciones |
| SDK-35 | Análisis estático de imports de `apps/pwa` | Vitest | `U` | 0 imports directos a `navegador/` o `autocaptura` |
| SDK-35 | Regresión E2E de la PWA | Playwright | `npm run test:e2e` | E2E previos verdes, umbrales intactos |
| SDK-36 | `::part`, variables CSS e imports | Vitest browser | `B`, `U` | 3/3 escenarios |
| SDK-36 | Regresión visual (por defecto y personalizada) | `toHaveScreenshot` | `E(visual)` | `maxDiffPixelRatio` 0,01 |
| SDK-37 | E2E offline sin servidor en cada ejemplo | Playwright | `E(sin-servidor)` | 6/6 ejemplos; 0 peticiones a otros orígenes; 0 `POST` |
| SDK-37 | Privacidad de red | Playwright | `E(sin-servidor)` | 0 apariciones de `9999123456` en peticiones |
| SDK-38 | Unitaria de `envio` con servidor falso (caído, 401, vencida, éxito) | Vitest | `U` | 3/3 escenarios + 4 códigos |
| SDK-38 | E2E con `api-pruebas` y con servidor detenido | Playwright | `E(sesion)` | 2/2 escenarios E2E |
| SDK-38 | Mutación de `envio.ts` | Stryker | `M` | >= 85 % |
| SDK-39 | Unitaria de integridad (hash correcto, alterado, ausente) | Vitest | `U` | 3/3 casos |
| SDK-39 | E2E de recurso alterado | Playwright | `E(offline)` | 1/1 escenario |
| SDK-39 | Coherencia del manifiesto tras compilar | Vitest | `U` | 100 % de archivos con hash correcto |
| SDK-39 | Mutación de `integridad.ts` | Stryker | `M` | >= 85 % |
| SDK-40 | Unitaria (aceptada en pruebas, rechazo al arrancar, destino no listado, despliegue sin la variable) | pytest, Vitest | `S`, `U` | 4/4 escenarios |
| SDK-40 | Integración (entrega real del sandbox a los 4 adaptadores y verificación diferencial) | Vitest + `api-pruebas` | `C` | 100 % de webhooks verifican |
| Todos | Secretos y vulnerabilidades | gitleaks, osv-scanner (Docker) | `npm run check` + escáneres | 0 secretos; 0 High/Critical |

Evals: este cambio no toca parsers; `npm run eval:quick` MUST seguir sin regresión.

### Pruebas del modelo backend propio (decisiones del usuario, 2026-10-09)

Comandos nuevos:

- `UB` = `npx vitest run packages/web/test/backend packages/react packages/vue` (unitarias y propiedades de SDK-45 a SDK-59 con `DEPS`, `fetch` falso y `ReadableStream` falso; reloj falso, nunca esperas fijas)
- `EB(x)` = `E2E_SIN_SERVIDORES=1 npx playwright test e2e/backend/<x>.spec.ts --project=backend-chromium --project=backend-pixel7 --workers=1` contra los ejemplos de MOT-13 (Express en 4195, Next en 4197 y Nest en 4198, backend real en proceso, cámara simulada con `amarilla-1080p.y4m`; sin `E2E_SIN_SERVIDORES` los levanta `playwright.config.ts`); `x` en `modos` y `ejemplos-backend`. `EB(backend)` y `EB(modo-back-red)` son `EB(modos)`: la secuencia de SDK-46 y la ausencia de recursos `pesado` de SDK-56 están en `e2e/backend/modos.spec.ts` (B.7, 2026-10-10: la carpeta pasó de `e2e/sdk/` a `e2e/backend/` porque los proyectos `sdk-*` sirven `examples/vanilla` con otra cámara).
- `TB` = `npm run check:tamano-sdk -- --modo back` (grafo del modo back <= `PRESUPUESTO_BACK`, fixture de `PRESUPUESTO_BACK + 1` que falla)

`PRESUPUESTO_BACK`: meta 300 KiB gzip; la tarea B.6 mide el valor real con el ejemplo y lo fija aquí (valor medido + 10 %, nunca por encima de 300 KiB sin decisión humana).

**`PRESUPUESTO_BACK` = 23 732 B gzip** (B.6, 2026-10-09): medido 21 574 B (JS del núcleo, dependencias por omisión y cliente del protocolo empaquetados con esbuild 14 011 B; Worker de calidad 6 894 B; `manifest.json` 669 B) + 10 %. Constante en `packages/web/scripts/tamano-back.mjs`, que mide con `--fixture <archivo>` y sale con 1 por encima; `TB` delega en ese script.

**SDK-56 en E2E** (B.7, decisión del orquestador 2026-10-10: solo los chunks del SDK, sin React ni código de la app): los ejemplos con backend propio empaquetan todo el SDK en un único chunk `assets/sdk-*.js` y React en `assets/react-*.js` (`examples/vite-chunks-sdk.mjs`). `EB(modos)`, en los casos sin front activo, suma el gzip nivel 9 de TODO lo que la página pidió del SDK, sin excluir nada: ese chunk y todo lo pedido bajo `/lector-cedula/`, que debe ser exactamente `calidad.js` y `manifest.json`; medido 22 998 B (chunk 15 166, Worker 7 153, manifiesto 679) <= `PRESUPUESTO_BACK`. **Avisos legales** (decisión del orquestador por delegación del usuario, 2026-10-10): `THIRD_PARTY_LICENSES.txt` sigue publicado en el paquete, en `dist/assets` y en el manifiesto (SDK-26), ahora con `aviso: true`; el cargador no pide por red ninguna entrada `aviso` en ningún modo, y `TB` cuenta todo lo que pide la carga ligera (sin `pesado` ni `aviso`): 22 850 B.

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| SDK-18 | Análisis estático (grafo de `cliente.ts`) | Vitest | `U` | 0 importaciones del motor |
| SDK-28 | Unitaria (`confiable` solo tras `ok`) | Vitest | `UB` | 0 estados con `confiable: true` fuera de `resultado` verificado |
| SDK-45 | Unitaria (validación de `backend`, cabeceras) | Vitest | `UB` | 4/4 escenarios |
| SDK-45 | Propiedad (URL arbitrarias nunca lanzan; inválidas nunca hacen red) | fast-check | `UB` | numRuns >= 1000 |
| SDK-46 | Unitaria (secuencias de fase y etapa) | Vitest | `UB` | 4/4 escenarios, `toStrictEqual` sobre secuencias |
| SDK-46 | E2E con backend real | Playwright | `EB(modos)` | Chromium y Pixel 7 verdes |
| SDK-46, SDK-47, SDK-48 | Propiedad de la máquina con `verificando` | fast-check | `UB` | numRuns >= 1000; todo par de fases en `TRANSICIONES` |
| SDK-47 | Unitaria (tabla de motivos, tope) | Vitest | `UB` | 4/4 escenarios, 9 motivos |
| SDK-48 | Unitaria (stream falso, abort) | Vitest | `UB` | 7/7 escenarios |
| SDK-48 | Propiedad (fragmentación y bytes arbitrarios) | fast-check | `UB` | numRuns >= 1000 cada una, 0 excepciones |
| SDK-48 | Mutación de `protocolo.ts` y `verificacion.ts` | Stryker | `M` | >= 85 % (break 80) |
| SDK-49 | Unitaria y SSR en React, Vue y Angular | RTL, Vue Test Utils, TestBed | `UB`, `A` | 4/4 escenarios por adaptador |
| SDK-50 | Unitaria por adaptador | RTL, Vue Test Utils, TestBed | `UB`, `A` | 2/2 escenarios |
| SDK-50 | Presupuesto de adaptadores | script | `T` | <= 3 072 B cada uno |
| SDK-51 | E2E por ejemplo (Express, Nest, Next) | Playwright | `EB(ejemplos-backend)` | 3 ejemplos x 2 proyectos verdes; 0 peticiones fuera del origen |
| SDK-51 | Accesibilidad | @axe-core/playwright | `EB(ejemplos-backend)` | 0 serious/critical en 5 estados |
| SDK-52 | Regresión del modo opcional | Vitest | `U` | pruebas SDK-38/SDK-42 sin cambios |
| SDK-52 | Análisis estático de docs | Vitest | `U` (`tools/test/docs-sdk.test.mjs`) | orden de encabezados correcto |
| SDK-53 | Unitaria | Vitest | `UB` | 2/2 escenarios |
| SDK-54 | Unitaria (códigos de transporte, reloj falso) | Vitest | `UB` | 5/5 escenarios |
| SDK-54 | Privacidad (copias a cero en cada fallo) | Vitest | `UB`, `P` | 100 % de copias a cero; 0 hallazgos |
| SDK-55 | Unitaria | Vitest | `UB` | 3/3 escenarios |
| SDK-56 | Unitaria (sin `leyendo`, lector no invocado) | Vitest | `UB` | 1/1 |
| SDK-56 | E2E de red (sin recursos pesados) | Playwright | `EB(modos)` | 0 recursos `pesado`; bytes <= `PRESUPUESTO_BACK` |
| SDK-56 | Presupuesto con fixture que falla | script | `TB` | árbol real pasa; fixture sale con 1 |
| SDK-57 | Unitaria (tabla de 8 casos literal de `decidirFront` y 4 escenarios del núcleo) | Vitest | `UB` | 8/8 filas con `toStrictEqual` |
| SDK-57 | Propiedad (totalidad, `usarFront` si y solo si `potente`) | fast-check | `UB` | numRuns >= 1000, casos débiles y potentes > 10 % cada uno medidos con `fc.statistics` |
| SDK-57 | Mutación de `decidir-front.ts` | Stryker | `M` | >= 85 % |
| SDK-58 | Unitaria (cola en memoria, `en-espera`, `online`, vencimiento, front ligero) | Vitest | `UB` | 4/4 escenarios |
| SDK-58 | Privacidad (sin persistencia) | Vitest browser + Playwright | `B`, `EB(modos)` | 0 datos en IndexedDB, `localStorage`, Cache Storage |
| SDK-59 | Unitaria (Accept y JSON único) | Vitest | `UB` | 2/2 escenarios |
| SDK-60 | E2E de front, back, front-back estricta y front-back auto (potente y débil), streaming on/off | Playwright | `EB(modos)` | matriz completa verde en Chromium y Pixel 7 |

### Pruebas de la guía en un recuadro embebido (necesidad del usuario, 2026-10-10)

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| SDK-61 | Unitaria y propiedad de `calcularGuia` con orientación y margen; Worker con guía (amarilla, digital y pasaporte de pie sintéticos) | Vitest + fast-check | `npx vitest run packages/capture/test/lectura/sdk-61-guia-vertical.test.ts` | 8/8 escenarios |
| SDK-61, SDK-62 | Unitaria y propiedad de `guiaEnElemento`, `guiaEnVideo` y `regionVisible`; controlador con medidas y redimensionado | Vitest + fast-check | `npx vitest run packages/web/test/sdk-61-63-guia.test.ts` | 10/10 escenarios |
| SDK-62 | Adaptadores React, Vue y Angular | Vitest (jsdom) | `npx vitest run packages/react/test/sdk-62-react.test.ts packages/vue/test/sdk-62-vue.test.ts packages/angular/test/sdk-62-angular.test.ts` | 3/3 |
| SDK-62, SDK-63 | Navegador: medidas por omisión, ResizeObserver, sin tocar estilos, captura a la resolución de la pista | Vitest browser | `npm run test:browser -- packages/web/test-browser/sdk-62-63-recuadro.browser.test.ts` | 4/4 |
| SDK-64 | E2E del ejemplo de login (260x400 vertical y 320x200 horizontal, redimensionado), autorización del titular y accesibilidad | Playwright + axe | `npx playwright test --project=login-chromium --project=login-pixel7 --workers=1` | 6/6 en cada proyecto, 0 violaciones serias o críticas |
| SDK-64 | Privacidad del ejemplo: todas las peticiones al origen del preview; `localStorage`, `sessionStorage` e `indexedDB.databases()` vacíos al terminar cada lectura | Playwright | igual | 0 peticiones fuera de `http://localhost:4196`, almacenamiento vacío |
| SDK-64 | Escenas sintéticas declaradas | Vitest | `npx vitest run tools/test/videos-cedula.test.mjs` | verde |

### Pruebas de los tipos públicos de los campos (2026-10-10)

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| SDK-65 | Tipos (`expectTypeOf` y `@ts-expect-error`): tipos exactos, asignaciones inválidas y campos inexistentes | tsc (vía `tools/test/mot-15-tipos.test.mjs`) | `npx tsc -p packages/web/test/tipos --noEmit` | 0 errores |
| SDK-65 | Conformidad: salida real de `interpretarPdf417`/`interpretarMrz` con fixtures sintéticos (amarilla, TI, digital, CE, pasaporte; con y sin máscara) contra `validarEvento`, el esquema JSON (Ajv) y un oráculo literal del dominio | Vitest | `npx vitest run packages/web/test/sdk-65-campos.test.ts` | 3/3 escenarios |
| SDK-65 | Propiedad de la salida real (PDF417, digital, CE TD1 y pasaporte TD3 arbitrarios) | fast-check | igual | numRuns >= 300 por fuente, > 50 % de lecturas correctas por fuente |
| SDK-65, MOT-27 | Validador del protocolo | Vitest + fast-check | `npx vitest run packages/protocolo/test/mot-27-campos.test.ts` | ver MOT-27 en `motor-backend-embebido` |
| SDK-65 | Documentación | Vitest | `npx vitest run tools/test/docs-sdk.test.mjs` | verde |

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

## Decisiones del usuario, 2026-10-08

Prevalecen sobre la decisión 2 del orquestador (`proposal.md`) y sobre las decisiones 1 a 6 de este documento donde difieran.

### A. Frontal headless

1. **Núcleo headless `@lector-cedula/web`** sin UI ni estilos: `crearLector(opciones, deps?)` devuelve un controlador con máquina de estados (`inicio`, `permiso`, `activo`, `listo`, `leyendo`, `resultado`, `error`), `suscribir`/`obtenerEstado`, `iniciar(video)`, `cancelar`, `reintentar`, `destruir`. El estado expone fase, calidad `{score, motivo}`, guía en coordenadas del vídeo y normalizadas, contenido (`pdf417`, `mrz-td1`, `mrz-td3`), progreso, intento, resultado (`confiable: false`), error con código y envío. Reutiliza `packages/capture`; la PWA migra a consumirlo (SDK-27 a SDK-30, SDK-35).
2. **Adaptadores finos** sin UI, framework como `peerDependency`, <= 3 KB gzip: `@lector-cedula/react` (`useLectorCedula`, `"use client"`, SSR-safe, sirve para Next), `@lector-cedula/angular` (`injectLectorCedula` con signals, standalone, sin zone obligatorio), `@lector-cedula/vue` (`useLectorCedula` con refs) (SDK-31 a SDK-34).
3. **Web Component opcional** `@lector-cedula/elementos` sobre el núcleo, con `::part` y variables CSS; mantiene su presupuesto de 60 KB (SDK-01 a SDK-04, SDK-10, SDK-36).
4. **Presupuestos:** núcleo <= 30 720 B gzip de carga inicial; cada adaptador <= 3 072 B; componente <= 61 440 B. WASM, Worker, traineddata y DIVIPOL diferidos (ver B).
5. **Flujo alojado (`/v/{token}`) y React Native por WebView: sin cambios.**
6. **Pruebas:** unitarias del núcleo con dependencias inyectadas; React Testing Library, Angular TestBed y Vue Test Utils (tras `licencia-check`); E2E Playwright de ejemplos por framework con UI distinta; prueba de que el núcleo no inyecta CSS ni elementos; SSR de Next sin errores.

Arquitectura del núcleo:

- `maquina.ts`: función pura `transicion(estado, evento) -> estado`, con la tabla `TRANSICIONES` de la spec; es lo que miden la propiedad y Stryker.
- `controlador.ts`: conecta la máquina con `DependenciasLector` (cámara, cliente de calidad, cliente lector, reloj) y gestiona suscriptores; con `destruir` corta todo.
- `dependencias.ts`: implementación por omisión sobre `packages/capture` (`navegador/camara.ts`, `cliente-calidad.ts`, Worker lector, `flujo/autocaptura.ts`, `guia.ts`, pista de tipo). Solo se importa dinámicamente en `iniciar`, así la importación no toca globals (SSR) y no cuenta en el presupuesto inicial.
- Los adaptadores solo traducen `suscribir` a la reactividad del framework.

### B. Frontal 100 % offline y sin backend

1. `servidor` y `sesion` son **opcionales** en `crearLector`, los adaptadores y el componente. Sin ellos, el núcleo lee localmente, entrega el resultado con `confiable: false` y no hace ninguna petición fuera del origen del integrador (SDK-37). Con ellos, además sube las imágenes a la sesión para el resultado firmado; si el servidor falla, el resultado local se conserva y `envio` informa el código (SDK-38).
2. **Assets dentro del paquete npm** (`@lector-cedula/web/assets`: Worker, WASM de zxing y tesseract, `mrz.traineddata`, DIVIPOL, `manifest.json` con SHA-256). La opción `recursos` fija la URL base; por omisión, la que resuelve el bundler (`new URL("./assets/", import.meta.url)`). `docs/sdk/` incluye cómo copiarlos a `public/` en Vite, Next y Angular.
3. **Integridad y caché** como OFF-01/OFF-02: verificación SHA-256 antes de usar o cachear (SDK-39), Cache Storage `lector-cedula-sdk-<version>` (SDK-06). Para recargar sin red, el integrador importa `precacheLector(recursos)` de `@lector-cedula/web/sw` en su service worker o usa su propia estrategia (documentado).
4. El núcleo sin servidor funciona igual en todos los ejemplos (SDK-37).
5. **Consecuencias:** la ruta `/sdk/v1/` del servidor (SDK-05, fase 2) se mantiene sin cambios como espejo opcional, pero el frontal ya no depende de ella; el tamaño del paquete npm crece con los assets (se informa, sin límite duro hasta decisión humana). La decisión de diseño 5 queda subordinada a esto.

### C. Fase futura (solo diseño, sin tareas): `@lector-cedula/react-native`

- Hook `useLectorCedula` nativo sobre la misma `maquina.ts` y tipos (`EstadoLector`), que no depende del DOM.
- `DependenciasLector` nativas: cámara con react-native-vision-camera (MIT) y frame processors (worklets) que calculan la calidad y decodifican PDF417 (zxing nativo o ML Kit, a evaluar con `licencia-check`) y MRZ con OCR nativo; parsers TypeScript de `packages/parsers` en JS.
- Mismo contrato de estado, por lo que la UI del integrador en RN sigue el mismo patrón que en web.
- Riesgos: licencias de los decodificadores nativos, paridad de umbrales de calidad entre WASM y nativo (requiere prueba diferencial), tamaño del binario. Hasta entonces, RN usa el flujo alojado en WebView (sin cambios).

## Hallazgos de revisor-privacidad aplicados (2026-10-08)

- M1: `/sdk/v1/` solo sirve `.wasm`, `.js` y `.mjs`; `DIRECTORIO_SDK` debe ser absoluta y sin `..`.
- M2: la excepción de Spectral a `sin-binario-en-respuestas` cubre solo la respuesta 200 de `/sdk/v1/{archivo}` con `application/wasm` o `text/javascript`.
- M3: los tokens de subida y alojado se firman con subclaves HKDF-SHA256 (RFC 5869) de `SECRETO_SUBIDA` por propósito (`app/secretos.py`). El formato no cambia; los tokens vigentes antes del despliegue dejan de valer (el almacén es en memoria y se vacía al reiniciar, así que no hay tokens que conservar).
- M4: el CORS de `/sdk/v1/` solo se anuncia en respuestas 200.

## Decisión del orquestador: destinos de webhook solo para pruebas (2026-10-08)

AV-28 impide que el servidor entregue a un receptor local, así que la tarea 2.5 no podía comprobar webhooks reales. Se añade una excepción **solo para pruebas** (SDK-40): `WEBHOOK_DESTINOS_PRUEBA`, lista exacta de URL `http`/`https`, aceptada únicamente con `ENTORNO=pruebas`; en cualquier otro entorno su presencia detiene el arranque. Solo las URL listadas se saltan la comprobación de red interna y de `https`; el resto sigue AV-28. La define solo `api-pruebas` en `server/compose.yaml`; `compose.dokploy.yaml` nunca (prueba en `tools/test/despliegue-dokploy.test.mjs`). Revisor: `revisor-privacidad`.

## Decisiones del orquestador por delegación del usuario (2026-10-08, segunda ronda)

1. Tamaño del paquete npm con assets: sin límite duro; `check:tamano-sdk` informa y falla solo si crece más de 10 % frente a la versión anterior.
2. Redistribución de WASM y `mrz.traineddata` en npm: la tarea 3.3 exige el veredicto de `revisor-licencias` antes de publicar.
3. `/sdk/v1/` se mantiene como espejo opcional de los recursos; no se retira.
4. Componente opcional: español incluido; inglés bajo demanda.
5. Angular mínimo 18; el adaptador funciona con y sin zone.js.
6. La página alojada conserva la precaché de OFF-01; `precacheLector` es para integradores.
7. La migración de la PWA (3.6) se hace al final de la fase 3, después de integrar otros-documentos y deteccion-fraude en la PWA.

## Decisiones del orquestador por delegación del usuario (2026-10-09, tercera ronda)

1. SDK-09 (tarea 3.7): `lector-cedula:tiempo` mide de `leyendo` a `resultado`, igual que la PWA (OFF-15). La descarga en frío del motor (~20 MB) se mide aparte y se informa como anotación `descarga-fria-ms`, sin umbral bloqueante. La tarea 3.7 se cierra si la medida en caliente cumple.
2. Transiciones nuevas: `activo|listo→error` cuando falla el análisis de calidad (código `calidad-error`, en lugar de volver a `inicio`) y `permiso→inicio` al cancelar durante el permiso (en lugar del rodeo `permiso→activo→inicio`). Trasladado a la spec (convención `TRANSICIONES` y escenarios de SDK-30).
3. `leerDocumento` devuelve el mismo `ResultadoPresentacion` que `estado.resultado` (escenario "Mismo objeto que el estado" de SDK-08).
4. Hallazgos de `revisor-privacidad` sobre el núcleo (aplicados en 3.5b): `upload.url` solo del mismo origen que `servidor` y segura; sin envío de tarjeta de identidad ni menores salvo `enviarMenores: true` (`envio` `fallido` `menor-no-enviado`); copias a cero al liberar e incluso ante excepción; autorización del titular a cargo del integrador; imagen duplicada `front`/`back` como excepción temporal hasta la tarea 4.3.

## Decisión del orquestador por delegación del usuario (2026-10-09): dependencias internas en npm

`@lector-cedula/web` importa `@lector-cedula/capture` en tiempo de ejecución. Se publicarán también `@lector-cedula/capture` y `@lector-cedula/parsers` como paquetes públicos (MIT; las subrutas con datos conservan CC BY-SA), en vez de agrupar todo en un bundle: así cada paquete conserva su licencia y sus tipos. Tarea pendiente en la fase 6: quitar `private`, versionar y publicar en orden parsers, capture, web.
5. Compatibilidad con bundlers (hallado en 3b.4, Next 16 con Turbopack): `new URL("./assets/", import.meta.url)` hace fallar Turbopack y webpack ("Can't resolve './assets/'"). Los recursos por omisión se resuelven en tiempo de ejecución desde `import.meta.url` en una variable; con cualquier bundler el integrador pasa `recursos` (como ya hacen todos los ejemplos). Escenario en SDK-12.
6. `precargarMotor` carga también el módulo diferido de dependencias por omisión (hallado en el E2E offline de los ejemplos con Vite, Next y Angular, que separan ese chunk). Escenario "Precarga sin red" de SDK-07.
7. Fase 3b: Angular 21.2 en desarrollo (cumple "Angular >= 18"; Angular 22 exige TypeScript 6.0 y el repositorio usa 5.9). Los ejemplos son workspaces (`examples/*`) con versiones exactas, para que `npm run build -w examples/<x>` funcione y comparta una sola copia de cada framework. Los adaptadores aceptan `avanzado: { deps?, crear? }` (convención de la spec).
8. El E2E `SDK-30 Cancelar/Destruir libera la cámara` usa el vídeo `sin-documento-1080p`: con la amarilla, la lectura terminaba antes de poder observar la cámara abierta (carrera de tiempos, no cambio de comportamiento).
9. OFF-27c en el núcleo: `leerSecuencia` envía `respaldoDe: "pdf417"` en la llamada final de respaldo MRZ de una pista PDF417 y el cliente del Worker lo reenvía (prueba `packages/web/test/off-27c-respaldo.test.ts`).

> Nota (2026-10-09): la decisión C (React Native con VisionCamera) queda sustituida por el cambio `sdk-nativo`.

## Decisiones del usuario, 2026-10-09 (modelo backend propio)

Decididas por el usuario y trasladadas a la spec con escenarios (SDK-45 a SDK-60 en `sdk-integracion`; MOT-13, MOT-15, MOT-19 a MOT-25 en `motor-backend-embebido`).

1. **Dos partes, front headless y back.** El motor (tesseract, zxing, fraude) corre en el servidor de la empresa que usa la librería, nunca en un servidor del autor. `@lector-cedula/servidor` absorbe el antiguo `@lector-cedula/motor` (MOT-01 pasa a `@lector-cedula/servidor`; SDK-18 enmendado: dependencias solo `@lector-cedula/*` y subruta `/cliente` sin motor).
2. **Modelo por defecto: front + backend propio con respuesta en vivo.** Opción `backend` en `@lector-cedula/web` y adaptadores (SDK-45), envío automático tras la lectura local, fase `verificando` con `estado.verificacion` (SDK-46), rechazo con vuelta automática a `activo` y tope `intentosVerificacion` (SDK-47), `autoIniciar` (SDK-49). El botón solo abre la cámara.
3. **Protocolo en vivo NDJSON** (`application/x-ndjson`) con `fetch` + `ReadableStream`, `AbortController`, `tiempoLimiteMs` e `inactividadMs`; sin WebSocket ni sondeo (SDK-48, SDK-54, MOT-20). Respuesta JSON única opcional con `streaming: false` / `Accept: application/json` / `?streaming=0` (SDK-59, MOT-25).
4. **Back**: `crearLectorServidor({ alConfirmar, limites, fraude, comparar })` con `.express()`, `.nest()`, `.next()`, `.fastify()` y `.manejar(Request): Response` (MOT-19); motor en proceso con `worker_threads`; compara con el cliente (MOT-10) y llama `alConfirmar` solo si ok (MOT-21); motivos de rechazo cerrados (MOT-22); sin red, sin disco, bytes a cero (MOT-23). Java y Go emiten el mismo protocolo (MOT-24).
5. **Modo opcional microservicio**: sesión, `hosted_url`, webhooks firmados, página alojada y `crearCliente` se conservan sin cambios y se reetiquetan como opcionales (SDK-52). Lo ya implementado (fases 1, 2 y 4) no se toca.
6. **Ampliación del usuario: `modo: "front" | "back" | "front-back" | "auto"`** (por omisión `auto`), con `estado.modo` y `estado.modoMotivo` (SDK-55). `back` captura con análisis ligero sin descargar el motor pesado, con presupuesto `PRESUPUESTO_BACK` medido y fijado (SDK-56). `auto` decide con la función pura `decidirModo` sobre `deviceMemory`, `hardwareConcurrency`, WASM SIMD, `saveData`/`effectiveType` y micro-medición opcional, con umbrales configurables (SDK-57). Sin red: `front` y confirmación al volver la red con cola solo en memoria (SDK-58).

Decisiones del redactor por delegación (el usuario puede revertirlas):

- `backend` acepta ruta relativa, mismo origen, `https:` de otro origen (CORS a cargo de la empresa) y `http://localhost`; `credentials: "same-origin"`, `redirect: "error"` (SDK-45).
- Todos los motivos de rechazo vuelven a `activo` mientras haya intentos, también `menor-de-edad` y `documento-no-admitido` (literal de la instrucción del usuario); por omisión 3 intentos (1..10).
- Los fallos de transporte (`backend-no-disponible`, `backend-rechazo-http`, `backend-tiempo-agotado`, `protocolo-invalido`) no consumen intentos y llevan a `error` con el resultado local conservado; el 413 se trata como rechazo `demasiado-grande`.
- Con `autoIniciar`, el fallo de cámara en el arranque automático vuelve a `inicio` con `autoinicio-fallido` (transición `permiso→inicio`), no a `error`.
- Menores en modo backend: rechazo local `menor-de-edad` sin red salvo `enviarMenores` (SDK-53, coherente con SDK-43).
- `alConfirmar` que lanza da `rechazo.motivo` `error-interno` sin filtrar el mensaje (MOT-21).
- La opción `enviarA` de la propuesta anterior se retira en favor de `backend` (MOT-15).
- `decidirModo` trata señales ausentes (Safari sin `deviceMemory`) como no débiles; umbrales por omisión: 4 GB, 4 núcleos, SIMD requerido, `saveData` o `slow-2g`/`2g` débiles.
- Cola sin red: una sola imagen, solo en memoria, vence a los 10 min (`tiempoColaMs`), código `cola-vencida`.

## Decisiones del orquestador por delegación del usuario (2026-10-09, modos)

1. `PRESUPUESTO_BACK`: meta de 300 KiB gzip; el valor final lo fija la medición de B.6 más un 10 %.
2. Rechazos `menor-de-edad` y `documento-no-admitido` terminan en `error` sin reintento; el resto (`no-coincide`, `fraude`, `ilegible`) vuelve a `activo`.
3. Umbrales de `auto`: memoria menor de 4 GB, menos de 4 núcleos, sin WASM SIMD, o `saveData`/2g cuentan como débil; señales no expuestas por el navegador no cuentan como débiles.

## Corrección del usuario, 2026-10-09 (modos y validación)

Prevalece sobre la decisión 6 de "Decisiones del usuario, 2026-10-09 (modelo backend propio)" y sobre el punto 3 de "Decisiones del orquestador por delegación del usuario (2026-10-09, modos)". Trasladada a la spec (SDK-55 a SDK-58, SDK-60 y convenciones).

1. `modo: "front" | "back" | "front-back"`; ya no existe `modo: "auto"`. Por omisión `front-back` con `backend` y `front` sin él.
2. En `front-back` (doble validación) el back SIEMPRE valida, sin excepción.
3. Nueva opción `validacion: "estricta" | "auto"` solo para `front-back` (por omisión `estricta`): `estricta` = el front siempre lee localmente y el back valida; `auto` = el front lee solo si `decidirFront(dispositivo, umbrales)` lo permite (mismas señales y umbrales que antes); si no, captura como el modo back ligero y el back valida.
4. `decidirModo` pasa a `decidirFront(dispositivo, umbrales): { usarFront, motivo }` (`packages/web/src/decidir-front.ts`). La red ya no es una entrada: la falta de red se resuelve con la cola.
5. Cola sin red (SDK-58) en `front-back`: la fase queda en `verificando` con etapa `en-espera` y el resultado nunca es confiable hasta que el back responde; vencida, `error` `cola-vencida`. En `front` no aplica; en `back` la falta de red es `backend-no-disponible`.
6. El estado expone `modo`, `validacion`, `frontActivo` y `modoMotivo`.
7. Decisión del implementador por delegación: los motivos terminales `menor-de-edad` y `documento-no-admitido` llevan a `error` con código `verificacion-rechazada` (el mismo del tope agotado) y `estado.rechazo.motivo` indica cuál; SDK-47 y SDK-53 enmendados.
