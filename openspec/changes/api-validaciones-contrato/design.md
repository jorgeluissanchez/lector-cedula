# Design

## Context

Motivación en `proposal.md`. Estado actual de `server/`: FastAPI con un único endpoint `/salud`, `pyproject.toml` con `fastapi` y `uvicorn` y, en dev, `pytest`, `httpx` y `ruff` (reglas `E F I B UP S T20`). `compose.yaml` define `pruebas` (ruff + pytest, código montado en solo lectura) y `api` (imagen de producción, `read_only: true`, `tmpfs: /tmp`). Python local está bloqueado: todo comando Python corre en Docker.

Restricciones que dan forma al diseño:

- Principio III: el servidor procesa solo en memoria, no escribe imágenes a disco, no hay PII en logs, toda validación exige autorización expresa (`docs/legal/autorizacion-tratamiento.md`).
- Principio VI: el documento normalizado depende de hipótesis pendientes (H03, H05, H06 en la amarilla; M02 en la digital). `place_of_birth.divipol_department` y `divipol_municipality` asumen H05 y H06; por eso los fixtures de sandbox las declaran en `document.warnings` (AV-19).
- Este cambio entrega contrato más stub. El motor real (re-decodificación, OCR, liveness, face match) llega en cambios posteriores y se enchufa en la interfaz `Motor` (decisión 6).

## Goals / Non-Goals

**Goals:**
- Un contrato OpenAPI 3.1 estable, linteado y probado por contrato, del que más adelante se genere el SDK TypeScript.
- Un stub en sandbox que cumple el 100 % del contrato con datos sintéticos, para que cliente y SDK se integren ya.
- Garantías de privacidad comprobadas por pruebas automáticas, no por revisión manual.

**Non-Goals:**
- Lectura real de imágenes (ni siquiera de dimensiones: la protección contra bombas de descompresión llega con el motor).
- Almacén persistente o cifrado del resultado, auditoría de accesos y rotación de secretos (Fase 7).
- Varios workers o varias réplicas del servidor.
- Documentos distintos de `co_national-id-2000` y `co_national-id-2020` (Fase 6) y tratamiento de menores.

## Decisions

1. **El contrato YAML es la fuente de verdad.** `server/openapi/api-validaciones.yaml` se escribe a mano y la aplicación lo carga al arrancar (PyYAML) y lo sirve en `/openapi.json` sustituyendo `app.openapi`. Los modelos Pydantic validan las peticiones; la prueba de paridad (AV-01) y Schemathesis (AV-34) detectan cualquier deriva. Alternativa descartada: dejar que FastAPI genere el documento, porque el lint, los `links`, los `webhooks`, los ejemplos y las respuestas `problem+json` quedarían repartidos en decoradores y la deriva sería invisible hasta Schemathesis.

2. **Subida única y síncrona.** Las tres partes (`front`, `back`, `selfie` opcional) van en un solo `multipart/form-data` y la validación termina dentro de esa petición. Así ninguna imagen espera en memoria entre peticiones y el ciclo de vida de los bytes coincide con el de la petición. Se desvía de `PLAN.md` (Fase 4, tarea 3: `PUT` por lado), que obligaría a guardar el anverso hasta que llegue el reverso. Se mantiene la "URL firmada" del plan. Con el motor real, el objetivo p95 menor a 3 s hace viable la respuesta síncrona; si no lo fuera, un cambio posterior añadiría `202` con procesamiento en segundo plano, siempre en memoria.

3. **Multipart sin disco.** Starlette guarda las partes de archivo de más de 1 MiB en `SpooledTemporaryFile`, que escribe en `/tmp`. Se usa el parser en streaming de `python-multipart` con callbacks que acumulan cada parte en un `bytearray` y abortan al superar 8 MiB por parte o 20 MiB en total; `Content-Length` se comprueba antes de leer. La firma del tipo se comprueba con los bytes iniciales (`FF D8 FF` para JPEG, `89 50 4E 47 0D 0A 1A 0A` para PNG). AV-30 instrumenta `SpooledTemporaryFile.rollover` y `os.open` para que cualquier regresión falle. Alternativa descartada: subir `spool_max_size` de Starlette, porque depende de un atributo interno y no limita la memoria por parte.

