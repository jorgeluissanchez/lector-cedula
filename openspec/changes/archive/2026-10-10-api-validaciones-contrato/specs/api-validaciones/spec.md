# Spec Delta

## Purpose

API HTTP pública del servidor de respaldo para crear, alimentar con imágenes, consultar y suprimir validaciones de la cédula colombiana, al nivel de Truora, Veriff y Didit, con autorización expresa del titular y sin persistir imágenes ni datos personales en logs.

Convenciones de esta spec (aplican a todos los escenarios):

- Claves sintéticas: `KT` = `sk_test_00000000000000000000000000000000` (sandbox), `KT2` = `sk_test_11111111111111111111111111111111` (sandbox, otro cliente), `KL` = `sk_live_22222222222222222222222222222222` (live). Se envían como `Authorization: Bearer <clave>`.
- `AUT` = `{"datos": true, "sensibles": false, "version_texto": "2026-10-01", "otorgada_en": "2026-10-06T15:19:00Z"}`.
- `CREAR` = `POST /v1/validations` con cuerpo `{"document_type": "co_national-id-2000", "autorizacion": AUT}` y `KT`.
- Reloj inyectado: "ahora" = `2026-10-06T15:20:00Z` (unix `1791300000`) salvo que el escenario diga otra cosa.
- `IMG_JPEG` = imagen JPEG sintética válida de 1280x800 px y menos de 200 KiB generada en la prueba; `IMG_PNG` igual en PNG.
- `PROBLEM(slug)` = respuesta con `Content-Type: application/problem+json` y `type` = `https://lector-cedula.example/problemas/<slug>`.
- Toda persona de los fixtures es ficticia; los números de documento empiezan por `9999` (skill `fixture-sintetico`).

## ADDED Requirements

### Requirement: AV-01 Contrato OpenAPI 3.1 publicado
El servidor SHALL tener su contrato en `server/openapi/api-validaciones.yaml` (OpenAPI `3.1.1`) y SHALL servirlo sin cambios semánticos en `GET /openapi.json`. El conjunto de pares ruta y método implementados MUST ser igual al declarado en el contrato.

#### Scenario: El documento servido es el contrato
- **WHEN** se hace `GET /openapi.json` sin autenticación
- **THEN** la respuesta es 200 con `Content-Type: application/json`, el campo `openapi` vale `"3.1.1"` y el JSON es igual, tras cargar ambos como objetos, al YAML de `server/openapi/api-validaciones.yaml`

#### Scenario: Paridad de rutas
- **WHEN** se comparan las rutas registradas en la aplicación con `paths` del contrato
- **THEN** ambos conjuntos son exactamente `{GET /salud, GET /openapi.json, POST /v1/validations, GET /v1/validations/{id}, DELETE /v1/validations/{id}, POST /v1/validations/{id}/images}` y el contrato declara el webhook `validation.completed` en `webhooks`

#### Scenario: Lint del contrato
- **WHEN** se ejecuta Spectral con el ruleset `server/openapi/.spectral.yaml` sobre el contrato
- **THEN** termina con código 0 y 0 resultados de severidad `error` o `warn`

### Requirement: AV-02 Autenticación por clave de API
Toda ruta bajo `/v1` SHALL exigir `Authorization: Bearer <clave>` con una clave configurada, salvo la subida con token firmado (AV-08). El prefijo `sk_test_` selecciona el modo sandbox y `sk_live_` el modo live. Una validación SHALL ser visible solo para la clave que la creó.

#### Scenario: Sin cabecera de autorización
- **WHEN** se hace `GET /v1/validations/val_0123456789abcdef0123456789abcdef` sin `Authorization`
- **THEN** la respuesta es 401 `PROBLEM(unauthorized)` con cabecera `WWW-Authenticate: Bearer`

#### Scenario: Clave desconocida
- **WHEN** se hace `CREAR` con `Authorization: Bearer sk_test_99999999999999999999999999999999`, clave no configurada
- **THEN** la respuesta es 401 `PROBLEM(unauthorized)` y no se crea ninguna validación

#### Scenario: Validación de otro cliente
- **WHEN** se crea una validación con `KT` y se consulta su `id` con `KT2`
- **THEN** la respuesta es 404 `PROBLEM(not-found)`, idéntica a la de un `id` inexistente salvo `request_id`

### Requirement: AV-03 Creación de una validación
`POST /v1/validations` SHALL crear una validación en estado `pending` y responder 201 con el objeto validación y la cabecera `Location: /v1/validations/{id}`. El `id` MUST cumplir `^val_[0-9a-f]{32}$` y generarse con un generador criptográficamente seguro. El cuerpo MUST rechazar campos no declarados.

#### Scenario: Creación mínima en sandbox
- **WHEN** se hace `CREAR`
- **THEN** la respuesta es 201, `Location` es `/v1/validations/<id>` y el cuerpo tiene exactamente las claves `id`, `object`, `sandbox`, `document_type`, `face_match`, `status`, `declined_reason`, `checks`, `document`, `autorizacion`, `upload`, `webhook_url`, `created_at`, `updated_at`, `completed_at`, `expires_at`, con `object` `"validation"`, `sandbox` `true`, `document_type` `"co_national-id-2000"`, `face_match` `false`, `status` `"pending"`, `declined_reason` `null`, `checks` `[]`, `document` `null`, `webhook_url` `null`, `completed_at` `null` y `created_at` `"2026-10-06T15:20:00Z"`

#### Scenario: Tipo de documento fuera del enumerado
- **WHEN** se hace `CREAR` con `document_type` `"co_passport"`
- **THEN** la respuesta es 422 `PROBLEM(invalid-request)` con `errors` `[{"pointer": "/document_type", "code": "invalid_value"}]`

#### Scenario: Campo no declarado
- **WHEN** se hace `CREAR` añadiendo `"nombre_cliente": "PRUEBA"` al cuerpo
- **THEN** la respuesta es 422 `PROBLEM(invalid-request)` con `errors` `[{"pointer": "/nombre_cliente", "code": "unexpected_field"}]`

