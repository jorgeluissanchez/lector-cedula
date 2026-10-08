# Design

## Context

`api-validaciones-contrato` dejó el puerto `Motor` y el modo live sin motor (503). La PWA necesita el servidor como respaldo cuando su lectura falla. Las decisiones 1 a 3 son del usuario (2026-10-07) y no se reabren aquí.

## Decisiones

1. **Parsers TypeScript con Node dentro del contenedor** (decisión humana). No se reescriben en Python: una sola implementación con sus pruebas, mutación y evals. Un proceso Node de corta vida por subida (`asyncio.create_subprocess_exec`, argumentos fijos, datos por la entrada estándar, salida de errores a `DEVNULL`, 5 s de tiempo límite). Un proceso por subida evita estado compartido entre titulares; el arranque (unos 50 ms) cabe en el p95 < 3 s de AV-35.
2. **Acceso de la PWA** (decisión humana): el backend del integrador crea la validación con su clave secreta y entrega a la PWA `upload.url` de un solo uso. No hay clave publicable. El contrato y CORS de la subida (AV-07) ya cubren ese flujo: este cambio no toca el contrato.
3. **zxing-cpp 3.1.1 y RapidOCR 3.9** (decisión humana inicial): **reemplazada por la decisión 9**; no se instalan.
4. **Imagen Docker**: etapa `parsers` sobre `node:24-bookworm-slim` que compila `packages/parsers/src` con TypeScript 5.9.3 (versión del `package.json` raíz) y opciones equivalentes a `tsconfig.base.json`; la etapa `base` copia `/usr/local/bin/node` y `dist/`. Compose pasa `../packages/parsers` como contexto adicional `parsers`, sin ampliar el contexto principal.
5. **Tabla de resultado** (MS-02): la traducción vive en Python (`resultado_desde_interpretacion`), es pura y se prueba con pytest; el intérprete Node solo adapta el resultado del parser a JSON sin los datos crudos (`lineasCorregidas`, `trama`, `confianza`).
6. **MRZ sin separación de apellidos**: la MRZ no distingue primer y segundo apellido (`DE<LA<OSSA<FICTICIO`), así que el documento lleva los apellidos y nombres completos en `first_surname` y `first_name`. El lugar de la MRZ queda en `null` mientras M03 esté pendiente.
7. **Comparación facial**: el motor real no la hace; con `face_match` `true` devuelve `failure` `processing_error` en vez de un `success` engañoso.
8. **Checks no evaluados**: `image_quality`, `data_consistency` y `document_liveness` van en `not_performed` hasta la Fase 5.

9. **Lector = packages/capture en Node** (decisión humana del 2026-10-07, reemplaza la 3): `server/lector/leer.mjs` usa `decodificarPdf417Imagen` y `crearLectorMrz` como `tools/leer-foto.mjs`. Un proceso por subida; imágenes por la entrada estándar en base64 (`back` y luego `front`), puestas a cero tras leerlas. Dependencias con las versiones exactas de `packages/capture/package.json`, instaladas con `--ignore-scripts` en la etapa `lector`; el modelo se descarga en la compilación con `tools/modelos/descargar-mrz.mjs` (el script de `npm run modelos:mrz`) y se verifica su SHA-256. Presupuesto MRZ de 20 s (MS-18). Se activa con `LECTOR_LIVE=node` (MS-19).
10. **Compilar desde HEAD**: las etapas toman `packages/parsers`, `packages/capture` y `tools/modelos` con `git archive HEAD` del `.git` (contexto adicional `repo_git`). Motivo: otros cambios editan `packages/capture` en paralelo y su trabajo a medio hacer no compila (`ceder` sin definir al 2026-10-07); la imagen del servidor solo lleva código commiteado. git solo existe en la etapa `fuente`, y una prueba falla si la imagen final contiene `/repo.git` o un directorio `.git`. El `.git` sí queda en la caché local de BuildKit (capa de la etapa `fuente`): **no exportar la caché de compilación con `mode=max`** (por ejemplo, `--cache-to type=registry,mode=max`), que publicaría también esa capa. Alternativa descartada por ahora: generar el tar con `git archive HEAD` fuera de Docker en un paso previo, porque Compose no tiene pasos previos y obligaría a un script extra antes de cada `docker compose build`.
11. **Bytes en Python**: los `bytes` de las imágenes y del payload son inmutables y no se pueden poner a cero; el servidor suelta sus referencias con `del` tras usarlos y deja la memoria al recolector. Node sí pone a cero sus copias (`fill(0)`).

## Riesgos

- El resultado `success` sin document liveness es más débil que el de los competidores; el `revisor-producto` lo debe evaluar al cerrar la Fase 4.
- Node, zxing-wasm, tesseract.js y el modelo (11 MB) añaden unos 150 MB a la imagen.
- La MRZ con tesseract.js puede tardar segundos por intento; con el presupuesto de 20 s, la subida live de una digital puede superar el p95 de 3 s de AV-35 (que solo mide sandbox).
- Las dependencias transitivas de la etapa `lector` no salen del `package-lock.json` del repositorio (solo las directas están fijadas).

## Pruebas

La tabla por requisito está en `specs/motor-servidor/spec.md`, sección `## Pruebas`. Comandos: `P` = `docker compose -f server/compose.yaml run --rm pruebas`; `A` = `docker compose -f server/compose.yaml up -d --build --wait api-pruebas`; `G`, `C`, `Z` como en `api-validaciones-contrato/design.md` (en Git Bash con `MSYS_NO_PATHCONV=1`).