4. **Token de subida.** `token = base64url(exp_be64 || HMAC-SHA256(SECRETO_SUBIDA, id + "." + exp))` sin relleno (54 caracteres). Se verifica en tiempo constante (`hmac.compare_digest`). El uso único se deriva del estado: tras la subida la validación deja `pending` y todo reintento recibe 409 (AV-09). El token viaja en la query, por lo que el middleware de logs nunca registra query strings y todas las respuestas llevan `Referrer-Policy: no-referrer` (AV-32, AV-33).

5. **Almacén en memoria con un solo worker.** Diccionario `id -> Validación` protegido por `asyncio.Lock`, con vencimientos (token y retención) evaluados por un planificador y, de forma perezosa, en cada lectura. Uvicorn arranca con `--workers 1`. Un reinicio pierde validaciones, claves de idempotencia y reintentos pendientes: es coherente con "sin persistencia" y queda como riesgo. La Fase 7 decide el almacén cifrado.

6. **Puertos inyectables para pruebas deterministas.** `Reloj`, `GeneradorIds`, `Transporte` (cliente HTTP de webhooks, httpx en producción), `Resolvedor` (DNS), `Planificador` (reintentos y vencimientos) y `Motor` (`procesar(tipo, face_match, imagenes) -> Resultado`). En producción: reloj del sistema, `secrets.token_hex`, httpx, `getaddrinfo`, tareas asyncio. En pruebas: dobles controlados por el test, nunca esperas por tiempo. El modo sandbox usa `MotorSandbox`; el modo live usa el motor configurado y, si no hay ninguno, responde 503 (AV-22).

7. **Claves y secretos por variable de entorno.** `CLAVES_API_JSON` contiene una lista de `{ "sha256": <hash de la clave>, "secreto_webhook": "whsec_..." }`; el modo sale del prefijo de la clave. `SECRETO_SUBIDA`, `URL_PUBLICA`, `ORIGENES_CORS`, `LIMITE_PETICIONES_POR_MINUTO` (60), `RETENCION_RESULTADOS_S` (86 400) y `BASE_TIPOS_PROBLEMA` (`https://lector-cedula.example/problemas/`) también. Nada se lee de disco salvo el contrato y los fixtures empaquetados en la imagen.

8. **Firma del webhook al estilo `t=,v1=`.** Se firma `<t>.<cuerpo>` para que el receptor pueda rechazar repeticiones por antigüedad de `t`; `v1` deja espacio para rotar el esquema. El cuerpo se serializa una vez (`json.dumps(..., separators=(",", ":"), ensure_ascii=False)`, orden de claves fijo) y esos mismos bytes se firman y se envían. Los vectores de AV-26 se calcularon con dos implementaciones independientes (Node `crypto` y `openssl dgst -hmac`).

9. **Webhook sin datos personales.** El evento solo lleva identificadores y veredicto; el cliente consulta el detalle con su clave. Minimiza lo que viaja a terceros y lo que queda en colas de reintento. Alternativa descartada: incluir `document` como Veriff en algunos eventos, porque multiplica las copias de PII.

10. **Reintentos y SSRF.** Calendario fijo `[0, 60, 300, 1800, 7200, 21600]` s desde el primer intento, timeout de 10 s, sin seguir redirecciones. La URL se valida al crear (esquema `https`, sin credenciales, host no IP literal, máximo 2048) y, al entregar, el host se resuelve con el `Resolvedor` y la conexión se hace a la IP ya comprobada (transporte httpx con resolución fijada), lo que cierra el DNS rebinding entre comprobación y conexión.

