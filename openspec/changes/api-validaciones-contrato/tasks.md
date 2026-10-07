# Tasks

Reglas para todas las tareas: TDD (principio II): cada prueba se escribe primero, se ve fallar y se adjunta esa salida como evidencia antes de implementar. Todo Python corre en Docker; nunca Python local. Datos sintéticos únicamente (skill `fixture-sintetico`): personas ficticias y números `9999...`. Las pruebas se nombran `test_AVxx_<escenario>`. Los comandos `P`, `A`, `L`, `Ln`, `C`, `Z`, `G`, `K`, `V` y `Lic` y los umbrales por requisito están en `design.md`, sección `## Pruebas`. Cada tarea es un PR pequeño; ninguna escribe imágenes a disco ni registra cuerpos, queries o cabeceras. Tipos de prueba usados:

- **Unitaria**: un test pytest por escenario con los literales de la spec e igualdad exacta.
- **Propiedad**: Hypothesis con generadores válidos por construcción, `max_examples` de la tabla y proporción de casos útiles medida (> 50 %).
- **Lint de contrato**: Spectral con el ruleset del proyecto, incluida la regla que prohíbe imagen y biometría en respuestas.
- **Contrato**: Schemathesis `--checks all` en Docker contra `host.docker.internal`.
- **Seguridad**: ruff `S` y `T20`, Semgrep CE (SAST), OWASP ZAP (DAST), `licencia-check`, `privacidad-check`.
- **Carga**: Locust en Docker.
- **Integración**: Docker Compose sobre el contenedor de solo lectura.

## 1. Base del servidor

- [x] 1.1 Añadir `hypothesis` al grupo `dev` y `python-multipart`, `pyyaml` y `httpx` a las dependencias de runtime de `server/pyproject.toml`; regenerar `uv.lock` en Docker; añadir a `server/compose.yaml` el servicio `api-pruebas` (imagen `produccion`, `read_only: true`, `tmpfs: /tmp`, puerto 8000, claves sintéticas `KT`, `KT2`, `KL` por `CLAVES_API_JSON`, `LIMITE_PETICIONES_POR_MINUTO=100000`, healthcheck sobre `/salud`, `--workers 1 --no-access-log`); montar `docs/decisiones/hipotesis-formato.md` en solo lectura en `pruebas`; perfil `ci` de Hypothesis en `server/tests/conftest.py` (`database=None`, `deadline=None`); añadir `server/reportes/` y `server/carga/reporte*` a `.gitignore`. Habilita AV-01 a AV-35; no cubre un escenario por sí sola. Tipos de prueba: **seguridad** (licencias). Verificación: `Lic` sin infracciones; `P` en verde con la prueba existente `test_salud_responde_ok`; `A` termina con el servicio `healthy`.

## 2. Contrato OpenAPI

- [x] 2.1 Escribir `server/openapi/.spectral.yaml` (extiende `spectral:oas`; reglas propias `sin-imagen-ni-biometria-en-respuestas`, `sin-binario-en-respuestas`, `errores-problem-json`, `creacion-con-idempotency-key`) y el fixture `server/openapi/pruebas/viola-imagen.yaml`; ver `Ln` fallar con 2 resultados de la regla. Después escribir `server/openapi/api-validaciones.yaml` (OpenAPI `3.1.1`): rutas de AV-01, esquemas `Validation`, `Document`, `Check`, `DeclinedReason`, `Problem`, `Autorizacion`, razones por categoría, cabeceras, ejemplos sintéticos, `links` de creación a consulta, subida y supresión, y el webhook `validation.completed`. Añadir las pruebas pytest que leen el YAML: "Enumerado en el contrato" (AV-15), "Códigos de razón por categoría" (AV-16), "Dominios de los campos en el contrato" (AV-18), "Patrón en el contrato" (AV-19). Cubre AV-01 (lint), AV-15, AV-16, AV-18, AV-19, AV-31 (lint). Tipos de prueba: **lint de contrato**, **unitaria**. Verificación: `L` con código 0 y 0 resultados; `Ln` con código distinto de 0 y exactamente 2 resultados de `sin-imagen-ni-biometria-en-respuestas`; `P` en verde.
- [x] 2.2 Servir el contrato en `GET /openapi.json` sustituyendo `app.openapi` y registrar rutas vacías que respondan 501 temporal solo hasta las tareas siguientes (la prueba de paridad ya exige el conjunto exacto). Escribir primero "El documento servido es el contrato" y "Paridad de rutas". Cubre AV-01. Tipos de prueba: **unitaria**. Verificación: `P` en verde; `L` sigue en 0.

## 3. Núcleo HTTP

