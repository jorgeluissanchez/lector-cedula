# Design

## Context

Motivación y alcance: ver `proposal.md`. Requisitos: `specs/captura-camara/spec.md` (CAM-01 a CAM-12) y `specs/calidad-captura/spec.md` (CAL-01 a CAL-15).

Estado observado el 2026-10-06:

- No existen `apps/` ni `packages/capture`. El monorepo usa npm workspaces (`packages/*`, `apps/*`), TypeScript 5.9 estricto (`tsconfig.base.json` con `lib` DOM y WebWorker, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Vitest 3.2.7, Vite 7.3.7 (dependencia transitiva de Vitest), Playwright 1.63.0 (solo Chromium instalado; no hay WebKit en `%LOCALAPPDATA%/ms-playwright`), Stryker 10 y @axe-core/playwright 4.13.
- `vitest.config.ts` incluye `packages/*/test/**/*.test.ts` y `apps/*/test/**/*.test.ts`, con cobertura v8 sobre `packages/*/src/**` y umbrales 90/85/90/90. Código que solo corre en navegador bajaría esa cobertura si no se separa (decisión 13).
- `playwright.config.ts` tiene dos proyectos (Desktop Chrome y Pixel 7, viewport 412x839) con `--use-fake-device-for-media-stream` y `--use-fake-ui-for-media-stream`, sin `webServer` ni `baseURL`. `e2e/seed.spec.ts` sirve HTML por `page.route`. Los agentes `playwright-test-planner`, `-generator` y `-healer` están en `.claude/agents/`; los planes van a `e2e/planes/`.
- `tools/privacidad-check.mjs` marca `localStorage`, `sessionStorage` e `indexedDB` en `packages/` y `apps/`, y toda imagen o vídeo (`.png`, `.mp4`...) fuera de carpetas `sinteticos/`, `especimenes/` o `assets-ui/`. Las imágenes de referencia de la regresión visual deben vivir bajo `assets-ui/` (decisión 15).
- Licencias comprobadas con `node tools/licencia-check.mjs --package` el 2026-10-06: `preact@10.29.8` MIT, `vite@7.3.7` MIT, `@vitest/browser@3.2.7` MIT (peer `vitest` 3.2.7 y `playwright` cualquiera), `@lhci/cli@0.15.1` Apache-2.0 (última publicación 2025-06). También `@preact/preset-vite` 2.10.6, `vite-plugin-pwa` 2.0.0 y `lit` (MIT), descartados por diseño. Preact 11.0.0 salió el 2026-09-30.
- Hay cambios OpenSpec en paralelo (`generador-fixtures-sinteticos`, `parser-pdf417-amarilla`, `pruebas-nuip-y-evals-robustas`). Este cambio no toca `packages/parsers` ni `evals/`.

## Goals / Non-Goals

**Goals:**
- Núcleo de calidad puro (sin DOM) y determinista, probado en Node con literales y metamórficas, y mutado con Stryker.
- La misma función de calidad corre en el Worker y en Node; el Worker solo añade transporte.
- Todo lo que depende del navegador (cámara, canvas, Worker) aislado en una carpeta propia y probado en Chromium real.
- E2E reproducibles con vídeos sintéticos generados, sin binarios versionados.

**Non-Goals:**
- Detección del documento (DocAligner, jscanify, OpenCV.js), corrección de perspectiva, recorte, lectura de PDF417, clasificador de versión, linterna, OCR. Solo se definen interfaces (CAL-14, CAL-15).
- Calibración de umbrales con datos: queda descrita en `docs/decisiones/2026-10-06-umbrales-calidad-captura.md`.
- App Capacitor (Fase 4) y pruebas en iOS real (el simulador no tiene cámara).
- Migrar a Vitest 4 o 5.

## Decisions

### 1. Framework de UI: Preact 10.29.8 con JSX de esbuild, sin plugin

La PWA usa `preact@10.29.8` (unos 4,5 KB gzip). El JSX lo transforma el esbuild que Vite ya incluye (`tsconfig` con `"jsx": "react-jsx"` y `"jsxImportSource": "preact"`), sin `@preact/preset-vite`, que arrastra Babel. Se pierde la recarga en caliente con estado (prefresh), irrelevante aquí.

Alternativas: TypeScript sin framework (la máquina de pantallas y los avisos crecen en la Fase 3 con resultados y errores por campo; reescribir el DOM a mano es frágil); React 19 (unos 45 KB gzip frente al presupuesto de CAM-12; `PLAN.md` lo menciona, ver pregunta abierta 1; migrar desde Preact es casi directo con `preact/compat`); Lit (web components; el shadow DOM complica los selectores de los agentes de Playwright); Svelte y Solid (compiladores con plugin propio). Preact 11 se descarta por tener seis días de publicado.

### 2. Estructura del código

```
packages/capture/                     @lector-cedula/capture (MIT, ESM, sideEffects false)
  src/calidad/    luminancia, reduccion, region, nitidez, reflejo, exposicion, tamano, score, umbrales   (puro)
  src/flujo/      entorno, resolucion, errores-camara, guia, planificador, autocaptura, feedback        (puro)
  src/navegador/  worker-calidad (iniciarWorkerCalidad), cliente-calidad, camara, frames, captura        (DOM)
  src/interfaces.ts   tipos públicos de la decisión 7
  test/           Node: unitarias, propiedades, metamórficas, tipos (*.test-d.ts), escenas sintéticas
  test-browser/   Vitest browser: *.browser.test.ts y workers de prueba (detectores sustitutos)
apps/pwa/
  index.html, public/manifest.webmanifest, public/iconos/*.png (generados, sin datos)
  src/main.tsx, src/App.tsx, src/estado.ts (reductor de pantallas), src/pantallas/*.tsx,
  src/calidad.worker.ts (una línea: iniciarWorkerCalidad(self, crearDetectorGuia())), src/sw.ts
  test/           Node: reductor de pantallas y análisis estático de privacidad
```

Lo puro (`calidad/`, `flujo/`) no importa nada de `navegador/` ni usa tipos del DOM salvo `Uint8ClampedArray`. Así se prueba en Node, se muta con Stryker (que no soporta browser mode) y cuenta para la cobertura actual. La app construye el `Worker` y se lo pasa al cliente; el paquete no sabe nada del empaquetador.

### 3. Frame de análisis reducido en el hilo principal con `drawImage`

El hilo principal dibuja el `<video>` en un canvas de 640 px de lado largo (CAL-01) con `drawImage(video, 0, 0, ancho, alto)`, lee `getImageData` y transfiere `pixeles.buffer` al Worker. El Worker devuelve el mismo buffer transferido en la respuesta (CAL-09) y el hilo principal lo reutiliza para el siguiente frame: hay como máximo dos buffers de 921600 bytes vivos y ninguna copia.

Alternativas: `createImageBitmap(video, { resizeWidth })` transferido a un `OffscreenCanvas` en el Worker (menos trabajo en el hilo principal, pero el soporte de las opciones de redimensionado en Safari no está verificado); `ImageCapture.grabFrame` (no existe en iOS, CAM-07). `drawImage` es el único camino común a Chromium, WebKit y la futura WebView de Capacitor. La reducción la hace el navegador con su interpolación, así que las pruebas literales de calidad trabajan sobre frames ya reducidos y solo las dimensiones de la reducción se prueban de forma exacta.

### 4. Métricas y score

- Rampas lineales `rampa(x, a, b)` con redondeo `Math.round` y score = mínimo de los subscores (CAL-07). Se prefiere el mínimo a una media ponderada porque una media esconde un reflejo grave detrás de una buena nitidez, y porque hace evidente qué corregir: el motivo es siempre la métrica limitante.
- Orden de prioridad en empates: `acerca`, `oscuro`, `sobreexpuesto`, `reflejo`, `desenfocado`. Primero lo que el usuario corrige moviendo el documento o la luz; el desenfoque suele resolverse solo con el autoenfoque.
- M por centros de píxel y prueba de semiplanos con tolerancia 1e-9 para el borde. Convexidad: los cuatro productos cruzados de aristas consecutivas tienen el mismo signo (o cero en a lo sumo dos, lo que da área cero y se rechaza por la regla del área).
- Componentes 4-conexos con una pila explícita (sin recursión) y un `Int32Array` de etiquetas reutilizado entre frames.
- La exposición se separa en dos subscores (`oscuro` y `sobreexpuesto`) para que el motivo diga qué hacer. La sobreexposición global usa la media; los brillos locales los mide el reflejo.
- Con la guía como cuadrilátero (`fuente: "guia"`) el tamaño no se puede medir (la guía es fija), así que es `null` y "Acerca la cédula" solo aparece con un detector real o cuando un detector no encuentra documento (CAL-14). Ver pregunta abierta 2.

### 5. Umbrales calibrables

`UMBRALES_POR_DEFECTO` congelado (`Object.freeze`) con los valores literales de CAL-08 y `validarUmbrales(parcial, vigentes)` puro, que devuelve `{ ok: true, umbrales }` o `{ ok: false, codigo: "umbrales-invalidos", campos }` con los campos ordenados con `localeCompare` en `"en"`. El Worker aplica la configuración con un mensaje `configurar`; si es inválida, no cambia nada. Los valores son provisionales y su origen y procedimiento de calibración están en `docs/decisiones/2026-10-06-umbrales-calidad-captura.md`. Cambiar un valor por defecto es un cambio OpenSpec.

### 6. Protocolo del Worker

```ts
type MensajeAlWorker =
  | { tipo: "configurar"; id: number; umbrales: unknown }
  | { tipo: "analizar"; id: number; ancho: number; alto: number;
      anchoOriginal: number; altoOriginal: number; pixeles: ArrayBuffer };   // transferido
type MensajeDelWorker =
  | { tipo: "configurado"; id: number; resultado: ResultadoConfiguracion }
  | { tipo: "resultado"; id: number; resultado: ResultadoCalidad;
      deteccion: DeteccionDocumento; pixeles: ArrayBuffer }                  // devuelto por transferencia
  | { tipo: "error"; id: number;
      codigo: "frame-invalido" | "cuadrilatero-invalido" | "mensaje-invalido"; pixeles?: ArrayBuffer };
```

`frame-invalido`: dimensiones no enteras o no positivas, o `byteLength` distinto de `ancho * alto * 4`. `mensaje-invalido`: `tipo` desconocido o `id` no entero (si no hay `id` legible, se responde con `id: -1`). El Worker nunca lanza hacia fuera: un error inesperado se responde como `mensaje-invalido` y el cliente pasa a la pantalla `error` con el código `desconocido`. El Worker no guarda referencias a frames entre mensajes.

`iniciarWorkerCalidad(alcance, detector)` registra `onmessage` y recibe el detector por inyección: la app pasa `crearDetectorGuia()` y las pruebas de navegador usan workers de prueba con detectores sustitutos (CAL-14).

### 7. Interfaces públicas para los cambios posteriores

```ts
export type Punto = readonly [x: number, y: number];
export type Cuadrilatero = readonly [Punto, Punto, Punto, Punto];   // sup-izq, sup-der, inf-der, inf-izq

export interface FrameAnalisis {
  readonly ancho: number; readonly alto: number; readonly pixeles: Uint8ClampedArray;   // RGBA
  readonly anchoOriginal: number; readonly altoOriginal: number;
}
export interface DeteccionDocumento {
  readonly cuadrilatero: Cuadrilatero | null;          // en píxeles del frame de análisis
  readonly confianza: number | null;                   // 0..1, null si no aplica
  readonly fuente: "guia" | "modelo";
}
export interface DetectorDocumento {
  readonly id: string;
  detectar(frame: FrameAnalisis): DeteccionDocumento | Promise<DeteccionDocumento>;
  liberar?(): void;
}
export interface CapturaAceptada {
  readonly ancho: number; readonly alto: number;
  readonly pixeles: Uint8ClampedArray;                 // RGBA a resolución completa
  readonly cuadrilatero: Cuadrilatero;                 // en píxeles de la captura
  readonly calidad: ResultadoCalidad;
  readonly liberada: boolean;
  liberar(): void;                                     // pone los bytes a cero (CAM-11)
}
export type FormatoCodigo = "pdf417";                  // el QR de la digital no se decodifica (principio V)
export interface CodigoLeido {
  readonly formato: FormatoCodigo;
  readonly bytes: Uint8Array;                          // crudos ISO-8859-1; el parser descarta la biometría
  readonly esquinas: Cuadrilatero | null;
}
export interface LectorCodigos {
  readonly id: string;
  readonly formatos: readonly FormatoCodigo[];
  leer(captura: CapturaAceptada, opciones?: { readonly senal?: AbortSignal }): Promise<readonly CodigoLeido[]>;
}
```

El detector corre dentro del Worker (DocAligner en ONNX irá allí). El lector recibirá la `CapturaAceptada` en el cambio de lectura de códigos; un `LectorCodigos` MUST NOT retener la captura después de resolver la promesa (se exigirá en ese cambio).

### 8. Flujo de captura y máquina de pantallas

`apps/pwa/src/estado.ts` es un reductor puro con las pantallas `inicio`, `activo`, `pausado`, `listo` y `error` (con código). El ciclo:

1. "Iniciar cámara": `performance.mark("camara:solicitada")`, comprobación de entorno (CAM-02), `getUserMedia` (CAM-03), resolución (CAM-04), enfoque (CAM-06), creación diferida del Worker con `new Worker(new URL("./calidad.worker.ts", import.meta.url), { type: "module" })` (CAM-12).
2. Bucle por `requestAnimationFrame`: el planificador puro (CAL-10) decide si se envía un frame; cada respuesta crea `performance.measure("calidad:frame", { start: tEnvio, end: tRespuesta })`.
3. Auto-captura (CAL-11): al completarse la racha se dibuja el vídeo a resolución completa (CAM-07), se reduce desde ese canvas y se revalida en el Worker. Si pasa, se crea la `CapturaAceptada`, se detienen las pistas (CAM-10), se mide `captura:tiempo-a-listo` desde `camara:solicitada` y se muestra `listo`.
4. "Repetir", "Cancelar", `visibilitychange` a oculto y `pagehide` llaman a `captura.liberar()` y detienen las pistas.

### 9. Feedback

`flujo/feedback.ts` es puro: recibe el resultado y la cuenta de la racha y devuelve el texto vigente con la histéresis de CAL-12. Se pinta en el único elemento `role="status"` con `aria-live="polite"`, sobre un fondo opaco para que el contraste no dependa del vídeo. "Listo" no pasa por la histéresis.

### 10. Service worker y manifiesto escritos a mano

`src/sw.ts` se compila como segunda entrada de Rollup a `dist/sw.js` (alcance `/`). Un plugin de diez líneas dentro de `vite.config.ts` (hook `generateBundle`) sustituye `self.__RECURSOS__` por la lista de archivos emitidos más `/`, `/index.html`, `/manifest.webmanifest` y los iconos. Estrategia: precarga en `install`, borrado de cachés viejas en `activate`, y en `fetch` solo responde desde caché a GET del mismo origen cuya ruta esté en la lista; todo lo demás va a la red sin tocar la caché. No hay caché en tiempo de ejecución.

Alternativa descartada: `vite-plugin-pwa` 2.0.0 (MIT) con Workbox; añade decenas de dependencias transitivas que auditar y una estrategia de caché en tiempo de ejecución que habría que desactivar para cumplir CAM-01 y CAM-11.

### 11. Vídeos sintéticos con ffmpeg en Docker

`e2e/videos/generar.mjs` invoca `docker run --rm -v "<repo>:/w" -w /w jrottenberg/ffmpeg:8-alpine -f lavfi -i "<grafo>" -frames:v 10 -pix_fmt yuv420p -y e2e/videos/sinteticos/<nombre>.y4m` por escena. La "tarjeta" es `testsrc2` (patrón con bordes nítidos y color) con la luminancia acotada (`lutyuv=y='clip(val,40,200)'`) para no saturar, superpuesta en la posición exacta de la guía de CAM-08 sobre un fondo `color=c=0x303030`:

| Vídeo | Tamaño | Modificación tras superponer | Motivo esperado (CAL-12) |
|---|---|---|---|
| `nitida-1080p` | 1920x1080, tarjeta 1541x972 en (190, 54) | ninguna | "Listo" |
| `desenfocada-1080p` | igual | `gblur=sigma=8` | `desenfocado` |
| `reflejo-1080p` | igual | `drawbox=x=500:y=300:w=300:h=200:color=white:t=fill` (4 % de M) | `reflejo` |
| `sobreexpuesta-1080p` | igual | `lutyuv=y='clip(val*0.3+170,16,235)'` | `sobreexpuesto` |
| `oscura-1080p` | igual | `lutyuv=y='val*0.15'` | `oscuro` |
| `nitida-720p` | 1280x720, tarjeta 1028x648 en (126, 36) | ninguna | "Listo" y aviso de CAM-04 |

Diez frames a 10 fps (Chromium repite el archivo en bucle); unos 31 MB por vídeo de 1080p. Los `.y4m` no se versionan (`e2e/videos/sinteticos/` va al `.gitignore`); se regeneran con `npm run e2e:videos`. Los parámetros exactos de ffmpeg son estimados [E]: si un vídeo no produce el motivo esperado, se ajusta la escena, nunca los umbrales. La escena de WebKit (CAM-07) la dibuja la instrumentación en un canvas con la misma composición (fondo `#303030` y rectángulos aleatorios de semilla fija con gris entre 40 y 200 dentro de la guía). La imagen de `jrottenberg/ffmpeg` incluye componentes GPL: es una herramienta de desarrollo en Docker, no se distribuye ni entra al producto.

### 12. E2E con Playwright

- `playwright.config.ts`: `webServer` con `npm run build -w apps/pwa && npm run preview -w apps/pwa -- --port 4173 --strictPort`, `baseURL` `http://localhost:4173`. Los dos proyectos existentes pasan a `testIgnore: /captura\//`.
- Un proyecto por vídeo y dispositivo, generado en bucle: `captura-<video>-<escritorio|pixel>`, con `--use-file-for-fake-video-capture=e2e/videos/sinteticos/<video>.y4m`, `testMatch: /captura\/.*\.spec\.ts/` y `grep: /@video:<video>/`. Cada prueba declara su vídeo con la etiqueta `@video:<nombre>`; las que no dependen de la imagen usan `@video:nitida-1080p`. Las de regresión visual llevan además `@visual` y se excluyen (`grepInvert`) salvo con `VISUAL=1`.
- `captura-webkit` (Desktop Safari) solo para la prueba de CAM-07 en WebKit; requiere `npx playwright install webkit` (descarga del navegador, no es dependencia npm). En Windows WebKit no arranca por dependencias del sistema: el proyecto solo se define fuera de Windows y se ejecuta con `npm run test:webkit` dentro del contenedor `mcr.microsoft.com/playwright:v1.63.0-noble` (mismo corredor que `test:visual`, `tools/visual.mjs`).
- Instrumentación común en `e2e/captura/instrumentacion.ts` (espías de `getUserMedia`, `applyConstraints`, `ImageCapture`; registro de streams; redefinición de `visibilityState`), inyectada con `page.addInitScript`.
- Planes con el agente `playwright-test-planner` usando `e2e/seed.spec.ts` y guardados en `e2e/planes/captura-calidad-pwa.md` (indicarlo en el prompt: no hay opción para cambiar `specs/`; si el agente crea `specs/README.md`, se borra). Pruebas con `playwright-test-generator`; reparación con `playwright-test-healer`. Esperas solo por condición (`expect(...).toHaveText`, `expect.poll`, `waitForFunction`), nunca `waitForTimeout`.

### 13. Vitest browser mode y cobertura

`@vitest/browser@3.2.7` (el paquete `@vitest/browser-playwright` solo existe desde Vitest 4). `vitest.browser.config.ts` en la raíz: `test.include: ["packages/*/test-browser/**/*.browser.test.ts"]`, `browser: { enabled: true, provider: "playwright", headless: true, instances: [{ browser: "chromium", launch: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] } }] }` (cámara simulada con el patrón por defecto de Chromium, suficiente para probar restricciones y parada de pistas; el nombre exacto de la opción por instancia en 3.2.7 se confirma en la tarea 1.2 [E]), cobertura v8 sobre `packages/capture/src/navegador/**` con los mismos umbrales (90/85/90/90). En `vitest.config.ts` se añade `packages/capture/src/navegador/**` a `coverage.exclude`. Script `test:browser`: `vitest run --config vitest.browser.config.ts`. La comprobación de tipos de contrato usa `npx vitest run --typecheck.only packages/capture` sobre `*.test-d.ts`.

### 14. Medidas de rendimiento y reporte

Nombres fijos en `performance`: `camara:solicitada` (marca), `calidad:frame` y `captura:tiempo-a-listo` (medidas). Son tiempos sin datos de imagen. La prueba de CAL-13 escribe `reports/captura/tiempo-a-listo-<proyecto>.json` (se añaden `reports/captura/` y `reports/lighthouse/` al `.gitignore`).

### 15. Regresión visual en contenedor

`npm run test:visual` ejecuta `docker run --rm --ipc=host -e VISUAL=1 -v "$(pwd -W):/work" -v /work/node_modules -w /work mcr.microsoft.com/playwright:v1.63.0-noble bash -c "npm ci && npx playwright test --grep @visual"`. El volumen anónimo sobre `node_modules` evita usar los binarios nativos de Windows (rollup, esbuild) dentro de Linux. `toHaveScreenshot` con `maxDiffPixelRatio: 0.01`, `animations: "disabled"` y `mask: [page.locator("video")]`. `snapshotPathTemplate: "e2e/visual/assets-ui/{testFileName}/{arg}-{projectName}{ext}"`, para que `privacidad-check` acepte las imágenes de referencia (son capturas de la UI con el vídeo enmascarado, sin frames). Los `.y4m` se generan antes en el anfitrión y llegan por el montaje.

### 16. Lighthouse CI

`@lhci/cli@0.15.1` como devDependency. `apps/pwa/lighthouserc.json`: `collect.staticDistDir: "apps/pwa/dist"`, `numberOfRuns: 3`, `chromePath` desde la variable `CHROME_PATH` (el Chromium de Playwright); `assert.assertions` de CAM-12; `upload.target: "filesystem"` con `outputDir: "reports/lighthouse"`. Nunca `temporary-public-storage`: subiría el reporte a un servicio externo.

### 17. Mutación

`stryker.config.mjs` añade `packages/capture/src/calidad/**/*.ts` y `packages/capture/src/flujo/**/*.ts` a `mutate`, con el umbral de rotura del proyecto (85). `navegador/` queda fuera (Stryker no soporta browser mode); lo cubren las pruebas de navegador y E2E.

### 18. Privacidad por construcción

Sin red ni almacenamiento en el código de captura (análisis estático de CAM-11 y `privacidad-check`); buffers transferidos, no copiados, y devueltos (el Worker no puede retenerlos); captura con `liberar()` que pone los bytes a cero; pistas detenidas en `listo`, `Cancelar` y página oculta; service worker sin caché en tiempo de ejecución; reporte de Lighthouse solo en disco local. Telemetría: ninguna en este cambio.

### 19. Pruebas en un celular real

Sin plugin HTTPS: con `adb reverse tcp:4173 tcp:4173`, Chrome de Android trata `http://localhost:4173` como contexto seguro. Es un procedimiento manual de apoyo, no una prueba (principio II); la evidencia sigue siendo la automática.

## Pruebas

Según el principio II y la fila "Captura web" de la matriz de `.claude/skills/estrategia-pruebas/SKILL.md`. Comandos:

- `U` = `npx vitest run packages/capture apps/pwa` (Node: unitarias, propiedades, metamórficas, análisis estático)
- `T` = `npx vitest run --typecheck.only packages/capture` (contrato de tipos)
- `B` = `npm run test:browser` (Vitest browser, Chromium real)
- `E(archivo)` = `npx playwright test e2e/captura/<archivo>.spec.ts` (todos los proyectos de captura que lo seleccionan: Chromium escritorio y Pixel 7)
- `W` = `npx playwright test --project=captura-webkit`
- `VIS` = `npm run test:visual` (contenedor `mcr.microsoft.com/playwright:v1.63.0-noble`)
- `LH` = `npx @lhci/cli autorun --config=apps/pwa/lighthouserc.json`
- `M` = `npm run test:mutacion`
- `P` = `npm run check:privacidad`; `L` = `npm run check:licencias`

Toda propiedad usa `numRuns >= 1000` salvo que se indique otra cosa; las metamórficas usan las semillas literales de su escenario. "Vacuidad" = proporción de casos útiles medida con contadores y comprobada con `expect` tras `fc.assert`. Nombre de cada prueba: `"<ID> <escenario>"`.

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| CAM-01 | E2E: manifiesto, shell sin conexión, caché limitada | Playwright | E(pwa) | 3 de 3 escenarios en verde en los dos dispositivos |
| CAM-02 | Unitaria: 4 combinaciones de entorno | Vitest | U | 4 de 4 `toStrictEqual` |
| CAM-02 | E2E: origen HTTP `lector.test` y navegador sin `getUserMedia` | Playwright | E(camara) | 2 de 2 en verde; espía con 0 llamadas |
| CAM-03 | E2E: sin cámara antes del clic, restricciones exactas, vídeo en línea | Playwright | E(camara) | 3 de 3; argumento `toStrictEqual` al literal |
| CAM-03, CAM-10 | Unitaria en navegador con la cámara simulada: restricciones exactas y parada de pistas del módulo de cámara | Vitest browser | B | argumento `toStrictEqual` al literal; todas las pistas `ended` |
| CAM-04 | Unitaria: 5 resoluciones | Vitest | U | 5 de 5 |
| CAM-04 | E2E: aviso con `nitida-720p`, sin aviso con `nitida-1080p` | Playwright | E(camara) | texto exacto; 0 elementos con "Tu cámara entrega" en 1080p |
| CAM-05 | Unitaria: 8 rechazos clasificados con su texto | Vitest | U | 8 de 8 `toStrictEqual` |
| CAM-05 | E2E: permiso denegado y reintento | Playwright | E(camara) | 2 llamadas; pantalla `activo` |
| CAM-06 | E2E con instrumentación: con, sin y rechazo de enfoque continuo | Playwright | E(camara) | 1 llamada exacta; 0 llamadas; pantalla `activo` |
| CAM-07 | Unitaria en navegador: frame de captura 1920x1080 y de análisis 640x360 | Vitest browser | B | dimensiones y bytes exactos; color central con diferencia <= 3 |
| CAM-07 | E2E: `ImageCapture` sin usos; sin `input[type=file]` | Playwright | E(camara) | contador 0; 0 elementos en 4 pantallas |
| CAM-07 | E2E WebKit con `canvas.captureStream()` | Playwright WebKit | W | llega a `listo` |
| CAM-08 | Unitaria: 5 guías literales | Vitest | U | 5 de 5 `toStrictEqual` |
| CAM-08 | Propiedad: para W y H enteros en 320..4096, cada lado de la guía mide como máximo el 90 % del lado del frame más 0,5 px, está centrada (diferencia de márgenes <= 1) y su proporción difiere de 85,60/53,98 en menos de 2/min(ancho, alto) de la guía | fast-check | U | numRuns >= 1000; 0 fallos |
| CAM-08 | E2E: caja de la guía en pantalla | Playwright | E(guia) | tolerancia 1 px CSS en los dos dispositivos |
| CAM-08 | Regresión visual de `activo` con reflejo | Playwright `toHaveScreenshot` en contenedor | VIS | `maxDiffPixelRatio` 0.01 |
| CAM-09 | Accesibilidad: 5 pantallas x 2 dispositivos | @axe-core/playwright | E(accesibilidad) | 0 violaciones serious o critical |
| CAM-09 | E2E: región de estado única, botones >= 44 px, guía decorativa, `lang` y título | Playwright | E(accesibilidad) | todos los literales del escenario |
| CAM-09 | Regresión visual de `inicio`, `listo` y `error` | Playwright `toHaveScreenshot` en contenedor | VIS | `maxDiffPixelRatio` 0.01 |
| CAM-10 | E2E: pistas detenidas en `listo`, `Cancelar`, página oculta y "Continuar" | Playwright | E(ciclo-de-vida) | 3 de 3; todas las pistas `ended` |
| CAM-11 | E2E: red y almacenamiento durante el flujo completo | Playwright | E(privacidad) | 0 peticiones fuera de la lista; 0 WebSockets; almacenamiento vacío |
| CAM-11 | Seguridad estática: identificadores prohibidos en `packages/capture/src` y `apps/pwa/src` | Vitest (lectura de archivos) | U | 0 apariciones fuera de la excepción del service worker |
| CAM-11 | Privacidad del repositorio | `privacidad-check` | P | 0 hallazgos |
| CAM-11 | Unitaria en navegador: `liberar()` pone a cero 8294400 bytes | Vitest browser | B | 0 bytes distintos de 0; `liberada: true` |
| CAM-12 | Rendimiento y accesibilidad de la carga | Lighthouse CI | LH | performance >= 0,90; accesibilidad >= 0,95; script <= 307200 bytes |
| CAM-12 | E2E: Worker diferido | Playwright | E(privacidad) | 0 peticiones `calidad.worker` antes del clic; 1 después |
| CAL-01 | Unitaria: 8 dimensiones, 7 colores; exhaustiva de 256 grises | Vitest | U | 15 de 15 literales; 256 de 256 |
| CAL-02 | Unitaria: guía (166536), completo (4096), parcial (100), 4 inválidos | Vitest | U | literales exactos; error `cuadrilatero-invalido` en 4 de 4 |
| CAL-02 | Propiedad: para rectángulos de esquinas enteras dentro del frame, M = ancho x alto | fast-check | U | numRuns >= 1000 |
| CAL-03 | Unitaria: 4 patrones y 3 subscores | Vitest | U | literales exactos |
| CAL-03 | Metamórfica: desenfoque de caja 1, 2 y 3 veces sobre ruido (semillas 1 a 100) | Vitest | U | 100 de 100: razón <= 0,05 y no crecimiento |
| CAL-04 | Unitaria: 3 tamaños, dispersos, conectividad, umbral 249/250, fuera del cuadrilátero | Vitest | U | literales exactos |
| CAL-04 | Metamórfica: discos de radio 2, 4, 8 y 16 | Vitest | U | subscores no crecientes |
| CAL-05 | Unitaria: 5 grises y sombras recortadas | Vitest | U | literales exactos |
| CAL-05 | Metamórfica: brillo x1,2 sobre ruido (semillas 1 a 100) | Vitest | U | 100 de 100 |
| CAL-06 | Unitaria: 3 ratios y guía `null` | Vitest | U | literales exactos |
| CAL-07 | Unitaria: resultado completo, frame bueno, empate, lejano/suficiente | Vitest | U | `toStrictEqual` al literal |
| CAL-07 | Metamórfica: desenfoque fuerte 2 y 3 veces | Vitest | U | score < 70 y motivo `desenfocado` |
| CAL-07 | Propiedad: determinismo y score = mínimo | fast-check | U | numRuns >= 1000; 0 fallos |
| CAL-08 | Unitaria: valores por defecto, configuración inválida, sustitución parcial | Vitest | U | `toStrictEqual` a los literales |
| CAL-08 | Propiedad: `validarUmbrales` con `fc.anything()` nunca lanza y, si devuelve error, los vigentes no cambian; con parciales válidos por construcción devuelve `ok: true` | fast-check | U | numRuns >= 1000 cada una; vacuidad: válidos >= 50 % en la segunda |
| CAL-09 | Unitaria en navegador: transferencia, diferencial Worker contra directo, mensajes mal formados | Vitest browser | B | `byteLength` 0 tras enviar; igualdad profunda en todos los pares; 3 respuestas literales |
| CAL-10 | Unitaria: planificador rápido y lento | Vitest | U | listas de envíos exactas |
| CAL-10 | Propiedad: latencias y ticks arbitrarios nunca dejan 2 frames en vuelo ni envíos a menos de `intervaloMinimoMs` | fast-check | U | numRuns >= 1000 |
| CAL-10 | E2E: cadencia con `desenfocada-1080p` | Playwright | E(calidad) | 30 medidas: intervalos >= 100 ms; tramo total <= 5800 ms |
| CAL-11 | Unitaria: secuencias literales y revalidación | Vitest | U | cuentas y solicitudes exactas |
| CAL-11 | Propiedad: nunca captura sin racha | fast-check | U | numRuns >= 1000; vacuidad: >= 50 % de secuencias con racha |
| CAL-11 | E2E: `nitida-1080p` llega a `listo`; `desenfocada-1080p` no tras 30 medidas | Playwright | E(calidad) | en verde en los dos dispositivos |
| CAL-12 | Unitaria: 8 textos e histéresis | Vitest | U | literales exactos |
| CAL-12 | E2E: feedback con los 5 vídeos | Playwright | E(calidad) | 10 de 10 (5 vídeos x 2 dispositivos) |
| CAL-13 | Rendimiento: tiempo hasta `listo`, 20 ejecuciones por dispositivo | Playwright + `performance` | E(tiempo-a-listo) | p95 <= 3000 ms; mediana <= 2000 ms; reporte con 7 claves exactas |
| CAL-14 | Unitaria: detector por defecto | Vitest | U | literal con tolerancia 1e-9 |
| CAL-14 | Unitaria en navegador: Worker con detectores sustitutos; documento no encontrado | Vitest browser | B | literales exactos |
| CAL-14 | Contrato de tipos | Vitest typecheck | T | 0 errores inesperados; los `@ts-expect-error` se cumplen |
| CAL-15 | Contrato de tipos | Vitest typecheck | T | ídem |
| CAL-15 | E2E: sin peticiones de decodificadores | Playwright | E(privacidad) | 0 rutas con `zxing`, `barcode` o `.wasm` |
| CAL-01 a CAL-08, CAL-10 a CAL-12, CAM-02, CAM-04, CAM-05, CAM-08 | Mutación de `src/calidad` y `src/flujo` | Stryker | M | >= 85 % por archivo |
| Dependencias nuevas | Licencias | `licencia-check` | L y `node tools/licencia-check.mjs --package <x>` antes de instalar | 0 infracciones |

Cobertura: `npm test` mantiene 90/85/90/90 sobre `packages/*/src/**` (sin `navegador/`); `npm run test:browser` exige lo mismo sobre `packages/capture/src/navegador/**`.

## Risks / Trade-offs

- [Los parámetros de ffmpeg no producen el motivo esperado en algún vídeo] -> La tarea de vídeos se cierra solo cuando cada vídeo produce su motivo en E2E; se ajusta la escena, nunca los umbrales (decisión 11).
- [La conversión YUV a RGB de Chromium satura o recorta distinto de lo previsto (rango limitado frente a completo)] -> Escenas con luminancia acotada a 40..200 y reflejo con blanco puro; las pruebas literales de calidad no dependen de esa conversión.
- [El tiempo hasta `listo` y la cadencia dependen de la máquina y de la carga de agentes en paralelo] -> Umbrales con margen (p95 3 s frente a unos 0,5 s esperados); `describe` con `timeout: 60_000` (errores pasados de `CLAUDE.md`); los proyectos de rendimiento corren con `workers: 1`.
- [Pixel 7 en Playwright emula pantalla y agente de usuario, no la CPU de un celular] -> CAL-13 mide el pipeline, no un dispositivo; la meta real (95 % y mediana < 2 s en 5 modelos) se mide con el set de campo al cierre de la fase.
- [Sin detector, "Acerca la cédula" no aparece en la PWA] -> Declarado en CAL-06 y CAL-14; se cubre con detectores sustitutos en navegador; pregunta abierta 2.
- [Los valores por defecto de los umbrales no están calibrados y pueden rechazar cédulas reales (por ejemplo, el fondo claro de la digital)] -> Documentado como provisional; la calibración es condición de salida de la fase, no de este cambio.
- [C02 falla y 1920x1080 no da 2 px por módulo en el PDF417] -> Hipótesis registrada; el cambio de lectura de códigos la medirá con fixtures sintéticos impresos a escala.
- [`lib` DOM y WebWorker juntos en `tsconfig.base.json`] -> `skipLibCheck` ya activo; el archivo del Worker declara su alcance con un tipo propio (`DedicatedWorkerGlobalScope` mínimo) en lugar de depender de la combinación.
- [`@lhci/cli` sin publicaciones desde 2025-06] -> Uso solo en desarrollo; si deja de funcionar con Chromium 1.63, se sustituye por `lighthouse` directo (Apache-2.0) en un cambio aparte.
- [La regresión visual en Docker exige `npm ci` en cada ejecución] -> Aceptado (minutos); el volumen de `node_modules` puede hacerse con nombre si molesta.
- [El análisis estático de CAM-11 es por texto y se puede esquivar (`window["fe" + "tch"]`)] -> Es una red de seguridad; la garantía principal es la E2E de red y almacenamiento, y la revisión del `revisor-privacidad`.

## Migration Plan

No hay migración: todo es nuevo. Despliegue: la PWA se publica como sitio estático (`apps/pwa/dist`) detrás de HTTPS. Reversión: retirar el despliegue; el service worker se desregistra publicando un `sw.js` que llama a `self.registration.unregister()`.

## Open Questions

1. `PLAN.md` (sección 2.1) dice "Vite + React" y este diseño elige Preact. No cambia specs ni tareas (la UI es pequeña y `preact/compat` permite migrar), pero un humano debe ratificarlo o pedir React.
2. "Acerca la cédula" solo se emite con un detector. Si se quiere en la PWA antes del cambio de detección, haría falta una heurística sin modelo (por ejemplo, densidad de bordes dentro de la guía), que este cambio no incluye.
3. Textos de exposición añadidos a los cuatro pedidos: "Busca un lugar con más luz" y "Hay demasiada luz", y el intermedio "No te muevas". Revisión de redacción por quien lleve UX y accesibilidad.
4. Cuando el cambio `generador-fixtures-sinteticos` produzca imágenes de cédulas sintéticas, ¿se sustituye `testsrc2` por esas imágenes en los vídeos? Los motivos esperados no cambiarían.
5. ¿WebKit (`captura-webkit`) bloquea la integración o solo informa? Hoy no está instalado en esta máquina.

## Decisiones del orquestador (2026-10-06, pendientes de ratificación humana)

- Pregunta 1: se ratifica Preact 10.29.8 (MIT) en lugar de React, por peso en móvil; PLAN.md decía React.
- Pregunta 2: "Acerca la cédula" queda para el cambio de detección de documento; no se añade heurística sin modelo.
- Pregunta 3: los textos añadidos se aceptan provisionalmente; revisión de redacción en la fase de endurecimiento.
- Pregunta 4: se aceptan los umbrales por defecto como provisionales; la calibración con DLC-2021 y el set de campo es condición de salida de la Fase 2.
- Pregunta 5: C02 queda como hipótesis; si el set de campo la refuta, se pide 4K.
- Pregunta 6: la prueba en WebKit y el umbral de tiempo en Pixel 7 informan pero no bloquean hasta tener dispositivo real.
- Pregunta 7: ffmpeg (componentes GPL) se acepta solo como herramienta de desarrollo en Docker; no se distribuye.
- Pregunta 8: Lighthouse CI se mantiene.
- Pregunta 9: sí; los vídeos de prueba pasarán a cédulas sintéticas cuando el generador produzca imágenes.
- Ejecución: el implementador de este cambio arranca cuando termine el del generador, para no correr dos `npm install` a la vez sobre el lockfile.
