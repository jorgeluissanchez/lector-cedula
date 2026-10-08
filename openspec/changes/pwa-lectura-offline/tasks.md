# Tasks

Reglas para todas las tareas: TDD (principio II): la prueba se escribe y se ve fallar antes de implementar; las E2E generadas sobre la app ya construida se ven fallar contra un mutante manual temporal indicado en la tarea y revertido antes del commit. Datos sintéticos de `@lector-cedula/fixtures` y `evals/sinteticos/`; ningún dato real. Código con `\` o escapes `\u` se escribe con la herramienta de escritura de archivos y se comprueban los bytes. Toda prueba que lance procesos o navegadores declara `{ timeout: 60_000 }` en su `describe`. E2E con los agentes `playwright-test-planner` (plan en `e2e/planes/pwa-lectura-offline.md`), `-generator` y `-healer`; esperas por condición, nunca `waitForTimeout`. Comandos `U`, `T`, `B`, `E(archivo)`, `LH`, `M`, `P`, `L`, `EV` y tabla por requisito: `design.md`, `## Pruebas`. No tocar `openspec/changes/captura-calidad-pwa/`.

## 1. Fixtures y andamiaje

- [x] 1.1 Crear `packages/capture/src/lectura/` y su export en `index.ts`; añadir proyectos `lectura-chromium` y `lectura-pixel7` a `playwright.config.ts` (testDir `e2e/lectura`, vídeo por proyecto). Cubre: base de OFF-06. Tipos de prueba: ninguno de comportamiento; humo de configuración. Verificación: `npm run typecheck` y `npx playwright test e2e/lectura --list` con código 0.
- [x] 1.2 Extender `e2e/videos/generar.mjs` con `amarilla-1080p`, `digital-1080p` y `digital-girada-90-1080p` desde PNG sintéticos de `PERSONA_BASE` (design.md, decisión 13), con su prueba en `tools/test/` que comprueba cabecera y dimensiones `.y4m` (`leerCabeceraY4m`) y que la imagen fuente contiene NUIP `^9999`. Cubre: fixtures de OFF-09, OFF-10, OFF-12, OFF-15. Tipos de prueba: **unitaria**. Verificación: `npm run e2e:videos` y `npx vitest run tools` en verde.

## 2. Núcleo puro de lectura (Node)

- [x] 2.1 Escribir las unitarias de OFF-09 (dos escenarios de máscara literales) y la propiedad de máscara; verlas fallar; extraer `src/lectura/mascara.ts` y hacer que `tools/leer-foto.mjs` la importe sin cambiar su salida. Cubre OFF-09 (núcleo). Tipos de prueba: **unitaria**, **propiedad**. Verificación: `U` en verde; las pruebas existentes de la CLI siguen verdes.
- [x] 2.2 Escribir las unitarias de OFF-06 (orden, cortocircuitos) y OFF-07 (espía de `formats`; tipo `"qr"` con `@ts-expect-error`) con dependencias inyectadas; verlas fallar; implementar `leerDocumento` en `src/lectura/leer.ts` y el `LectorCodigos` PDF417. Cubre OFF-06, OFF-07. Tipos de prueba: **unitaria**, **contrato de tipos**. Verificación: `U` y `T` en verde.
- [x] 2.3 Escribir la prueba diferencial de OFF-08 contra `npm run leer-foto` (imágenes sintéticas en un temporal fuera del repo) y el escenario "Lugar desconocido"; verlas fallar; conectar parsers y DIVIPOL en `leerDocumento`. Cubre OFF-08. Tipos de prueba: **diferencial**, **unitaria**, **eval**. Verificación: `U` en verde y `EV` sin regresión.
- [x] 2.4 Escribir las unitarias de OFF-13 (tabla de errores) y OFF-11 "Bytes a cero"; verlas fallar; implementar `clasificarErrorLectura` y el manejador puro del Worker con borrado de buffers. Cubre OFF-11, OFF-13. Tipos de prueba: **unitaria**. Verificación: `U` en verde.
- [x] 2.5 Añadir `src/lectura/**` a `mutate` de Stryker y matar supervivientes. Cubre OFF-06, OFF-09, OFF-11, OFF-13. Tipos de prueba: **mutación**. Verificación: `M` con >= 85 % por archivo, sin bajar los demás.

