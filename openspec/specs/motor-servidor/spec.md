# motor-servidor Specification

## Purpose
Motor real del servidor de respaldo: interpreta el PDF417 de la cédula amarilla y la MRZ de la cédula digital con los parsers TypeScript del repositorio, ejecutados con Node dentro del contenedor, y produce el resultado del contrato `api-validaciones` sin persistir imágenes ni registrar datos personales.

Convenciones de esta spec (aplican a todos los escenarios):

- `HOY` = `2026-10-06` (reloj inyectado; unix `1791300000` = `2026-10-06T15:20:00Z`).
- `FX/<ruta>` = fixture sintético `evals/fixtures/sinteticos/<ruta>.json`; su `entrada` es el payload PDF417 en hexadecimal o las 3 líneas MRZ. Todas las personas son ficticias y los números `9999...` (skill `fixture-sintetico`).
- `LECTOR(x)` = lector falso que devuelve `x` sin mirar las imágenes; `LECTOR(nada)` no devuelve ni payload ni líneas.
- `NP` = los checks `image_quality`, `data_consistency` y `document_liveness` con `status` `not_performed` y `reasons` `[]`.
- "El motor" = `MotorReal` con el intérprete Node real (`server/interprete/interpretar.mjs` y los parsers compilados en la imagen), salvo que el escenario diga otra cosa.

## Requirements

### Requirement: MS-01 Interpretación con los parsers TypeScript en Node
El motor SHALL interpretar el payload PDF417 y las líneas MRZ ejecutando `@lector-cedula/parsers` en un proceso Node por subida (decisión humana del 2026-10-07: no se reescriben los parsers en Python), que recibe una petición JSON por la entrada estándar y escribe una respuesta JSON en la salida estándar.

#### Scenario: PDF417 sintético con apellido compuesto
- **WHEN** el intérprete recibe `{"fuente": "pdf417", "datos_b64": <base64 de FX/pdf417-amarilla/apellido-compuesto>}`
- **THEN** responde `ok` `true` con `campos` `{"numeroDocumento": "9999123456", "primerApellido": "DE LA OSSA", "segundoApellido": "EJEMPLO", "primerNombre": "FICTICIA", "segundoNombre": "LUZ", "sexo": "F", "fechaNacimiento": "1985-03-14", "rh": "O+", "codigoDepartamentoNacimiento": "16", "codigoMunicipioNacimiento": "001"}`, las 4 validaciones en `ok` y `warnings` `[]`

#### Scenario: MRZ sintética con apellido compuesto
- **WHEN** el intérprete recibe `{"fuente": "mrz", "lineas": <entrada de FX/mrz-cedula-digital/apellido-compuesto>, "fecha_referencia": "2026-10-06"}`
- **THEN** responde `ok` `true`, `valido` `true`, `campos.nuip` `"9999123456"`, `campos.apellidos` `"DE LA OSSA FICTICIO"`, `campos.nombres` `"ANA"`, los 4 dígitos de control `valido`, `errores` `[]` y `warnings` `["M03"]`

#### Scenario: Solo los campos que usa el documento
- **WHEN** el intérprete interpreta FX/pdf417-amarilla/apellido-compuesto y FX/mrz-cedula-digital/apellido-compuesto
- **THEN** `campos` tiene exactamente las claves `numeroDocumento`, `primerApellido`, `segundoApellido`, `primerNombre`, `segundoNombre`, `sexo`, `fechaNacimiento`, `rh`, `codigoDepartamentoNacimiento` y `codigoMunicipioNacimiento` en el PDF417, y `nuip`, `apellidos`, `nombres`, `sexo`, `fechaNacimiento` y `fechaVencimiento` en la MRZ (minimización, revisión de privacidad)

#### Scenario: Error interno del intérprete
- **WHEN** el intérprete no puede cargar los parsers (`RUTA_PARSERS` apunta a un archivo inexistente)
- **THEN** escribe `{"ok": false, "motivo": "error-interno"}`, termina con código distinto de 0 y no escribe nada en la salida de errores

#### Scenario: Entrada no válida
- **WHEN** el intérprete recibe `no es json` o `{"fuente": "otra"}`
- **THEN** responde `{"ok": false, "motivo": "entrada-no-valida"}` y `{"ok": false, "motivo": "fuente-desconocida"}` respectivamente, con código 0

### Requirement: MS-07 Aislamiento del proceso intérprete
El proceso intérprete MUST recibir los datos solo por la entrada estándar, con argumentos fijos que no contienen datos, MUST NOT escribir archivos ni usar la red, y su salida de errores MUST descartarse sin registrarse.

