# Spec Delta

## Purpose

Generar, de forma determinista y sin datos reales, los payloads PDF417 de la cédula amarilla y las líneas MRZ TD1 de la cédula digital que usan las pruebas y las evals de los parsers. Cada fixture declara su estructura (rangos de bytes o posiciones) y las hipótesis del formato que asume (`docs/decisiones/hipotesis-formato.md`), de modo que confirmar o refutar una hipótesis cambie un solo lugar.

Convenciones de los escenarios:

- `bytes[a,b)` es el subarreglo de `a` (incluido) a `b` (excluido) del payload, decodificado como ISO-8859-1. `\0` es el byte 0x00 y `"\0" × n` son `n` bytes 0x00. Los rangos declarados se escriben `[inicio, fin]` (arreglo de dos números) y significan ese mismo intervalo semiabierto.
- Las posiciones de la MRZ se cuentan desde 0; las líneas, desde 1 (`L1`, `L2`, `L3`).
- `PERSONA_BASE` es la persona ficticia exportada: `{ nuip: "9999123456", primerApellido: "PRUEBA", segundoApellido: "EJEMPLO", primerNombre: "FICTICIA", segundoNombre: "LUZ", sexo: "F", fechaNacimiento: "1985-03-14", departamento: "16", municipio: "001", rh: "O+", serialDocumento: "999912345", fechaVencimiento: "2035-03-14", lugarExpedicion: "16001" }`. `PERSONA_BASE + { campo: valor }` es una copia con ese campo sustituido.
- Si un escenario no indica variante ni semilla, se usan las de omisión: variante `"completa"` (PDF417) o `"valida"` (MRZ) y semilla `1`.
- Las hipótesis `Hxx`, `Mxx` y `Gxx` son las de `docs/decisiones/hipotesis-formato.md`, todas pendientes. Ningún escenario afirma que la cédula real sea así: afirma que el generador produce eso bajo esas hipótesis.
- Todos los números y nombres son sintéticos (NUIP y serial con prefijo `9999`; primer nombre de la lista de marcadores de ficción).
- La disposición de la trama PDF417 sigue la evidencia de `docs/decisiones/2026-10-06-evidencia-hipotesis-formato.md` (layout observado en un payload público, G01 corregida): `[32,40)` son 8 bytes 0x00 y `[40,48)` es un campo numérico de 8 bytes; no hay un campo de 6 dígitos en `[33,39)`.

## ADDED Requirements

### Requirement: FX-01 Paquete de pruebas privado
El generador SHALL vivir en el paquete de workspace `@lector-cedula/fixtures` (`packages/fixtures/`) con `"private": true`. Ningún `package.json` de `packages/*` ni de `apps/*` MUST declararlo en `dependencies`, `peerDependencies` ni `optionalDependencies`; solo en `devDependencies`. Su código fuente MUST NOT hacer E/S ni usar `Math.random` o el reloj, y MUST pasar `privacidad-check` sin hallazgos.

#### Scenario: Paquete privado
- **WHEN** se lee `packages/fixtures/package.json`
- **THEN** `name` es `"@lector-cedula/fixtures"` y `private` es `true`

#### Scenario: Ningún paquete de producción depende del generador
- **WHEN** se recorren los `package.json` de `packages/*` y `apps/*`
- **THEN** ninguno contiene `"@lector-cedula/fixtures"` en `dependencies`, `peerDependencies` ni `optionalDependencies`

#### Scenario: Privacidad del paquete
- **WHEN** se aplica `revisarArchivo` de `tools/privacidad-check.mjs` a cada archivo de `packages/fixtures/src/` y `packages/fixtures/test/` con su contenido
- **THEN** todas las llamadas devuelven `[]` y exactamente una línea de `packages/fixtures/src/` contiene `PubDSK_1`

#### Scenario: Sin E/S ni aleatoriedad externa en la fuente
- **WHEN** se buscan en `packages/fixtures/src/` las cadenas `node:`, `fetch(`, `writeFile`, `readFile`, `console.`, `Math.random`, `Date.now` y `new Date(`
- **THEN** no hay ninguna coincidencia

### Requirement: FX-02 Interfaz pública estable
El paquete SHALL exportar exactamente los valores del escenario y los tipos de design.md (decisión 2). `VERSION_CONTRATO` MUST valer `"1.0.0"`; todo cambio incompatible de nombres, formas de objeto, algoritmo del PRNG u orden de consumo de la semilla MUST subir su MAJOR en un cambio OpenSpec que actualice a los consumidores. `PERSONA_BASE` y los fixtures devueltos MUST ser inmutables, salvo `bytes`.

#### Scenario: Lista exacta de exportaciones
- **WHEN** se importa el módulo y se ordenan sus claves
- **THEN** son exactamente `["ErrorFixture", "PERSONA_BASE", "VERSION_CONTRATO", "arbFixtureMrz", "arbFixturePdf417", "arbPersonaFicticia", "casosMrz", "casosPdf417", "generarMrzTd1", "generarPdf417"]`

#### Scenario: Versión del contrato
- **WHEN** se lee `VERSION_CONTRATO`
- **THEN** vale `"1.0.0"`

#### Scenario: Persona base inmutable
- **WHEN** se intenta asignar `PERSONA_BASE.nuip = "9999000000"` en modo estricto
- **THEN** se lanza `TypeError` y `PERSONA_BASE.nuip` sigue siendo `"9999123456"`

#### Scenario: Fixture inmutable
- **WHEN** se intenta asignar `f.esperado.nuip = "9999000000"` y `f.hipotesis.push("H10")` sobre `f = generarPdf417(PERSONA_BASE)` en modo estricto
- **THEN** ambas asignaciones lanzan `TypeError`

### Requirement: FX-03 Validación de la persona y de las opciones
Los generadores SHALL validar la persona y después las opciones antes de generar. Ante el primer fallo, en el orden fijado en el escenario de orden, MUST lanzar `ErrorFixture` (subclase de `Error` con `codigo` y `campo`; `campo` es `null` si no aplica) y MUST NOT devolver una salida parcial ni lanzar otra excepción. La persona MUST tener exactamente las 13 claves de `PERSONA_BASE`.

#### Scenario: Persona base válida
- **WHEN** se llama `generarPdf417(PERSONA_BASE)` y `generarMrzTd1(PERSONA_BASE)`
- **THEN** ninguna lanza y ambas devuelven un objeto con `sintetico: true`

