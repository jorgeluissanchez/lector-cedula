# Despliegue a producción

Guía paso a paso para publicar la PWA en **Vercel** y el servidor de respaldo en **Hostinger con Dokploy**. Contrato: `openspec/changes/despliegue-produccion/` (DP-01 a DP-10). Ninguna credencial va al repositorio: los secretos se escriben solo en los paneles de Vercel y Dokploy.

## 0. Checklist previo a publicar

Marca cada punto antes de abrir el tráfico:

- [ ] **Textos legales**: todos los marcadores entre corchetes de `docs/legal/` (`[RAZÓN SOCIAL]`, `[CORREO]`, `[PLAZO]`, `[FECHA]`, `[DIRECCIÓN]`...) están llenos y el abogado aprobó por escrito los borradores (`docs/legal/PARA-EL-ABOGADO.md`). Comprobación rápida: `grep -rn "\[[A-ZÁÉÍÓÚÑ ]\{4,\}\]" docs/legal/` no debe devolver nada.
- [ ] **Dominio**: dominio de la PWA (el de Vercel `*.vercel.app` o uno propio) y subdominio del API (por ejemplo `api.tu-dominio`) con sus registros DNS apuntando a Vercel y al VPS de Hostinger.
- [ ] **CORS**: `ORIGENES_CORS` del servidor contiene exactamente los orígenes de la PWA (con `https://`, sin barra final, separados por coma). Nada de `*`.
- [ ] **Analítica desactivada**: en Vercel, *Analytics* y *Speed Insights* apagados (DP-06). La CSP los bloquearía de todos modos, pero no deben activarse.
- [ ] **Caché de BuildKit**: nadie configura `--cache-to ... mode=max` ni exporta la caché del build del servidor (publicaría la capa con el `.git`).
- [ ] **Prueba offline en un celular real** (Android con Chrome y, si se puede, iPhone con Safari): abrir la PWA por HTTPS, esperar el aviso de lectura sin conexión lista, activar **modo avión**, recargar y leer una cédula **de prueba o la propia con consentimiento**, sin guardar capturas. Debe leer la amarilla (PDF417) y la digital (MRZ).
- [ ] **Puerta local en verde**: `npm run check` y `npx playwright test --project=despliegue-chromium` (cabeceras de producción, CSP y lectura).
- [ ] **Servidor**: `https://api.tu-dominio/salud` responde 200; `https://api.tu-dominio/openapi.json` carga.

## 1. PWA en Vercel

La configuración está en `vercel.json` (raíz del repositorio): compila el monorepo, descarga y **verifica por SHA-256** el modelo MRZ (`npm run modelos:mrz`), compila los parsers y construye `apps/pwa/dist`. Cabeceras: CSP estricta sin terceros (`'wasm-unsafe-eval'` es necesario para zxing-wasm y tesseract.js), Permissions-Policy (`camera=(self)`), Referrer-Policy `no-referrer`, HSTS, nosniff, `sw.js` e `index.html` sin caché, `/assets/*` inmutables, `application/wasm` y `application/octet-stream` para `.traineddata`.

1. En Vercel: **Add New... > Project** e importa el repositorio de GitHub.
2. **Root Directory**: déjalo vacío (raíz). **Framework Preset**: *Other*. No cambies Build/Install/Output: los toma de `vercel.json`.
3. **Node.js Version** (Settings > General): 24.x (el repositorio exige `node >= 24`).
4. No añadas variables de entorno: la PWA no necesita ninguna.
5. **Deploy**. Al terminar, abre la URL y comprueba en las herramientas de desarrollo (pestaña Red, documento `/`) que llega la cabecera `Content-Security-Policy` y que la consola no muestra errores de CSP.
6. Settings > **Analytics** y **Speed Insights**: deben quedar desactivados. Settings > Deployment Protection a gusto; la barra de herramientas de Vercel en *previews* genera avisos de CSP (esperado, solo en previews).
7. Dominio propio (opcional): Settings > Domains. Añade ese origen a `ORIGENES_CORS` del servidor.

Antes de publicar puedes reproducir en local exactamente las cabeceras de Vercel:

```sh
npm run build -w @lector-cedula/pwa
node tools/despliegue/vercel.mjs                 # valida vercel.json contra la spec
node tools/despliegue/servir-vercel.mjs 4180     # sirve dist con las cabeceras de vercel.json
```

## 2. Servidor en Dokploy (Hostinger)

Archivos: `server/compose.dokploy.yaml` (servicio `api` endurecido) y `server/dokploy.env.example` (plantilla de variables, sin valores).

