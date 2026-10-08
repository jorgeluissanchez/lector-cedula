# Imagen del servidor de respaldo. Sin volúmenes de escritura: procesa solo en memoria (principio III).
# Parsers TypeScript del repositorio compilados desde el código fuente (cambio motor-real-servidor,
# decisión 4). El contexto adicional `fuente_parsers` es packages/parsers/src (server/compose.yaml).
FROM node:24-bookworm-slim AS parsers
WORKDIR /p
# TypeScript (Apache-2.0) solo en esta etapa; la imagen final no lo lleva. `type: module` hace que
# NodeNext compile a ESM, como el paquete original.
RUN printf '{"type":"module","private":true}' > package.json \
 && npm install --no-save --no-audit --no-fund typescript@5.9.3
COPY --from=fuente_parsers . ./src
RUN npx tsc --rootDir src --outDir dist --target ES2023 --module NodeNext --moduleResolution NodeNext \
    --lib ES2023,DOM --strict --skipLibCheck --declaration false --sourceMap false \
    $(find src -name '*.ts' -not -name '*.d.ts') \
 && printf '{"type":"module"}' > dist/package.json

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS base
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-install-project --no-dev
# Node (MIT) solo para el intérprete de los parsers: un proceso por subida, datos por tubería (MS-01, MS-07).
COPY --from=node:24-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=parsers /p/dist /srv/parsers/dist

FROM base AS dev
RUN uv sync --frozen --no-install-project
COPY . .

FROM base AS produccion
COPY app ./app
# El contrato es la fuente de verdad y se sirve en /openapi.json (decisión 1).
COPY openapi/api-validaciones.yaml ./openapi/api-validaciones.yaml
COPY interprete/interpretar.mjs ./interprete/interpretar.mjs
RUN useradd --create-home --uid 10001 api
USER api
EXPOSE 8000
# Un solo worker (almacén en memoria, decisión 5) y sin access log: registraría la query con el
# token de subida (decisión 14). Se usa el entorno ya instalado: el sistema de archivos es de solo lectura.
CMD ["/srv/.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
