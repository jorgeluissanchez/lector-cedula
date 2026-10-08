## ADDED Requirements

### Requirement: OD-01 Parser puro de MRZ TD3
`parsearMrzTd3(lineas, opciones?: { fechaReferencia })` en `packages/parsers` MUST ser pura y total y aceptar exactamente 2 líneas de 44 caracteres del alfabeto MRZ (`0-9`, `A-Z`, `<`) según ICAO 9303 parte 4 y devolver `{ ok: true, tipoDocumento: "pasaporte", campos, digitosControl, warnings }` o `{ ok: false, error }`. Otro número de líneas o longitudes da `error: "formato-td3"`; un código de documento que no empieza por `P` da `error: "no-es-pasaporte"`.

#### Scenario: Longitudes inválidas
- **WHEN** se parsea una sola línea, tres líneas, líneas de 43 o 45 caracteres, `null`, `42` o `["", ""]`
- **THEN** el resultado es `{ ok: false, error: "formato-td3" }` y no lanza

#### Scenario: TD1 no es TD3
- **WHEN** se parsean las 3 líneas de 30 de la digital sintética `PERSONA_BASE`
- **THEN** el resultado es `{ ok: false, error: "formato-td3" }`

#### Scenario: No es pasaporte
- **WHEN** se parsea el espécimen ICAO con la línea 1 empezando por `V<` y los dígitos de control intactos
- **THEN** el resultado es `{ ok: false, error: "no-es-pasaporte" }`

### Requirement: OD-01a Campos del TD3
Los campos de `parsearMrzTd3` MUST ser: `codigoDocumento` ([0,2) de la línea 1 sin `<`), `estadoEmisor` [2,5), `apellidos` y `nombres` ([5,44) separados por `<<`, `<` simple como espacio), y de la línea 2 `numeroDocumento` [0,9) sin `<`, `nacionalidad` [10,13), `fechaNacimiento` [13,19) en ISO, `sexo` [20] (`"F"`, `"M"`, o `null` para `<` y `X`), `fechaVencimiento` [21,27) en ISO y `datoOpcional` [28,42) sin `<` (`null` si vacío).

#### Scenario: Espécimen ICAO
- **WHEN** se parsea `["P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<", "L898902C36UTO7408122F1204159ZE184226B<<<<<10"]` con `fechaReferencia` `2026-10-08`
- **THEN** `ok` es `true` y `campos` es `{ codigoDocumento: "P", estadoEmisor: "UTO", apellidos: "ERIKSSON", nombres: "ANNA MARIA", numeroDocumento: "L898902C3", nacionalidad: "UTO", fechaNacimiento: "1974-08-12", sexo: "F", fechaVencimiento: "2012-04-15", datoOpcional: "ZE184226B" }`, los 5 dígitos de control son `"valido"` y `warnings` contiene `"documento-vencido"` y `"pais-especimen"`

#### Scenario: Pasaporte colombiano sintético con apellido compuesto y Ñ transliterada
- **WHEN** se parsea `["P<COLPEREZ<NUNEZ<<ANA<MARIA<<<<<<<<<<<<<<<<<", "AZ12345673COL9002155F31021451234567890<<<<78"]` con `fechaReferencia` `2026-10-08`
- **THEN** `apellidos` es `"PEREZ NUNEZ"`, `nombres` es `"ANA MARIA"`, `numeroDocumento` es `"AZ1234567"`, `fechaNacimiento` es `"1990-02-15"`, `fechaVencimiento` es `"2031-02-14"`, `datoOpcional` es `"1234567890"` y los 5 dígitos de control son `"valido"`

#### Scenario: Apellido de varias palabras y sexo M (error pasado)
- **WHEN** se parsea `["P<COLDE<LA<OSSA<<JUAN<<<<<<<<<<<<<<<<<<<<<<<", "AZ76543211COL8501019M3001019<<<<<<<<<<<<<<<0"]`
- **THEN** `apellidos` es `"DE LA OSSA"`, `nombres` es `"JUAN"`, `sexo` es `"M"` y `datoOpcional` es `null`

### Requirement: OD-02 Dígitos de control TD3 con digitoControlIcao
`parsearMrzTd3` MUST verificar con `digitoControlIcao` (MZ-08) los dígitos de número [9], nacimiento [19], vencimiento [27], dato opcional [42] (si el campo es todo `<`, el dígito `<` o `0` es válido) y compuesto [43] (sobre [0,10) + [13,20) + [21,43) de la línea 2). Con cualquier dígito `"invalido"` el resultado MUST ser `{ ok: false, error: "digito-control", digitosControl }` sin campos.

#### Scenario: Número de documento alterado
- **WHEN** se parsea el espécimen ICAO con la línea 2 cambiada a `"L898902C46UTO7408122F1204159ZE184226B<<<<<10"`
- **THEN** el resultado es `ok: false`, `error: "digito-control"` y `digitosControl.numeroDocumento` es `"invalido"`

