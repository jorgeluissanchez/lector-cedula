# Proposal

## Why

La meta 10 de `PLAN.md` (sección 0) pide una API JSON al nivel de Truora, Veriff y Didit: estados `pending`/`success`/`failure`, checks agrupados, `declined_reason`, webhooks HMAC-SHA256, sandbox e idempotencia. Hoy `server/` solo expone `/salud`. La Fase 4 necesita ese contrato fijo antes de construir el motor (re-decodificación PDF417, OCR), y el SDK de la Fase 4 se generará desde él. Adelantar solo el contrato permite que el cliente, el SDK y el motor avancen en paralelo contra una interfaz estable y verificada, con la privacidad (principio III) y la autorización del titular (Ley 1581 de 2012) exigidas desde el primer endpoint.

## What Changes

- Contrato OpenAPI 3.1 versionado en `server/openapi/api-validaciones.yaml`, servido en `GET /openapi.json`, con lint (Spectral) que incluye una regla que prohíbe campos de imagen o biometría en respuestas y webhooks.
- `POST /v1/validations`: crea una validación en `pending`. Exige `autorizacion.datos = true` y, si se pide comparación facial, `autorizacion.sensibles = true` (`docs/legal/autorizacion-tratamiento.md`). Registra versión del texto aceptado, fecha y hora, sin imágenes.
- Subida de imágenes por URL firmada de un solo uso (`front`, `back` y, solo con comparación facial, `selfie`) en una sola petición `multipart/form-data`, procesada de forma síncrona en memoria. Ninguna imagen sobrevive a la petición.
- `GET /v1/validations/{id}` con estados `pending`, `success`, `failure`, `review`; `declined_reason` enumerado; `checks[]` agrupados (`image_quality`, `data_validation`, `data_consistency`, `document_liveness` y `face_match` si se pidió); campos normalizados del documento y `warnings[]` con los IDs de hipótesis del formato.
- `DELETE /v1/validations/{id}`: supresión por revocación de la autorización; el resultado JSON desaparece.
- Webhooks `validation.completed` firmados con HMAC-SHA256 (`t=<unix>,v1=<hex>`), sin datos personales, con reintentos con backoff fijo y protección contra SSRF.
- `Idempotency-Key` en la creación; sandbox con claves `sk_test_` y escenarios sintéticos deterministas; errores RFC 9457 (`application/problem+json`); límites de tamaño y tipo de imagen y rate limiting por clave.
- Un motor de sandbox (stub) que cumple el contrato con fixtures sintéticos. El modo live sin motor configurado responde `503 engine-unavailable`.
- Nuevas dependencias del servidor, sujetas a `licencia-check`: `hypothesis` (MPL-2.0, dev), `python-multipart` (Apache-2.0), `pyyaml` (MIT), `httpx` pasa de dev a runtime (BSD-3-Clause).

Fuera de alcance: OCR, re-decodificación PDF417/MRZ, clasificador de versión, document liveness y face match reales (motor de la Fase 4 y Fase 5), SDK TypeScript generado, persistencia cifrada del JSON (Fase 7) y el despliegue en el VPS.

## Capabilities

### New Capabilities
- `api-validaciones`: API HTTP pública del servidor para crear, alimentar, consultar y suprimir validaciones de documento, con su contrato OpenAPI, autorización del titular, webhooks firmados, sandbox, idempotencia, errores RFC 9457, límites y garantías de no persistencia.

### Modified Capabilities
(ninguna)

## Impact

- Código: `server/app/` (rutas, motor de sandbox, webhooks, middleware de límites y logs), `server/openapi/` (contrato y reglas de lint), `server/tests/`, `server/carga/` (Locust), `server/compose.yaml` y `server/pyproject.toml`.
- API pública nueva bajo `/v1`; `/salud` no cambia.
- Pruebas en Docker: pytest + Hypothesis, Schemathesis 4.29.4, Spectral, ruff (S, T20), Semgrep CE, OWASP ZAP 2.17.0 y Locust 2.46.7.
- Privacidad: el `revisor-privacidad` debe revisar el cambio (toca servidor, logs y datos).
- Hipótesis del formato: los `warnings[]` del documento citan IDs de `docs/decisiones/hipotesis-formato.md`; este cambio no confirma ni refuta ninguna.
