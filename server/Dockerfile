# Imagen del servidor de respaldo. Sin volúmenes de escritura: procesa solo en memoria (principio III).
# Código TypeScript del repositorio tomado de lo commiteado (HEAD), no del árbol de trabajo: el trabajo en curso
# de otros cambios no entra en la imagen (motor-real-servidor, decisión 10). El contexto adicional `repo_git` es
# el .git del repositorio (server/compose.yaml); git solo existe en esta etapa. El .git queda en la caché local de
# BuildKit: no exportar la caché con mode=max (design.md, decisión 10).
FROM node:24-bookworm-slim AS fuente
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates  && rm -rf /var/lib/apt/lists/*
COPY --from=repo_git . /repo.git
# REF: HEAD por omisión (despliegue). Las pruebas E2E pasan el árbol del directorio de trabajo (`git write-tree` con un
# índice temporal, e2e/alojada/imagen.mjs) para probar el código sin commit; nunca mueve HEAD ni toca el árbol.
ARG REF=HEAD
RUN mkdir /fuente && git --git-dir=/repo.git archive "$REF" packages/parsers/src packages/parsers/THIRD_PARTY_NOTICES.md \
    packages/capture/src packages/capture/worker tools/modelos/descargar-mrz.mjs packages/web/src packages/web/scripts \
    packages/web/package.json tools/avisos-terceros.mjs apps/pwa/licencias models/manifest.json LICENSE \
    apps/alojada/src apps/alojada/index.html apps/alojada/construir.mjs | tar -x -C /fuente

# Parsers TypeScript compilados desde el código fuente (decisión 4).
FROM node:24-bookworm-slim AS parsers
WORKDIR /p
# TypeScript (Apache-2.0) solo en esta etapa; la imagen final no lo lleva. `type: module` hace que
# NodeNext compile a ESM, como el paquete original.
RUN printf '{"type":"module","private":true}' > package.json \
 && npm install --no-save --no-audit --no-fund typescript@5.9.3
COPY --from=fuente /fuente/packages/parsers/src ./src
RUN npx tsc --rootDir src --outDir dist --target ES2023 --module NodeNext --moduleResolution NodeNext \
    --lib ES2023,DOM --strict --skipLibCheck --declaration --sourceMap false \
    $(find src -name '*.ts' -not -name '*.d.ts') \
 && printf '{"type":"module"}' > dist/package.json

# Lector de imagen de packages/capture (zxing-wasm 3.1.5 y tesseract.js 7.0.0, ya aprobados), el mismo de la
# CLI y la PWA (motor-real-servidor, decisión 9). Todo queda empaquetado: en ejecución no hay red.
FROM node:24-bookworm-slim AS lector
WORKDIR /l
# Versiones exactas de packages/capture/package.json; sin scripts de instalación.
RUN printf '%s' '{"type":"module","private":true,"dependencies":{"zxing-wasm":"3.1.5","tesseract.js":"7.0.0","jpeg-js":"0.4.4","pngjs":"7.0.0"}}' > package.json \
 && npm install --no-audit --no-fund --ignore-scripts \
 && npm install --no-save --no-audit --no-fund --ignore-scripts typescript@5.9.3 @types/pngjs@6.0.5
COPY --from=parsers /p/dist ./node_modules/@lector-cedula/parsers/dist
RUN printf '%s' '{"name":"@lector-cedula/parsers","type":"module","exports":{".":{"types":"./dist/index.d.ts","default":"./dist/index.js"},"./divipola":{"types":"./dist/divipola/index.d.ts","default":"./dist/divipola/index.js"},"./divipol-2018":{"types":"./dist/divipol-2018/index.d.ts","default":"./dist/divipol-2018/index.js"}}}' > node_modules/@lector-cedula/parsers/package.json
COPY --from=fuente /fuente/packages/capture/src ./capture/src
COPY --from=fuente /fuente/packages/capture/worker ./capture/worker
RUN npx tsc --rootDir capture/src --outDir node_modules/@lector-cedula/capture/dist --target ES2023 \
    --module NodeNext --moduleResolution NodeNext --lib ES2023,DOM,DOM.Iterable,WebWorker --strict \
    --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --declaration false --sourceMap false \
    $(find capture/src -name '*.ts' -not -name '*.d.ts') \
 && cp -r capture/worker node_modules/@lector-cedula/capture/worker \
 && printf '%s' '{"name":"@lector-cedula/capture","type":"module","exports":{".":"./dist/index.js"}}' > node_modules/@lector-cedula/capture/package.json \
 && rm -rf node_modules/typescript node_modules/@types
# Modelo MRZ con la misma descarga verificada de `npm run modelos:mrz` (SHA-256 y tamaño; models/manifest.json).
COPY --from=fuente /fuente/tools/modelos/descargar-mrz.mjs /r/tools/modelos/descargar-mrz.mjs
RUN node /r/tools/modelos/descargar-mrz.mjs && node /r/tools/modelos/descargar-mrz.mjs --verificar

# Assets de @lector-cedula/web (Workers, WASM, modelo MRZ, avisos y manifest.json con SHA-256) y página alojada
# /v/{token} (sdk-integracion, fase 4), con el mismo script del paquete npm. Solo esbuild (MIT) y las dependencias ya
# aprobadas del motor; los paquetes del repositorio se resuelven desde su fuente TypeScript. La imagen final no lleva
# node_modules de esta etapa.
FROM node:24-bookworm-slim AS web
WORKDIR /repo
COPY --from=fuente /fuente/ ./
RUN printf '%s' '{"type":"module","private":true,"dependencies":{"esbuild":"0.28.2","zxing-wasm":"3.1.5","tesseract.js":"7.0.0","tesseract.js-core":"7.0.0","jpeg-js":"0.4.4","pngjs":"7.0.0"}}' > package.json \
 && npm install --no-audit --no-fund --ignore-scripts \
 && printf '%s' '{"name":"@lector-cedula/capture","type":"module","sideEffects":false,"exports":{".":"./src/index.ts"}}' > packages/capture/package.json \
 && printf '%s' '{"name":"@lector-cedula/parsers","type":"module","sideEffects":false,"exports":{".":"./src/index.ts","./divipola":"./src/divipola/index.ts","./divipol-2018":"./src/divipol-2018/index.ts"}}' > packages/parsers/package.json \
 && mkdir -p node_modules/@lector-cedula \
 && ln -s ../../packages/capture node_modules/@lector-cedula/capture \
 && ln -s ../../packages/parsers node_modules/@lector-cedula/parsers
COPY --from=lector /r/models/tesseract ./models/tesseract
RUN node packages/web/scripts/construir-assets.mjs && node apps/alojada/construir.mjs /salida/alojada

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS base
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-install-project --no-dev
# Node (MIT) solo para el intérprete de los parsers: un proceso por subida, datos por tubería (MS-01, MS-07).
COPY --from=node:24-bookworm-slim /usr/local/bin/node /usr/local/bin/node
# Licencia completa de Node con los avisos de terceros (V8, OpenSSL, ICU, c-ares...): condición del
# revisor de licencias al copiar solo el binario.
COPY --from=node:24-bookworm-slim /usr/local/LICENSE /srv/licencias/node-LICENSE
# Los parsers llevan datos CC BY-SA 4.0 (DANE y Registraduría) y el intérprete los usa para el nombre del lugar
# (divipol-consulados-2018, DC-14): su atribución viaja con la imagen.
COPY --from=fuente /fuente/packages/parsers/THIRD_PARTY_NOTICES.md /srv/licencias/parsers-THIRD_PARTY_NOTICES.md
COPY --from=parsers /p/dist /srv/parsers/dist
COPY --from=lector /l/node_modules /srv/lector/node_modules
COPY --from=lector /r/models/tesseract /srv/modelos/tesseract

FROM base AS dev
RUN uv sync --frozen --no-install-project
COPY . .

FROM base AS produccion
COPY app ./app
# El contrato es la fuente de verdad y se sirve en /openapi.json (decisión 1).
COPY openapi/api-validaciones.yaml ./openapi/api-validaciones.yaml
COPY interprete/interpretar.mjs ./interprete/interpretar.mjs
COPY lector/leer.mjs ./lector/leer.mjs
# Recursos del motor servidos en /sdk/v1/ (SDK-05): los assets de @lector-cedula/web con su manifest.json.
COPY sdk ./sdk
COPY --from=web /repo/packages/web/dist/assets ./sdk/v1
# Página alojada /v/{token} (SDK-14).
COPY --from=web /salida/alojada/index.html ./alojada/index.html
RUN useradd --create-home --uid 10001 api
USER api
EXPOSE 8000
# Un solo worker (almacén en memoria, decisión 5) y sin access log: registraría la query con el
# token de subida (decisión 14). Se usa el entorno ya instalado: el sistema de archivos es de solo lectura.
CMD ["/srv/.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