#### Scenario: Campo no declarado con un nombre que no se reproduce
- **WHEN** se hace `CREAR` añadiendo `"campo_9999123456": "FICTICIA"` al cuerpo, cuyo nombre no cumple `^[a-z_]{1,64}$`
- **THEN** la respuesta es 422 `PROBLEM(invalid-request)` con `errors` `[{"pointer": "", "code": "unexpected_field"}]`: el `pointer` solo reproduce nombres de campo que cumplen `^[a-z_]{1,64}$` y, si un segmento no lo cumple, se corta en su padre (aquí, la raíz), para no devolver datos del cliente (AV-29)

#### Scenario: Cuerpo JSON demasiado grande
- **WHEN** se hace `POST /v1/validations` con `KT` y un cuerpo de 16385 bytes
- **THEN** la respuesta es 413 `PROBLEM(request-too-large)`

### Requirement: AV-04 Autorización de tratamiento de datos obligatoria
La creación SHALL rechazarse con 422 si `autorizacion.datos` no es exactamente el booleano `true` (Ley 1581 de 2012; `docs/legal/autorizacion-tratamiento.md`). Un rechazo por autorización MUST NOT crear la validación ni consumir la `Idempotency-Key`.

#### Scenario: Autorización ausente
- **WHEN** se hace `POST /v1/validations` con `KT` y cuerpo `{"document_type": "co_national-id-2000"}`
- **THEN** la respuesta es 422 `PROBLEM(invalid-request)` con `errors` `[{"pointer": "/autorizacion", "code": "required"}]` y el almacén de validaciones queda con el mismo número de elementos que antes

#### Scenario: Autorización en falso o como texto
- **WHEN** se hace `CREAR` con `autorizacion.datos` igual a `false`, luego igual a `"true"` y luego igual a `1`
- **THEN** las tres respuestas son 422 `PROBLEM(invalid-request)` con un error de `pointer` `/autorizacion/datos`, de `code` `must_be_true` en el primer caso e `invalid_type` en los otros dos

#### Scenario: La clave de idempotencia no se consume
- **WHEN** se hace `CREAR` con `Idempotency-Key: k-aut-1` y `autorizacion.datos` `false`, y después `CREAR` con la misma clave y `autorizacion.datos` `true`
- **THEN** la primera respuesta es 422 y la segunda es 201 sin cabecera `Idempotent-Replayed`

### Requirement: AV-05 Autorización de datos sensibles para biometría
Si `face_match` es `true`, la creación SHALL exigir además `autorizacion.sensibles` exactamente `true`; si no, responde 422. Con `face_match` `false` u omitido, `sensibles` SHALL aceptarse como `true` o `false` y la biometría no se solicita.

#### Scenario: Comparación facial sin autorización de sensibles
- **WHEN** se hace `CREAR` con `"face_match": true` y `autorizacion.sensibles` `false`
- **THEN** la respuesta es 422 `PROBLEM(invalid-request)` con `errors` `[{"pointer": "/autorizacion/sensibles", "code": "required_for_face_match"}]`

#### Scenario: Comparación facial con sensibles ausente
- **WHEN** se hace `CREAR` con `"face_match": true` y `autorizacion` sin la clave `sensibles`
- **THEN** la respuesta es 422 con el mismo error de `pointer` `/autorizacion/sensibles` y `code` `required_for_face_match`

#### Scenario: Comparación facial autorizada
- **WHEN** se hace `CREAR` con `"face_match": true` y `autorizacion.sensibles` `true`
- **THEN** la respuesta es 201 con `face_match` `true` y `autorizacion.sensibles` `true`

### Requirement: AV-06 Registro de la autorización otorgada
La validación SHALL guardar y devolver en `autorizacion` las casillas, `version_texto` (1 a 64 caracteres de `[A-Za-z0-9._-]`), `otorgada_en` (RFC 3339) y `registrada_en` (hora del servidor). Una `otorgada_en` más de 300 s en el futuro MUST rechazarse.

#### Scenario: Eco del registro
- **WHEN** se hace `CREAR`
- **THEN** `autorizacion` es exactamente `{"datos": true, "sensibles": false, "version_texto": "2026-10-01", "otorgada_en": "2026-10-06T15:19:00Z", "registrada_en": "2026-10-06T15:20:00Z"}`

#### Scenario: Fecha de otorgamiento en el futuro
- **WHEN** se hace `CREAR` con `otorgada_en` `"2026-10-06T15:25:01Z"`
- **THEN** la respuesta es 422 con un error de `pointer` `/autorizacion/otorgada_en` y `code` `in_future`

#### Scenario: Margen de reloj aceptado
- **WHEN** se hace `CREAR` con `otorgada_en` `"2026-10-06T15:25:00Z"`
- **THEN** la respuesta es 201

#### Scenario: Versión del texto inválida
- **WHEN** se hace `CREAR` con `version_texto` `""` y luego con `version_texto` `"v 1"`
- **THEN** ambas respuestas son 422 con un error de `pointer` `/autorizacion/version_texto` y `code` `invalid_format`

### Requirement: AV-07 Subida de imágenes en una sola petición
`POST /v1/validations/{id}/images` SHALL recibir `multipart/form-data` con las partes `front` y `back` y, solo si `face_match` es `true`, `selfie`. SHALL procesarlas de forma síncrona y responder 200 con la validación en estado terminal. Las imágenes MUST NOT sobrevivir a la petición.

#### Scenario: Subida completa en sandbox
- **WHEN** se crea una validación con `CREAR` y se envía a su `upload.url` la parte `front` = `IMG_JPEG` y `back` = `IMG_PNG`
- **THEN** la respuesta es 200, `status` es `"success"`, `upload` es `null` y `completed_at` es `"2026-10-06T15:20:00Z"`

#### Scenario: Falta una parte obligatoria
- **WHEN** se envía solo la parte `front`
- **THEN** la respuesta es 422 `PROBLEM(invalid-request)` con `errors` `[{"pointer": "/back", "code": "required"}]` y la validación sigue en `pending`

#### Scenario: Selfie sin comparación facial
- **WHEN** la validación tiene `face_match` `false` y se envían `front`, `back` y `selfie`
- **THEN** la respuesta es 422 con `errors` `[{"pointer": "/selfie", "code": "unexpected_part"}]` y la validación sigue en `pending`

