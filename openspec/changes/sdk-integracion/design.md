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
- `C` = `docker compose -f server/compose.yaml up -d --wait api-pruebas && npx vitest run packages/servidor/test/contrato` (contrato del paquete contra la API real)
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

## Decisiones del orquestador por delegación del usuario (2026-10-08, segunda ronda)

1. Tamaño del paquete npm con assets: sin límite duro; `check:tamano-sdk` informa y falla solo si crece más de 10 % frente a la versión anterior.
2. Redistribución de WASM y `mrz.traineddata` en npm: la tarea 3.3 exige el veredicto de `revisor-licencias` antes de publicar.
3. `/sdk/v1/` se mantiene como espejo opcional de los recursos; no se retira.
4. Componente opcional: español incluido; inglés bajo demanda.
5. Angular mínimo 18; el adaptador funciona con y sin zone.js.
6. La página alojada conserva la precaché de OFF-01; `precacheLector` es para integradores.
7. La migración de la PWA (3.6) se hace al final de la fase 3, después de integrar otros-documentos y deteccion-fraude en la PWA.