#### Scenario: Datos solo por la entrada estándar
- **WHEN** el motor interpreta FX/pdf417-amarilla/apellido-compuesto con el lanzador de procesos instrumentado
- **THEN** el proceso se lanza exactamente con los argumentos `["/usr/local/bin/node", "/srv/interprete/interpretar.mjs"]`, con la entrada estándar como tubería, la salida de errores descartada y ninguno de los argumentos contiene `9999123456`

### Requirement: MS-08 Fallo del intérprete
Si el proceso intérprete termina con código distinto de 0, devuelve algo que no es un objeto JSON o tarda más de 5 s, el motor MUST lanzar una excepción sin datos en su mensaje, y la subida termina por la vía de error interno de AV-29.

#### Scenario: Fallo del intérprete
- **WHEN** con un intérprete que termina con código 1, otro que escribe `[]` y otro que no responde en 5 s, se sube a una validación live con `LECTOR(FX/pdf417-amarilla/apellido-compuesto)`
- **THEN** cada subida responde 500 `internal-error`, el `GET` posterior muestra `status` `failure` con `declined_reason` `processing_error`, y ninguna línea de log contiene `9999123456`

### Requirement: MS-02 Forma del resultado del motor real
`checks` SHALL seguir el orden del contrato con `image_quality`, `data_consistency` y `document_liveness` en `not_performed` (`NP`). `document` MUST incluirse solo si la interpretación dio número `^[0-9]{6,11}$`, primer apellido y primer nombre de 1 a 64 caracteres y sexo `M` o `F`; si no, es `null`.

#### Scenario: Cédula amarilla legible
- **WHEN** el motor procesa `co_national-id-2000` sin comparación facial con `LECTOR(FX/pdf417-amarilla/apellido-compuesto)`
- **THEN** devuelve `status` `success`, `declined_reason` `null`, checks `image_quality` NP, `data_validation` `passed` `[]`, `data_consistency` NP, `document_liveness` NP, y `document` `{"type": "co_national-id-2000", "document_number": "9999123456", "first_surname": "DE LA OSSA", "second_surname": "EJEMPLO", "first_name": "FICTICIA", "second_name": "LUZ", "sex": "F", "date_of_birth": "1985-03-14", "place_of_birth": {"divipol_department": "16", "divipol_municipality": "001"}, "blood_type": "O+", "date_of_issue": null, "place_of_issue": null, "date_of_expiry": null, "sources": ["pdf417"], "warnings": []}`

### Requirement: MS-15 Campos opcionales fuera de forma
Los campos opcionales del documento que no cumplen el esquema `Document` del contrato (fecha que no es `YYYY-MM-DD` válida, texto vacío o de más de 64 caracteres, RH o código DIVIPOL fuera de forma, o un solo código DIVIPOL) MUST quedar en `null`.

#### Scenario: Lugar y fecha fuera de forma
- **WHEN** el intérprete falso devuelve los campos del PDF417 de apellido-compuesto con los dos códigos DIVIPOL en `null`, y otra vez con `fechaNacimiento` `1990-13-40` y `segundoNombre` `""`
- **THEN** el primer documento tiene `place_of_birth` `null` y el segundo `date_of_birth` `null` y `second_name` `null`; ambos con `status` `success`

### Requirement: MS-09 Documento ilegible
Sin payload ni líneas, si el parser rechaza la entrada por estructura, si una MRZ tiene `valido` `false` sin una causa de MS-10, o si los datos impiden construir el documento sin una causa de MS-10, el motor MUST devolver `failure`, `document_unreadable`, `data_validation` `failed` `["barcode_unreadable"]` y `document` `null`.

#### Scenario: Nada legible
- **WHEN** el motor procesa cada tipo con `LECTOR(nada)`, y `co_national-id-2000` con `LECTOR(FX/pdf417-amarilla/error-bloque-no-encontrado)` `co_national-id-2020` con `LECTOR(FX/mrz-cedula-digital/no-es-cedula)` y `co_national-id-2020` con `LECTOR(FX/mrz-cedula-digital/nacionalidad-ven)` (MRZ con `valido` `false` solo por `nacionalidad-invalida`)
- **THEN** los cinco devuelven `failure`, `document_unreadable`, `data_validation` `failed` `["barcode_unreadable"]` y `document` `null`

### Requirement: MS-10 Datos inválidos
El motor MUST devolver `failure` con `data_validation_failed` y `data_validation` `failed` con las razones, en este orden y sin repetir: `document_number_invalid` (PDF417 `nuip-invalido`, validación `formato-nuip` fallida o error MRZ `nuip-invalido`), `date_invalid` (PDF417 `fecha-nacimiento-invalida` o errores MRZ de fecha) y `mrz_check_digit_invalid` (algún dígito de control MRZ distinto de `valido`).

