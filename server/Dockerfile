# Imagen del servidor de respaldo. Sin volúmenes de escritura: procesa solo en memoria (principio III).
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS base
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
COPY pyproject.toml uv.lock* ./
RUN uv sync --no-install-project --no-dev

FROM base AS dev
RUN uv sync --no-install-project
COPY . .

FROM base AS produccion
COPY app ./app
RUN useradd --create-home --uid 10001 api
USER api
EXPOSE 8000
CMD ["uv", "run", "--no-dev", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