#### Scenario: Compuesto alterado
- **WHEN** se parsea el espécimen ICAO con el último carácter `0` cambiado por `1`
- **THEN** `ok` es `false` y `digitosControl.compuesto` es `"invalido"` y los otros cuatro `"valido"`

#### Scenario: Propiedad de round-trip
- **WHEN** el generador sintético de TD3 produce 1000 pasaportes con campos aleatorios válidos (fast-check)
- **THEN** `parsearMrzTd3` devuelve `ok: true` y los mismos campos en todos, y alterar un carácter numérico protegido cambia a `ok: false` en todos

### Requirement: OD-03 Correcciones OCR-B solo en zonas numéricas
`parsearMrzTd3` MUST aplicar las correcciones O->0, Q->0, I->1, Z->2, S->5, G->6, B->8 solo en las posiciones numéricas (fechas y dígitos de control, [9], [13,20), [21,28), [42], [43]) y registrarlas en `correcciones`; MUST NOT corregir nombres, número de documento, países ni dato opcional.

#### Scenario: Fecha leída con O
- **WHEN** se parsea el espécimen ICAO con `7408122` cambiado por `74O8122`
- **THEN** `ok` es `true`, `fechaNacimiento` es `"1974-08-12"` y `correcciones` es `[{ posicion: 15, de: "O", a: "0" }]`

#### Scenario: Número de documento con O no se corrige
- **WHEN** se parsea un TD3 sintético con `numeroDocumento` `"AO1234567"` y sus dígitos de control calculados con la O
- **THEN** `numeroDocumento` es `"AO1234567"` y `correcciones` es `[]`

### Requirement: OD-04 Países ISO 3166-1 alfa-3 y códigos ICAO
El paquete MUST incluir `PAISES_ICAO` con los 249 códigos ISO 3166-1 alfa-3, los especiales de ICAO 9303 parte 3 (`D`, `GBD`, `GBN`, `GBO`, `GBP`, `GBS`, `UNA`, `UNK`, `UNO`, `XOM`, `XXA`, `XXB`, `XXC`, `XXX`, `EUE`, `RKS`) y `UTO` como espécimen. `parsearMrzTd3` MUST devolver `estadoEmisor` y `nacionalidad` como códigos y `nombrePaisEmisor` y `nombreNacionalidad` en español; un código desconocido añade `"pais-desconocido"` sin rechazar; `D<<` se normaliza a `"D"`.

#### Scenario: Alemania con D<<
- **WHEN** se parsea `["P<D<<MUSTERMANN<<ERIKA<<<<<<<<<<<<<<<<<<<<<<", "C01X00T478D<<6408125F3103315<<<<<<<<<<<<<<<2"]`
- **THEN** `estadoEmisor` es `"D"`, `nacionalidad` es `"D"`, `nombreNacionalidad` es `"Alemania"` y `warnings` no contiene `"pais-desconocido"`

#### Scenario: Código inexistente
- **WHEN** se parsea un TD3 sintético válido con nacionalidad `"QQQ"`
- **THEN** `ok` es `true`, `nombreNacionalidad` es `null` y `warnings` contiene `"pais-desconocido"`

#### Scenario: Colombia
- **WHEN** se parsea el pasaporte colombiano sintético de OD-01
- **THEN** `nombrePaisEmisor` es `"Colombia"`

### Requirement: OD-05 Siglo de fechas y vigencia
`parsearMrzTd3` MUST resolver el siglo así: nacimiento `AA` es `20AA` si `20AA` <= el año de `fechaReferencia` (por defecto la fecha del sistema), si no `19AA`; vencimiento siempre `20AA`. Fechas imposibles (mes 13, 30 de febrero) MUST dar `error: "fecha-invalida"`. Si `fechaVencimiento` < `fechaReferencia` se añade el warning `"documento-vencido"` sin rechazar (la decisión de rechazo es del integrador).

#### Scenario: Siglo del nacimiento
- **WHEN** se parsean TD3 sintéticos con nacimiento `260101` y `270101` y `fechaReferencia` `2026-10-08`
- **THEN** las fechas son `"2026-01-01"` y `"1927-01-01"`

#### Scenario: Fecha imposible
- **WHEN** se parsea un TD3 sintético con nacimiento `900230` y dígitos de control recalculados
- **THEN** el resultado es `{ ok: false, error: "fecha-invalida" }`

#### Scenario: Nunca lanza
- **WHEN** se pasa a `parsearMrzTd3` `fc.anything()`, `fc.string()` y pares de `fc.string({ unit: "binary" })` (numRuns 1000 cada uno)
- **THEN** nunca lanza y siempre devuelve un objeto con `ok` booleano