## 3. Worker lector en navegador real

- [x] 3.1 Escribir `packages/capture/test-browser/off-06-worker-lector.browser.test.ts` (amarilla y digital sintéticas, imagen solo QR, giro 270) con zxing-wasm, tesseract.js y `mrz.traineddata` servidos desde el mismo origen; verla fallar; implementar `worker-lector.ts` con rutas locales (design.md, decisiones 1, 4, 5). Cubre OFF-06, OFF-07, OFF-10. Tipos de prueba: **unitaria en navegador**, **metamórfica**. Verificación: `B` en verde (requiere `npm run modelos:mrz`).

## 4. Precaché con integridad

- [ ] 4.1 Escribir las unitarias y la propiedad de `verificarEntrada` (OFF-02) y la prueba de navegador con `crypto.subtle`; verlas fallar; implementar `apps/pwa/src/precache/verificar.ts`. Cubre OFF-02. Tipos de prueba: **unitaria**, **propiedad**, **unitaria en navegador**. Verificación: `U` y `B` en verde.
- [ ] 4.2 Escribir las unitarias de "Lista de precarga", "Manifiesto coherente" y "Presupuesto de bytes" sobre `apps/pwa/dist`, y la de ausencia de URLs de CDN/`tessdata`; verlas fallar; ampliar `plugin-pwa.ts` para emitir los recursos de lectura con hash y el manifiesto con `sha256` y `bytes`. Cubre OFF-01, OFF-02, OFF-04 (estático), OFF-16. Tipos de prueba: **unitaria**, **seguridad estática**. Verificación: `npm run build -w apps/pwa` y `U` en verde; suma <= 20971520.
- [ ] 4.3 Reescribir `sw.ts` con instalación verificada en caché pendiente, activación y respuesta a `estado-precache` (design.md, decisiones 7, 9, 10). Añadir `src/precache/**` a `mutate`. Cubre OFF-01, OFF-02, OFF-03, OFF-05, OFF-16, OFF-17. Tipos de prueba: **unitaria**, **mutación**. Verificación: `U` y `M` (>= 85 %) en verde.

## 5. Integración en la PWA

- [ ] 5.1 Pantallas `leyendo`, `resultado` y `error-lectura` en `apps/pwa`, conectadas a la `CapturaAceptada` (con `liberar()`), cancelación y `visibilitychange` (decisiones 11, 12); indicador `data-offline`. Cubre OFF-03, OFF-09, OFF-11, OFF-13, OFF-14, OFF-18. Tipos de prueba: **unitaria** de estado (`apps/pwa/test/`). Verificación: `U` en verde; `npm run build -w apps/pwa` con código 0.

## 6. E2E con Playwright (Chromium escritorio y Pixel 7)