#### Scenario: Clave sobrante, faltante o persona que no es objeto
- **WHEN** se llama `generarPdf417` con `PERSONA_BASE + { apodo: "X" }`, con `PERSONA_BASE` sin la clave `rh` y con `null`
- **THEN** las tres lanzan `ErrorFixture` con `codigo` `"persona-invalida"`

#### Scenario: Orden de validación
- **WHEN** una persona tiene varios campos inválidos
- **THEN** el `campo` del error es el primero de este orden: `nuip`, `serialDocumento`, `primerApellido`, `segundoApellido`, `primerNombre`, `segundoNombre`, `sexo`, `fechaNacimiento`, `fechaVencimiento`, `departamento`, `municipio`, `lugarExpedicion`, `rh`; después las opciones `variante`, `semilla` y las de OCR; y por último las restricciones de la MRZ (`nuip-no-soportado-en-mrz`, luego `nombre-excede-mrz`)

#### Scenario: Primer error en el orden fijado
- **WHEN** se llama `generarPdf417(PERSONA_BASE + { nuip: "123", rh: "Z" }, { variante: "otra" })`
- **THEN** lanza `ErrorFixture` con `codigo` `"nuip-fuera-de-rango-sintetico"` y `campo` `"nuip"`

#### Scenario: Opciones inválidas
- **WHEN** se llama `generarPdf417(PERSONA_BASE, { variante: "otra" })`, `generarPdf417(PERSONA_BASE, { semilla: -1 })`, `generarPdf417(PERSONA_BASE, { semilla: 1.5 })` y `generarMrzTd1(PERSONA_BASE, { semilla: 4294967296 })`
- **THEN** lanzan `ErrorFixture` con `codigo` `"variante-invalida"`, `"semilla-invalida"`, `"semilla-invalida"` y `"semilla-invalida"` respectivamente

#### Scenario: Entradas arbitrarias solo producen ErrorFixture
- **WHEN** se llaman `generarPdf417(p, o)` y `generarMrzTd1(p, o)` con al menos 1000 pares `p`, `o` de `fc.anything()` y con al menos 1000 personas `PERSONA_BASE` con un campo sustituido por `fc.anything()`
- **THEN** ninguna llamada lanza algo distinto de `ErrorFixture`, y cada `codigo` es uno de `persona-invalida`, `nuip-fuera-de-rango-sintetico`, `serial-fuera-de-rango-sintetico`, `nombre-invalido`, `nombre-demasiado-largo`, `sexo-invalido`, `fecha-invalida`, `divipol-invalido`, `rh-invalido`, `variante-invalida`, `semilla-invalida`, `opcion-ocr-invalida`, `nuip-no-soportado-en-mrz`, `nombre-excede-mrz`

### Requirement: FX-04 Reglas de los campos de la persona
`nuip` SHALL cumplir `^9999[0-9]{1,6}$`; `serialDocumento`, `^9999[0-9]{5}$`; `primerApellido`, `segundoApellido` y `primerNombre`, `^[A-ZÑ]+( [A-ZÑ]+)*$`; `segundoNombre`, lo mismo o `""`; cada nombre MUST tener 23 caracteres o menos; `sexo` es `M` o `F`; las fechas son gregorianas válidas `YYYY-MM-DD` con año de 1900 a 2099; `departamento`, `municipio` y `lugarExpedicion` tienen 2, 3 y 5 dígitos; `rh` es `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+` u `O-`.

#### Scenario: Un valor inválido por campo
- **WHEN** se llama `generarPdf417` con `PERSONA_BASE` y un solo campo sustituido por: `nuip` `"9999"`, `serialDocumento` `"99991234"`, `primerApellido` `"Prueba"`, `segundoApellido` `"ABCDEFGHIJKLMNOPQRSTUVWX"` (24), `primerNombre` `"FICTICÍA"`, `segundoNombre` `" LUZ"`, `sexo` `"X"`, `fechaNacimiento` `"1985-02-29"`, `fechaVencimiento` `"2100-01-01"`, `departamento` `"6"`, `municipio` `"01"`, `lugarExpedicion` `"1600A"`, `rh` `"AB"`
- **THEN** cada llamada lanza `ErrorFixture` con ese `campo` y `codigo` respectivamente `nuip-fuera-de-rango-sintetico`, `serial-fuera-de-rango-sintetico`, `nombre-invalido`, `nombre-demasiado-largo`, `nombre-invalido`, `nombre-invalido`, `sexo-invalido`, `fecha-invalida`, `fecha-invalida`, `divipol-invalido`, `divipol-invalido`, `divipol-invalido`, `rh-invalido`

#### Scenario: Doble espacio en apellido compuesto
- **WHEN** se llama `generarPdf417(PERSONA_BASE + { primerApellido: "DE  LA OSSA" })`
- **THEN** lanza `ErrorFixture` con `codigo` `"nombre-invalido"` y `campo` `"primerApellido"`

#### Scenario: Valores límite aceptados
- **WHEN** se llama `generarPdf417` con `PERSONA_BASE + { nuip: "99991" }`, `PERSONA_BASE + { segundoApellido: "ABCDEFGHIJKLMNOPQRSTUVW" }` (23), `PERSONA_BASE + { fechaNacimiento: "2000-02-29" }` y `PERSONA_BASE + { segundoNombre: "" }`
- **THEN** ninguna lanza

### Requirement: FX-05 Nunca un número fuera del rango sintético
El generador MUST NOT producir, para ninguna entrada, un NUIP, un serial o un AFIS fuera del rango sintético (principio III): el NUIP que extrae la regla H03 del PDF417, sin ceros a la izquierda, cumple `^9999[0-9]{1,6}$`; el AFIS cumple `^9999[0-9]{4}$`; en la MRZ sin errores, `L2[18,28)` cumple `^9999[0-9]{6}$` y `L1[5,14)` cumple `^9999[0-9]{5}$`.

#### Scenario: NUIP con forma de cédula real rechazado
- **WHEN** se llama `generarPdf417(PERSONA_BASE + { nuip: "1234567890" })`
- **THEN** lanza `ErrorFixture` con `codigo` `"nuip-fuera-de-rango-sintetico"` y `campo` `"nuip"`

#### Scenario: Cero inicial y once dígitos rechazados
- **WHEN** se llama `generarMrzTd1` con `PERSONA_BASE + { nuip: "0999912345" }` y con `PERSONA_BASE + { nuip: "99991234567" }`
- **THEN** ambas lanzan `ErrorFixture` con `codigo` `"nuip-fuera-de-rango-sintetico"`