11. **Rate limiting por ventana deslizante.** Registro de marcas de tiempo por hash de clave (`collections.deque` de como máximo N elementos). Garantiza "como máximo N en cualquier ventana de 60 s", que un token bucket no garantiza (permite hasta 2N). Se aplica antes de leer el cuerpo. Las subidas con token cuentan para la clave creadora.

12. **Idempotencia.** Entrada `(hash de clave, Idempotency-Key) -> (sha256 del cuerpo canónico, estado HTTP, bytes del cuerpo, cabeceras, vence)`, con un marcador "en curso" que responde 409. Cuerpo canónico: JSON parseado y reserializado con `sort_keys=True`; si no es JSON, los bytes crudos. Solo se guardan respuestas 201: un 4xx no consume la clave (AV-04). La respuesta de creación no contiene datos del documento, así que la caché no guarda PII.

13. **Errores RFC 9457 centralizados.** Manejadores para `RequestValidationError`, errores HTTP y excepciones no controladas. Los errores de Pydantic se traducen a `{pointer, code}` sin el campo `input` ni `ctx`; nunca se usa el mensaje de una excepción como `detail`. `code` es el slug final de `type`.

14. **Logs.** `logging` de la biblioteca estándar con un formateador JSON propio y un filtro que descarta toda clave fuera de la lista de AV-32. Se desactiva el access log de uvicorn (`--no-access-log` y `log_config` propio) porque registra la query con el token. Sin dependencia nueva.

15. **Fixtures de sandbox.** `server/app/sandbox/fixtures/<tipo>/<escenario>.json` con `"sintetico": true`, personas ficticias y números `9999...`. Se empaquetan en la imagen. El contenido de las imágenes válidas se ignora en sandbox: el escenario lo fija `sandbox_scenario`. Los nombres incluyen `PEÑA`, `NUÑEZ`, `DE LA OSSA`, RH `AB-` y segundo nombre ausente para que el cliente pruebe los errores pasados de `CLAUDE.md`.

16. **Herramientas en Docker, nunca Python local.** Spectral, Schemathesis, ZAP, Semgrep y Locust corren con imágenes fijadas por versión (verificadas el 2026-10-06 con `docker manifest inspect`). Para Schemathesis, ZAP y Locust se añade al compose el servicio `api-pruebas` (misma imagen que `api`, `read_only: true`, `tmpfs: /tmp`, claves sintéticas de prueba, límite de peticiones en 100 000, healthcheck sobre `/salud`). Schemathesis usa `server/schemathesis.toml` para declarar los estados esperados de `positive_data_acceptance` (por ejemplo, 415 ante bytes aleatorios declarados como imagen) y nunca `--baseline` para aceptar fallos.

17. **Nombres de campos.** Claves en inglés `snake_case` como Truora y Didit, salvo el objeto `autorizacion` (`datos`, `sensibles`, `version_texto`, `otorgada_en`, `registrada_en`), que conserva los nombres de `docs/legal/autorizacion-tratamiento.md`. Ver preguntas abiertas.

## Pruebas

Según el principio II y la fila "API servidor" de `.claude/skills/estrategia-pruebas/SKILL.md`. Comandos (todos desde la raíz del repositorio, en Git Bash; `$(pwd -W)` da la ruta Windows para los montajes):

