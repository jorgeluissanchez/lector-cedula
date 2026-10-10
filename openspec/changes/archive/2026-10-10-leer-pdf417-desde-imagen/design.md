# Design: leer-pdf417-desde-imagen

## Context

`parsearPdf417Amarilla` (packages/parsers) recibe bytes crudos ISO-8859-1. Falta pasar de una foto a esos bytes. La skill `captura-movil` fija zxing-cpp (vía zxing-wasm, reader de 1,04 MiB) como decodificador web, con tolerancia limitada a la rotación (unos 3°, issue #145) y la necesidad de unos 2 px por módulo.

## Goals / Non-Goals

- Goals: decodificar PDF417 desde PNG/JPEG en Node y desde `ImageData` en navegador; CLI local para fotos reales; pruebas solo sintéticas.
- Non-Goals: corrección de perspectiva, detección del documento, integración en el flujo de auto-captura de la PWA (cambio posterior), ML Kit nativo, interpretar el payload.

## Decisions

1. **Ubicación: `packages/capture/src/pdf417/`, no `packages/parsers`.** Los parsers son puros, sin E/S ni WASM (CLAUDE.md, principio VII). Decodificar una imagen es parte de la captura y el flujo de `captura-calidad-pwa` ya prevé una interfaz de lectura de códigos que este módulo implementará. No se crea `packages/lector` para no abrir un paquete con un solo archivo.
2. **Bytes, no texto.** `text` de zxing aplica una decodificación de caracteres que puede alterar bytes >= 0x80 (Ñ) y el bloque binario; el parser espera bytes crudos (LPI-01).
3. **Reintentos explícitos con escala 0,75 y 0,5** además de `tryHarder`/`tryRotate`: fotos de móvil de alta resolución con ruido decodifican a veces mejor reducidas. El escalado se hace por intento para que el orden sea observable y probable (LPI-02). En Node el PNG/JPEG se pasa tal cual a `readBarcodes` en el intento original; para los reescalados se decodifica a píxeles con el propio lector solo si zxing-wasm lo permite, y si no, se pasa `downscaleFactor`/`downscaleThreshold` equivalentes (ver pregunta abierta 1).
4. **Inyección de dependencia** del `readBarcodes` (parámetro opcional interno o fábrica `crearDecodificador({ readBarcodes })`) para las pruebas de LPI-02 sin mocks de módulo.
5. **CLI en `tools/leer-foto.mjs`** con script raíz `"leer-foto": "tsc -b && node tools/leer-foto.mjs"`, siguiendo el patrón de `npm run demo`. Lee el archivo con `fs.readFile` a memoria; no crea archivos temporales. El rechazo de rutas dentro del repositorio (salvo `evals/real/`, ignorado por git) evita que una foto real acabe versionada por descuido (principio III).
6. **Imágenes sintéticas en pruebas**: generadas en la prueba con `writeBarcode` del mismo paquete zxing-wasm (`zxing-wasm/writer` o el build `full`), desde `generarPdf417`. Ninguna imagen se guarda en el repositorio. Las metamórficas corren en Vitest browser (Chromium real) porque canvas 2D da rotación, blur (`filter: blur()`), brillo y JPEG sin dependencias nuevas.
7. **Carga diferida**: `import("zxing-wasm/reader")` dinámico dentro de la función (LPI-08).

## Risks / Trade-offs

- [El writer de zxing-wasm podría no aceptar `Uint8Array` binario] -> la tarea 1 lo comprueba primero; si no, se usa una cadena latin1 con ECI ISO-8859-1 y se documenta.
- [Las fotos reales pueden fallar por perspectiva] -> fuera de alcance; la CLI informa `pdf417-no-encontrado` y nunca inventa datos (LPI-04).
- [La CLI imprime datos personales en la terminal del usuario] -> es la salida pedida; no se escribe a disco ni a logs. Ver pregunta abierta 2.

## Pruebas

Comandos: `U` = `npx vitest run packages/capture/test/pdf417 tools/test/leer-foto.test.mjs`; `B` = `npm run test:browser -- packages/capture/test-browser/pdf417`; `M` = `npm run test:mutacion` (mutate `packages/capture/src/pdf417/**`); `L` = `npm run check:licencias`; `P` = `npm run check:privacidad`.

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| LPI-01 | Unitaria (round-trip, Ñ) | Vitest + zxing-wasm writer | `U` | 2/2 escenarios verdes, `toStrictEqual` |
| LPI-01 | Propiedad (round-trip generador -> imagen -> bytes) | fast-check | `U` | numRuns >= 50 (coste WASM), semillas y 4 variantes de `generarPdf417`, 0 fallos |
| LPI-02 | Unitaria con `readBarcodes` inyectado | Vitest | `U` | 2/2 escenarios verdes |
| LPI-03 | Unitaria de errores | Vitest | `U` | 4 literales exactos |
| LPI-03 | Propiedad "nunca lanza" | fast-check | `U` | 200 + 200 runs, 0 excepciones |
| LPI-03 | Unitaria en navegador (ImageData) | Vitest browser, Chromium | `B` | verde |
| LPI-04 | Metamórfica (7 distorsiones leves + fuerte) | Vitest browser, canvas 2D | `B` | 7/7 iguales a `F.bytes`; fuerte nunca da otros bytes |
| LPI-05 | Integración imagen -> parser | Vitest | `U` | campos iguales a `F.esperado` |
| LPI-06 | Integración de CLI (proceso hijo, `{ timeout: 60_000 }`) | Vitest + `child_process` | `U` | códigos 0/1/64 y stdout exactos |
| LPI-07 | Integración de CLI y espías de consola | Vitest | `U` | 0 archivos nuevos o modificados; 0 llamadas a consola |
| LPI-07 | Privacidad estática | `privacidad-check` | `P` | 0 hallazgos |
| LPI-08 | Licencias | `licencia-check` | `L` | 0 infracciones |
| LPI-08 | Unitaria de carga diferida | Vitest `vi.mock` | `U` | contador = 0 |
| LPI-01..03 | Mutación | Stryker | `M` | mutation score >= 85 % en `src/pdf417` |

Datos: solo `@lector-cedula/fixtures`; ninguna imagen en el repositorio. Las fotos reales que el usuario pruebe con la CLI quedan fuera del repo o en `evals/real/` y no forman parte de ninguna prueba automática.

## Decisiones del orquestador (pendientes de ratificación humana)
1. Se aprueban pngjs y jpeg-js (MIT, verificar con licencia-check) para pasar PNG/JPEG a píxeles en Node y cumplir LPI-02.
2. La CLI enmascara por defecto NUIP y nombres (p. ej. 9999****56, P***** E******); `--sin-mascara` los muestra completos. Ajustar LPI-06 con su escenario.
3. Se aprueba rechazar rutas del repositorio salvo evals/real/.
4. Se acepta numRuns >= 50 en la ida y vuelta con WASM.
5. Si el writer no acepta binario, latin1 con ECI. (Comprobado en la tarea 1.1: el writer acepta `Uint8Array` binario; no hace falta ECI.)
6. (Tarea 3.1) En Chromium, zxing-wasm decodifica S girada hasta 2° pero no a 2,5° ni 3°, así que LPI-04 fallaba. Se añaden dos intentos tras las escalas: giro +2° y giro -2° de la imagen original (LPI-01, LPI-02 y sus escenarios actualizados en la spec delta). Coste: hasta dos lecturas más solo cuando las tres primeras fallan.

## Informe de mutación reproducible de `packages/capture/src/pdf417` (2026-10-07, agente de parser-pdf417-amarilla)

Configuración (en el scratchpad del agente: `scratchpad/pdf417/stryker-captura.mjs` y `vitest-captura.mjs`): `mutate` = `packages/capture/src/pdf417/**/*.ts` (4 archivos, 806 mutantes); pruebas = `packages/capture/test/pdf417/*.test.ts`; `vitest.related: false` (las pruebas importan el índice del paquete); `dryRunTimeoutMinutes: 30`; `testNamePattern` excluye "foto grande", "CLI" y "D-EXIF", porque con instrumentación cada una pasa de 10 min.

Resultado: **no terminó en 60 min y no hay score por archivo**. Ninguna corrida pasó de la corrida en seco:

| Intento | Inicio | Resultado |
|---|---|---|
| 1 | 13:03 | Falla en seco: "LPI-02 Giros tras las escalas" (3 elementos en vez de 4). Con Vitest normal pasó un minuto después: el archivo se estaba editando |
| 2 | 13:23 | Falla en seco: "LPI-11 Banda primero en foto grande" excede 600 s con instrumentación |
| 3 | 13:45 | Falla en seco a las 14:05: "LPI-02 Orden de reintentos" (`['1920x1080','1440x810']` frente a tres escalas). Prueba en edición por otro agente |

Pendiente: repetir `npx stryker run scratchpad/pdf417/stryker-captura.mjs` cuando `packages/capture/test/pdf417/decodificar.test.ts` esté estable; la parte de `src/pdf417-amarilla` y del adaptador terminó (99,88 %, ver `design.md` de parser-pdf417-amarilla).