#### Scenario: Serial fuera de rango
- **WHEN** se llama `generarMrzTd1(PERSONA_BASE + { serialDocumento: "123456789" })`
- **THEN** lanza `ErrorFixture` con `codigo` `"serial-fuera-de-rango-sintetico"` y `campo` `"serialDocumento"`

#### Scenario: Propiedad sobre números arbitrarios
- **WHEN** se generan al menos 1000 personas `PERSONA_BASE` con `nuip` de una mezcla de NUIP sintéticos válidos, `fc.stringMatching(/^[0-9]{1,12}$/)` y `fc.string()`, y `serialDocumento` de una mezcla análoga, y se llama a `generarPdf417` y a `generarMrzTd1` con variante y semilla arbitrarias
- **THEN** cada llamada o lanza `ErrorFixture` o devuelve una salida en la que la primera coincidencia de `/([0-9]{10})[A-ZÑ]/` en el payload ISO-8859-1, sin ceros a la izquierda, cumple `^9999[0-9]{1,6}$`, `bytes[rangos.afis]` cumple `^9999[0-9]{4}$`, y en `lineasSinErrores` `L2[18,28)` cumple `^9999[0-9]{6}$` y `L1[5,14)` cumple `^9999[0-9]{5}$`; y los contadores registran al menos un 20 % de salidas y al menos un 20 % de rechazos

### Requirement: FX-06 Determinismo con semilla
Las funciones del paquete SHALL ser puras y deterministas: la misma persona, opciones y semilla MUST dar salidas profundamente iguales. La semilla es un entero de 0 a 4294967295 (por omisión `1`). Todo valor aleatorio MUST salir del PRNG mulberry32 sembrado con la semilla y consumido en el orden de design.md (decisión 5). Cada llamada MUST devolver objetos y `Uint8Array` nuevos. Los arbitrarios MUST repetir su secuencia con la misma semilla de `fast-check`.

#### Scenario: Misma semilla, mismos bytes
- **WHEN** se llama dos veces `generarPdf417(PERSONA_BASE, { semilla: 7 })`
- **THEN** los dos `bytes` son iguales byte a byte y los dos objetos son profundamente iguales

#### Scenario: Semilla por omisión
- **WHEN** se compara `generarPdf417(PERSONA_BASE)` con `generarPdf417(PERSONA_BASE, { semilla: 1 })`
- **THEN** son profundamente iguales

#### Scenario: Valores literales con semilla 1
- **WHEN** se llama `generarPdf417(PERSONA_BASE, { semilla: 1 })`
- **THEN** `bytes[0,2)` es `"60"`, `bytes[2,10)` es `"99995992"`, `bytes[40,48)` es `"67494414"`, `bytes[165,166)` es `"2"` y los bytes 168 a 171 son `0x27 0x7D 0x11 0x65`

#### Scenario: Valores literales con semilla 2
- **WHEN** se llama `generarPdf417(PERSONA_BASE, { semilla: 2 })`
- **THEN** `bytes[0,2)` es `"73"`, `bytes[2,10)` es `"99992586"`, `bytes[40,48)` es `"43717248"`, `bytes[165,166)` es `"5"` y los bytes 168 a 171 son `0x24 0xAC 0x5D 0xF8`

#### Scenario: Copias independientes
- **WHEN** se pone a `0xFF` el byte 48 del `bytes` devuelto por una llamada y se repite la llamada con los mismos argumentos
- **THEN** el byte 48 de la segunda salida es `0x39` (`"9"`)

#### Scenario: Arbitrarios reproducibles
- **WHEN** se ejecuta dos veces `fc.sample(arbFixturePdf417(), { seed: 42, numRuns: 50 })` y lo mismo con `arbFixtureMrz()`
- **THEN** cada par de muestras es profundamente igual

### Requirement: FX-07 Trama PDF417 completa
Con variante `"completa"`, `generarPdf417` SHALL producir un payload de 531 bytes (H01) con la disposición de G01: 2 dígitos de cabecera, AFIS ficticio, 14 bytes 0x00, `PubDSK_1` desde el byte 24 (H02), 8 bytes 0x00, un campo numérico de 8 dígitos en `[40,48)`, el NUIP rellenado con `"0"` a la izquierda hasta 10 dígitos (H03), los cuatro nombres de 23 bytes desde el 58 (H04), el bloque demográfico desde el 150 y la cola hasta el final. Los dígitos de relleno salen del PRNG.

#### Scenario: Trama completa de la persona base
- **WHEN** se llama `generarPdf417(PERSONA_BASE)`
- **THEN** `bytes.length` es `531`, `bytes[10,24)` es `"\0" × 14`, `bytes[24,32)` es `"PubDSK_1"`, `bytes[32,40)` es `"\0" × 8`, `bytes[48,58)` es `"9999123456"` y `bytes[0,2)` y `bytes[40,48)` son solo dígitos ASCII

#### Scenario: Rangos declarados de la trama completa
- **WHEN** se llama `generarPdf417(PERSONA_BASE)`
- **THEN** `rangos` es `{ afis: [2,10], marcador: [24,32], nuip: [48,58], primerApellido: [58,81], segundoApellido: [81,104], primerNombre: [104,127], segundoNombre: [127,150], bloqueDemografico: [150,168], rh: [166,168], cola: [168,531] }`

#### Scenario: NUIP corto rellenado con ceros
- **WHEN** se llama `generarPdf417(PERSONA_BASE + { nuip: "99991234" })`
- **THEN** `bytes[48,58)` es `"0099991234"` y `esperado.nuip` es `"99991234"`

### Requirement: FX-08 Campos de nombre en ISO-8859-1
Cada campo de nombre del PDF417 SHALL ocupar 23 bytes: el nombre en ISO-8859-1 (la Ñ es 0xD1) relleno con 0x00 a la derecha (G01). Cada espacio interno de un nombre compuesto MUST codificarse como un único 0x20. Un segundo nombre ausente (`""`) MUST producir 23 bytes 0x00 sin desplazar ningún otro campo.

#### Scenario: Nombres de la persona base
- **WHEN** se llama `generarPdf417(PERSONA_BASE)`
- **THEN** `bytes[58,81)` es `"PRUEBA" + "\0" × 17`, `bytes[81,104)` es `"EJEMPLO" + "\0" × 16`, `bytes[104,127)` es `"FICTICIA" + "\0" × 15` y `bytes[127,150)` es `"LUZ" + "\0" × 20`