- `P` = `docker compose -f server/compose.yaml run --rm pruebas` (ruff con `S` y `T20`, `ruff format --check` y pytest con Hypothesis, perfil `ci`: `database=None`, `deadline=None`).
- `A` = `docker compose -f server/compose.yaml up -d --build --wait api-pruebas` (requisito previo de `C`, `Z`, `K` y del último escenario de AV-30).
- `L` = `docker run --rm -v "$(pwd -W)/server/openapi:/oa" -w /oa stoplight/spectral:6.17.0 lint api-validaciones.yaml --ruleset .spectral.yaml --fail-severity warn`
- `Ln` = igual que `L` sobre `pruebas/viola-imagen.yaml`; debe terminar con código distinto de 0.
- `C` = `docker run --rm -v "$(pwd -W)/server:/w" ghcr.io/schemathesis/schemathesis:4.29.4 --config-file /w/schemathesis.toml run http://host.docker.internal:8000/openapi.json --checks all -w auto -n 200 -H "Authorization: Bearer sk_test_00000000000000000000000000000000" --report junit --report-dir /w/reportes/schemathesis`
- `Z` = `docker run --rm -e ZAP_AUTH_HEADER_VALUE="Bearer sk_test_00000000000000000000000000000000" -v "$(pwd -W)/server/reportes:/zap/wrk:rw" -t ghcr.io/zaproxy/zaproxy:2.17.0 zap-api-scan.py -t http://host.docker.internal:8000/openapi.json -f openapi -I -J zap.json -r zap.html` seguido de `node -e "const r=require('./server/reportes/zap.json');const h=r.site.flatMap(s=>s.alerts).filter(a=>a.riskcode==='3');console.log(h.length);process.exit(h.length?1:0)"`
- `G` = `docker run --rm -v "$(pwd -W)/server:/src" semgrep/semgrep:1.179.0 semgrep scan --config p/python --error --metrics=off /src/app`
- `K` = `docker run --rm -v "$(pwd -W)/server/carga:/mnt/locust" locustio/locust:2.46.7 -f /mnt/locust/locustfile.py --headless -u 2 -r 2 -t 60s --host http://host.docker.internal:8000 --csv /mnt/locust/reporte --only-summary` (el `locustfile` fija `process_exit_code = 1` en el evento `quitting` si algún p95 es mayor o igual a 3000 ms o hay fallos).
- `V` = `npm run check:privacidad`
- `Lic` = `node tools/licencia-check.mjs --pip hypothesis python-multipart pyyaml httpx`