- [x] 3.1 Errores RFC 9457 centralizados (decisión 13), `X-Request-Id`, cabeceras `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, 404 y 405 con `Allow`, 500 genérico. Escribir primero los escenarios de AV-29 "Estructura de un error de validación" (con un modelo mínimo de creación), "Ruta y método desconocidos" y la propiedad "Propiedad sobre cuerpos arbitrarios", y AV-33 en su versión para 404. Cubre AV-29, AV-33. Tipos de prueba: **unitaria**, **propiedad**. Verificación: `P` en verde con la propiedad a 1000 ejemplos, 0 respuestas 5xx y 0 apariciones de `ZZMARCAZZ`.
- [x] 3.2 Autenticación por `CLAVES_API_JSON` (hash SHA-256 de la clave, modo por prefijo) y aislamiento por cliente. Escribir primero los tres escenarios de AV-02. Cubre AV-02. Tipos de prueba: **unitaria**, **seguridad** (ruff `S`). Verificación: `P` en verde; los cuerpos 404 de "Validación de otro cliente" y de un `id` inexistente son iguales salvo `request_id`.
- [x] 3.3 Logs JSON con lista de claves permitidas, filtro que descarta el resto, access log de uvicorn desactivado y `route` como plantilla (decisión 14). Escribir primero una prueba de AV-32 sobre una petición `GET` con `?token=ZZMARCAZZ` y `Authorization: Bearer KT` que exija 0 apariciones de `ZZMARCAZZ`, `sk_test_` y `Authorization` en la salida capturada. Cubre AV-32 (base; el flujo completo se prueba en 9.1). Tipos de prueba: **unitaria**, **seguridad** (`privacidad-check`). Verificación: `P` en verde; `V` con código 0.

## 4. Creación de validaciones

- [x] 4.1 `POST /v1/validations` con modelo estricto (`extra="forbid"`), `autorizacion` y `face_match`, almacén en memoria y `GeneradorIds` y `Reloj` inyectables. Escribir primero todos los escenarios de AV-03, AV-04 (salvo el de idempotencia), AV-05 y AV-06, y la propiedad de AV-04. Cubre AV-03, AV-04, AV-05, AV-06. Tipos de prueba: **unitaria**, **propiedad**. Verificación: `P` en verde; propiedad de AV-04 con 1000 ejemplos y 100 % de 422.
- [x] 4.2 Validación de `webhook_url` al crear (decisión 10). Escribir primero "URLs rechazadas al crear" con las 5 URLs literales. Cubre AV-28 (creación). Tipos de prueba: **unitaria**. Verificación: `P` en verde.
- [x] 4.3 `Idempotency-Key` (decisión 12). Escribir primero los cinco escenarios de AV-12, el de AV-04 "La clave de idempotencia no se consume" y la propiedad de repetición. Para "Petición concurrente" usar un `asyncio.Event` inyectado que retiene la primera creación; nunca `sleep`. Cubre AV-12, AV-04. Tipos de prueba: **unitaria**, **propiedad**. Verificación: `P` en verde; repetición idéntica byte a byte en el 100 % de 500 ejemplos.
- [x] 4.4 Rate limiting por ventana deslizante (decisión 11). Escribir primero los tres escenarios de AV-11 y la propiedad de líneas de tiempo arbitrarias. Cubre AV-11. Tipos de prueba: **unitaria**, **propiedad**. Verificación: `P` en verde; propiedad con 1000 ejemplos y 0 ventanas con más de N aceptadas.

## 5. Subida y motor de sandbox

- [x] 5.1 Token de subida firmado y `upload.url` (decisión 4). Escribir primero los cinco escenarios de AV-08 y la propiedad de alteración. Cubre AV-08. Tipos de prueba: **unitaria**, **propiedad**. Verificación: `P` en verde; 100 % de 403 en 1000 alteraciones.
- [x] 5.2 Parser multipart en streaming sin disco con límites de tamaño y firma (decisión 3) y CORS para la ruta de subida. Escribir primero los escenarios de AV-10, "Falta una parte obligatoria", "Selfie sin comparación facial", "Selfie requerida" y "Preflight CORS" de AV-07, "Imagen grande sin archivos temporales" de AV-30 (verla fallar con el `request.form()` por defecto de Starlette) y la propiedad de tamaños de AV-10. Cubre AV-07, AV-10, AV-30. Tipos de prueba: **unitaria**, **propiedad**, **seguridad**. Verificación: `P` en verde; directorio `TMPDIR` vacío y 0 llamadas instrumentadas.
- [x] 5.3 `MotorSandbox` y fixtures `server/app/sandbox/fixtures/<tipo>/<escenario>.json` (decisión 15) con `sandbox_scenario`. Escribir primero "Subida completa en sandbox" (AV-07), los tres escenarios de AV-20, los dos de AV-18 con el objeto exacto, "Estructura en una validación exitosa" y "Razones vacías" (AV-16), "Nulidad según estado" (AV-15), "IDs existentes en el registro de hipótesis" (AV-19), los de AV-21 y "El almacén no guarda bytes" y la comprobación en tiempo de ejecución de AV-31. Cubre AV-07, AV-15, AV-16, AV-18, AV-19, AV-20, AV-21, AV-30, AV-31. Tipos de prueba: **unitaria**, **seguridad** (`privacidad-check`). Verificación: `P` en verde; `V` con código 0.
- [x] 5.4 Transiciones de estado, vencimiento del token por `Planificador` y lectura perezosa, segunda subida, modo live sin motor y error interno del motor. Escribir primero AV-09, los dos escenarios de AV-14, AV-22, "Error interno sin traza" de AV-29 y la máquina de estados de AV-17. Cubre AV-09, AV-14, AV-17, AV-22, AV-29. Tipos de prueba: **unitaria**, **propiedad**. Verificación: `P` en verde; máquina de estados con 500 ejemplos, 0 violaciones y los 7 escenarios de sandbox alcanzados.

## 6. Consulta, supresión y retención

- [x] 6.1 `GET` y `DELETE /v1/validations/{id}` y vencimiento de la retención. Escribir primero los escenarios de AV-13, "Supresión de una validación terminada" de AV-23 y AV-24, y la versión de AV-33 para creación y subida. Cubre AV-13, AV-23, AV-24, AV-33. Tipos de prueba: **unitaria**. Verificación: `P` en verde.

## 7. Webhooks

- [x] 7.1 Firma HMAC-SHA256 `t=,v1=` (decisión 8). Escribir primero los vectores 1 a 5 de AV-26 como literales (no recalcular el esperado con la función bajo prueba) y la propiedad de verificación. Cubre AV-26. Tipos de prueba: **unitaria**, **propiedad**. Verificación: `P` en verde; 5 de 5 vectores exactos; propiedad con 1000 ejemplos.
- [x] 7.2 Entrega del evento `validation.completed` con `Transporte` y `Resolvedor` inyectables, conexión a la IP comprobada (decisión 10) y log de intentos. Escribir primero los tres escenarios de AV-25, "Resolución a red interna" de AV-28 y la propiedad de rangos de IP. Cubre AV-25, AV-28. Tipos de prueba: **unitaria**, **propiedad**, **seguridad**. Verificación: `P` en verde; cuerpo de 232 bytes idéntico al de la spec.
- [x] 7.3 Reintentos con calendario fijo, timeout de 10 s, sin redirecciones y cancelación por `DELETE`. Escribir primero los tres escenarios de AV-27 y "Reintentos cancelados" de AV-23, con `Planificador` y `Reloj` falsos que el test avanza. Cubre AV-27, AV-23. Tipos de prueba: **unitaria**. Verificación: `P` en verde; instantes `t` exactos.

## 8. Verificación externa en Docker

- [x] 8.1 `server/schemathesis.toml` (estados esperados de `positive_data_acceptance`, sin `--baseline`) y ajustes del contrato que Schemathesis revele. Ver fallar primero `C` contra el estado anterior a los ajustes, o documentar que pasó a la primera con la salida completa. Cubre AV-34 (contrato) y, de forma transversal, AV-01 a AV-33. Tipos de prueba: **contrato**. Verificación: `A` y luego `C` con código 0 y 0 fallos; informe JUnit en `server/reportes/schemathesis/` (ignorado por git).
- [x] 8.2 Escaneos de seguridad: corregir lo que reporten ZAP y Semgrep. Cubre AV-34 (DAST y SAST). Tipos de prueba: **seguridad**. Verificación: `A` y luego `Z` con 0 alertas de `riskcode` 3; `G` con 0 hallazgos; `P` con ruff `S` y `T20` sin hallazgos.
- [x] 8.3 `server/carga/locustfile.py` con el flujo creación, subida y consulta en sandbox e imágenes sintéticas generadas en memoria, y el umbral de salida en el evento `quitting`. Verlo fallar primero con un umbral temporal de 1 ms. Cubre AV-35. Tipos de prueba: **carga**. Verificación: `A` y luego `K` con código 0, p95 < 3000 ms por endpoint y 0 fallos en `server/carga/reporte_stats.csv` (ignorado por git).

## 9. Integración

- [ ] 9.1 Comprobación de privacidad de extremo a extremo y cierre. Escribir "Flujo completo sin datos personales en logs" y "Errores sin datos personales en logs" de AV-32 y "Contenedor de solo lectura" de AV-30. Cubre AV-30, AV-31, AV-32 y la integración de AV-01 a AV-35. Tipos de prueba: **integración**, **unitaria**, **seguridad**. Verificación: `P`, `L`, `Ln` (falla esperada), `A`, `docker compose -f server/compose.yaml exec api-pruebas find /tmp -type f` con salida vacía, `C`, `Z`, `G`, `K`, `V` y `npm run check` en verde; `openspec validate api-validaciones-contrato --strict` válido.

## Workflow follow-up

- Ratificar las preguntas 1 a 3 de `design.md` (Open Questions) antes de `/opsx:apply`.
- Tras la implementación: `verificador` (spec contra código) y `pr-test-analyzer` en paralelo; `revisor-privacidad` obligatorio (servidor, logs y datos); `revisor-licencias` por las dependencias nuevas.
- Archivar con `/opsx:archive` solo con el veredicto CONFIRMADO del verificador.