#### Scenario: Ñ como byte 0xD1
- **WHEN** se llama `generarPdf417(PERSONA_BASE + { primerApellido: "PEÑA", segundoApellido: "NUÑEZ" })`
- **THEN** los bytes 58 a 61 son `0x50 0x45 0xD1 0x41`, los bytes 81 a 85 son `0x4E 0x55 0xD1 0x45 0x5A` y `esperado.primerApellido` es `"PEÑA"`

#### Scenario: Apellido compuesto con espacio simple
- **WHEN** se llama `generarPdf417(PERSONA_BASE + { primerApellido: "DE LA OSSA" })`
- **THEN** `bytes[58,81)` es `"DE LA OSSA" + "\0" × 13` y `bytes[81,88)` es `"EJEMPLO"`

#### Scenario: Segundo nombre ausente
- **WHEN** se llama `generarPdf417(PERSONA_BASE + { segundoNombre: "" })`
- **THEN** `bytes[127,150)` es `"\0" × 23`, `bytes[150,151)` es `"0"`, `bytes.length` es `531` y `esperado.segundoNombre` es `""`

### Requirement: FX-09 Bloque demográfico sexo-primero y RH
En las variantes `"completa"`, `"windows-truncada"` y `"sin-pubdsk"`, el bloque demográfico SHALL ser `"0"` + sexo + `YYYYMMDD` + departamento (2) + municipio (3) + 1 dígito del PRNG + RH (H05, H06, H11). El RH MUST escribirse completo, con 2 o 3 caracteres y su signo.

#### Scenario: Bloque de la persona base
- **WHEN** se llama `generarPdf417(PERSONA_BASE)`
- **THEN** `bytes[150,165)` es `"0F1985031416001"`, `bytes[165,166)` es un dígito y `bytes[166,168)` es `"O+"`

#### Scenario: RH AB negativo de tres caracteres
- **WHEN** se llama `generarPdf417(PERSONA_BASE + { rh: "AB-" })`
- **THEN** `bytes[166,169)` es `"AB-"`, `rangos.rh` es `[166,169]`, `rangos.cola` es `[169,531]` y `bytes.length` es `531`

#### Scenario: RH O negativo conserva el signo
- **WHEN** se llama `generarPdf417(PERSONA_BASE + { rh: "O-" })`
- **THEN** `bytes[166,168)` es `"O-"` y `esperado.rh` es `"O-"`

#### Scenario: Sexo F con M en el apellido
- **WHEN** se llama `generarPdf417(PERSONA_BASE + { primerApellido: "MARTINEZ", sexo: "F" })`
- **THEN** `bytes[151,152)` es `"F"` y `esperado.sexo` es `"F"`

### Requirement: FX-10 Variante Windows truncada
Con variante `"windows-truncada"`, el payload SHALL ser el de la variante `"completa"` con la misma persona y semilla sin los 11 bytes 0x00 de `[13,24)`: `PubDSK_1` empieza en el byte 13 (H02) y el resto se conserva, desplazado 11 posiciones (G02).

#### Scenario: Relación exacta con la trama completa
- **WHEN** se generan `c = generarPdf417(PERSONA_BASE)` y `w = generarPdf417(PERSONA_BASE, { variante: "windows-truncada" })`
- **THEN** `w.bytes` es igual a `c.bytes[0,13)` seguido de `c.bytes[24,531)`, `w.bytes.length` es `520`, `w.bytes[13,21)` es `"PubDSK_1"` y `w.esperado` es profundamente igual a `c.esperado`

#### Scenario: Rangos desplazados
- **WHEN** se llama `generarPdf417(PERSONA_BASE, { variante: "windows-truncada" })`
- **THEN** `rangos.marcador` es `[13,21]`, `rangos.nuip` es `[37,47]`, `rangos.primerApellido` es `[47,70]`, `rangos.bloqueDemografico` es `[139,157]` y `rangos.cola` es `[157,520]`

### Requirement: FX-11 Variante sin PubDSK
Con variante `"sin-pubdsk"`, el payload SHALL ser el de la variante `"completa"` con la misma persona y semilla, con los 8 bytes del marcador sustituidos por 0x00 y un byte 0x00 más insertado en la posición 32, de modo que todo campo desde el byte 32 empieza una posición después (desplazamiento +1, H07, G03). El payload MUST conservar 531 bytes (H01): la cola pierde su último byte. `rangos.marcador` MUST ser `null`.

#### Scenario: Relación exacta con la trama completa
- **WHEN** se generan `c = generarPdf417(PERSONA_BASE)` y `s = generarPdf417(PERSONA_BASE, { variante: "sin-pubdsk" })`
- **THEN** `s.bytes` es igual a `c.bytes[0,24)` + `"\0" × 9` + `c.bytes[32,530)`, `s.bytes.length` es `531`, el texto ISO-8859-1 de `s.bytes` no contiene `"PubDSK"` y `s.esperado` es profundamente igual a `c.esperado`

#### Scenario: Rangos desplazados una posición
- **WHEN** se llama `generarPdf417(PERSONA_BASE, { variante: "sin-pubdsk" })`
- **THEN** `rangos.marcador` es `null`, `rangos.afis` es `[2,10]`, `rangos.nuip` es `[49,59]`, `rangos.primerApellido` es `[59,82]`, `rangos.bloqueDemografico` es `[151,169]` y `rangos.cola` es `[169,531]`

### Requirement: FX-12 Variante fecha-primero
Con variante `"fecha-primero"`, la cabecera y los nombres SHALL ser los de la variante `"completa"`, y el bloque demográfico desde el byte 150 MUST ser `"02"` + `YYYYMMDD` + sexo + departamento (2) + municipio (3) + 1 dígito del PRNG + RH (H08, G04). El payload MUST medir 531 bytes; la cola ocupa el resto.

#### Scenario: Bloque fecha-primero de la persona base
- **WHEN** se llama `generarPdf417(PERSONA_BASE, { variante: "fecha-primero" })`
- **THEN** `bytes[150,166)` es `"0219850314F16001"`, `bytes[166,167)` es un dígito, `bytes[167,169)` es `"O+"`, `rangos.bloqueDemografico` es `[150,169]`, `rangos.cola` es `[169,531]` y `bytes.length` es `531`

#### Scenario: Mismos datos esperados que la trama completa
- **WHEN** se comparan los `esperado` de `generarPdf417(PERSONA_BASE + { rh: "AB-" }, { variante: "fecha-primero" })` y de `generarPdf417(PERSONA_BASE + { rh: "AB-" })`
- **THEN** son profundamente iguales y `esperado.rh` es `"AB-"`

