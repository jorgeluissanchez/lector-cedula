# Design: pwa-lectura-offline

## Contexto

`captura-calidad-pwa` (en curso, otro agente) entrega `CapturaAceptada` y la interfaz `LectorCodigos` sin implementación (CAL-15). Los lectores y parsers ya funcionan en Node (`tools/leer-foto.mjs`). Este cambio los lleva al navegador dentro de un Worker y hace la PWA completamente utilizable sin red. Restricciones: constitución (principios II, III, IV, V), `CLAUDE.md` (reglas 3 y 5), skills `captura-movil`, `privacidad-check`, `licencia-check`, `estrategia-pruebas`.

## Decisiones

1. **Worker lector dedicado** (`packages/capture/src/lectura/worker-lector.ts`, emitido como `assets/lector.worker-<hash>.js`). Recibe el `ArrayBuffer` RGBA transferido, ejecuta PDF417 → MRZ → parser, responde solo el resultado enmascarado y pone a cero sus buffers (OFF-06, OFF-11, OFF-14). Un solo worker de tesseract.js se crea dentro de él la primera vez y se reutiliza.
2. **Orquestación pura y compartida**: `leerDocumento(pixeles, deps, { fechaReferencia, senal })` en `src/lectura/leer.ts`, con dependencias inyectadas (decodificador, lector MRZ, parsers, DIVIPOL). Se usa en el Worker y en Node (prueba diferencial contra la CLI, OFF-08). La CLI no cambia de salida.
3. **Máscara única** en `src/lectura/mascara.ts`, extraída de `tools/leer-foto.mjs`, que pasa a importarla (OFF-09). La PWA no tiene opción sin máscara.
4. **Rutas locales de tesseract.js**: `workerPath`, `corePath` (directorio con `simd-lstm` y `lstm`), `langPath` apuntando a `/assets/`, `gzip: false`, `cacheMethod: "none"` (OFF-04). Así tesseract no usa IndexedDB (OFF-11) ni CDN. Vite copia los archivos con hash mediante `plugin-pwa.ts`; como tesseract construye el nombre del core y del `.traineddata`, el plugin genera un mapa `nombre lógico → ruta con hash` y el Worker lector reescribe las URLs con un `fetch` interceptado por nombre (o, si tesseract no lo permite, se emiten en `assets/tesseract/<version>/` sin hash y con la versión en la ruta; ver pregunta abierta 3).
5. **zxing-wasm** con `prepareZXingModule({ overrides: { locateFile } })` apuntando a `/assets/zxing_reader-<hash>.wasm`; `formats: ["PDF417"]` (OFF-07).
6. **DIVIPOL**: la tabla generada (`tabla.generated.ts`, ~32 KB) entra en un chunk `divipol-<hash>.js` importado solo por el Worker lector (OFF-08, CAM-12).
7. **Manifiesto de precaché con SHA-256** generado por `plugin-pwa.ts` en `generateBundle`: `{ version, entradas: [{ ruta, bytes, sha256 }] }`. El service worker lo importa en compilación (no hay petición extra), descarga cada entrada con `cache: "no-store"`, verifica tamaño y digest con `crypto.subtle.digest("SHA-256")` y solo entonces hace `cache.put`. Cualquier fallo rechaza `install` (OFF-01, OFF-02, OFF-17). Las respuestas se escriben primero en una caché temporal `lector-<version>-pendiente` que se renombra (copia y borra) al terminar; si `install` falla se borra.
8. **Worker de calidad precacheado** (OFF-01): supersede los escenarios de CAM-01 "Precarga sin el Worker de calidad" y CAM-12 "Worker diferido". La página sigue sin cargar el Worker de calidad hasta "Iniciar cámara"; la descarga ocurre en el `install` del service worker, que no cuenta en el JavaScript de carga inicial que mide Lighthouse. Al archivarse `captura-calidad-pwa`, la tarea 8.2 convierte esto en un delta MODIFIED.
9. **Indicador sin conexión** (OFF-03): la página pregunta al service worker por `postMessage({ tipo: "estado-precache" })`; responde `lista` solo si todas las rutas están en la caché activa.
10. **Cuota** (OFF-16): la página llama `navigator.storage.estimate()` y, si basta, `navigator.storage.persist()` (sin bloquear si se niega) antes de registrar el service worker.
11. **Fecha de referencia** (OFF-08): `Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" })` en la página, enviada al Worker.
12. **Ciclo de vida** (OFF-11): `visibilitychange` a `hidden` en `resultado` o `leyendo` cancela, borra el estado y vuelve a `inicio`.
13. **Vídeos sintéticos de cédula** (tarea 1.2): `e2e/videos/generar.mjs` añade tres escenas a partir de PNG sintéticos renderizados por el helper de PDF417 de las pruebas y por `evals/sinteticos/render-mrz.mjs`, colocados en la guía de CAM-08, convertidos a `.y4m` con ffmpeg en Docker. Se generan en `e2e/videos/sinteticos/` (ignorado por git).

