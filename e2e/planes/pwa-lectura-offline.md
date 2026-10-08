# Plan E2E: pwa-lectura-offline

Escrito a mano por el implementador (los agentes `playwright-test-planner` y `-generator` no estaban registrados en la
sesión). Proyectos `lectura-chromium` y `lectura-pixel7`; un vídeo sintético por archivo (`test.use(conVideo(...))`).
Esperas por condición; ninguna `waitForTimeout`. Fecha fija con `page.clock.setFixedTime` salvo donde se mide
`performance` (el reloj simulado la sustituye).

| Escenario de la spec | Archivo | Vídeo |
|---|---|---|
| OFF-01 Todo en caché antes de la primera lectura; OFF-03 Primera visita completa | `precache.spec.ts` | amarilla |
| OFF-01 Activación bloqueada si falta un recurso | `precache.spec.ts` | amarilla |
| OFF-02 Recurso alterado | `precache.spec.ts` | amarilla |
| OFF-03 Navegador sin service worker | `precache.spec.ts` | amarilla |
| OFF-16 Cuota insuficiente | `precache.spec.ts` | amarilla |
| OFF-17 Actualización fallida | `actualizacion.spec.ts` (copia de dist servida aparte) | digital |
| OFF-04 Sin terceros; Lectura servida desde caché | `red.spec.ts`, `red-amarilla.spec.ts` | digital, amarilla |
| OFF-05 Claves tras leer; OFF-11 Almacenamiento vacío | `privacidad.spec.ts`, `privacidad-digital.spec.ts` | amarilla, digital |
| OFF-11 Página oculta | `privacidad.spec.ts` | amarilla |
| OFF-09 Pantalla de resultado de la amarilla; OFF-19 Transición automática; OFF-14 Cancelar | `lectura.spec.ts` | amarilla |
| OFF-09 Pantalla de resultado de la digital; OFF-14 Hilo principal libre | `lectura-digital.spec.ts` | digital |
| OFF-10 Digital girada en E2E | `lectura-girada.spec.ts` (referencia en un segundo navegador con digital) | girada 90 |
| OFF-12 Primera carga online, recarga offline y lectura | `offline.spec.ts`, `offline-amarilla.spec.ts` | digital, amarilla |
| OFF-12 Sin conexión desde el arranque del Worker | `offline.spec.ts` | digital |
| OFF-13 Vídeo sin documento | `errores.spec.ts` | nitida |
| OFF-18 axe en leyendo, resultado y error-lectura | `accesibilidad.spec.ts` | amarilla |
| OFF-20 Pantalla de licencias; Licencias sin conexión; axe | `licencias.spec.ts`, `accesibilidad.spec.ts` | amarilla |
| OFF-21 Casilla, no persistida, descargo, textos legales sin conexión, axe | `legal.spec.ts` | amarilla |
| OFF-15 Presupuesto (tarea 7.1) | pendiente: `tiempos.spec.ts` | las tres |