### Requirement: FX-13 Cola biométrica aleatoria no realista
Todo byte posterior al RH SHALL ser cola (H09): bytes uniformes de 0x00 a 0xFF sacados del PRNG, sin estructura de una plantilla biométrica real (sin minucias, sin cabeceras de formatos de huella, sin AFIS ni tarjeta decadactilar). `rangos.cola` MUST terminar en `bytes.length`. La cola MUST depender solo de la semilla y de su longitud, nunca de los datos de la persona.

#### Scenario: Longitud de la cola
- **WHEN** se llama `generarPdf417(PERSONA_BASE)` y `generarPdf417(PERSONA_BASE + { rh: "AB+" })`
- **THEN** las colas miden `363` y `362` bytes respectivamente y ambos payloads miden `531`

#### Scenario: La cola no depende de la persona
- **WHEN** se generan las tramas completas de `PERSONA_BASE` y de `PERSONA_BASE + { primerApellido: "MUESTRA", nuip: "9999000001" }`, ambas con semilla `5`
- **THEN** sus colas son idénticas byte a byte

#### Scenario: Semillas distintas, colas distintas
- **WHEN** se generan las tramas completas de `PERSONA_BASE` con semillas `1` y `2`
- **THEN** las colas difieren en al menos un byte

### Requirement: FX-14 Hipótesis declaradas
Cada fixture SHALL incluir `hipotesis`: los IDs que asume su variante, ordenados alfabéticamente y sin repetidos, según la tabla fija de los escenarios; un fixture PDF417 con RH `AB+` o `AB-` añade además `H05b` (RH de 3 bytes, pedido del verificador del 2026-10-06). Cada ID MUST existir como fila de `docs/decisiones/hipotesis-formato.md`.

#### Scenario: Hipótesis de la trama completa
- **WHEN** se llama `generarPdf417(PERSONA_BASE)`
- **THEN** `hipotesis` es exactamente `["G01","H01","H02","H03","H04","H05","H06","H09","H11"]`

#### Scenario: Hipótesis de la trama Windows truncada
- **WHEN** se llama `generarPdf417(PERSONA_BASE, { variante: "windows-truncada" })`
- **THEN** `hipotesis` es exactamente `["G01","G02","H01","H02","H03","H04","H05","H06","H09","H11"]`

#### Scenario: Hipótesis de la variante sin PubDSK
- **WHEN** se llama `generarPdf417(PERSONA_BASE, { variante: "sin-pubdsk" })`
- **THEN** `hipotesis` es exactamente `["G01","G03","H01","H03","H04","H05","H06","H07","H09","H11"]`

#### Scenario: Hipótesis de la variante fecha-primero
- **WHEN** se llama `generarPdf417(PERSONA_BASE, { variante: "fecha-primero" })`
- **THEN** `hipotesis` es exactamente `["G01","G04","H01","H02","H03","H04","H06","H08","H09"]`

#### Scenario: Hipótesis de la MRZ
- **WHEN** se llama `generarMrzTd1(PERSONA_BASE, { variante: v })` para cada una de las 7 variantes de la MRZ
- **THEN** `hipotesis` es exactamente `["G05","M01","M02","M03"]` en todas

#### Scenario: Todo ID existe en el registro de hipótesis
- **WHEN** se reúnen los IDs de `hipotesis` de todos los casos de `casosPdf417()` y `casosMrz()` y se buscan en `docs/decisiones/hipotesis-formato.md` como celdas `| <ID> |`
- **THEN** todos aparecen

### Requirement: FX-15 Estructura declarada del PDF417
Todo fixture PDF417 SHALL declarar `rangos` y `esperado` (los campos de la persona que un parser correcto debe devolver; NUIP sin ceros a la izquierda, fecha `YYYY-MM-DD`). Los rangos `nuip`, `primerApellido`, `segundoApellido`, `primerNombre`, `segundoNombre`, `bloqueDemografico` y `cola` MUST ser contiguos en ese orden, `rh` MUST terminar donde termina el bloque, `cola` donde termina el payload, y cada rango MUST contener el valor de `esperado` que nombra.

#### Scenario: Esperado de la persona base
- **WHEN** se llama `generarPdf417(PERSONA_BASE)`
- **THEN** `esperado` es exactamente `{ nuip: "9999123456", primerApellido: "PRUEBA", segundoApellido: "EJEMPLO", primerNombre: "FICTICIA", segundoNombre: "LUZ", sexo: "F", fechaNacimiento: "1985-03-14", departamento: "16", municipio: "001", rh: "O+" }`

#### Scenario: Propiedad de estructura sobre todas las variantes
- **WHEN** se ejecutan al menos 1000 casos de `arbFixturePdf417()`
- **THEN** en cada uno: `bytes.length` es 531, 520, 531 o 531 y `rangos.nuip[0]` es 48, 37, 49 o 48 según la variante sea `completa`, `windows-truncada`, `sin-pubdsk` o `fecha-primero`; los rangos de nombre miden 23; cada nombre decodificado de su rango sin los 0x00 finales es igual a `esperado`; `bytes[rangos.nuip]` sin ceros a la izquierda es `esperado.nuip`; `bytes[rangos.rh]` es `esperado.rh`; `bytes[rangos.bloqueDemografico]` contiene `esperado.fechaNacimiento` sin guiones; y los rangos son contiguos como exige el requisito

### Requirement: FX-16 MRZ TD1 válida
Con variante `"valida"`, `generarMrzTd1` SHALL producir tres líneas de 30 caracteres de `[A-Z0-9<]` y `texto` con las tres unidas por `"\n"`. `L1` = `IC` + `COL` + serial + dígito de control + `lugarExpedicion` (M03) + `<` × 10 (M01). `L2` = nacimiento `YYMMDD` + dígito + sexo + vencimiento `YYMMDD` + dígito + `COL` + NUIP (M02) + `<` + dígito compuesto. Exige NUIP de 10 dígitos; si no, `ErrorFixture` `nuip-no-soportado-en-mrz`.

#### Scenario: MRZ de la persona base
- **WHEN** se llama `generarMrzTd1(PERSONA_BASE)`
- **THEN** `lineas` es `["ICCOL999912345516001<<<<<<<<<<", "8503149F3503144COL9999123456<5", "PRUEBA<EJEMPLO<<FICTICIA<LUZ<<"]`, `lineasSinErrores` es igual a `lineas`, `inyecciones` es `[]` y `texto` es `lineas.join("\n")`