## Riesgos

- `mrz.traineddata` pesa 11,4 MB: domina la precaché (~18,6 MB en total estimado). Mitigación: presupuesto de 20 MiB (OFF-16) y pregunta abierta 1.
- Emulación de Pixel 7 no reproduce el rendimiento real; los tiempos de OFF-15 son metas provisionales a recalibrar con el set de campo.
- Dos variantes de core (`simd-lstm`, `lstm`) suman ~5,7 MB; sin la `lstm`, un navegador sin SIMD no leería la digital sin red.
- Conflicto con el cambio en curso `captura-calidad-pwa` (decisión 8).

## Pruebas

Según el principio II y la fila "Captura web" de la matriz de `.claude/skills/estrategia-pruebas/SKILL.md` (más diferencial y seguridad estática). Comandos:

- `U` = `npx vitest run packages/capture apps/pwa tools` (Node: unitarias, propiedades, diferencial contra la CLI, análisis estático)
- `T` = `npx vitest run --typecheck.only packages/capture` (contrato de tipos)
- `B` = `npm run test:browser` (Vitest browser, Chromium real: Worker lector, WASM, `crypto.subtle`)
- `E(archivo)` = `npx playwright test e2e/lectura/<archivo>.spec.ts` (proyectos `lectura-chromium` y `lectura-pixel7`)
- `LH` = `npx @lhci/cli autorun --config=apps/pwa/lighthouserc.json`
- `M` = `npm run test:mutacion` (añade `packages/capture/src/lectura/**/*.ts` y `apps/pwa/src/precache/**/*.ts` a `mutate`)
- `P` = `npm run check:privacidad`; `L` = `npm run check:licencias`
- `EV` = `npm run eval:quick`

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| OFF-01 | Unitaria (lista de precarga desde la compilación) | Vitest | `U` | 10 patrones con exactamente 1 coincidencia cada uno |
| OFF-01 | E2E (todo en caché; activación bloqueada) | Playwright | `E(precache)` | Verde en Chromium y Pixel 7 |
| OFF-02 | Unitaria + propiedad (`verificarEntrada`: digest correcto acepta, cualquier byte cambiado rechaza) | Vitest, fast-check | `U` | numRuns >= 1000; 0 falsos positivos |
| OFF-02 | Unitaria en navegador (`crypto.subtle` real) | Vitest browser | `B` | Verde |
| OFF-02 | E2E (recurso alterado) | Playwright | `E(precache)` | 0 cachés `lector-*` |
| OFF-02 | Mutación | Stryker | `M` | >= 85 % en `src/precache` |
| OFF-03 | E2E + accesibilidad (indicador) | Playwright, axe | `E(precache)` | Verde; 0 serious/critical |
| OFF-04 | E2E (sin terceros; respuestas desde SW) | Playwright | `E(red)` | 0 peticiones a otro origen; 0 en el servidor durante la lectura |
| OFF-04 | Seguridad estática (sin URLs de CDN ni `tessdata` en `dist`) | Vitest | `U` | 0 coincidencias |
| OFF-05 | E2E (claves de caché) | Playwright | `E(privacidad)` | Conjunto igual al manifiesto |
| OFF-06 | Unitaria (orden y cortocircuitos con dependencias inyectadas) | Vitest | `U` | 3 escenarios verdes |
| OFF-06 | Unitaria en navegador (Worker real con zxing-wasm y tesseract.js reales) | Vitest browser | `B` | Amarilla y digital sintéticas leídas |
| OFF-06 | Mutación | Stryker | `M` | >= 85 % en `src/lectura` |
| OFF-07 | Unitaria (espía de `formats`); contrato de tipos (`"qr"` es error) | Vitest | `U`, `T` | `["PDF417"]` exacto |
| OFF-07 | Unitaria en navegador (imagen con solo QR) | Vitest browser | `B` | `SINTETICO-QR` ausente |
| OFF-08 | Diferencial PWA contra CLI | Vitest (lanza `npm run leer-foto`) | `U` | `toStrictEqual` en amarilla y digital; `timeout: 60_000` |
| OFF-08 | Eval de campo sin regresión | `eval-campo` | `EV` | Sin regresión frente a `baseline.json` |
| OFF-09 | Unitaria (literales) + propiedad (longitud conservada, solo 2 últimos visibles) | Vitest, fast-check | `U` | numRuns >= 1000 |
| OFF-09 | E2E (pantalla de resultado) | Playwright | `E(lectura)` | Verde en Chromium y Pixel 7 |
| OFF-09 | Mutación | Stryker | `M` | >= 85 % en `mascara.ts` |
| OFF-10 | Metamórfica (giro 90/270 no cambia el resultado) | Vitest browser | `B` | Igualdad estricta |
| OFF-10 | E2E (digital girada) | Playwright | `E(lectura)` | Igual a `digital-1080p` |
| OFF-11 | E2E (almacenamiento vacío; página oculta) | Playwright | `E(privacidad)` | 0 entradas |
| OFF-11 | Unitaria (bytes a cero) | Vitest | `U` | 100 % de bytes en 0 |
| OFF-11 | Seguridad estática | `privacidad-check` | `P` | 0 infracciones; la regla nueva se ve fallar con un caso sintético |
| OFF-12 | E2E (online → `setOffline(true)` → recarga → lectura; página nueva offline) | Playwright | `E(offline)` | Resultado idéntico como cadena, amarilla y digital |
| OFF-13 | Unitaria (tabla de errores) + E2E (vídeo sin documento) | Vitest, Playwright | `U`, `E(errores)` | 4 códigos + `motor` por defecto |
| OFF-14 | E2E de rendimiento (long tasks) y cancelación | Playwright | `E(lectura)` | 0 tareas > 200 ms; vuelta a `activo` < 1 s |
| OFF-15 | Rendimiento | Playwright + CDP | `npx playwright test e2e/lectura/tiempos.spec.ts --project=lectura-pixel7` | p95 1500 / 5000 / 10000 ms |
| OFF-16 | Unitaria (suma del manifiesto) + E2E (cuota) | Vitest, Playwright | `U`, `E(precache)` | <= 20971520 bytes |
| OFF-16 | Rendimiento web | Lighthouse CI | `LH` | script <= 307200 bytes; performance >= 0,90 |
| OFF-17 | E2E (actualización fallida) | Playwright | `E(actualizacion)` | `lector-A` intacta; lectura offline verde |
| OFF-18 | Accesibilidad | @axe-core/playwright | `E(accesibilidad)` | 0 serious/critical en 3 pantallas, 2 proyectos |
| OFF-22, OFF-25 | Unitaria (Worker en Node con frames sintéticos degradados: gaussiano, movimiento, reflejo, oscuro, sobreexpuesto) | Vitest | `npx vitest run packages/capture/test/lectura/off-25-filtros-estrictos.test.ts packages/capture/test/lectura/off-22-presencia.test.ts` | cédulas suaves (varianza 27 a 152): score >= 70 y motivo null con y sin presencia; más suaves: `desenfocado`; movida: `desenfocado`; reflejo sobre la MRZ: `reflejo`; oscura: `oscuro`; sobreexpuesta: `sobreexpuesto`; sin cédula < 70; presencia nunca evaluada bajo el umbral |
| CAL-03, CAL-07, CAL-08 (delta) | Unitaria con los literales recalibrados | Vitest | `npx vitest run packages/capture/test/cal-03-nitidez.test.ts packages/capture/test/cal-07-score.test.ts packages/capture/test/cal-08-umbrales.test.ts` | escenarios literales; tabla de `docs/decisiones/2026-10-06-umbrales-calidad-captura.md` igual a los valores por defecto |
| CAL-08, NAT-03 | Unitaria (JSON generado para el núcleo nativo sin desfase) | Vitest, Kotest | `npx vitest run packages/nucleo-js/test/nat-03-umbrales.test.ts`, `KJ` | JSON idéntico al generado; Kotlin con 8 y 35 y sin `laplacianoMinimoGuiado` |
| OFF-25 | E2E (vídeos suaves; vídeos que no deben disparar) | Playwright | `npx playwright test e2e/lectura/suave-amarilla.spec.ts e2e/lectura/suave-digital.spec.ts e2e/lectura/desenfocada.spec.ts e2e/lectura/sin-documento.spec.ts --project=lectura-chromium --workers=1` | suaves: `listo` y `resultado`; desenfocada y sin documento: sin `listo`, con su feedback |
| OFF-25 | Eval (sin lecturas falsas; sin regresión por campo) | corredores de `evals/` | `npm run eval:mrz-imagen`, `npm run eval:quick` | 0 lecturas falsas; sin regresión frente a `baseline.json` |
| OFF-26 | Unitaria (política y reductor) + E2E (tarjeta ilegible) | Vitest, Playwright | `npx vitest run apps/pwa/test/off-26-reintentos.test.ts`, `E(errores)` | decisiones literales; dos `leyendo` antes de `error-lectura` |
| OFF-27 | Unitaria (orden y número de llamadas con dependencias inyectadas; mensaje del Worker lector; `contenido` del Worker de calidad) + cliente | Vitest | `npx vitest run packages/capture/test/lectura/off-27-pista.test.ts apps/pwa/test/off-27-29-diagnostico-cliente.test.ts` | escenarios literales |
| OFF-28 | Unitaria con frames sintéticos de vídeo (módulos de 2 px, sigma 1,3 y JPEG 60; sigma 1,2 y JPEG 45) y sin lecturas falsas | Vitest + zxing-wasm real | `npx vitest run packages/capture/test/pdf417/off-28-realce.test.ts` | sin realce `pdf417-no-encontrado`, con realce bytes exactos; 0 lecturas falsas |
| OFF-28 | Unitaria (foto: `takePhoto` con la resolución máxima, límite y respaldo; secuencia de frames) | Vitest | `npx vitest run packages/capture/test/lectura/off-28-foto.test.ts apps/pwa/test/off-28-secuencia.test.ts` | escenarios literales; frames a cero |
| OFF-28, CAM-07 | E2E (`ImageCapture` solo para la lectura; amarilla suave; tarjeta ilegible sin lecturas falsas) | Playwright | `npx playwright test e2e/captura/camara.spec.ts --project=captura-nitida-1080p-escritorio`, `E(suave-amarilla)`, `E(errores)` | verde |
| OFF-29 | E2E (panel solo con `?debug=1`, sin datos ni imágenes) + unitaria (líneas de solo números y códigos) | Playwright, Vitest | `E(diagnostico)` | verde; mutante "panel siempre visible" detectado |
| Todos | Licencias y privacidad del repositorio | `licencia-check`, `privacidad-check` | `L`, `P`, `npm run check` | 0 infracciones |