Convención de nombres: cada prueba pytest se llama `test_AVxx_<escenario>` y lleva en el docstring el texto del escenario. Las propiedades usan generadores válidos por construcción y miden la proporción de casos útiles con `hypothesis.event` o contadores (más del 50 %, según la sección 4 de la skill).

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| AV-01 | Lint del contrato | Spectral 6.17.0 | L | código 0; 0 resultados `error` o `warn` |
| AV-01 | Unitaria: documento servido igual al YAML y paridad de rutas | pytest | P | 3 de 3 escenarios en verde |
| AV-02 | Unitaria: sin cabecera, clave desconocida, otro cliente | pytest | P | 3 de 3; cuerpos 404 iguales salvo `request_id` |
| AV-03 | Unitaria: creación mínima con conjunto exacto de claves, enumerado, campo extra, 16 385 bytes | pytest | P | 4 de 4 con igualdad exacta |
| AV-04 | Unitaria: ausente, `false`, `"true"`, `1`; idempotencia no consumida | pytest | P | 3 de 3; tamaño del almacén sin cambio |
| AV-04 | Propiedad: todo valor de `autorizacion.datos` distinto de `True` (`st.from_type(object)` filtrado, más booleanos, cadenas, números y `None`) da 422 | Hypothesis | P | max_examples 1000; 100 % 422 con `pointer` `/autorizacion/datos`; casos útiles > 50 % |
| AV-05 | Unitaria: los tres escenarios | pytest | P | 3 de 3 |
| AV-06 | Unitaria: eco exacto, futuro +301 s, margen +300 s, versión inválida | pytest | P | 4 de 4 |
| AV-07 | Unitaria: subida completa, parte faltante, selfie inesperada, selfie requerida, CORS | pytest | P | 5 de 5; estado `pending` tras cada rechazo |
| AV-08 | Unitaria: forma de URL, token alterado, de otra validación, vencido, clave del creador | pytest | P | 5 de 5 |
| AV-08 | Propiedad: cualquier alteración de un carácter del token o de `id` da 403 | Hypothesis | P | max_examples 1000; 100 % 403 |
| AV-09 | Unitaria: segunda subida | pytest | P | 409 y cuerpo de `GET` idéntico byte a byte |
| AV-10 | Unitaria: 8 MiB exactos, 8 MiB + 1, `Content-Length` excesivo, tipo y firma, parte vacía | pytest | P | 5 de 5 |
| AV-10 | Propiedad: tamaños en `[0, 8 MiB + 64]` alrededor de los bordes y firmas aleatorias | Hypothesis | P | max_examples 300; 200 si y solo si tamaño en `[1, 8 388 608]` y firma válida; casos con borde ±1 >= 20 % |
| AV-11 | Unitaria: petición 61, otra clave, ventana liberada | pytest | P | 3 de 3; `Retry-After: 60` |
| AV-11 | Propiedad: líneas de tiempo arbitrarias de peticiones | Hypothesis | P | max_examples 1000; en toda ventana de 60 s, aceptadas <= N; ninguna rechazada si hay hueco |
| AV-12 | Unitaria: repetición exacta, otro cuerpo, concurrente, clave inválida, alcance y vencimiento | pytest | P | 5 de 5; bytes idénticos en la repetición |
| AV-12 | Propiedad: cuerpos válidos arbitrarios repetidos devuelven bytes idénticos y un solo `id` | Hypothesis | P | max_examples 500; 100 % |
| AV-13 | Unitaria: consulta terminada, ids mal formados | pytest | P | 2 de 2 |
| AV-14 | Unitaria: vencimiento sin subida, estado terminal inmutable | pytest | P | 2 de 2 |
| AV-15 | Unitaria: enumerado del contrato y nulidad según estado | pytest | P | 12 valores exactos y en orden |
| AV-16 | Unitaria: estructura exitosa, códigos por categoría, razones vacías | pytest | P | 3 de 3 con igualdad exacta |
| AV-17 | Propiedad con máquina de estados (`RuleBasedStateMachine`) | Hypothesis | P | 500 secuencias (`max_examples=500`, `stateful_step_count=20`); 0 violaciones; todos los escenarios de sandbox alcanzados al menos una vez |
| AV-18 | Unitaria: amarilla y digital exactas, dominios del contrato | pytest | P | 3 de 3 con igualdad exacta |
| AV-19 | Unitaria: IDs de los fixtures presentes en `docs/decisiones/hipotesis-formato.md` (montado en solo lectura en `pruebas`); patrón del contrato | pytest | P | 100 % de IDs encontrados |
| AV-20 | Unitaria: tabla de 7 escenarios, incompatibles, campo en live | pytest | P | 7 + 2 + 1 casos con igualdad exacta |
| AV-21 | Unitaria: marca y prefijo; control de privacidad | pytest, `privacidad-check` | P, V | 100 % de fixtures; V con código 0 |
| AV-22 | Unitaria: subida live sin motor | pytest | P | 503, `pending`, 0 webhooks encolados |
| AV-23 | Unitaria: supresión y 404 posteriores; reintentos cancelados | pytest | P | 2 de 2; 0 intentos tras `DELETE` |
| AV-24 | Unitaria: vencimiento de la retención | pytest | P | `expires_at` exacto y 404 a +1 s |
| AV-25 | Unitaria: cuerpo exacto de 232 bytes, sin datos del documento, sin webhook | pytest | P | igualdad de bytes; 0 apariciones de marcadores |
| AV-26 | Unitaria: vectores 1 a 5 | pytest | P | 5 de 5 hexadecimales exactos |
| AV-26 | Propiedad: firma y verificación de cuerpos binarios arbitrarios; alteración de un byte | Hypothesis | P | max_examples 1000; 100 % verdadero y 100 % falso |
| AV-27 | Unitaria con `Planificador` y `Transporte` falsos: tercer intento, agotados, redirección | pytest | P | instantes `t` exactos; 3 y 6 intentos; 0 peticiones a `otro.example` |
| AV-28 | Unitaria: 5 URLs rechazadas; resolución a `10.0.0.5` | pytest | P | 5 de 5 con 422; 0 peticiones y `outcome` `blocked` |
| AV-28 | Propiedad: IPs generadas de rangos loopback, privados, link-local y multicast (IPv4 e IPv6) | Hypothesis | P | max_examples 1000; 100 % bloqueadas |
| AV-29 | Unitaria: estructura, sin eco, 404 y 405, error interno | pytest | P | 4 de 4 |
| AV-29 | Propiedad: 1000 cuerpos JSON arbitrarios con marcador | Hypothesis | P | 0 respuestas 5xx; 100 % `problem+json` válidas contra `Problem`; 0 apariciones de `ZZMARCAZZ` |
| AV-30 | Unitaria con instrumentación: imagen grande sin temporales; almacén sin bytes | pytest | P | directorio vacío; 0 llamadas instrumentadas; 0 valores binarios |
| AV-30 | Integración en contenedor de solo lectura | Docker Compose | A, luego `docker compose -f server/compose.yaml exec api-pruebas find /tmp -type f` | `read_only: true` en la configuración; salida vacía |
| AV-31 | Lint: regla propia `sin-imagen-ni-biometria-en-respuestas` sobre el contrato y sobre el fixture que viola | Spectral | L, Ln | 0 resultados en L; código distinto de 0 y exactamente 2 resultados de la regla en Ln |
| AV-31 | Unitaria en tiempo de ejecución sobre respuestas y webhooks | pytest | P | 0 claves prohibidas; 0 cadenas > 512 caracteres |
| AV-32 | Unitaria: captura de logs en el flujo completo y en el error interno | pytest (`caplog` y captura de stdout) | P | 100 % de líneas JSON con claves permitidas; 0 apariciones de marcadores |
| AV-32 | Control estático de logs | `privacidad-check` | V | código 0 |
| AV-33 | Unitaria: cabeceras en creación, subida y 404 | pytest | P | 3 de 3; `X-Request-Id` UUID v4 |
| AV-34 | Contrato | Schemathesis 4.29.4 | A, C | código 0; 0 fallos con `--checks all`; sin `--baseline` |
| AV-34 | DAST | OWASP ZAP 2.17.0 | A, Z | 0 alertas `riskcode` 3 |
| AV-34 | SAST | ruff (`S`, `T20`), Semgrep CE 1.179.0 | P, G | 0 hallazgos en ambos |
| AV-35 | Carga | Locust 2.46.7 | A, K | código 0; p95 < 3000 ms por endpoint; 0 fallos |
| Todos | Validación de la spec | OpenSpec | `openspec validate api-validaciones-contrato --strict` | válido |

