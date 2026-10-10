# Plan E2E: front React + backend propio (motor-backend-embebido 1.5, sdk-integracion B.7)

Redactado a mano con el formato de `playwright-test-planner` (los agentes de Playwright no estaban disponibles en esta
sesión); el `playwright-test-healer` debe revisarlo en la próxima corrida con agentes.

- Aplicaciones (mismo origen para el front y `POST /api/cedula`, motor real en proceso):
  - `examples/backend-express` compilado (`npm run build -w examples/backend-express`) y servido por su `servidor.mjs`
    en `http://localhost:4195`.
  - `examples/backend-next` compilado (`npm run build -w examples/backend-next`, webpack) y servido con
    `npm run start -w examples/backend-next` en `http://localhost:4197`.
  - `examples/backend-nest` compilado (`npm run build -w examples/backend-nest`: front en `dist/publico`, servidor Nest
    en `dist/servidor`) y servido con `npm run start -w examples/backend-nest` en `http://localhost:4198`.
- Cámara: Chromium con `--use-file-for-fake-video-capture=e2e/videos/sinteticos/amarilla-1080p.y4m` (PERSONA_BASE).
- Proyectos: `backend-chromium` (Desktop Chrome) y `backend-pixel7` (Pixel 7), `--workers=1`.
- UI de los ejemplos: `data-prueba` `fase`, `etapa`, `etapas` (historial sin repeticiones, observado con `suscribir`),
  `nuip`, `confiable`, `rechazo`, `error`, `autorizacion` (casilla de autorización del titular, Ley 1581, sin marcar al
  abrir) y `empezar` (deshabilitado hasta autorizar; en `inicio`); Express y Nest (mismo front) añaden `modo`,
  `front-activo` y `fases`, y aceptan `?modo`, `?validacion` y `?streaming=0`. Cada prueba marca la casilla tras
  `goto`: sin ella la cámara no se abre.
- Esperas: siempre por condición (`expect(...).toHaveText` con tiempo límite), nunca `waitForTimeout`. Sin mocks: el
  rechazo se provoca alterando la lectura local en la página antes del envío y lo decide el backend real.

## `e2e/backend/modos.spec.ts` (`EB(modos)`)

1. SDK-60, matriz: `front` (sin backend), `back`, `front-back` estricta, `front-back` auto sin limitar y `front-back`
   auto con `deviceMemory` 2, cada modo con backend con streaming activado y desactivado (9 casos). Se comprueban
   `estado.modo`, `frontActivo`, NUIP `9999123456`, `confiable` (`false` solo en `front`), número de peticiones y
   campos del multipart (`cliente` solo si el front lee), `Content-Type` NDJSON o JSON, y que sin front activo no se
   pidió ningún recurso `pesado` del `manifest.json` (SDK-56) y que todo lo descargado del SDK (chunk `assets/sdk-*.js`,
   sin React ni la app, y todo lo pedido bajo `/lector-cedula/`, que es exactamente `calidad.js` y `manifest.json`: los
   avisos legales no se piden) cabe en `PRESUPUESTO_BACK` (gzip 9).
2. MOT-15: `front-back` estricta, 1 petición con `imagen` y `cliente`, axe sin serious/critical, consola sin el NUIP.
3. SDK-46: fases empiezan en `permiso, activo` y terminan en `leyendo, verificando, resultado`; etapas exactamente
   `recibido, leyendo, fraude, comparando`.
4. SDK-60 y SDK-58, sin red: con la red cortada en `activo`, `etapa` `en-espera`, fase `verificando`, resultado local
   no confiable, 0 peticiones y almacenamiento vacío (localStorage, sessionStorage, IndexedDB, Cache Storage fuera de
   `lector-cedula-sdk-*`); al volver la red, 1 petición y `confiable` `true`.

## `e2e/backend/ejemplos-backend.spec.ts` (`EB(ejemplos-backend)`), por ejemplo (Express, Next y Nest)

1. SDK-51, sin autorización: casilla sin marcar, "Empezar" deshabilitado, vídeo sin flujo, fase `inicio` y ninguna
   petición a `/api/cedula`; al marcarla arranca sola y al desmarcarla vuelve a `inicio`.
2. SDK-51, flujo marcando solo la autorización: etapas `recibido`, `leyendo` y `comparando`, `confiable` `true`, NUIP,
   todas las peticiones http(s) al origen del ejemplo y almacenamiento vacío (como en modos, punto 4).
3. SDK-51, axe en `inicio` (`?autoIniciar=0`; tras autorizar sigue en `inicio` hasta pulsar "Empezar"), `activo`, `verificando` (en-espera sin red) y `resultado`.
4. SDK-51, axe con un rechazo visible: la lectura local se altera (`nuip` `9999123457`) y el backend responde
   `no-coincide`.