#### Scenario: Selfie requerida
- **WHEN** la validación tiene `face_match` `true` y se envían solo `front` y `back`
- **THEN** la respuesta es 422 con `errors` `[{"pointer": "/selfie", "code": "required"}]`

#### Scenario: Preflight CORS desde un origen permitido
- **WHEN** `ORIGENES_CORS` es `https://app.lector-cedula.example` y se hace `OPTIONS` a `upload.url` con `Origin: https://app.lector-cedula.example` y `Access-Control-Request-Method: POST`
- **THEN** la respuesta es 204 con `Access-Control-Allow-Origin: https://app.lector-cedula.example`; con `Origin: https://otro.example` la respuesta no trae `Access-Control-Allow-Origin`

### Requirement: AV-08 URL de subida firmada y de un solo uso
`upload.url` SHALL llevar un token firmado en `?token=` que autoriza solo la subida a esa validación, vence 900 s después de la creación (`upload.expires_at`) y sirve una sola vez. La subida MAY autenticarse también con la clave del creador.

#### Scenario: Forma de la URL de subida
- **WHEN** se hace `CREAR` con `URL_PUBLICA` `https://api.lector-cedula.example`
- **THEN** `upload.url` cumple `^https://api\.lector-cedula\.example/v1/validations/val_[0-9a-f]{32}/images\?token=[A-Za-z0-9_-]{43,}$` y `upload.expires_at` es `"2026-10-06T15:35:00Z"`

#### Scenario: Token alterado
- **WHEN** se sube a la URL con el último carácter del token cambiado
- **THEN** la respuesta es 403 `PROBLEM(upload-token-invalid)` y la validación sigue en `pending`

#### Scenario: Token de otra validación
- **WHEN** se usa el token de la validación A en la ruta de la validación B
- **THEN** la respuesta es 403 `PROBLEM(upload-token-invalid)`

#### Scenario: Token vencido
- **WHEN** el reloj avanza a `2026-10-06T15:35:01Z` y se sube con el token
- **THEN** la respuesta es 403 `PROBLEM(upload-token-expired)`

#### Scenario: Subida con la clave del creador
- **WHEN** se sube a `/v1/validations/{id}/images` sin `token` y con `Authorization: Bearer KT`
- **THEN** la respuesta es 200; con `KT2` la respuesta es 404 `PROBLEM(not-found)`

### Requirement: AV-09 Una sola subida por validación
Una validación que no está en `pending` SHALL rechazar toda subida con 409 sin procesar las imágenes.

#### Scenario: Segunda subida
- **WHEN** una validación ya está en `success` y se sube otra vez con `KT`
- **THEN** la respuesta es 409 `PROBLEM(validation-not-pending)` y `GET` devuelve el mismo cuerpo que antes de la segunda subida

### Requirement: AV-10 Límites de tamaño y tipo de imagen
Cada parte SHALL medir como máximo 8 388 608 bytes (8 MiB) y el cuerpo multipart como máximo 20 971 520 bytes; SHALL declarar `image/jpeg` o `image/png` y sus primeros bytes MUST coincidir con ese tipo. Un cuerpo con `Content-Length` mayor al límite MUST rechazarse sin leerlo.

#### Scenario: Parte de exactamente 8 MiB
- **WHEN** `front` es un JPEG sintético de 8 388 608 bytes y `back` es `IMG_PNG`
- **THEN** la respuesta es 200

#### Scenario: Parte de 8 MiB más un byte
- **WHEN** `front` mide 8 388 609 bytes
- **THEN** la respuesta es 413 `PROBLEM(image-too-large)` con `errors` `[{"pointer": "/front", "code": "too_large"}]` y la validación sigue en `pending`

#### Scenario: Content-Length excesivo
- **WHEN** se envía `Content-Length: 20971521`
- **THEN** la respuesta es 413 `PROBLEM(request-too-large)` antes de leer el cuerpo

#### Scenario: Tipo no admitido o firma que no coincide
- **WHEN** `front` se declara `image/gif`, y en otra petición `front` se declara `image/jpeg` pero empieza por los bytes `89 50 4E 47`
- **THEN** ambas respuestas son 415 `PROBLEM(unsupported-image-type)` con un error de `pointer` `/front`

#### Scenario: Parte vacía
- **WHEN** `back` tiene 0 bytes
- **THEN** la respuesta es 422 con `errors` `[{"pointer": "/back", "code": "empty_part"}]`

### Requirement: AV-11 Rate limiting por clave
El servidor SHALL aceptar como máximo `LIMITE_PETICIONES_POR_MINUTO` peticiones (60 por defecto) por clave de API en cualquier ventana deslizante de 60 s sobre `/v1`, contando las subidas con token a cuenta de la clave creadora. El exceso MUST responder 429 con `Retry-After` en segundos enteros.

#### Scenario: Petición 61 en el mismo minuto
- **WHEN** con el límite en 60 y el reloj fijo se hacen 61 `GET` con `KT`
- **THEN** las 60 primeras no son 429 y la 61 es 429 `PROBLEM(rate-limited)` con `Retry-After: 60`

#### Scenario: Otra clave no se ve afectada
- **WHEN** tras agotar el límite de `KT` se hace un `GET` con `KT2`
- **THEN** la respuesta no es 429

#### Scenario: La ventana se libera
- **WHEN** se agota el límite a las `15:20:00Z` y el reloj avanza a `15:21:00.001Z`
- **THEN** la siguiente petición con `KT` no es 429

### Requirement: AV-12 Idempotencia de la creación
`POST /v1/validations` SHALL aceptar `Idempotency-Key` (1 a 255 caracteres ASCII imprimibles), con alcance por clave de API y vigencia de 86 400 s. Repetir clave y cuerpo MUST devolver la misma respuesta con `Idempotent-Replayed: true`; repetir la clave con otro cuerpo MUST responder 422.

#### Scenario: Repetición exacta
- **WHEN** se hace `CREAR` dos veces con `Idempotency-Key: k-1`
- **THEN** ambas respuestas tienen estado 201 y cuerpo idéntico byte a byte, la segunda trae `Idempotent-Replayed: true` y el almacén tiene una sola validación nueva

#### Scenario: Misma clave, otro cuerpo
- **WHEN** se hace `CREAR` con `Idempotency-Key: k-2` y luego con la misma clave y `document_type` `"co_national-id-2020"`
- **THEN** la segunda respuesta es 422 `PROBLEM(idempotency-key-reused)`