- [ ] 6.1 Plan con `playwright-test-planner` en `e2e/planes/pwa-lectura-offline.md` que cubre cada escenario E2E de la spec. Cubre: OFF-01 a OFF-18 (escenarios E2E). Tipos de prueba: plan E2E. Verificación: revisión del verificador; cada escenario E2E de la spec aparece en el plan.
- [ ] 6.2 `e2e/lectura/precache.spec.ts` (todo en caché, activación bloqueada, recurso alterado, indicador, cuota) y `actualizacion.spec.ts`. Mutante manual: quitar la comparación de digest. Cubre OFF-01, OFF-02, OFF-03, OFF-16, OFF-17. Tipos de prueba: **E2E**. Verificación: `E(precache)` y `E(actualizacion)` en verde.
- [ ] 6.3 `e2e/lectura/lectura.spec.ts` (amarilla, digital, digital girada, long tasks, cancelar) y `errores.spec.ts`. Mutante manual: desactivar la máscara del NUIP. Cubre OFF-09, OFF-10, OFF-13, OFF-14. Tipos de prueba: **E2E**, **rendimiento**. Verificación: `E(lectura)` y `E(errores)` en verde.
- [ ] 6.4 `e2e/lectura/offline.spec.ts`: primera carga online, `context.setOffline(true)`, recarga y lectura de amarilla y digital con resultado idéntico; página nueva sin conexión. Mutante manual: excluir `mrz-*.traineddata` de la precaché (debe fallar la digital offline). Cubre OFF-12. Tipos de prueba: **E2E**. Verificación: `E(offline)` en verde en ambos proyectos.
- [ ] 6.5 `e2e/lectura/red.spec.ts` y `privacidad.spec.ts` (sin terceros, `fromServiceWorker`, claves de caché, almacenamiento vacío, página oculta). Mutante manual: guardar el resultado en `sessionStorage`. Cubre OFF-04, OFF-05, OFF-11. Tipos de prueba: **E2E**, **privacidad**. Verificación: `E(red)` y `E(privacidad)` en verde.
- [ ] 6.6 `e2e/lectura/accesibilidad.spec.ts` con axe en las tres pantallas. Cubre OFF-18. Tipos de prueba: **accesibilidad**. Verificación: `E(accesibilidad)` con 0 serious/critical.

## 7. Rendimiento y tamaño

- [ ] 7.1 `e2e/lectura/tiempos.spec.ts` con CPU 4x por CDP, 20 lecturas por tipo sin conexión y `reports/lectura/tiempos.json` (ignorado por git). Cubre OFF-15. Tipos de prueba: **rendimiento**. Verificación: `npx playwright test e2e/lectura/tiempos.spec.ts --project=lectura-pixel7` con p95 1500 / 5000 / 10000 ms.
- [ ] 7.2 Lighthouse CI sobre la compilación con lectura. Cubre OFF-16 (carga inicial). Tipos de prueba: **rendimiento web**. Verificación: `LH` con script <= 307200 bytes, performance >= 0,90, accesibilidad >= 0,95.

## 8. Privacidad estática y coordinación

- [ ] 8.1 Añadir a `tools/privacidad-check.mjs` la regla de OFF-11 (prohíbe `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie` en `apps/pwa/src` y `packages/capture/src/lectura`) con su prueba en `tools/test/`, vista fallar con un caso sintético. Cubre OFF-11. Tipos de prueba: **seguridad estática**, **unitaria**. Verificación: `npx vitest run tools` y `P` en verde.
- [ ] 8.2 Cuando `captura-calidad-pwa` esté archivado, añadir a este cambio un delta `## MODIFIED Requirements` de `captura-camara` para CAM-01 ("Precarga sin el Worker de calidad") y CAM-12 ("Worker diferido") según design.md, decisión 8, y revalidar. Cubre OFF-01. Tipos de prueba: validación de spec. Verificación: `openspec validate pwa-lectura-offline --strict` y las E2E de `e2e/captura/pwa.spec.ts` ajustadas en verde.

## 9. Revisiones obligatorias

- [ ] 9.1 Agente `revisor-privacidad` sobre todo el cambio (captura, Worker, service worker, almacenamiento, logs). Cubre OFF-04, OFF-05, OFF-11. Tipos de prueba: revisión + `privacidad-check`. Verificación: informe sin hallazgos bloqueantes y `P` en verde.
- [ ] 9.2 Agente `revisor-licencias` sobre la redistribución en la PWA de `mrz.traineddata`, `tesseract.js-core` (variantes `simd-lstm` y `lstm`), worker de tesseract.js y `zxing_reader.wasm`, con avisos de licencia accesibles en la app. Cubre OFF-01. Tipos de prueba: **seguridad estática** de licencias. Verificación: `L` y `node tools/licencia-check.mjs --package tesseract.js@7.0.0 zxing-wasm@3.1.5` sin infracciones.
- [ ] 9.3 Puerta final: `npm run check`, `npm run test:e2e`, verificador y `pr-test-analyzer` en paralelo. Cubre OFF-01 a OFF-18. Tipos de prueba: todos los anteriores. Verificación: `npm run check` y `npm run test:e2e` con código 0.