## Decisiones humanas (2026-10-07)

- Se acepta la precaché de unos 19 MB (incluye `mrz.traineddata` de 11,4 MB); el tope de 20 MiB de OFF-16 se mantiene.
- Se precachean las dos variantes del core de tesseract (`simd-lstm` y `lstm`) para leer sin red también en navegadores sin SIMD.
- El Worker de calidad se precachea (OFF-01); reemplaza los escenarios CAM-01 "Precarga sin el Worker de calidad" y CAM-12 "Worker diferido" de `captura-calidad-pwa`.

## Decisiones del 2026-10-08 (reporte del usuario: la amarilla no se lee en Android)

- OFF-27: la presencia ya sabe si ve un PDF417 o una MRZ; ese `contenido` viaja como `pista` hasta `leerDocumento`, que empieza por ese lector. Medido en Node (Chromium escritorio, 3 repeticiones, frame de 1920x1080): digital sin pista 3742 a 4576 ms, con pista `mrz` 2818 a 3520 ms; en la PWA (`?debug=1`, `digital-1080p`) la digital con pista tarda 2934 a 3155 ms.
- OFF-28 (a): `ImageCapture.takePhoto` con la resolución máxima de `getPhotoCapabilities` para el frame de lectura de la amarilla, antes de detener las pistas (CAM-10 no cambia) y con respaldo al frame del vídeo; las restricciones de `getUserMedia` de CAM-03 no cambian. CAM-07 se modifica (delta en `captura-camara`).
- OFF-28 (b): la ampliación bilineal sola no recupera un PDF417 de 2 px por módulo desenfocado (probado con x2 y x3 y ambos binarizadores); lo que sí lo recupera es el enfoque horizontal (unsharp mask) tras el estiramiento de contraste. Se activa solo en el Worker de la PWA (`realce: true`) para no cambiar el orden de LPI-11 de la CLI. Amarilla sintética de vídeo (sigma 1,3, JPEG 60): antes `mrz-no-encontrada` tras 16592 a 17291 ms (PDF417 sin éxito y respaldo MRZ); después `realce-x2` en 865 a 980 ms.
- OFF-28 (c): con `amarilla-suave-1080p` se vio que un respaldo MRZ en el primer frame (11,5 s) agotaba el presupuesto de frames; el respaldo pasa a hacerse una sola vez al final, sobre el primer frame. Con la secuencia, la misma escena se lee en el tercer frame (unos 4,1 s) cuando los dos primeros fallan.
- OFF-29: `?debug=1` para diagnosticar en el celular sin datos personales: solo resoluciones, códigos y tiempos, en memoria.