#### Scenario: Petición concurrente con la misma clave
- **WHEN** una creación con `Idempotency-Key: k-3` está en curso y llega otra con la misma clave
- **THEN** la segunda respuesta es 409 `PROBLEM(idempotency-key-in-progress)`

#### Scenario: Clave inválida
- **WHEN** se envía `Idempotency-Key` vacía o de 256 caracteres
- **THEN** la respuesta es 400 `PROBLEM(invalid-idempotency-key)`

#### Scenario: Alcance por cliente y vencimiento
- **WHEN** se hace `CREAR` con `Idempotency-Key: k-4` y `KT`, luego con la misma clave y `KT2`, y luego con `KT` tras avanzar el reloj 86 401 s
- **THEN** las tres respuestas son 201 con tres `id` distintos y ninguna trae `Idempotent-Replayed`

### Requirement: AV-13 Consulta del resultado
`GET /v1/validations/{id}` SHALL devolver 200 con el estado actual de la validación. Un `id` inexistente, mal formado, suprimido, vencido o de otro cliente MUST responder 404 con el mismo cuerpo salvo `request_id`.

#### Scenario: Consulta de una validación terminada
- **WHEN** tras la subida completa en sandbox se hace `GET` con `KT`
- **THEN** la respuesta es 200 y el cuerpo es igual al de la respuesta de la subida

#### Scenario: Identificador mal formado
- **WHEN** se hace `GET /v1/validations/abc` y `GET /v1/validations/val_XYZ` con `KT`
- **THEN** ambas respuestas son 404 `PROBLEM(not-found)`

### Requirement: AV-14 Estados y transiciones
`status` SHALL ser uno de `pending`, `success`, `failure` o `review`. Las únicas transiciones válidas son de `pending` a un estado terminal; un estado terminal MUST NOT cambiar. Una validación `pending` cuyo token vence SHALL pasar a `failure` con `declined_reason` `upload_expired`.

#### Scenario: Vencimiento sin subida
- **WHEN** se hace `CREAR`, el reloj avanza a `2026-10-06T15:35:01Z` y se hace `GET`
- **THEN** `status` es `"failure"`, `declined_reason` es `"upload_expired"`, `document` es `null`, `completed_at` es `"2026-10-06T15:35:00Z"` y los cuatro checks tienen `status` `"not_performed"`

#### Scenario: El estado terminal no cambia
- **WHEN** una validación está en `failure` y se intenta subir de nuevo o se avanza el reloj 3600 s
- **THEN** la subida responde 409 y `GET` devuelve el mismo `status`, `declined_reason` y `updated_at`

### Requirement: AV-15 Motivo de rechazo enumerado
`declined_reason` SHALL ser `null` en `pending` y `success` y no nulo en `failure` y `review`, con un valor de: `image_quality_insufficient`, `document_not_detected`, `document_unreadable`, `unsupported_document_type`, `data_validation_failed`, `document_expired`, `data_inconsistent`, `document_liveness_suspected`, `face_mismatch`, `legacy_document`, `upload_expired`, `processing_error`.

#### Scenario: Enumerado en el contrato
- **WHEN** se lee el esquema `DeclinedReason` del contrato
- **THEN** su `enum` contiene exactamente los 12 valores del requisito, en ese orden, y el esquema admite `null`

#### Scenario: Nulidad según estado
- **WHEN** se recorren las respuestas de todos los escenarios de sandbox de AV-20 y de AV-14
- **THEN** `declined_reason` es `null` exactamente cuando `status` es `pending` o `success`

### Requirement: AV-16 Checks agrupados
Fuera de `pending`, `checks` SHALL contener un objeto por categoría en el orden `image_quality`, `data_validation`, `data_consistency`, `document_liveness` y, solo si `face_match` es `true`, `face_match`. Cada objeto tiene `category`, `status` (`passed`, `failed`, `warning`, `not_performed`) y `reasons`, con códigos del enumerado de su categoría.

#### Scenario: Estructura en una validación exitosa
- **WHEN** termina la subida completa en sandbox con el escenario `success`
- **THEN** `checks` es exactamente `[{"category": "image_quality", "status": "passed", "reasons": []}, {"category": "data_validation", "status": "passed", "reasons": []}, {"category": "data_consistency", "status": "passed", "reasons": []}, {"category": "document_liveness", "status": "passed", "reasons": []}]`

#### Scenario: Códigos de razón por categoría
- **WHEN** se leen los esquemas de razones del contrato
- **THEN** `image_quality` admite `blur_detected`, `glare_detected`, `document_cropped`, `low_resolution`, `overexposed`, `underexposed`; `data_validation` admite `barcode_unreadable`, `mrz_check_digit_invalid`, `document_number_invalid`, `date_invalid`, `document_expired`, `divipol_unknown`, `legacy_document_type`; `data_consistency` admite `document_number_mismatch`, `name_mismatch`, `date_of_birth_mismatch`, `sex_mismatch`; `document_liveness` admite `screen_recapture_suspected`, `photocopy_suspected`, `print_suspected`; `face_match` admite `face_not_detected`, `face_mismatch`, `liveness_failed`

#### Scenario: Razones vacías salvo en fallo o advertencia
- **WHEN** se recorren las respuestas de todos los escenarios de sandbox
- **THEN** `reasons` está vacío exactamente cuando el `status` del check es `passed` o `not_performed`

### Requirement: AV-17 Coherencia entre estado y checks
En `pending`, `checks` SHALL ser `[]` y `document` `null`. En `success` ningún check MUST estar en `failed` ni `warning`. En `failure` al menos un check MUST estar en `failed`, salvo con `upload_expired` o `processing_error`, donde todos están en `not_performed`. En `review` al menos uno MUST estar en `warning` o `failed`.

#### Scenario: Propiedad sobre secuencias de operaciones
- **WHEN** Hypothesis genera 500 secuencias de creación, subida, avance de reloj y consulta sobre todos los escenarios de sandbox
- **THEN** cada respuesta 200 o 201 cumple las cuatro reglas del requisito y las de AV-15 y AV-16