#### Scenario: Datos inválidos
- **WHEN** el motor procesa FX/pdf417-amarilla/error-nuip-invalido, FX/pdf417-amarilla/error-fecha-invalida, FX/mrz-cedula-digital/cd-nacimiento-alterado y FX/mrz-cedula-digital/nuip-vacio
- **THEN** los cuatro devuelven `failure` y `data_validation_failed` con razones `["document_number_invalid"]`, `["date_invalid"]`, `["mrz_check_digit_invalid"]` y `["document_number_invalid"]`; `document` es `null` en el primero, el segundo y el cuarto, y en el tercero tiene `document_number` `"9999123456"`

### Requirement: MS-11 Cédula digital vencida
Con una MRZ válida cuya `fechaVencimiento` es anterior a `HOY`, el motor MUST devolver `failure`, `document_expired`, `data_validation` `failed` `["document_expired"]` y el documento.

#### Scenario: Cédula digital vencida
- **WHEN** el motor procesa FX/mrz-cedula-digital/vencimiento-2020 con `HOY`
- **THEN** devuelve `failure`, `document_expired`, `data_validation` `failed` `["document_expired"]` y `document.date_of_expiry` `"2020-01-01"`

### Requirement: MS-12 DIVIPOL desconocido
Un PDF417 legible con la validación `divipol-codigos` o `divipol-existe` en `fallida` SHALL dar `success` con `data_validation` `warning` `["divipol_unknown"]` y el documento.

#### Scenario: DIVIPOL desconocido
- **WHEN** el intérprete falso devuelve el resultado del PDF417 de apellido-compuesto con `divipol-existe` en `fallida`
- **THEN** el motor devuelve `success`, `data_validation` `warning` `["divipol_unknown"]` y el documento completo

### Requirement: MS-13 Comparación facial no disponible
El motor real no compara rostros (decisión de este cambio): con `face_match` `true` MUST devolver `failure`, `processing_error`, los 5 checks `not_performed` con `reasons` `[]` y `document` `null`, sin lanzar el intérprete, en lugar de un `success` sin comparación.

#### Scenario: Comparación facial pedida
- **WHEN** el motor procesa `LECTOR(FX/pdf417-amarilla/apellido-compuesto)` con `face_match` `true` y un intérprete espía
- **THEN** devuelve `failure`, `processing_error`, los 5 checks `not_performed` con `reasons` `[]`, `document` `null` y el espía no recibió ninguna llamada

### Requirement: MS-06 Normalización de la cédula digital
La MRZ no separa primer y segundo apellido ni nombre de forma inequívoca (`DE<LA<OSSA<FICTICIO`), así que el documento de la MRZ SHALL llevar los apellidos completos en `first_surname` y los nombres completos en `first_name`, con `second_surname`, `second_name`, `place_of_birth`, `place_of_issue` (hipótesis M03 pendiente), `blood_type` y `date_of_issue` en `null`, `date_of_expiry` = vencimiento y `sources` `["mrz"]`.

#### Scenario: Cédula digital legible
- **WHEN** el motor procesa `co_national-id-2020` con `LECTOR(FX/mrz-cedula-digital/apellido-compuesto)`
- **THEN** devuelve `status` `success`, `data_validation` `passed` y `document` `{"type": "co_national-id-2020", "document_number": "9999123456", "first_surname": "DE LA OSSA FICTICIO", "second_surname": null, "first_name": "ANA", "second_name": null, "sex": "F", "date_of_birth": "1990-07-15", "place_of_birth": null, "blood_type": null, "date_of_issue": null, "place_of_issue": null, "date_of_expiry": "2034-07-15", "sources": ["mrz"], "warnings": ["M03"]}`

### Requirement: MS-14 Warnings del documento
`document.warnings` SHALL contener solo los warnings del parser con forma `^[HMN][0-9]{2}$`, sin repetidos y en su orden.

#### Scenario: Warnings fuera del registro
- **WHEN** el intérprete falso devuelve warnings `["M03", "D04", "M03", "x"]`
- **THEN** `document.warnings` es `["M03"]`

### Requirement: MS-03 Activación del motor real en modo live
`Puertos` SHALL aceptar un `Lector`; con lector, `motor_live` es `MotorReal` con ese lector y el intérprete Node. Sin lector, `motor_live` sigue en `None` y AV-22 no cambia. El modo sandbox no usa el motor real.