#### Scenario: Esperado de la MRZ base
- **WHEN** se llama `generarMrzTd1(PERSONA_BASE)`
- **THEN** `esperado` es exactamente `{ serialDocumento: "999912345", lugarExpedicion: "16001", fechaNacimiento: "1985-03-14", sexo: "F", fechaVencimiento: "2035-03-14", nacionalidad: "COL", nuip: "9999123456", primerApellido: "PRUEBA", segundoApellido: "EJEMPLO", primerNombre: "FICTICIA", segundoNombre: "LUZ", digitosControl: { documento: "valido", nacimiento: "valido", vencimiento: "valido", compuesto: "valido" } }`

#### Scenario: NUIP corto en la MRZ
- **WHEN** se llama `generarMrzTd1(PERSONA_BASE + { nuip: "99991234" })`
- **THEN** lanza `ErrorFixture` con `codigo` `"nuip-no-soportado-en-mrz"` y `campo` `"nuip"`

### Requirement: FX-17 Dígitos de control ICAO 9303
Los dígitos de control SHALL calcularse según ICAO 9303: pesos 7, 3, 1 repetidos desde el primer carácter; `0` a `9` valen su dígito, `A` a `Z` valen 10 a 35 y `<` vale 0; el dígito es la suma módulo 10. El compuesto MUST cubrir, concatenados, `L1[5,30)`, `L2[0,7)`, `L2[8,15)` y `L2[18,29)`. Las pruebas MUST verificarlo con oráculos independientes del generador.

#### Scenario: Oráculo con el espécimen público de ICAO 9303
- **WHEN** la prueba aplica su oráculo a los campos del espécimen TD1 de ICAO 9303 parte 5 (`I<UTOD231458907<<<<<<<<<<<<<<<`, `7408122F1204159UTO<<<<<<<<<<<6`)
- **THEN** obtiene `7` para `D23145890`, `2` para `740812`, `9` para `120415` y `6` para el compuesto, igual que lo impreso en el espécimen

#### Scenario: Valores literales de la persona base
- **WHEN** se llama `generarMrzTd1(PERSONA_BASE)`
- **THEN** `L1[14]` es `"5"` (de `999912345`), `L2[6]` es `"9"` (de `850314`), `L2[14]` es `"4"` (de `350314`) y `L2[29]` es `"5"`

#### Scenario: Oráculo diferencial
- **WHEN** se ejecutan al menos 1000 casos de `arbFixtureMrz({ variantes: ["valida"] })` y se analiza cada `lineas` con el paquete `mrz` 5.0.2
- **THEN** en cada caso el análisis reporta válidos los dígitos de control del número de documento, de la fecha de nacimiento, de la fecha de vencimiento y el compuesto

### Requirement: FX-18 Línea 3 de la MRZ
`L3` SHALL ser `primerApellido` + `<` + `segundoApellido` + `<<` + `primerNombre` + (`<` + `segundoNombre` si no es vacío), con cada espacio interno como `<`, la Ñ transliterada a `N` y relleno con `<` hasta 30 (G05). Si supera 30 caracteres MUST lanzar `ErrorFixture` `nombre-excede-mrz`, sin truncar. `esperado` MUST llevar los nombres transliterados.

#### Scenario: Ñ transliterada
- **WHEN** se llama `generarMrzTd1(PERSONA_BASE + { primerApellido: "PEÑA", segundoApellido: "NUÑEZ" })`
- **THEN** `lineas[2]` es `"PENA<NUNEZ<<FICTICIA<LUZ<<<<<<"`, `esperado.primerApellido` es `"PENA"` y `esperado.segundoApellido` es `"NUNEZ"`

#### Scenario: Apellido compuesto sin segundo nombre
- **WHEN** se llama `generarMrzTd1(PERSONA_BASE + { primerApellido: "DE LA OSSA", segundoNombre: "" })`
- **THEN** `lineas[2]` es `"DE<LA<OSSA<EJEMPLO<<FICTICIA<<"`, `esperado.primerApellido` es `"DE LA OSSA"` y `lineas[0]` y `lineas[1]` son iguales a las de la persona base

#### Scenario: Nombre que no cabe
- **WHEN** se llama `generarMrzTd1(PERSONA_BASE + { primerApellido: "DE LA OSSA" })` (`L3` de 32 caracteres)
- **THEN** lanza `ErrorFixture` con `codigo` `"nombre-excede-mrz"`

### Requirement: FX-19 Dígitos de control alterados
Las variantes `cd-documento-alterado`, `cd-nacimiento-alterado`, `cd-vencimiento-alterado` y `cd-compuesto-alterado` SHALL sustituir `L1[14]`, `L2[6]`, `L2[14]` o `L2[29]` por (correcto + 1) módulo 10 y, salvo la última, recalcular el compuesto: exactamente un dígito queda inválido. `cd-documento-relleno` SHALL poner `<` en `L1[14]` (M01). `esperado.digitosControl` MUST marcar cada dígito `valido`, `invalido` o `relleno`.

#### Scenario: Documento alterado
- **WHEN** se llama `generarMrzTd1(PERSONA_BASE, { variante: "cd-documento-alterado" })`
- **THEN** `lineas[0]` es `"ICCOL999912345616001<<<<<<<<<<"`, `lineas[1]` es `"8503149F3503144COL9999123456<2"` y `esperado.digitosControl` es `{ documento: "invalido", nacimiento: "valido", vencimiento: "valido", compuesto: "valido" }`

#### Scenario: Nacimiento alterado
- **WHEN** se llama `generarMrzTd1(PERSONA_BASE, { variante: "cd-nacimiento-alterado" })`
- **THEN** `lineas[1]` es `"8503140F3503144COL9999123456<8"` y `esperado.digitosControl` es `{ documento: "valido", nacimiento: "invalido", vencimiento: "valido", compuesto: "valido" }`

#### Scenario: Vencimiento alterado
- **WHEN** se llama `generarMrzTd1(PERSONA_BASE, { variante: "cd-vencimiento-alterado" })`
- **THEN** `lineas[1]` es `"8503149F3503145COL9999123456<6"` y `esperado.digitosControl` es `{ documento: "valido", nacimiento: "valido", vencimiento: "invalido", compuesto: "valido" }`