## Recalibración estricta de la nitidez (2026-10-10, tarea 5.8)

Decisión del usuario del 2026-10-07: nitidez, iluminación, reflejo y movimiento bloquean siempre; la presencia es una condición adicional, nunca un sustituto. Se elimina la captura guiada (OFF-25 anterior: score elevado a `umbralListo` con presencia y varianza >= `LAPLACIANO_MINIMO_GUIADO` 12) y se recalibran los umbrales de CAL-08 (delta MODIFIED de `calidad-captura`). Detalle en `docs/decisiones/2026-10-10-recalibracion-nitidez.md`.

| Umbral | Antes | Ahora |
|---|---|---|
| `laplacianoDesenfocado` | 40 | 8 |
| `laplacianoNitido` | 200 | 35 |
| Varianza con score 70 | 152 | 27 |
| `LAPLACIANO_MINIMO_GUIADO` | 12 | eliminado |

Mediciones (varianza del Laplaciano en el frame de análisis de 640 px, dentro de la guía):

- Fotos reales del usuario (fuera del repositorio, solo números): 326 a 798 con el realce de la app de cámara; con un desenfoque adicional de sigma 1 (equivalente al vídeo en vivo), 28 a 56; con sigma 1,5, 12 a 20. El 27 deja pasar las primeras y frena las segundas.
- Sintéticas degradadas (ruido +-4, JPEG 50): digital sigma 1,5: 33,4; digital girada sigma 1: 46,9; amarilla sigma 1,5: 71,9; amarilla al 20 % sigma 0,75: 49,9 (todas disparan). Amarilla al 20 % sigma 1: 25,1; digital sigma 2: 14,5; movimiento diagonal 9 px + sigma 1: 21,5; horizontal 15 px + sigma 1: 25,6 (todas `desenfocado`).
- Vídeos: `amarilla-suave-1080p` 77,9 y `digital-suave-1080p` 128,6 (score antes 24 y 55; ahora 100 y 88); `desenfocada-1080p` 5,0; `amarilla-1080p` con sigma 6 (NAT-03) 19,4, que sigue en `desenfocado` también con presencia.
- Límite conocido: un movimiento puro en un solo eje conserva la energía del eje perpendicular (horizontal 15 px sin desenfoque: 229) y no se detecta; si no se lee, OFF-26 reintenta.

Efecto en el núcleo nativo (`sdk-nativo`, NAT-03): el JSON generado pierde `laplacianoMinimoGuiado` y Kotlin aplica la misma regla; el escenario "Desenfoque con documento presente" de `sdk-nativo` se ajusta en su spec delta.