### Requirement: AV-18 Campos normalizados del documento
`document` SHALL ser `null` en `pending` y, si hay datos, un objeto con `type`, `document_number`, `first_surname`, `second_surname`, `first_name`, `second_name`, `sex`, `date_of_birth`, `place_of_birth`, `blood_type`, `date_of_issue`, `place_of_issue`, `date_of_expiry`, `sources` y `warnings`. Las fechas MUST ser `YYYY-MM-DD` y los nombres MUST conservar la Ñ y los espacios internos.

#### Scenario: Cédula amarilla en sandbox
- **WHEN** termina la subida en sandbox con `document_type` `"co_national-id-2000"` y el escenario `success`
- **THEN** `document` es exactamente `{"type": "co_national-id-2000", "document_number": "9999123456", "first_surname": "PEÑA", "second_surname": "DE LA OSSA", "first_name": "FICTICIA", "second_name": null, "sex": "F", "date_of_birth": "1990-02-28", "place_of_birth": {"divipol_department": "01", "divipol_municipality": "001"}, "blood_type": "AB-", "date_of_issue": null, "place_of_issue": null, "date_of_expiry": null, "sources": ["pdf417"], "warnings": []}`

#### Scenario: Cédula digital en sandbox
- **WHEN** termina la subida en sandbox con `document_type` `"co_national-id-2020"` y el escenario `success`
- **THEN** `document` es exactamente `{"type": "co_national-id-2020", "document_number": "9999654321", "first_surname": "NUÑEZ", "second_surname": "MARTINEZ", "first_name": "PRUEBA", "second_name": "SINTETICA", "sex": "M", "date_of_birth": "1985-12-01", "place_of_birth": null, "blood_type": null, "date_of_issue": null, "place_of_issue": null, "date_of_expiry": "2035-12-01", "sources": ["mrz"], "warnings": []}`

#### Scenario: Dominios de los campos en el contrato
- **WHEN** se lee el esquema `Document` del contrato
- **THEN** `sex` admite `M` y `F`; `blood_type` admite `O+`, `O-`, `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-` y `null`; `document_number` cumple `^[0-9]{6,11}$`; `divipol_department` cumple `^[0-9]{2}$` y `divipol_municipality` `^[0-9]{3}$`; `sources` admite `pdf417`, `mrz` y `ocr`; `additionalProperties` es `false`

### Requirement: AV-19 Advertencias de hipótesis del formato
`document.warnings` SHALL listar los IDs de las hipótesis no confirmadas que se aplicaron al extraer los datos (principio VI). Cada ID MUST existir en la tabla de `docs/decisiones/hipotesis-formato.md`, cumplir `^[HMN][0-9]{2}$` y tener estado `pendiente` en su tabla "Actualización de estados"; una hipótesis confirmada (aunque sea con corrección) o refutada MUST NOT aparecer.

#### Scenario: IDs existentes en el registro de hipótesis
- **WHEN** se recorren los `warnings` de todos los fixtures de sandbox
- **THEN** cada ID aparece en la primera columna de una tabla de `docs/decisiones/hipotesis-formato.md`

#### Scenario: Solo hipótesis pendientes
- **WHEN** se recorren los `warnings` de todos los fixtures de sandbox
- **THEN** ningún ID tiene en la tabla "Actualización de estados" de `docs/decisiones/hipotesis-formato.md` un estado distinto de `pendiente` (en particular no aparecen H03, H05, H06 ni M02) y los fixtures de `success` tienen `warnings` `[]`

#### Scenario: Patrón en el contrato
- **WHEN** se lee el esquema de `Document.warnings` del contrato
- **THEN** sus elementos cumplen `^[HMN][0-9]{2}$` y la descripción enlaza `docs/decisiones/hipotesis-formato.md`

### Requirement: AV-20 Sandbox determinista
Con una clave `sk_test_`, el campo opcional `sandbox_scenario` de la creación SHALL fijar el resultado de la subida según la tabla de escenarios, ignorando el contenido de las imágenes válidas. Sin el campo, el escenario es `success`. Con una clave `sk_live_` el campo MUST rechazarse.

#### Scenario: Tabla de escenarios
- **WHEN** se crea con cada `sandbox_scenario` y se sube `front` = `IMG_JPEG` y `back` = `IMG_PNG` (con `selfie` = `IMG_JPEG` y `face_match` `true` solo en `review_face_mismatch`)
- **THEN** `status`, `declined_reason` y los `status` de checks (`image_quality`, `data_validation`, `data_consistency`, `document_liveness`) son: `success` → `success`, `null`, todos `passed`; `failure_image_quality` → `failure`, `image_quality_insufficient`, `failed` con `["glare_detected"]` y el resto `not_performed`, `document` `null`; `failure_document_unreadable` → `failure`, `document_unreadable`, `passed`, `failed` con `["barcode_unreadable"]`, `not_performed`, `not_performed`, `document` `null`; `review_data_consistency` → `review`, `data_inconsistent`, `passed`, `passed`, `warning` con `["name_mismatch"]`, `passed`; `review_document_liveness` → `review`, `document_liveness_suspected`, `passed`, `passed`, `passed`, `warning` con `["screen_recapture_suspected"]`; `failure_document_expired` → `failure`, `document_expired`, `passed`, `failed` con `["document_expired"]`, `passed`, `passed`; `review_face_mismatch` → `review`, `face_mismatch`, los cuatro `passed` y `face_match` `warning` con `["face_mismatch"]`

#### Scenario: Escenario incompatible
- **WHEN** se crea con `sandbox_scenario` `"failure_document_expired"` y `document_type` `"co_national-id-2000"`, o con `"review_face_mismatch"` y `face_match` `false`
- **THEN** la respuesta es 422 con un error de `pointer` `/sandbox_scenario` y `code` `incompatible_scenario`

#### Scenario: Campo de sandbox en modo live
- **WHEN** se hace `CREAR` con `KL` y `"sandbox_scenario": "success"`
- **THEN** la respuesta es 422 con un error de `pointer` `/sandbox_scenario` y `code` `sandbox_only`

### Requirement: AV-21 Fixtures de sandbox sintéticos
Cada fixture del sandbox SHALL ser un JSON con `"sintetico": true`, con personas ficticias y números de documento que empiezan por `9999`, y MUST pasar `privacidad-check`.