#### Scenario: Compuesto alterado
- **WHEN** se llama `generarMrzTd1(PERSONA_BASE, { variante: "cd-compuesto-alterado" })`
- **THEN** `lineas[0]` es `"ICCOL999912345516001<<<<<<<<<<"`, `lineas[1]` es `"8503149F3503144COL9999123456<6"` y `esperado.digitosControl` es `{ documento: "valido", nacimiento: "valido", vencimiento: "valido", compuesto: "invalido" }`

#### Scenario: Dígito del documento como relleno
- **WHEN** se llama `generarMrzTd1(PERSONA_BASE, { variante: "cd-documento-relleno" })`
- **THEN** `lineas[0]` es `"ICCOL999912345<16001<<<<<<<<<<"`, `lineas[1]` es `"8503149F3503144COL9999123456<0"` y `esperado.digitosControl` es `{ documento: "relleno", nacimiento: "valido", vencimiento: "valido", compuesto: "valido" }`

#### Scenario: Exactamente un dígito inválido en toda persona
- **WHEN** se ejecutan al menos 1000 casos de `arbFixtureMrz` con las cuatro variantes `cd-*-alterado` y se comprueban los cuatro dígitos con el oráculo diferencial de FX-17
- **THEN** en cada caso exactamente un dígito es inválido y es el que nombra la variante

### Requirement: FX-20 Errores OCR-B inyectados
La variante `ocr-b` SHALL partir de la MRZ válida (`lineasSinErrores`) y sustituir dígitos de las zonas numéricas `L1[5,20)`, `L2[0,7)`, `L2[8,15)`, `L2[18,28)` y `L2[29,30)` por su confusión OCR-B: `0`->`O` o `Q`, `1`->`I`, `2`->`Z`, `5`->`S`, `6`->`G`, `8`->`B`. MUST NOT tocar ninguna otra posición. `inyecciones` MUST listar `{ linea, posicion, original, inyectado }` en orden de aplicación; `esperado` es el de la MRZ válida.

#### Scenario: Posición explícita
- **WHEN** se llama `generarMrzTd1(PERSONA_BASE, { variante: "ocr-b", posicionesOcr: [{ linea: 2, posicion: 0 }] })`
- **THEN** `lineas[1]` es `"B503149F3503144COL9999123456<5"`, `lineasSinErrores[1]` es `"8503149F3503144COL9999123456<5"` e `inyecciones` es `[{ linea: 2, posicion: 0, original: "8", inyectado: "B" }]`

#### Scenario: Posición elegida con la semilla
- **WHEN** se llama `generarMrzTd1(PERSONA_BASE, { variante: "ocr-b", semilla: 1, erroresOcr: 1 })`
- **THEN** `inyecciones` es `[{ linea: 2, posicion: 9, original: "5", inyectado: "S" }]` y `lineas[1]` es `"8503149F3S03144COL9999123456<5"`

#### Scenario: Propiedad de reversibilidad
- **WHEN** se ejecutan al menos 1000 casos de `arbFixtureMrz({ variantes: ["ocr-b"] })`
- **THEN** en cada caso `inyecciones` tiene de 1 a 5 elementos sin posiciones repetidas; cada una está en una zona numérica con un par (`original`, `inyectado`) de la tabla; deshacerlas sobre `lineas` da exactamente `lineasSinErrores`; `lineas` y `lineasSinErrores` difieren solo en esas posiciones; y `lineas[2]` es igual a `lineasSinErrores[2]`

### Requirement: FX-21 Opciones de inyección OCR-B
`erroresOcr` (entero de 1 a 5, por omisión 1) SHALL elegir las posiciones con el PRNG (design.md, decisión 7); `posicionesOcr` (lista de `{ linea, posicion, caracter? }`) SHALL fijarlas, con `caracter` por omisión igual a la primera confusión del dígito. MUST lanzar `ErrorFixture` `opcion-ocr-invalida` si se dan ambas, si se usan fuera de `ocr-b`, si `erroresOcr` está fuera de rango o si una posición no es numérica, no tiene confusión, se repite o su `caracter` no es confusión del dígito.

#### Scenario: Posiciones no admitidas
- **WHEN** se llama `generarMrzTd1(PERSONA_BASE, { variante: "ocr-b", posicionesOcr: [p] })` con `p` igual a `{ linea: 2, posicion: 7 }` (sexo), `{ linea: 2, posicion: 18 }` (dígito `9`, sin confusión), `{ linea: 3, posicion: 0 }` y `{ linea: 2, posicion: 0, caracter: "S" }`
- **THEN** las cuatro llamadas lanzan `ErrorFixture` con `codigo` `"opcion-ocr-invalida"`

#### Scenario: Posición repetida
- **WHEN** se llama `generarMrzTd1(PERSONA_BASE, { variante: "ocr-b", posicionesOcr: [{ linea: 2, posicion: 0 }, { linea: 2, posicion: 0 }] })`
- **THEN** lanza `ErrorFixture` con `codigo` `"opcion-ocr-invalida"`

#### Scenario: Combinaciones y rangos no admitidos
- **WHEN** se llama `generarMrzTd1(PERSONA_BASE, o)` con `o` igual a `{ variante: "valida", erroresOcr: 2 }`, `{ variante: "ocr-b", erroresOcr: 0 }`, `{ variante: "ocr-b", erroresOcr: 6 }` y `{ variante: "ocr-b", erroresOcr: 1, posicionesOcr: [{ linea: 2, posicion: 0 }] }`
- **THEN** las cuatro llamadas lanzan `ErrorFixture` con `codigo` `"opcion-ocr-invalida"`

#### Scenario: Cero con carácter explícito
- **WHEN** se llama `generarMrzTd1(PERSONA_BASE, { variante: "ocr-b", posicionesOcr: [{ linea: 2, posicion: 2, caracter: "Q" }] })`
- **THEN** `lineas[1]` es `"85Q3149F3503144COL9999123456<5"` e `inyecciones` es `[{ linea: 2, posicion: 2, original: "0", inyectado: "Q" }]`

### Requirement: FX-22 Catálogo de casos con nombre
`casosPdf417()` y `casosMrz()` SHALL devolver listas de `{ id, descripcion, fixture }` generadas con semilla `1`, con IDs únicos, en el orden y con las personas y variantes de los escenarios. Cada `fixture` MUST ser profundamente igual a llamar al generador con esos argumentos.