El servicio corre con raíz de **solo lectura**, `/tmp` en memoria (64 MB), `mem_limit: 1536m` (tesseract.js), `pids_limit`, sin capacidades, sin volúmenes, **sin puertos publicados** (solo Traefik llega al 8000) y con healthcheck sobre `/salud`. La imagen arranca uvicorn con `--no-access-log` (las URL de subida llevan un token). El tamaño de subida lo limita la API: 20 MiB por petición y 8 MiB por imagen (respuesta 413).

1. En Dokploy: **Create Project**, luego **Create Service > Compose**.
2. **Provider**: GitHub (o Git) con este repositorio y la rama `main`. **Compose Path**: `./server/compose.dokploy.yaml`.
3. **Environment**: copia las claves de `server/dokploy.env.example` y pon los valores reales **solo aquí**:
   - `CLAVES_API_JSON`: lista JSON con el **sha256** de cada clave de API (nunca la clave en claro) y su `secreto_webhook`. Genera la clave en tu máquina y calcula su hash con `printf '%s' "$CLAVE" | sha256sum`. Con varios aplicativos (SDK, cambio `sdk-integracion`), cada entrada admite además:
     - `origenes`: orígenes de navegador exactos del aplicativo (`https://host[:puerto]`, sin barra final ni ruta). Solo ellos pueden subir con esa clave, cargar `/sdk/v1/` con CORS y llamar a la API desde el navegador; cualquier otro `Origin` recibe 403 `origin-not-allowed`. Sin este campo (forma anterior), la clave usa `ORIGENES_CORS`.
     - `retornos`: URL exactas a las que vuelve la sesión alojada (`return_url`): `https://...` o deeplinks `com.tu.app://ruta`. Sin prefijos ni comodines; sin este campo, la clave no admite `return_url`.
     - Ejemplo (valores ficticios): `[{"sha256":"<64 hex>","secreto_webhook":"<secreto>","origenes":["https://app-a.example"],"retornos":["https://app-a.example/volver","com.ejemplo.appa://lector/retorno"]}]`.
     - Un `*` o una URL no exacta en `origenes` o `retornos` detiene el arranque con un mensaje que nombra el campo (nunca la clave ni el secreto).
   - `SECRETO_SUBIDA`: `openssl rand -hex 32`.
   - `URL_PUBLICA`: `https://api.tu-dominio`.
   - `ORIGENES_CORS`: `https://tu-app.vercel.app` (y el dominio propio, separado por coma). Aplica a las claves sin `origenes` propios. Nada de `*` (el servidor no arranca).
   - `LECTOR_LIVE` ya vale `node` en el compose.
   Si falta alguna obligatoria, Compose se niega a arrancar (`${VAR:?}`).
4. **Domains**: añade `api.tu-dominio`, servicio `api`, puerto `8000`, **HTTPS activado** con Let's Encrypt. Traefik de Dokploy termina TLS.
5. **Deploy**. Revisa en *Logs* que uvicorn arranca y en *Monitoring* que el contenedor queda `healthy`.
6. Comprueba `https://api.tu-dominio/salud` y una petición desde la PWA o con `curl` y una clave de prueba.

### Construcción sin exponer el `.git`

El Dockerfile compila los parsers desde `git archive HEAD` usando el `.git` del repositorio como contexto adicional (`repo_git: ../.git`). En Dokploy, el tipo Compose clona el repositorio con su `.git` y construye con `docker compose`, así que funciona sin cambios; el `.git` no llega a la imagen final (solo a la etapa `fuente`) pero sí a la **caché local de BuildKit** del VPS. Por eso:

- No actives exportación de caché a un registro ni `mode=max`.
- Si se quiere limpiar la caché tras el despliegue: `docker builder prune` en el VPS.

**Si el clon de Dokploy no trae `.git`** (el build falla en la etapa `fuente` con `not a git repository`), alternativa: construye la imagen en tu máquina y publícala en un registro privado.

```sh
docker compose -f server/compose.dokploy.yaml build    # pide las variables obligatorias; valen marcadores en el build
docker tag server-api registro.privado/lector-api:<versión>
docker push registro.privado/lector-api:<versión>
```

En Dokploy crea entonces un servicio **Docker image** con esa imagen y replica las opciones de `compose.dokploy.yaml` (solo lectura, tmpfs, memoria, healthcheck, variables).

## 3. Después de publicar

- Ejecuta el checklist del punto 0 en el celular real.
- Ante cualquier cambio de dominio, actualiza `ORIGENES_CORS` y vuelve a desplegar el servidor.
- Nunca subas capturas de pantalla con datos de una cédula real a issues ni al repositorio.