## Risks / Trade-offs

- [Reinicio del proceso pierde validaciones, idempotencia y reintentos de webhook] → Documentado en el contrato (`description` de la API); el webhook es una notificación, el cliente puede consultar con `GET` mientras no venza la retención; almacén cifrado y outbox en la Fase 7.
- [Un solo worker limita el rendimiento] → El motor real se ejecutará fuera del bucle de eventos (pool de procesos en memoria); la carga de AV-35 se repite con el motor en el VPS KVM 2 antes de cerrar la Fase 4.
- [El p95 medido con el stub no representa el del motor] → AV-35 solo mide la sobrecarga del contrato; el cambio del motor hereda el mismo escenario de Locust con imágenes sintéticas reales.
- [Agotamiento de memoria por validaciones `pending` acumuladas] → El rate limiting acota la creación por clave; un tope global de validaciones en memoria se decide con el motor (pregunta abierta).
- [El token en la query puede filtrarse por historial o proxies] → Vigencia de 900 s, un solo uso efectivo, `Referrer-Policy: no-referrer`, logs sin query; alternativa futura: token en cabecera para clientes que la soporten.
- [Schemathesis o ZAP chocan con el rate limiting] → `api-pruebas` corre con límite de 100 000; el límite real se prueba con pytest (AV-11).
- [Las reglas de Semgrep del registry son solo para uso interno] → Se usan solo en CI interno con `--metrics=off`; no se redistribuyen.
- [Desviación de `PLAN.md` (subida única, nombres de campos)] → Registrada en las decisiones 2 y 17 y en las preguntas abiertas para ratificación humana.