#### Scenario: Definición del catálogo PDF417
- **WHEN** se llama `casosPdf417()`
- **THEN** los IDs, en orden, y sus argumentos son: `completa-base`, `windows-truncada-base`, `sin-pubdsk-base`, `fecha-primero-base` (`PERSONA_BASE` en la variante del nombre); y en variante `completa`: `sin-segundo-nombre` (`segundoNombre: ""`), `apellido-compuesto` (`primerApellido: "DE LA OSSA"`), `enie` (`primerApellido: "PEÑA"`, `segundoApellido: "NUÑEZ"`), `rh-ab-positivo` (`rh: "AB+"`), `rh-ab-negativo` (`rh: "AB-"`), `rh-o-negativo` (`rh: "O-"`), `sexo-f-apellido-con-m` (`primerApellido: "MARTINEZ"`, `sexo: "F"`), `nuip-corto` (`nuip: "99991234"`)

#### Scenario: Definición del catálogo MRZ
- **WHEN** se llama `casosMrz()`
- **THEN** los IDs, en orden, y sus argumentos son: `valida-base`, `cd-documento-alterado`, `cd-nacimiento-alterado`, `cd-vencimiento-alterado`, `cd-compuesto-alterado`, `cd-documento-relleno` (`PERSONA_BASE` en la variante del nombre, `valida` para `valida-base`); `ocr-b-un-error` (`ocr-b`, `erroresOcr: 1`); `ocr-b-cinco-errores` (`ocr-b`, `erroresOcr: 5`); y en variante `valida`: `enie` (`primerApellido: "PEÑA"`, `segundoApellido: "NUÑEZ"`), `apellido-compuesto` (`primerApellido: "DE LA OSSA"`, `segundoNombre: ""`), `sin-segundo-nombre` (`segundoNombre: ""`)

#### Scenario: El catálogo equivale a llamar al generador
- **WHEN** se compara el `fixture` del caso `rh-ab-negativo` con `generarPdf417(PERSONA_BASE + { rh: "AB-" }, { variante: "completa", semilla: 1 })`
- **THEN** son profundamente iguales

#### Scenario: Errores de repos antiguos cubiertos
- **WHEN** se examina `casosPdf417()`
- **THEN** hay al menos un caso con `esperado.rh` `"AB+"`, uno con `"AB-"`, uno con `"O-"`, uno con Ñ en un apellido, uno con `segundoNombre` `""`, uno con espacio en `primerApellido`, uno con `sexo` `"F"` y `M` en `primerApellido`, uno con apellidos distintos, y la misma persona en `completa` y en `windows-truncada`

### Requirement: FX-23 Arbitrarios válidos por construcción
El paquete SHALL exportar `arbPersonaFicticia`, `arbFixturePdf417` y `arbFixtureMrz`, válidos por construcción: no lanzan ni producen personas que el generador rechace. Los nombres MUST salir de las listas fijas del escenario de nombres. `arbFixtureMrz` MUST producir solo personas con NUIP de 10 dígitos y `L3` de 30 caracteres o menos. Opciones: `nuipCorto` (NUIP de 5 a 10 dígitos; persona y PDF417) y `variantes` (subconjunto no vacío; por omisión todas).

#### Scenario: Personas siempre aceptadas
- **WHEN** se ejecutan al menos 1000 casos de `arbPersonaFicticia()` y se pasa cada persona a `generarPdf417` y a `generarMrzTd1`
- **THEN** `generarPdf417` nunca lanza y `generarMrzTd1` solo lanza `ErrorFixture` con `codigo` `"nombre-excede-mrz"`

#### Scenario: Nombres claramente ficticios
- **WHEN** se ejecutan al menos 1000 casos de `arbPersonaFicticia({ nuipCorto: true })`
- **THEN** cada `primerNombre` es uno de `FICTICIA`, `FICTICIO`, `SINTETICA`, `SINTETICO`, `PRUEBA`, `MUESTRA`, `EJEMPLO`; cada apellido es uno de `PRUEBA`, `EJEMPLO`, `MUESTRA`, `FICTICIO`, `SINTETICO`, `PEÑA`, `NUÑEZ`, `MUÑOZ`, `MARTINEZ`, `DE LA OSSA`; cada `segundoNombre` es uno de `""`, `LUZ`, `ANA`, `JOSE`, `MARIA`, `DEL CARMEN`; y cada `nuip` cumple `^9999[0-9]{1,6}$`

#### Scenario: Fixtures MRZ siempre generables
- **WHEN** se ejecutan al menos 1000 casos de `arbFixtureMrz()`
- **THEN** ninguno lanza, todo `esperado.nuip` tiene 10 dígitos y toda `lineas[2]` mide 30

#### Scenario: Filtro de variantes
- **WHEN** se ejecutan al menos 1000 casos de `arbFixturePdf417({ variantes: ["sin-pubdsk"] })`
- **THEN** todos tienen `variante` `"sin-pubdsk"`

#### Scenario: Variantes vacías o desconocidas rechazadas
- **WHEN** se llama `arbFixtureMrz({ variantes: [] })` y `arbFixturePdf417({ variantes: ["otra"] })`
- **THEN** ambas lanzan `ErrorFixture` con `codigo` `"variante-invalida"`

### Requirement: FX-24 Proporciones mínimas de los arbitrarios
Para que ninguna propiedad que los use sea vacía, los arbitrarios SHALL cumplir, en 1000 casos medidos con contadores (no con `fc.statistics`), las proporciones mínimas de los escenarios.

#### Scenario: Proporciones del PDF417
- **WHEN** se ejecutan 1000 casos de `arbFixturePdf417()`
- **THEN** cada variante aparece en al menos un 15 %, el RH negativo en al menos un 30 %, el RH `AB+` o `AB-` en al menos un 15 %, `segundoNombre` vacío en al menos un 8 %, Ñ en algún nombre en al menos un 25 %, espacio en algún nombre en al menos un 8 % y sexo `F` con `M` en `primerApellido` en al menos un 8 %

#### Scenario: Proporción de NUIP cortos
- **WHEN** se ejecutan 1000 casos de `arbFixturePdf417({ nuipCorto: true })`
- **THEN** al menos un 50 % tiene `esperado.nuip` de menos de 10 dígitos

#### Scenario: Proporciones de la MRZ
- **WHEN** se ejecutan 1000 casos de `arbFixtureMrz()`
- **THEN** cada una de las 7 variantes aparece en al menos un 8 %, `segundoNombre` no vacío en al menos un 20 %, Ñ en algún apellido de la persona en al menos un 15 % y espacio en `primerApellido` en al menos un 5 %