#### Scenario: Flujo live completo con lector
- **WHEN** con `Puertos(lector=LECTOR(FX/pdf417-amarilla/apellido-compuesto))` y `KL` se crea una validación `co_national-id-2000`, se suben `front` y `back` válidos con el token y se consulta
- **THEN** la subida responde 200 y el `GET` devuelve `status` `success`, `sandbox` `false` y el documento del escenario "Cédula amarilla legible"

#### Scenario: Sin lector
- **WHEN** con `Puertos()` se sube a una validación live
- **THEN** responde 503 `engine-unavailable` (AV-22)

#### Scenario: El sandbox no cambia
- **WHEN** con `Puertos(lector=LECTOR(nada))` se ejecuta `CREAR` con `KT` y una subida
- **THEN** el resultado es el del fixture de sandbox `success`

### Requirement: MS-04 Privacidad del motor real
El motor MUST pasar al intérprete solo el payload o las líneas (nunca bytes de imagen), MUST NOT guardar referencias a las imágenes ni a la interpretación cruda, y los logs de un flujo live con el motor real MUST cumplir AV-32. El contenedor con Node MUST seguir con sistema de archivos de solo lectura.

#### Scenario: Solo el payload llega al intérprete
- **WHEN** se sube con `LECTOR(FX/pdf417-amarilla/apellido-compuesto)` un `front` y un `back` con contenido conocido y un intérprete espía
- **THEN** la entrada del intérprete es un objeto con exactamente las claves `fuente` y `datos_b64` y no contiene el base64 de los primeros 48 bytes de ninguna imagen

#### Scenario: Logs del flujo live sin datos personales
- **WHEN** se ejecuta el escenario "Flujo live completo con lector" capturando los logs
- **THEN** ninguna línea contiene `9999123456`, `DE LA OSSA`, `FICTICIA`, `1985-03-14` ni `O+`

#### Scenario: Almacén sin bytes ni crudos
- **WHEN** termina el escenario "Flujo live completo con lector"
- **THEN** al recorrer la validación almacenada no aparece ningún valor `bytes`, `bytearray` ni `memoryview`, ni las claves `campos`, `validaciones` o `datos_b64`

#### Scenario: Servicio de pruebas de solo lectura
- **WHEN** se lee `server/compose.yaml`
- **THEN** el servicio `pruebas` tiene `read_only: true` y `tmpfs` `["/tmp"]`, y su orden ejecuta ruff con `--no-cache` y pytest con `-p no:cacheprovider`, de modo que la puerta del servidor corre sin escribir fuera de `/tmp`

#### Scenario: Contenedor de solo lectura con Node
- **WHEN** se ejecuta el intérprete dentro del servicio `api-pruebas` (`docker compose -f server/compose.yaml exec api-pruebas /usr/local/bin/node /srv/interprete/interpretar.mjs` con la entrada de "PDF417 sintético con apellido compuesto")
- **THEN** responde `ok` `true` y `docker compose -f server/compose.yaml exec api-pruebas find /tmp -type f` no lista ningún archivo

### Requirement: MS-05 Licencias del motor real
Los lectores del servidor MUST usar solo dependencias ya aprobadas de `packages/capture` (zxing-wasm 3.1.5, tesseract.js 7.0.0, jpeg-js 0.4.4, pngjs 7.0.0) y el modelo `tesseract-mrz` de `models/manifest.json`; zxing-cpp y RapidOCR MUST NOT añadirse (decisión 9, que reemplaza la autorización previa de esas dependencias). La imagen MUST llevar el LICENSE completo de Node.

#### Scenario: Licencia de Node en la imagen
- **WHEN** se lee `/srv/licencias/node-LICENSE` en la imagen del servidor
- **THEN** existe, empieza por `Node.js is licensed for use as follows:` y contiene los avisos de V8, OpenSSL, ICU y c-ares (condición del revisor de licencias)

#### Scenario: La imagen no contiene el repositorio git
- **WHEN** se busca en la imagen del servidor
- **THEN** no existe `/repo.git` ni ningún directorio `.git` bajo `/srv`, `/usr/local` ni `/root` (el `.git` solo entra en la etapa de compilación `fuente`)

#### Scenario: Sin dependencias no aprobadas
- **WHEN** se inspeccionan `server/pyproject.toml` y `server/uv.lock`
- **THEN** no contienen `zxing` ni `rapidocr`

#### Scenario: Modelo empaquetado y verificado
- **WHEN** se lee `/srv/modelos/tesseract/mrz.traineddata` en la imagen
- **THEN** su SHA-256 es el de `tesseract-mrz` en `models/manifest.json` (`e44f5b7a6bdd3f382ef3bfa84ee0057f5897946a84a094c26910e0a124f3a9bd`)

