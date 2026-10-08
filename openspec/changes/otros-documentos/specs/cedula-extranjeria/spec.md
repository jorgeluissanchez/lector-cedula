## ADDED Requirements

### Requirement: OD-10 Parser genérico de MRZ TD1
`parsearMrzTd1(lineas: unknown, opciones?)` en `packages/parsers` MUST ser puro y total y leer cualquier TD1 de ICAO 9303 parte 5 (3 líneas de 30): línea 1 `codigoDocumento` [0,2), `estadoEmisor` [2,5), `numeroDocumento` [5,14), `datoOpcional1` [15,30); línea 2 `fechaNacimiento` [0,6), `sexo` [7], `fechaVencimiento` [8,14), `nacionalidad` [15,18), `datoOpcional2` [18,29); línea 3 `apellidos` y `nombres`. Usa `PAISES_ICAO` (OD-04) y el siglo de OD-05.

#### Scenario: Nunca lanza
- **WHEN** se pasa `fc.anything()` y tríos de `fc.string({ unit: "binary" })` (numRuns 1000)
- **THEN** nunca lanza

### Requirement: OD-10a Controles del TD1 y compatibilidad
`parsearMrzTd1` MUST verificar con `digitoControlIcao` los 4 dígitos de control (línea 1 [14]; línea 2 [6], [14] y compuesto [29]) y aplicar las correcciones OCR-B solo en zonas numéricas. `parsearMrzCedulaDigital` MUST conservar su contrato (MZ) sin cambios en su salida.

#### Scenario: CE sintética
- **WHEN** se parsea `["I<COL1234567<<4<<<<<<<<<<<<<<<", "8001014F3001019VEN<<<<<<<<<<<4", "GARCIA<<MARIA<JOSE<<<<<<<<<<<<"]` con `fechaReferencia` `2026-10-08`
- **THEN** `ok` es `true`, `codigoDocumento` es `"I"`, `estadoEmisor` es `"COL"`, `numeroDocumento` es `"1234567"`, `nacionalidad` es `"VEN"`, `nombreNacionalidad` es `"Venezuela"`, `fechaNacimiento` es `"1980-01-01"`, `fechaVencimiento` es `"2030-01-01"`, `apellidos` es `"GARCIA"`, `nombres` es `"MARIA JOSE"` y los 4 dígitos de control son `"valido"`

#### Scenario: Compuesto alterado
- **WHEN** se parsea la CE sintética con el último carácter de la línea 2 cambiado de `4` a `5`
- **THEN** `ok` es `false`, `error` es `"digito-control"` y `digitosControl.compuesto` es `"invalido"`

#### Scenario: La digital no cambia
- **WHEN** se parsea la digital sintética `PERSONA_BASE` con `parsearMrzCedulaDigital` antes y después del cambio
- **THEN** las dos salidas son iguales con `toStrictEqual`

### Requirement: OD-11 Clasificación de la cédula de extranjería (hipótesis)
`clasificarDocumento` MUST devolver `"cedula-extranjeria"` para un TD1 válido con emisor `"COL"`, código `I<`, `ID` o `IE` (CE01) y nacionalidad distinta de `"COL"` (CE02), con los warnings `"CE01"`, `"CE02"` y `"CE03"`; `IC`+`COL` es `"cedula-ciudadania"`; un TD1 con emisor distinto de `"COL"` da `{ ok: false, error: "documento-no-admitido" }`. Las hipótesis CE01 a CE07 están en `docs/decisiones/hipotesis-formato.md`.

#### Scenario: CE clasificada con hipótesis
- **WHEN** se clasifica la CE sintética de OD-10
- **THEN** `tipoDocumento` es `"cedula-extranjeria"` y `warnings` contiene `"CE01"`, `"CE02"` y `"CE03"`

#### Scenario: Digital colombiana
- **WHEN** se clasifica `["ICCOL1234567897<<<<<<<<<<<<<<<", "8001014F3001019COL1234567890<5", "PEREZ<<ANA<<<<<<<<<<<<<<<<<<<<"]`
- **THEN** `tipoDocumento` es `"cedula-ciudadania"` y no hay warnings `CE`

#### Scenario: TD1 extranjero
- **WHEN** se clasifica un TD1 sintético válido con `estadoEmisor` `"ESP"`
- **THEN** el resultado es `{ ok: false, error: "documento-no-admitido" }`

### Requirement: OD-12 Número de la CE
Para `tipoDocumento: "cedula-extranjeria"` el campo `numeroDocumento` MUST ser el número tal cual (entre 1 y 9 caracteres, conservando los ceros a la izquierda; hipótesis CE03: la CE tiene hasta 7 dígitos impresos y el TD1 lo rellena con `<`). Si contiene letras, se devuelve igual y se añade el warning `"CE03-numero-no-numerico"`. El validador de NUIP (NF) MUST NOT aplicarse a la CE.

#### Scenario: Número de 7 dígitos
- **WHEN** se clasifica la CE sintética de OD-10
- **THEN** `numeroDocumento` es `"1234567"` y no hay campo `nuip`

#### Scenario: Número con ceros a la izquierda
- **WHEN** se clasifica una CE sintética con número `"0012345"` y dígitos de control recalculados
- **THEN** `numeroDocumento` es `"0012345"`

### Requirement: OD-13 Código 2D de la CE no se decodifica
El lector MUST NOT intentar decodificar el código bidimensional del reverso de la CE (hipótesis CE04: formato no publicado; puede contener datos cifrados o biométricos). Si la presencia detecta un PDF417 y la lectura MRZ de la misma imagen clasifica una CE, el resultado MUST venir solo de la MRZ y el decodificador PDF417 MUST NOT entregar sus bytes a ningún parser.

#### Scenario: CE con 2D sintético
- **WHEN** se lee una imagen sintética de CE con MRZ TD1 y un PDF417 sintético de bytes aleatorios en el reverso, con pista `"pdf417"`
- **THEN** el parser de la amarilla devuelve `ok: false` sin campos, los bytes del PDF417 quedan a cero, el respaldo MRZ da `tipoDocumento: "cedula-extranjeria"` con `fuente: "mrz-td1"`, y ningún campo del resultado proviene del PDF417
