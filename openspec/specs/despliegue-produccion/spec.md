# despliegue-produccion Specification

## Purpose
Configuración versionada y verificable para publicar la PWA en Vercel y el servidor de respaldo en Dokploy, sin terceros, sin telemetría y sin persistir datos.

## Requirements

### Requirement: DP-01 Compilación en Vercel
`vercel.json` en la raíz del repositorio MUST declarar `framework: null`, `installCommand: "npm ci"`, `buildCommand: "npm run modelos:mrz && npx tsc -b packages/parsers && npm run build -w @lector-cedula/pwa"` y `outputDirectory: "apps/pwa/dist"`. La descarga del modelo MRZ MUST ser la verificada por SHA-256 y tamaño (`tools/modelos/descargar-mrz.mjs`).

#### Scenario: Comandos de compilación
- **WHEN** se valida `vercel.json` con `validarVercel`
- **THEN** no hay errores y `buildCommand` empieza por `npm run modelos:mrz && `

#### Scenario: Compilación sin modelo verificado
- **WHEN** `buildCommand` no contiene `npm run modelos:mrz`
- **THEN** `validarVercel` devuelve un error que menciona `DP-01`

### Requirement: DP-02 Content-Security-Policy estricta
Toda respuesta MUST llevar exactamente la CSP literal del escenario "CSP en la raíz y en un recurso", que MUST NOT contener `unsafe-inline`, `unsafe-eval` (salvo `wasm-unsafe-eval`, necesario para zxing-wasm y tesseract.js), `blob:`, `data:`, `*` ni ningún origen distinto de `'self'`.

#### Scenario: CSP en la raíz y en un recurso
- **WHEN** se calculan las cabeceras de `/` y de `/assets/index-abc123.js` a partir de `vercel.json`
- **THEN** ambas contienen `Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`

#### Scenario: CSP con un tercero
- **WHEN** la CSP de `vercel.json` incluye `https://cdn.jsdelivr.net` o `'unsafe-inline'`
- **THEN** `validarVercel` devuelve un error que menciona `DP-02`

### Requirement: DP-03 Cabeceras de seguridad
Toda respuesta MUST llevar `Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin` y `X-Frame-Options: DENY`. `Service-Worker-Allowed` MUST NOT declararse: `sw.js` está en la raíz y su alcance por defecto ya es `/`.

#### Scenario: Cabeceras de seguridad en cualquier ruta
- **WHEN** se calculan las cabeceras de `/manifest.webmanifest`
- **THEN** contienen los siete valores literales de DP-03 y no contienen `Service-Worker-Allowed`

### Requirement: DP-04 Caché
`/`, `/index.html`, `/sw.js` y `/manifest.webmanifest` MUST responder con `Cache-Control: no-cache`. `/assets/*` (nombres con hash) MUST responder con `Cache-Control: public, max-age=31536000, immutable`.

#### Scenario: Service worker sin caché
- **WHEN** se calculan las cabeceras de `/sw.js`
- **THEN** `Cache-Control` es `no-cache`

#### Scenario: Recurso con hash inmutable
- **WHEN** se calculan las cabeceras de `/assets/mrz-abc123.traineddata`
- **THEN** `Cache-Control` es `public, max-age=31536000, immutable`

### Requirement: DP-05 Tipos MIME
`/assets/*.wasm` MUST responder con `Content-Type: application/wasm` (necesario para `WebAssembly.instantiateStreaming`) y `/assets/*.traineddata` con `Content-Type: application/octet-stream`.

#### Scenario: Wasm y modelo
- **WHEN** se calculan las cabeceras de `/assets/zxing_reader-abc.wasm` y de `/assets/mrz-abc.traineddata`
- **THEN** sus `Content-Type` son `application/wasm` y `application/octet-stream`

### Requirement: DP-06 Sin analítica ni telemetría
`vercel.json` MUST NOT contener las claves `analytics` ni `speedInsights`, y el build de la PWA MUST NOT contener las cadenas `_vercel/insights`, `_vercel/speed-insights` ni `va.vercel-scripts.com`. Activarlas en el panel de Vercel está prohibido (guía de despliegue).

