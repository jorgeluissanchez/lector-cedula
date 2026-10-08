# Design

## Context

PWA estática (Vite, `apps/pwa/dist`) con service worker en la raíz, workers de módulo, zxing-wasm y tesseract.js con su `.wasm` y el modelo `mrz.traineddata` empaquetados (pwa-lectura-offline). Servidor FastAPI en Docker con un Dockerfile que compila los parsers desde `git archive HEAD` del contexto `repo_git` (motor-real-servidor, decisión 10).

## Decisiones

1. **`vercel.json` en la raíz**, no en `apps/pwa`: el build necesita el monorepo (workspaces, `packages/parsers`, `models/`). En el proyecto de Vercel, *Root Directory* queda vacío.
2. **CSP medida, no supuesta**: el build se inspeccionó (2026-10-07): ningún `eval` alcanzable (el `new Function` del worker de tesseract.js es un respaldo de `globalThis` que no se ejecuta), tesseract.js usa `workerBlobURL: false` (`packages/capture/src/mrz/entorno.ts`), así que `worker-src 'self'` basta; WebAssembly exige `'wasm-unsafe-eval'`. La E2E de DP-07 lo confirma con lectura real bajo la CSP.
3. **Emulador de cabeceras propio** (`tools/despliegue/vercel.mjs`): implementa el subconjunto de `source` de Vercel que usamos (rutas literales y grupos `(.*)`), con la regla de Vercel de que, si varias reglas fijan la misma cabecera, gana la última. El validador rechaza cualquier otra sintaxis, para que el emulador y Vercel no puedan divergir en silencio.
4. **Dokploy con Compose**: el tipo de aplicación *Compose* de Dokploy clona el repositorio con su `.git` y ejecuta `docker compose build`, que soporta `additional_contexts`; así el Dockerfile existente sirve tal cual. Hipótesis no verificada contra una instancia real: si el clon no trae `.git`, la alternativa documentada es construir la imagen fuera (`docker compose -f server/compose.dokploy.yaml build` en la máquina del usuario), subirla a un registro privado y usar el tipo *Docker image* de Dokploy con las mismas opciones. No se exporta caché de BuildKit (`mode=max` publicaría la capa con el `.git`).
5. **Límites**: `mem_limit: 1536m` (tesseract.js en Node usa del orden de cientos de MB por lectura y hay un worker uvicorn), `pids_limit: 128`, `/tmp` en `tmpfs` de 64 MB. El tamaño de subida lo limita la propia API (20 MiB por cuerpo, 8 MiB por imagen, 413), sin depender de Traefik.
6. **Sin logs de acceso**: el `CMD` de la imagen ya pasa `--no-access-log`; el compose no lo sobrescribe.

## Riesgos

- La caché de Vercel o de un CDN intermedio podría servir un `sw.js` viejo: mitigado con `no-cache`.
- La barra de herramientas de Vercel en despliegues *preview* inyecta un script de `vercel.live`; la CSP lo bloquea (es lo deseado) y solo produce avisos en previews.

## Pruebas

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| DP-01 a DP-06 | Unitaria de configuración (validador y emulador con literales de la spec; casos negativos) | Vitest | `npx vitest run tools/test/despliegue-vercel.test.mjs` | 100 % escenarios |
| DP-06 | Integridad del build | Vitest | `npx vitest run tools/test/despliegue-vercel.test.mjs` | 0 coincidencias (se omite si no hay build) |
| DP-07 | E2E con cabeceras de producción y cámara simulada | Playwright | `npx playwright test --project=despliegue-chromium` | 0 violaciones CSP; SW activo; lectura amarilla y digital |
| DP-08, DP-09 | Unitaria de configuración | Vitest + js-yaml | `npx vitest run tools/test/despliegue-dokploy.test.mjs` | 100 % escenarios |
| DP-10 | Integridad de documentación | Vitest | `npx vitest run tools/test/despliegue-dokploy.test.mjs` | 100 % escenarios |
| Todos | Puerta del repositorio (privacidad, licencias) | `npm run check` | `npm run check` | verde |