#### Scenario: Marca y prefijo en todos los fixtures
- **WHEN** se cargan todos los archivos de fixtures del sandbox
- **THEN** cada uno tiene `"sintetico": true` y cada `document_number` empieza por `9999`

#### Scenario: Control de privacidad del repositorio
- **WHEN** se ejecuta `npm run check:privacidad`
- **THEN** termina con código 0

### Requirement: AV-22 Modo live sin motor configurado
Mientras no exista un motor de procesamiento real, una subida en modo live SHALL responder 503 sin procesar las imágenes y la validación MUST seguir en `pending`.

#### Scenario: Subida live sin motor
- **WHEN** se crea con `KL` y se suben `front` y `back` válidos
- **THEN** la respuesta es 503 `PROBLEM(engine-unavailable)`, `GET` devuelve `status` `"pending"` y no se encola ningún webhook

### Requirement: AV-23 Supresión por revocación
`DELETE /v1/validations/{id}` SHALL eliminar la validación y su resultado y responder 204. Después, toda operación sobre ese `id` MUST responder 404 y los webhooks pendientes MUST cancelarse. Solo SHALL quedar un registro mínimo de prueba de la autorización (Decreto 1377 de 2013; pendiente de validación legal), sin datos del documento ni imágenes y no expuesto por la API.

#### Scenario: Supresión de una validación terminada
- **WHEN** se hace `DELETE` con `KT` sobre una validación en `success`
- **THEN** la respuesta es 204 sin cuerpo, y `GET`, una nueva subida y un segundo `DELETE` sobre el mismo `id` responden 404 `PROBLEM(not-found)`

#### Scenario: Registro mínimo de prueba de la autorización
- **WHEN** se hace `DELETE` con `KT` a las `2026-10-06T15:21:00Z` sobre una validación en `success` creada con `CREAR`
- **THEN** el registro de prueba guarda exactamente `{"validation_id": <id>, "datos": true, "sensibles": false, "version_texto": "2026-10-01", "otorgada_en": "2026-10-06T15:19:00Z", "registrada_en": "2026-10-06T15:20:00Z", "suprimida_en": "2026-10-06T15:21:00Z", "motivo": "revocacion"}` y no contiene `9999123456`, `PEÑA` ni `FICTICIA`; al vencer la retención de AV-24 se guarda el mismo registro con `motivo` `retencion`

#### Scenario: Reintentos cancelados
- **WHEN** el receptor del webhook respondió 500 al primer intento y se hace `DELETE` antes del segundo
- **THEN** al avanzar el reloj 21 600 s no se hace ningún intento adicional

### Requirement: AV-24 Retención limitada del resultado
Una validación terminal SHALL eliminarse `RETENCION_RESULTADOS_S` segundos (86 400 por defecto) después de `completed_at`, y `expires_at` MUST informar ese instante. Mientras está `pending`, `expires_at` MUST ser `null`.

#### Scenario: Vencimiento de la retención
- **WHEN** una validación termina a las `2026-10-06T15:20:00Z` y el reloj avanza a `2026-10-07T15:20:01Z`
- **THEN** `expires_at` era `"2026-10-07T15:20:00Z"` y `GET` responde 404 `PROBLEM(not-found)`

### Requirement: AV-25 Webhook de validación terminada
Si la validación tiene `webhook_url`, al pasar a un estado terminal el servidor SHALL enviar `POST` con el evento `validation.completed`, `Content-Type: application/json` y cuerpo JSON compacto con solo `id`, `type`, `created_at`, `sandbox` y `data` (`validation_id`, `status`, `declined_reason`). El cuerpo MUST NOT contener datos del documento.

#### Scenario: Cuerpo exacto del evento
- **WHEN** con el generador de identificadores fijado a `evt_00000000000000000000000000000001` y `val_0123456789abcdef0123456789abcdef`, una validación sandbox con `webhook_url` `https://hooks.example.com/lector` termina en `success` a `1791300000`
- **THEN** el transporte recibe un `POST` a esa URL cuyo cuerpo es exactamente `{"id":"evt_00000000000000000000000000000001","type":"validation.completed","created_at":"2026-10-06T15:20:00Z","sandbox":true,"data":{"validation_id":"val_0123456789abcdef0123456789abcdef","status":"success","declined_reason":null}}` (232 bytes), con `X-Lector-Event-Id: evt_00000000000000000000000000000001` y `X-Lector-Attempt: 1`

#### Scenario: Sin datos del documento en el evento
- **WHEN** termina cualquier escenario de sandbox con `webhook_url`
- **THEN** el cuerpo del webhook no contiene `9999123456`, `9999654321`, `PEÑA`, `NUÑEZ`, `FICTICIA` ni `1990-02-28`

#### Scenario: Sin webhook configurado
- **WHEN** una validación sin `webhook_url` termina
- **THEN** el transporte no recibe ninguna petición

### Requirement: AV-26 Firma HMAC-SHA256 del webhook
Cada intento SHALL llevar `X-Lector-Signature: t=<unix>,v1=<hex>`, donde `<hex>` es el HMAC-SHA256 en hexadecimal minúscula, con el secreto de webhooks de la clave de API, de los bytes `<unix>` + `.` + cuerpo exacto. El secreto MUST NOT aparecer en respuestas ni logs.

#### Scenario: Vector 1, firma válida
- **WHEN** se firma el cuerpo de 232 bytes de AV-25 con el secreto `whsec_sintetico_0123456789abcdef` y `t` = `1791300000`
- **THEN** la cabecera es `t=1791300000,v1=1b3358c314ebcad6047166133405e2be0692e92e52d17606840183a58d5711df`

#### Scenario: Vector 2, cuerpo alterado
- **WHEN** se firma el mismo cuerpo con `"status":"failure"` en lugar de `"status":"success"`, mismo secreto y `t`
- **THEN** `v1` es `ad2d9a1789d2a0aed77ed9cba60fdd44dace698518a137e7c0a3ba07323a494e`

#### Scenario: Vector 3, otro secreto
- **WHEN** se firma el cuerpo original con el secreto `whsec_sintetico_fedcba9876543210` y `t` = `1791300000`
- **THEN** `v1` es `307be610808415cdcd78c48a54caa014d67c6a674e5906fa0f8a3ebd18d26120`