#### Scenario: Clave de analítica
- **WHEN** `vercel.json` contiene `"analytics": { "enabled": true }`
- **THEN** `validarVercel` devuelve un error que menciona `DP-06`

#### Scenario: Build limpio
- **WHEN** se recorre `apps/pwa/dist` tras compilar
- **THEN** ningún archivo contiene esas cadenas

### Requirement: DP-07 La app funciona con las cabeceras de producción
Servido localmente con exactamente las cabeceras de `vercel.json`, el build MUST cargar, registrar el service worker y leer una cédula sintética amarilla (zxing-wasm) y digital (tesseract.js) sin ninguna violación de CSP.

#### Scenario: Carga y service worker
- **WHEN** Chromium abre `/` en el servidor local con las cabeceras de `vercel.json`
- **THEN** la respuesta lleva la CSP de DP-02, `navigator.serviceWorker.controller` deja de ser `null` y no se registra ningún evento `securitypolicyviolation` ni mensaje de consola con `Content Security Policy`

#### Scenario: Lectura bajo CSP
- **WHEN** se lee el vídeo sintético `digital-1080p` y, en otra página, `amarilla-1080p`
- **THEN** la pantalla llega a `resultado` con `data-tipo` `mrz` y `pdf417` respectivamente, sin violaciones de CSP

### Requirement: DP-08 Servicio en Dokploy
`server/compose.dokploy.yaml` MUST definir un único servicio `api` endurecido, de solo lectura y con límites de recursos, sin puertos publicados (el tráfico entra solo por Traefik de Dokploy con HTTPS), sin volúmenes ni `cache_to`, y sin sobrescribir el `CMD` de la imagen (que lleva `--no-access-log`).

#### Scenario: Servicio endurecido
- **WHEN** se lee `server/compose.dokploy.yaml`
- **THEN** el servicio `api` tiene `build.target: produccion`, `build.additional_contexts.repo_git: ../.git`, `read_only: true`, un `tmpfs` de `/tmp` con `size=`, `mem_limit`, `pids_limit` > 0, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, `restart: unless-stopped`, un healthcheck sobre `/salud` y `expose: ["8000"]`, y no tiene `ports`, `volumes`, `command` ni `build.cache_to`

### Requirement: DP-09 Variables de entorno sin secretos en el repositorio
El servicio MUST fijar `LECTOR_LIVE: node` y tomar `CLAVES_API_JSON`, `SECRETO_SUBIDA`, `URL_PUBLICA` y `ORIGENES_CORS` con la forma obligatoria `${VAR:?...}` (Compose falla si faltan). `server/dokploy.env.example` MUST listar esas cuatro variables sin valores reales (vacías o con un marcador `<...>`).

#### Scenario: Variables obligatorias
- **WHEN** se lee el bloque `environment` del servicio
- **THEN** `LECTOR_LIVE` vale `node` y las otras cuatro empiezan por `${` y contienen `:?`

#### Scenario: Ejemplo sin secretos
- **WHEN** se lee `server/dokploy.env.example`
- **THEN** cada una de las cuatro variables aparece y ningún valor contiene `sk_`, `whsec_` ni una cadena hexadecimal de 64 caracteres

### Requirement: DP-10 Guía de despliegue
`docs/despliegue/README.md` MUST explicar paso a paso Vercel y Dokploy y MUST incluir un checklist previo a publicar con: marcadores de `docs/legal/` llenos y aprobados por el abogado, dominio, `ORIGENES_CORS` con el dominio de Vercel, prueba offline en un celular real, analítica de Vercel desactivada y la advertencia de no exportar la caché de BuildKit con `mode=max`.

#### Scenario: Checklist completo
- **WHEN** se lee `docs/despliegue/README.md`
- **THEN** contiene `docs/legal/`, `ORIGENES_CORS`, `modo avión`, `mode=max`, `Analytics` y `Speed Insights`