### Requirement: MS-16 Lector Node de packages/capture
El lector del servidor SHALL ser el de `packages/capture` (`decodificarPdf417Imagen` para la amarilla; `crearLectorMrz` con su plan de giros y su presupuesto LMI-13 para la digital), ejecutado con Node en un proceso por subida (`/srv/lector/leer.mjs`), que devuelve el payload PDF417 o las 3 líneas MRZ corregidas de la primera imagen legible entre `back` y `front`.

#### Scenario: PDF417 sintético leído en el contenedor
- **WHEN** el lector recibe como `back` un PNG sintético con el PDF417 de FX/pdf417-amarilla/apellido-compuesto escrito por zxing-wasm y como `front` `IMG_PNG`
- **THEN** devuelve `ok` `true` y `pdf417_b64` cuyos bytes son el payload del fixture

#### Scenario: Imagen sin documento
- **WHEN** el lector recibe `IMG_PNG` como `back` y `front` para cada tipo
- **THEN** devuelve `{"ok": false, "motivo": "no-encontrado"}` y el motor da `document_unreadable`

#### Scenario: Equivalencia con la CLI
- **WHEN** sobre la imagen sintética S de `PERSONA_BASE` (PDF417) y el reverso R renderizado de `PERSONA_BASE` (MRZ) se ejecutan `tools/leer-foto.mjs --sin-mascara` y `server/lector/leer.mjs` seguido del intérprete
- **THEN** los campos interpretados por el servidor son iguales a los de la CLI (`resultado.campos` del PDF417 sin `lugarNacimiento`, y los campos de la MRZ que proyecta el intérprete)

### Requirement: MS-17 Aislamiento del proceso lector
El proceso lector MUST recibir las imágenes solo por la entrada estándar, con argumentos fijos y salida de errores descartada, MUST poner a cero sus copias de las imágenes tras leerlas y MUST NOT usar la red en ejecución. En Python solo se sueltan las referencias (design.md, decisión 11). Si falla, el motor MUST lanzar una excepción sin datos (vía de error interno de AV-29).

#### Scenario: Imágenes solo por la entrada estándar
- **WHEN** el lector Node lee una subida con el lanzador de procesos instrumentado
- **THEN** el proceso se lanza con los argumentos `("/usr/local/bin/node", "/srv/lector/leer.mjs")`, entrada por tubería, salida de errores descartada, y la entrada tiene exactamente las claves `tipo`, `fecha_referencia` e `imagenes_b64`, con `back` primero

#### Scenario: Entrada con dos partes máximas
- **WHEN** se lee `MAX_ENTRADA` de `server/lector/leer.mjs` y se envía al lector real una petición con dos imágenes de `LIMITE_PARTE` (8 388 608) bytes
- **THEN** `MAX_ENTRADA` es al menos 2 x 4/3 x `LIMITE_PARTE` + 4096 y la respuesta no es `entrada-no-valida`

#### Scenario: Fallo del lector
- **WHEN** el proceso lector termina con código 1, escribe `[]`, responde `{"ok": false, "motivo": "modelo-no-disponible"}` o excede el tiempo límite
- **THEN** `leer` lanza `ErrorLector` sin datos en su mensaje

#### Scenario: Entrada no válida del lector
- **WHEN** el lector recibe `no es json`
- **THEN** responde `{"ok": false, "motivo": "entrada-no-valida"}` con código 0, sin escribir en la salida de errores

### Requirement: MS-18 Presupuesto de la MRZ en el servidor
El lector MRZ del servidor SHALL usar el presupuesto de LMI-13 con un tiempo límite de 20 s para toda la subida (repartido entre `back` y `front`: cada imagen recibe lo que queda), menor que los 60 s de la CLI, y el proceso lector se mata a los 25 s.

#### Scenario: Presupuesto configurado
- **WHEN** se leen `server/lector/leer.mjs` y `server/app/motor_real.py`
- **THEN** el lector pasa `tiempoLimiteMs` de 20 000 a `crearLectorMrz` y `LIMITE_LECTOR_S` es 25

### Requirement: MS-19 Activación del lector en producción
Con la variable de entorno `LECTOR_LIVE=node`, la aplicación SHALL crear `Puertos` con el lector Node; sin ella, el modo live sigue en 503 (AV-22). Los servicios `api` y `api-pruebas` de `server/compose.yaml` la definen.

#### Scenario: Lector activado por entorno
- **WHEN** se crea la aplicación sin puertos inyectados con `LECTOR_LIVE=node`, y otra vez sin la variable
- **THEN** la primera tiene `motor_live` `MotorReal` con `LectorNode` y la segunda `motor_live` `None`