#### Scenario: Vector 4, otra marca de tiempo
- **WHEN** se firma el cuerpo original con el secreto original y `t` = `1791300001`
- **THEN** `v1` es `66fbd0de5b41f685f61b6102a0f9ffebfcd85b8649f2307d72f14d475eb43bdf`

#### Scenario: Vector 5, evento de revisión
- **WHEN** se firma `{"id":"evt_00000000000000000000000000000002","type":"validation.completed","created_at":"2026-10-06T15:20:00Z","sandbox":true,"data":{"validation_id":"val_0123456789abcdef0123456789abcdef","status":"review","declined_reason":"data_inconsistent"}}` con el secreto original y `t` = `1791300000`
- **THEN** `v1` es `ddb4aa811a2cf0f80d5a9670ce95f5415ac3939a9e1dafc13b7b378abdc85ad7`

#### Scenario: Propiedad de verificación
- **WHEN** Hypothesis genera 1000 pares de cuerpo binario arbitrario y secreto, firma y verifica, y luego altera un byte del cuerpo
- **THEN** la verificación del original es verdadera en el 100 % de los casos y la del alterado es falsa en el 100 %

### Requirement: AV-27 Reintentos del webhook
Un intento SHALL contar como entregado solo con respuesta 2xx en 10 s; las redirecciones no se siguen. Si falla, el servidor SHALL reintentar a los 60, 300, 1800, 7200 y 21 600 s del primer intento (6 intentos en total) con el mismo cuerpo e `X-Lector-Event-Id`, y `t` y firma nuevos.

#### Scenario: Entrega al tercer intento
- **WHEN** el receptor responde 500, luego agota los 10 s sin responder y luego responde 204, con el primer intento en `t` = `1791300000`
- **THEN** hay exactamente 3 intentos, en `t` = `1791300000`, `1791300060` y `1791300300`, con `X-Lector-Attempt` 1, 2 y 3, el mismo cuerpo en los tres y la firma de cada uno válida para su `t`

#### Scenario: Intentos agotados
- **WHEN** el receptor responde 503 siempre
- **THEN** hay exactamente 6 intentos en `t` = `1791300000`, `1791300060`, `1791300300`, `1791301800`, `1791307200` y `1791321600`, y ninguno después de avanzar el reloj otras 48 h

#### Scenario: Redirección no seguida
- **WHEN** el receptor responde 302 con `Location: https://otro.example/`
- **THEN** el intento cuenta como fallido y no se hace ninguna petición a `https://otro.example/`

### Requirement: AV-28 Destino del webhook seguro
`webhook_url` SHALL ser una URL `https` de como máximo 2048 caracteres, sin credenciales y cuyo host no sea una IP literal. Al entregar, si el host resuelve a una dirección de loopback, privada, link-local, multicast o no enrutable, el intento MUST bloquearse sin reintentos.

#### Scenario: URLs rechazadas al crear
- **WHEN** se hace `CREAR` con `webhook_url` igual a `http://hooks.example.com/x`, `https://127.0.0.1/x`, `https://[::1]/x`, `https://usuario:clave@hooks.example.com/x` o `ftp://hooks.example.com/x`
- **THEN** cada respuesta es 422 con un error de `pointer` `/webhook_url` y `code` `invalid_webhook_url`

#### Scenario: Resolución a red interna
- **WHEN** el resolvedor inyectado devuelve `10.0.0.5` para `hooks.example.com` y la validación termina
- **THEN** el transporte no recibe ninguna petición, no se programa ningún reintento y el log registra `outcome` `"blocked"`

### Requirement: AV-29 Errores RFC 9457
Toda respuesta 4xx o 5xx SHALL ser `application/problem+json` con `type`, `title`, `status`, `detail`, `code` (el slug de `type`) y `request_id`, y con `errors` (`pointer` JSON Pointer y `code`) en errores de validación. Ningún error MUST reproducir valores enviados por el cliente ni trazas internas.

#### Scenario: Estructura de un error de validación
- **WHEN** se hace `POST /v1/validations` con `KT` y cuerpo `{}`
- **THEN** la respuesta es 422, `type` es `https://lector-cedula.example/problemas/invalid-request`, `status` es `422`, `code` es `"invalid-request"`, `request_id` es igual a la cabecera `X-Request-Id` y `errors` contiene `{"pointer": "/document_type", "code": "required"}` y `{"pointer": "/autorizacion", "code": "required"}`

#### Scenario: Sin eco de valores del cliente
- **WHEN** se hace `CREAR` con `document_type` `"PEÑA 9999123456"` y, en otra petición, con `"campo_9999123456": "FICTICIA"`
- **THEN** ninguno de los cuerpos de error contiene `9999123456`, `PEÑA` ni `FICTICIA`

#### Scenario: Ruta y método desconocidos
- **WHEN** se hace `GET /v1/no-existe` y `PATCH /v1/validations/val_0123456789abcdef0123456789abcdef` con `KT`
- **THEN** la primera es 404 `PROBLEM(not-found)` y la segunda es 405 `PROBLEM(method-not-allowed)` con `Allow: GET, DELETE`

#### Scenario: Error interno sin traza
- **WHEN** el motor de sandbox lanza una excepción con el mensaje `"9999123456 traza interna"` durante una subida
- **THEN** la respuesta es 500 `PROBLEM(internal-error)`, su cuerpo no contiene `9999123456` ni `traza`, y la validación pasa a `failure` con `declined_reason` `processing_error`

#### Scenario: Propiedad sobre cuerpos arbitrarios
- **WHEN** Hypothesis envía 1000 cuerpos JSON arbitrarios con `KT` a `POST /v1/validations`, cada uno con la cadena marcador `ZZMARCAZZ` en claves y valores
- **THEN** ninguna respuesta es 5xx, toda respuesta 4xx es `application/problem+json` válida contra el esquema `Problem` y ninguna contiene `ZZMARCAZZ`

### Requirement: AV-30 Sin persistencia de imágenes
El procesamiento de una subida SHALL ocurrir solo en memoria: MUST NOT crearse ningún archivo (ni temporal de multipart) y el almacén de validaciones MUST NOT retener bytes de imagen tras la petición. Los servicios `api` y `api-pruebas` MUST correr con sistema de archivos de solo lectura.

