# Design

## Context

`api-validaciones-contrato` dejó el puerto `Motor` y el modo live sin motor (503). La PWA necesita el servidor como respaldo cuando su lectura falla. Las decisiones 1 a 3 son del usuario (2026-10-07) y no se reabren aquí.

## Decisiones

1. **Parsers TypeScript con Node dentro del contenedor** (decisión humana). No se reescriben en Python: una sola implementación con sus pruebas, mutación y evals. Un proceso Node de corta vida por subida (`asyncio.create_subprocess_exec`, argumentos fijos, datos por la entrada estándar, salida de errores a `DEVNULL`, 5 s de tiempo límite). Un proceso por subida evita estado compartido entre titulares; el arranque (unos 50 ms) cabe en el p95 < 3 s de AV-35.
2. **Acceso de la PWA** (decisión humana): el backend del integrador crea la validación con su clave secreta y entrega a la PWA `upload.url` de un solo uso. No hay clave publicable. El contrato y CORS de la subida (AV-07) ya cubren ese flujo: este cambio no toca el contrato.
3. **zxing-cpp 3.1.1 y RapidOCR 3.9** (decisión humana): autorizados solo con aprobación previa del agente `revisor-licencias`. El implementador no puede lanzar ese agente, así que el grupo 4 de `tasks.md` queda bloqueado y nada se instala. Mientras tanto el `Lector` es un puerto y el modo live sigue en 503 sin lector.
4. **Imagen Docker**: etapa `parsers` sobre `node:24-bookworm-slim` que compila `packages/parsers/src` con TypeScript 5.9.3 (versión del `package.json` raíz) y opciones equivalentes a `tsconfig.base.json`; la etapa `base` copia `/usr/local/bin/node` y `dist/`. Compose pasa `../packages/parsers` como contexto adicional `parsers`, sin ampliar el contexto principal.
5. **Tabla de resultado** (MS-02): la traducción vive en Python (`resultado_desde_interpretacion`), es pura y se prueba con pytest; el intérprete Node solo adapta el resultado del parser a JSON sin los datos crudos (`lineasCorregidas`, `trama`, `confianza`).
6. **MRZ sin separación de apellidos**: la MRZ no distingue primer y segundo apellido (`DE<LA<OSSA<FICTICIO`), así que el documento lleva los apellidos y nombres completos en `first_surname` y `first_name`. El lugar de la MRZ queda en `null` mientras M03 esté pendiente.
7. **Comparación facial**: el motor real no la hace; con `face_match` `true` devuelve `failure` `processing_error` en vez de un `success` engañoso.
8. **Checks no evaluados**: `image_quality`, `data_consistency` y `document_liveness` van en `not_performed` hasta la Fase 5.

## Riesgos

- El resultado `success` sin document liveness es más débil que el de los competidores; el `revisor-producto` lo debe evaluar al cerrar la Fase 4.
- Node añade unos 100 MB a la imagen.

## Pruebas

La tabla por requisito está en `specs/motor-servidor/spec.md`, sección `## Pruebas`. Comandos: `P` = `docker compose -f server/compose.yaml run --rm pruebas`; `A` = `docker compose -f server/compose.yaml up -d --build --wait api-pruebas`; `G`, `C`, `Z` como en `api-validaciones-contrato/design.md` (en Git Bash con `MSYS_NO_PATHCONV=1`).
