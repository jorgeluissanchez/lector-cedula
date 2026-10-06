# Imagen del servidor de respaldo. Sin volúmenes de escritura: procesa solo en memoria (principio III).
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS base
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-install-project --no-dev

FROM base AS dev
RUN uv sync --frozen --no-install-project
COPY . .

FROM base AS produccion
COPY app ./app
# El contrato es la fuente de verdad y se sirve en /openapi.json (decisión 1).
COPY openapi/api-validaciones.yaml ./openapi/api-validaciones.yaml
RUN useradd --create-home --uid 10001 api
USER api
EXPOSE 8000
# Un solo worker (almacén en memoria, decisión 5) y sin access log: registraría la query con el
# token de subida (decisión 14). Se usa el entorno ya instalado: el sistema de archivos es de solo lectura.
CMD ["/srv/.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