#### Scenario: Imagen grande sin archivos temporales
- **WHEN** con `TMPDIR` apuntando a un directorio vacío y `tempfile.SpooledTemporaryFile.rollover` y `os.open` en modo escritura instrumentados para fallar, se sube `front` de 8 388 608 bytes y `back` = `IMG_PNG`
- **THEN** la respuesta es 200, el directorio sigue vacío y la instrumentación no registró ninguna llamada

#### Scenario: El almacén no guarda bytes
- **WHEN** termina cualquier escenario de sandbox
- **THEN** al recorrer recursivamente el objeto almacenado de la validación no aparece ningún valor `bytes`, `bytearray` ni `memoryview`, ni ninguna cadena que contenga el base64 de los primeros 48 bytes de las imágenes subidas

#### Scenario: Contenedor de solo lectura
- **WHEN** se ejecuta el flujo completo de sandbox contra el servicio `api-pruebas` de `server/compose.yaml` (misma imagen que `api`)
- **THEN** `docker compose -f server/compose.yaml config` muestra `read_only: true` en `api` y en `api-pruebas`, y `docker compose -f server/compose.yaml exec api-pruebas find /tmp -type f` no lista ningún archivo

### Requirement: AV-31 Sin imágenes ni biometría en respuestas
Ninguna respuesta ni webhook del contrato SHALL declarar propiedades cuyo nombre aluda a imagen, foto, selfie, retrato, rostro, plantilla biométrica, huella, AFIS, payload crudo o base64, ni esquemas con `format: binary`, `contentEncoding` o `contentMediaType`.

#### Scenario: Regla de lint sobre el contrato
- **WHEN** se ejecuta Spectral con `server/openapi/.spectral.yaml` sobre el contrato
- **THEN** la regla `sin-imagen-ni-biometria-en-respuestas` no reporta resultados

#### Scenario: La regla detecta una violación
- **WHEN** se ejecuta Spectral sobre `server/openapi/pruebas/viola-imagen.yaml`, una copia del contrato cuyo esquema `Validation` añade la propiedad `front_image` y cuyo webhook añade `pdf417_raw`
- **THEN** termina con código distinto de 0 y reporta 2 resultados de la regla `sin-imagen-ni-biometria-en-respuestas`

#### Scenario: Comprobación en tiempo de ejecución
- **WHEN** se recorren las respuestas y webhooks de todos los escenarios de sandbox
- **THEN** ninguna clave JSON coincide sin distinguir mayúsculas con `imag|img|foto|photo|selfie|retrato|portrait|rostro|face_(image|template|embedding)|biometr|afis|dactilar|huella|fingerprint|raw|payload|base64` y ninguna cadena mide más de 512 caracteres

### Requirement: AV-32 Logs sin datos personales
Cada petición SHALL producir una línea JSON de log con solo `ts`, `level`, `event`, `request_id`, `method`, `route` (plantilla), `status`, `duration_ms`, `sandbox` y, si aplica, `validation_id`; los intentos de webhook, con `event_id`, `attempt` y `outcome`. Los logs MUST NOT contener cuerpos, query strings, cabeceras ni valores del documento.

#### Scenario: Flujo completo sin datos personales en logs
- **WHEN** se captura toda la salida de logs (aplicación y servidor HTTP) durante creación, subida con token, consulta, webhook y supresión en sandbox
- **THEN** cada línea es JSON con claves dentro de la lista del requisito, `route` es `/v1/validations/{id}/images` y no `/v1/validations/val_...`, y ninguna línea contiene `9999123456`, `PEÑA`, `DE LA OSSA`, `FICTICIA`, `1990-02-28`, `AB-`, `token=`, el token, `sk_test_`, `whsec_` ni `Authorization`

#### Scenario: Errores sin datos personales en logs
- **WHEN** se ejecuta el escenario "Error interno sin traza" de AV-29
- **THEN** ninguna línea de log contiene `9999123456`

### Requirement: AV-33 Cabeceras de seguridad y caché
Toda respuesta bajo `/v1` SHALL incluir `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` y `X-Request-Id`.

#### Scenario: Cabeceras en éxito y en error
- **WHEN** se hacen `CREAR`, una subida completa y un `GET` con un `id` inexistente
- **THEN** las tres respuestas traen `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` y un `X-Request-Id` que cumple el formato UUID versión 4

### Requirement: AV-34 Conformidad del contrato y seguridad dinámica
La implementación SHALL pasar Schemathesis con `--checks all` contra su propio `/openapi.json` con 0 fallos y el escaneo de API de OWASP ZAP con 0 alertas de riesgo alto, ambos en Docker contra `host.docker.internal:8000`.

#### Scenario: Pruebas de contrato
- **WHEN** se ejecuta Schemathesis 4.29.4 en Docker con `--checks all` y `KT`, incluidos los enlaces OpenAPI de creación a consulta, subida y supresión
- **THEN** termina con código 0 y 0 fallos

#### Scenario: Escaneo dinámico
- **WHEN** se ejecuta `zap-api-scan.py` de ZAP 2.17.0 con formato `openapi` contra el contrato servido y `KT`
- **THEN** el informe JSON tiene 0 alertas con `riskcode` `"3"`

#### Scenario: Análisis estático
- **WHEN** se ejecutan `ruff check` con las reglas `S` y `T20` y Semgrep CE con `p/python` sobre `server/app`
- **THEN** ambos terminan con 0 hallazgos

### Requirement: AV-35 Latencia bajo carga en sandbox
Con 2 usuarios concurrentes ejecutando el flujo creación, subida y consulta en sandbox durante 60 s, el p95 de cada endpoint SHALL ser menor a 3000 ms y MUST NOT haber respuestas 5xx.

#### Scenario: Carga con Locust
- **WHEN** se ejecuta Locust 2.46.7 en Docker sin interfaz con `-u 2 -r 2 -t 60s` contra `host.docker.internal:8000` y el límite de peticiones elevado a 100 000 por minuto
- **THEN** el proceso termina con código 0, el p95 de cada endpoint en `reporte_stats.csv` es menor a 3000 ms y el número de fallos es 0