## Migration Plan

API nueva, sin consumidores: no hay migración. Despliegue: imagen `produccion` con las variables de la decisión 7; en este cambio solo se ejecuta en local con `api-pruebas`. Reversión: retirar las rutas `/v1` deja `/salud` intacto.

## Open Questions

Las marcadas **(ratificar antes de `/opsx:apply`)** podrían cambiar la spec; el redactor eligió un valor por defecto para no bloquear la redacción, pero requiere aprobación humana. Las demás son configurables y se pueden decidir después.

1. **(ratificar antes de `/opsx:apply`)** Prueba de la autorización frente a la supresión. El Decreto 1377 de 2013 obliga al responsable a conservar prueba de la autorización, y `docs/legal/autorizacion-tratamiento.md` dice que la revocación elimina el resultado JSON. AV-23 borra todo, incluido el registro de `autorizacion`. ¿Debe sobrevivir a `DELETE` un registro mínimo sin datos del documento (`id`, `version_texto`, `otorgada_en`, `registrada_en`, casillas, `revocada_en`)? Requiere asesoría legal.
2. **(ratificar antes de `/opsx:apply`)** Subida única síncrona en lugar de `PUT` por lado (decisión 2) y nombre `autorizacion.datos` en lugar de `user_authorized` de Truora (decisión 17), con claves mezcladas en español e inglés.
3. **(ratificar antes de `/opsx:apply`)** Política de veredicto del sandbox: con la tabla de AV-20, `data_consistency` y `document_liveness` llevan a `review` y no a `failure` ("nunca una señal sola rechaza", Fase 5). La política real del motor es una decisión humana (`PLAN.md`, sección 4).
4. Retención por defecto de 24 h (`RETENCION_RESULTADOS_S`) y vigencia del token de 900 s.
5. Límites por defecto: 8 MiB por imagen, 20 MiB por petición, 60 peticiones por minuto por clave, 6 intentos de webhook en 6 h.
6. Dominio definitivo para los `type` de RFC 9457 (hoy `https://lector-cedula.example/problemas/`, configurable).
7. Rotación de claves de API y de secretos de webhook (dos secretos válidos a la vez, varias firmas `v1` en la cabecera) y tope global de validaciones en memoria.
8. Si se añade prueba de mutación al servidor (mutmut, umbral 70 % en validadores, como sugiere `docs/investigacion/04-testing-herramientas-y-skills.md`), que hoy no está en la fila "API servidor" de la matriz.

## Decisiones del orquestador (2026-10-06, pendientes de ratificación humana y legal)

- Pregunta 1: `DELETE` conserva un registro mínimo de prueba de la autorización (versión del texto, fechas, identificador de la validación, sin ningún dato del documento ni imágenes), por el deber de prueba del Decreto 1377 de 2013. Requiere validación de un abogado; si la tarea de AV-23 choca con esto, el implementador ajusta la spec por OpenSpec antes de codificar.
- Pregunta 2: se aceptan la subida única síncrona y el objeto `autorizacion` en español (nombres del documento legal).
- Pregunta 3: el sandbox mantiene `review` para `data_consistency` y `document_liveness`.
- Preguntas 4 a 7: se aceptan los valores por defecto propuestos como configuración, no como constantes.
- Pregunta 8: la mutación del servidor (mutmut >= 70 %) entra en un cambio posterior, cuando exista lógica real además del stub.
