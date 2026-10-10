# pdf417-cedula-amarilla Specification

## Purpose
Interpretar de forma determinista, pura y sin E/S los bytes crudos (ISO-8859-1) del PDF417 de la cédula de ciudadanía amarilla y devolver campos normalizados con confianza, validaciones e hipótesis aplicadas, descartando siempre la biometría y los datos de control (AFIS, tarjeta decadactilar).

Convenciones de los escenarios (todas las personas y tramas son sintéticas; los NUIP empiezan por `9999` tras quitar ceros). Las hipótesis `Hxx` son las de `docs/decisiones/hipotesis-formato.md`; `H15` es la hipótesis propuesta en `design.md` de este cambio. Estados según la tabla "Actualización de estados (2026-10-06, evidencia pública)" de ese archivo: H01, H03, H04, H05, H06, H09 y H11 están confirmadas; H02 está confirmada solo para el byte 24 de la trama completa; H07, H08 y H15 siguen pendientes.

Personas de referencia (campos de nombre en ISO-8859-1, un byte por carácter; `-` es campo vacío):

| ID | Campo NUIP | Apellido 1 | Apellido 2 | Nombre 1 | Nombre 2 | Sexo | Fecha | Depto | Mpio | RH |
|---|---|---|---|---|---|---|---|---|---|---|
| P1 | `9999123456` | `PEREZ` | `GOMEZ` | `JUAN` | `CARLOS` | M | `20000229` | `16` | `001` | `O+` |
| P2 | `9999000001` | `PEÑA` | `NUÑEZ` | `JOSÉ` | `ÁNGEL` | M | `19851231` | `01` | `001` | `AB-` |
| P3 | `9999000002` | `MARTINEZ` | `MEJIA` | `MARIA` | - | F | `19700101` | `31` | `019` | `AB+` |
| P4 | `9999000003` | `DE LA OSSA` | `DEL CASTILLO` | `ANA` | `LUCIA` | F | `19990715` | `88` | `001` | `O-` |
| P5 | `9999000004` | `ÑUSTES` | `ROJAS` | `LUIS` | - | M | `20040310` | `00` | `000` | `B-` |
| P6 | `0099990005` | `GOMEZ` | `PEREZ` | `PEDRO` | - | M | `19500601` | `16` | `001` | `A-` |
| P7 | `9999000006` | `SMITH` | - | `JOHN` | `PAUL` | M | `19800505` | `16` | `001` | `B+` |
| P8 | `9999000007` | `PEREZ` | `ABCDEFGHIJKLMNOPQRSTUVW` | `JUAN` | `CARLOS` | M | `20000229` | `16` | `001` | `A+` |

Trama completa de referencia `C(p)`, 531 bytes, rangos semiabiertos (disposición de H04 y de la evidencia pública de `docs/decisiones/2026-10-06-evidencia-hipotesis-formato.md`, que corrige G01 en `[32,48)`): `[0,2)` `01`; `[2,10)` AFIS `99998888`; `[10,24)` 14 bytes 0x00; `[24,32)` marcador `PubDSK_1`; `[32,40)` 8 bytes 0x00; `[40,48)` tarjeta decadactilar `99997777` (campo numérico de 8 bytes); `[48,58)` campo NUIP; `[58,81)`, `[81,104)`, `[104,127)` y `[127,150)` apellido 1, apellido 2, nombre 1 y nombre 2, cada uno seguido de relleno 0x00 hasta llenar su rango; desde 150 el bloque demográfico sexo primero `0` + sexo + fecha + depto + mpio + `0` + RH; el resto hasta 531 es la cola, con el byte de posición absoluta `i` igual a `(i * 73 + 41) mod 256`.

Variantes, iguales a las del generador (G02, G03): `W(p)` (truncada, Windows) es `C(p)` sin los bytes `[13,24)` (marcador en el byte 13, 520 bytes); `S(p)` (sin `PubDSK`) es `C(p)[0,24)` seguido de 9 bytes 0x00 y de `C(p)[32,530)` (531 bytes: todo campo desde el byte 32 se desplaza +1, como G03 corregida en el generador; se recorta el último byte de la cola). El sufijo `F` (`C_F(p)`, `W_F(p)`, `S_F(p)`) cambia el bloque por el de fecha primero: `02` + fecha + sexo + depto + mpio + `0` + RH. "Cola" es todo byte posterior al signo del RH.

## Requirements

### Requirement: PA-01 Entrada admitida
El parser SHALL recibir `bytes` y `opciones` opcionales. `bytes` MUST ser una instancia de `Uint8Array` (incluidas sus subclases y vistas con desplazamiento); si no lo es, MUST devolver el error `entrada-no-bytes`. Si su longitud es 0 MUST devolver `entrada-vacia` y si supera 2048 bytes MUST devolver `entrada-demasiado-larga`, en ambos casos sin examinar el contenido.

#### Scenario: Valores que no son bytes
- **WHEN** se parsean `"0M2000"`, `[48, 49]`, `new ArrayBuffer(531)`, `new Uint16Array(531)`, `null` y `undefined`
- **THEN** los seis resultados son exactamente `{ "ok": false, "error": "entrada-no-bytes" }`

#### Scenario: Entrada vacía
- **WHEN** se parsea `new Uint8Array(0)`
- **THEN** el resultado es exactamente `{ "ok": false, "error": "entrada-vacia" }`

#### Scenario: Límite de longitud
- **WHEN** se parsean `C(P1)` extendida con la fórmula de la cola hasta exactamente 2048 bytes y la misma extendida hasta 2049 bytes
- **THEN** el primer resultado tiene `ok` `true` y `campos` iguales a los de `C(P1)`, y el segundo es exactamente `{ "ok": false, "error": "entrada-demasiado-larga" }`

#### Scenario: Vista con desplazamiento y Buffer
- **WHEN** se parsean `buf.subarray(7, 538)`, donde `buf` es 7 bytes 0xFF seguidos de `C(P1)` y de 5 bytes 0xFF, y `Buffer.from(C(P1))`
- **THEN** ambos resultados son profundamente iguales al resultado de parsear `C(P1)`

### Requirement: PA-02 Forma del resultado de éxito
Un resultado de éxito SHALL contener exactamente `ok` (`true`), `version` (`"cc-amarilla"`), `fuente` (`["pdf417"]`), `trama` (`variante`, `modo`, `bloqueDemografico`), `campos`, `confianza`, `validaciones` y `warnings`. `campos` MUST tener exactamente las diez claves del escenario y `confianza` las mismas diez claves con valores numéricos. Todo valor MUST ser texto, número, booleano, `null`, array u objeto plano.

#### Scenario: Resultado completo de la trama completa de referencia
- **WHEN** se parsea `C(P1)` sin opciones
- **THEN** el resultado es exactamente `{ "ok": true, "version": "cc-amarilla", "fuente": ["pdf417"], "trama": { "variante": "completa", "modo": "offsets", "bloqueDemografico": "sexo-primero" }, "campos": { "numeroDocumento": "9999123456", "primerApellido": "PEREZ", "segundoApellido": "GOMEZ", "primerNombre": "JUAN", "segundoNombre": "CARLOS", "sexo": "M", "fechaNacimiento": "2000-02-29", "rh": "O+", "codigoDepartamentoNacimiento": "16", "codigoMunicipioNacimiento": "001" }, "confianza": { "numeroDocumento": 1, "primerApellido": 1, "segundoApellido": 1, "primerNombre": 1, "segundoNombre": 1, "sexo": 1, "fechaNacimiento": 1, "rh": 1, "codigoDepartamentoNacimiento": 1, "codigoMunicipioNacimiento": 1 }, "validaciones": [ { "id": "formato-nuip", "estado": "ok", "campos": ["numeroDocumento"], "detalle": "nuip" }, { "id": "consistencia-modos", "estado": "ok", "campos": [], "detalle": null }, { "id": "divipol-codigos", "estado": "ok", "campos": ["codigoDepartamentoNacimiento", "codigoMunicipioNacimiento"], "detalle": null }, { "id": "divipol-existe", "estado": "no-aplica", "campos": ["codigoDepartamentoNacimiento", "codigoMunicipioNacimiento"], "detalle": "sin-resolutor" } ], "warnings": [] }`

#### Scenario: Solo datos planos
- **WHEN** se parsea `C(P2)`
- **THEN** `JSON.parse(JSON.stringify(resultado))` es profundamente igual a `resultado` y ningún valor del resultado es `Uint8Array`, `ArrayBuffer` ni función

### Requirement: PA-03 Resultado de error y prioridad de motivos
Un error SHALL ser exactamente `{ "ok": false, "error": <motivo> }`. Los motivos de entrada MUST respetar este orden de prioridad: `entrada-no-bytes`, `opciones-invalidas`, `entrada-vacia`, `entrada-demasiado-larga`. Los motivos de interpretación (`nuip-no-encontrado`, `nuip-invalido`, `caracteres-invalidos-en-nombre`, `nombres-no-reconocidos`, `bloque-demografico-no-encontrado`, `fecha-nacimiento-invalida`) MUST corresponder a la primera etapa que falla al leer la trama en orden.

#### Scenario: Prioridad de los motivos de entrada
- **WHEN** se parsean, en orden, `("x", 5)`, `(new Uint8Array(0), 5)`, `(new Uint8Array(0))` y `(new Uint8Array(2049))`
- **THEN** los resultados son, en orden, exactamente `{ "ok": false, "error": "entrada-no-bytes" }`, `{ "ok": false, "error": "opciones-invalidas" }`, `{ "ok": false, "error": "entrada-vacia" }` y `{ "ok": false, "error": "entrada-demasiado-larga" }`

#### Scenario: Un ejemplo por cada motivo de interpretación
- **WHEN** se parsean `new Uint8Array(531)` (todo 0x00); `C(P1)` con `[48,58)` igual a `0000000000`; `C(P1)` con el byte 61 igual a 0x2E (`PER.Z`); `C(P1)` con `[81,150)` todo 0x00; `C(P1)` con el byte 151 igual a 0x58 (`X`); y `C(P1)` con la fecha `20000230`
- **THEN** los errores son, en orden, `nuip-no-encontrado`, `nuip-invalido`, `caracteres-invalidos-en-nombre`, `nombres-no-reconocidos`, `bloque-demografico-no-encontrado` y `fecha-nacimiento-invalida`, y cada resultado tiene exactamente las claves `ok` y `error`

### Requirement: PA-04 Función pura y total
El parser MUST ser puro: sin E/S, sin estado compartido, sin depender de la hora, del entorno ni de la configuración regional. MUST devolver un resultado con la forma de PA-02 o PA-03, sin lanzar, para cualquier valor de JavaScript en `bytes` y en `opciones`, salvo objetos cuyos accesores o proxies lancen al leerse. MUST NOT modificar los bytes de entrada. Dos llamadas iguales MUST dar resultados profundamente iguales.

#### Scenario: Nunca lanza con bytes arbitrarios
- **WHEN** se parsea cualquier valor de `fc.uint8Array({ maxLength: 2048 })` (al menos 1000 casos)
- **THEN** ninguna llamada lanza y cada resultado cumple la forma de PA-02 o la de PA-03

#### Scenario: Nunca lanza con valores arbitrarios
- **WHEN** se parsea cualquier valor de `fc.anything()` como `bytes` y, aparte, `C(P1)` con cualquier valor de `fc.anything()` como `opciones` (al menos 1000 casos cada uno)
- **THEN** ninguna llamada lanza; con `bytes` que no son `Uint8Array` el resultado es exactamente `{ "ok": false, "error": "entrada-no-bytes" }`; con `C(P1)` el resultado es éxito con los `campos` de PA-02 o exactamente `{ "ok": false, "error": "opciones-invalidas" }`

#### Scenario: Entradas largas
- **WHEN** se parsea cualquier valor de `fc.uint8Array({ minLength: 2049, maxLength: 4096 })` (al menos 1000 casos)
- **THEN** todos los resultados son exactamente `{ "ok": false, "error": "entrada-demasiado-larga" }`

#### Scenario: Determinismo y entrada intacta
- **WHEN** se parsea dos veces la misma copia de `W(P2)` y se compara la copia con un duplicado tomado antes de la primera llamada
- **THEN** ambos resultados son profundamente iguales y los bytes de la copia no cambiaron

### Requirement: PA-05 Decodificación ISO-8859-1
El parser SHALL convertir cada byte de un campo de nombre en el carácter Unicode de igual valor (ISO-8859-1), sin la tabla windows-1252 ni UTF-8. Son letras de nombre los bytes 0x41-0x5A, 0x61-0x7A, 0xC0-0xD6, 0xD8-0xF6 y 0xF8-0xFF. Un campo de nombre con cualquier otro byte, salvo 0x20 y el 0x00 de separación o relleno, MUST dar `caracteres-invalidos-en-nombre`.

#### Scenario: Ñ y vocales acentuadas en la trama completa
- **WHEN** se parsea `C(P2)` (Ñ es el byte 0xD1, É 0xC9, Á 0xC1)
- **THEN** `campos.primerApellido` es `"PEÑA"`, `segundoApellido` es `"NUÑEZ"`, `primerNombre` es `"JOSÉ"`, `segundoNombre` es `"ÁNGEL"` y ningún valor de `campos` contiene `"�"`

#### Scenario: Ñ como primera letra del primer apellido
- **WHEN** se parsean `C(P5)` y `W(P5)`
- **THEN** en ambos `campos.primerApellido` es `"ÑUSTES"` y `campos.numeroDocumento` es `"9999000004"`

#### Scenario: Nombre codificado en UTF-8 se rechaza
- **WHEN** se parsea `C(P2)` con el primer apellido escrito en UTF-8 (`50 45 C3 91 41`, seguido de relleno 0x00) y `W(P2)` con el mismo cambio
- **THEN** ambos resultados son exactamente `{ "ok": false, "error": "caracteres-invalidos-en-nombre" }`

#### Scenario: Bytes de control C1 no se convierten en texto
- **WHEN** se parsea `C(P1)` con el byte 128 (la `A` de `CARLOS`) igual a 0x80
- **THEN** el resultado es exactamente `{ "ok": false, "error": "caracteres-invalidos-en-nombre" }` y no un nombre con `"€"` ni con un espacio

### Requirement: PA-06 Clasificación de la trama
El parser SHALL buscar el marcador `PubDSK_1` solo en los primeros 64 bytes. `trama.variante` MUST ser `"completa"` si el marcador empieza en el byte 24 y los bytes `[10,24)` contienen al menos 5 bytes 0x00 consecutivos (H02); `"truncada"` si el marcador aparece en otra posición o sin ese run de 0x00; y `"sin-pubdsk"` si no aparece (H07).

#### Scenario: Las tres variantes de referencia
- **WHEN** se parsean `C(P1)`, `W(P1)` y `S(P1)`
- **THEN** `trama.variante` es, en orden, `"completa"`, `"truncada"` y `"sin-pubdsk"`

#### Scenario: Marcador en el byte 24 sin run de NUL
- **WHEN** se parsea `C(P1)` con `[10,20)` igual a `0000000000` (dígitos ASCII), de modo que `[10,24)` solo tiene 4 bytes 0x00 seguidos
- **THEN** `trama.variante` es `"truncada"` y `trama.modo` es `"patrones"`

#### Scenario: Marcador en la cola se ignora
- **WHEN** se parsea `S(P1)` con los bytes `[200,208)` sustituidos por `PubDSK_1`
- **THEN** el resultado es profundamente igual al de `S(P1)` y `trama.variante` es `"sin-pubdsk"`

### Requirement: PA-07 Modo offsets en la trama completa
Si la variante es `"completa"`, el parser SHALL leer primero por offsets (H04, H05, G01): NUIP en `[48,58)`, nombres en `[58,81)`, `[81,104)`, `[104,127)` y `[127,150)` y bloque sexo primero desde el byte 150. Un campo de nombre es su texto antes del primer 0x00, con solo 0x00 después. Si cualquier lectura o validación de offsets falla, MUST usar el modo patrones (PA-08) para todos los campos.

#### Scenario: Lectura por offsets
- **WHEN** se parsea `C(P4)`
- **THEN** `trama.modo` es `"offsets"`, `campos.primerApellido` es `"DE LA OSSA"` y `campos.segundoApellido` es `"DEL CASTILLO"`

#### Scenario: Campo de nombre lleno sin relleno
- **WHEN** se parsea `C(P8)` (segundo apellido de 23 bytes que ocupa todo su rango)
- **THEN** `trama.modo` es `"offsets"`, `campos.segundoApellido` es `"ABCDEFGHIJKLMNOPQRSTUVW"`, `campos.primerNombre` es `"JUAN"` y `campos.segundoNombre` es `"CARLOS"`

#### Scenario: Bloque desplazado activa el respaldo
- **WHEN** se parsea `C(P1)` con un byte 0x00 insertado en la posición 150 (532 bytes)
- **THEN** `trama` es `{ "variante": "completa", "modo": "patrones", "bloqueDemografico": "sexo-primero" }` y `campos` es igual al de `C(P1)`

#### Scenario: Relleno con espacios activa el respaldo
- **WHEN** se parsea `C(P1)` con todo el relleno de los cuatro campos de nombre en 0x20 en lugar de 0x00
- **THEN** `trama.modo` es `"patrones"` y `campos` es igual al de `C(P1)`

### Requirement: PA-08 Modo patrones
En modo patrones el parser SHALL normalizar byte a byte (1:1): letras de PA-05, dígitos, `+`, `-`, `_` y 0x20 se conservan y cualquier otro byte pasa a 0x20. Un run de 2 o más 0x20 es frontera de campo; un 0x20 aislado se conserva dentro del campo. Este modo MUST aplicarse a las variantes `"truncada"` y `"sin-pubdsk"` y como respaldo de PA-07.

#### Scenario: Trama truncada igual que la completa
- **WHEN** se parsean `C(P1)` y `W(P1)`
- **THEN** los `campos` de ambos resultados son profundamente iguales, y `W(P1)` tiene `trama` `{ "variante": "truncada", "modo": "patrones", "bloqueDemografico": "sexo-primero" }`

#### Scenario: Apellidos compuestos en modo patrones
- **WHEN** se parsea `W(P4)`
- **THEN** `campos.primerApellido` es `"DE LA OSSA"`, `campos.segundoApellido` es `"DEL CASTILLO"`, `campos.primerNombre` es `"ANA"` y `campos.segundoNombre` es `"LUCIA"`

#### Scenario: Trama sin PubDSK
- **WHEN** se parsea `S(P1)`
- **THEN** `trama` es `{ "variante": "sin-pubdsk", "modo": "patrones", "bloqueDemografico": "sexo-primero" }` y `campos` es igual al de `C(P1)`

#### Scenario: Trama sin ningún NUL da error y no nombres partidos (H14)
- **WHEN** se parsea `C(P1)` sin ninguno de los bytes 0x00 de `[0,168)` (los nombres quedan concatenados: `PEREZGOMEZJUANCARLOS` seguido del bloque sin separador; la cola se conserva)
- **THEN** el resultado es exactamente `{ "ok": false, "error": "caracteres-invalidos-en-nombre" }`

### Requirement: PA-09 Número de documento
El número SHALL tomarse de los 10 dígitos inmediatamente anteriores a la primera letra del primer apellido (H03): en modo patrones, los 10 últimos del primer run de 10 o más dígitos ASCII seguido sin separación por una letra de PA-05 que no sea el inicio del marcador `PubDSK_1`; los dígitos previos (tarjeta decadactilar) se descartan. MUST validarse con `formato-nuip` (cédula): si es válido, `numeroDocumento` es su `numero`; si no, error `nuip-invalido`.

#### Scenario: Cédula antigua con ceros a la izquierda
- **WHEN** se parsean `C(P6)` y `W(P6)`
- **THEN** en ambos `campos.numeroDocumento` es `"99990005"` y la validación `formato-nuip` es `{ "id": "formato-nuip", "estado": "ok", "campos": ["numeroDocumento"], "detalle": "cedula-antigua" }`

#### Scenario: Límites de formato-nuip
- **WHEN** se parsean `C(P1)` con el campo NUIP `0000099999`, `0000009999` y `0000000000`
- **THEN** el primero tiene `campos.numeroDocumento` `"99999"` y detalle `"cedula-antigua"`; el segundo y el tercero son exactamente `{ "ok": false, "error": "nuip-invalido" }`

#### Scenario: La tarjeta decadactilar no se toma como número
- **WHEN** se parsea `W(P1)` (el run de dígitos antes del apellido es `999977779999123456`)
- **THEN** `campos.numeroDocumento` es `"9999123456"`

#### Scenario: Marcador pegado a la cabecera
- **WHEN** se parsea `C(P1)` sin los bytes `[10,24)` (517 bytes; el marcador empieza en el byte 10, justo después de los dígitos `0199998888`, como en los lectores que quitan los NUL de la cabecera)
- **THEN** `trama.variante` es `"truncada"`, `campos` es igual al de `C(P1)` y `warnings` es `["H02"]`

#### Scenario: Tarjeta decadactilar de 6 dígitos con relleno
- **WHEN** se parsea `C(P1)` con `[40,48)` igual a `999977` seguido de dos bytes 0x00
- **THEN** `trama.modo` es `"offsets"`, `campos` es igual al de `C(P1)` y la validación `consistencia-modos` tiene `estado` `"ok"`

#### Scenario: Sin corrección de confusiones OCR
- **WHEN** se parsea `C(P1)` con el byte 56 igual a `O` (0x4F) en lugar de `5`
- **THEN** el resultado es exactamente `{ "ok": false, "error": "caracteres-invalidos-en-nombre" }` y nunca un número con `O` corregida a `0`

### Requirement: PA-10 Nombres y apellidos
El parser SHALL entregar `primerApellido`, `segundoApellido`, `primerNombre` y `segundoNombre` en ese orden de la trama, con `null` para un campo vacío. `primerApellido` y `primerNombre` MUST NOT ser vacíos. En modo patrones, con 3 campos entre el primer apellido y el bloque se asignan en orden; con 2, segundo apellido y primer nombre; con 1, primer nombre (H15). Con 0 o más de 3 MUST dar `nombres-no-reconocidos`.

#### Scenario: Orden de los apellidos verificado por posición
- **WHEN** se parsean `C(P1)` y `C(P6)` (mismos apellidos en orden inverso)
- **THEN** `C(P1)` da `primerApellido` `"PEREZ"` y `segundoApellido` `"GOMEZ"`, y `C(P6)` da `primerApellido` `"GOMEZ"` y `segundoApellido` `"PEREZ"`

#### Scenario: Segundo nombre ausente
- **WHEN** se parsean `C(P3)` y `W(P3)`
- **THEN** en ambos `campos` es `{ "numeroDocumento": "9999000002", "primerApellido": "MARTINEZ", "segundoApellido": "MEJIA", "primerNombre": "MARIA", "segundoNombre": null, "sexo": "F", "fechaNacimiento": "1970-01-01", "rh": "AB+", "codigoDepartamentoNacimiento": "31", "codigoMunicipioNacimiento": "019" }`, y solo `W(P3)` incluye `"H15"` en `warnings`

#### Scenario: Segundo apellido ausente en la trama completa
- **WHEN** se parsea `C(P7)`
- **THEN** `campos.segundoApellido` es `null`, `campos.primerNombre` es `"JOHN"` y `campos.segundoNombre` es `"PAUL"`

#### Scenario: Ambigüedad documentada sin offsets
- **WHEN** se parsea `W(P7)`
- **THEN** `campos.segundoApellido` es `"JOHN"`, `campos.primerNombre` es `"PAUL"`, `campos.segundoNombre` es `null`, `warnings` incluye `"H15"` y la confianza de esos tres campos es `0.6`

#### Scenario: Demasiados campos de nombre
- **WHEN** se parsea `W(P1)` con el contenido del segundo nombre cambiado a `CARLOS` + `00 00` + `EXTRA` dentro de su rango de 23 bytes
- **THEN** el resultado es exactamente `{ "ok": false, "error": "nombres-no-reconocidos" }`

### Requirement: PA-11 Bloque demográfico sexo primero
El bloque sexo primero SHALL leerse como un dígito ignorado, sexo `M` o `F`, fecha `YYYYMMDD`, un run de dígitos y el RH (H05, H11). El sexo MUST salir solo de esa posición del bloque. Si el run tiene exactamente 6 dígitos, los 2 primeros son el departamento y los 3 siguientes el municipio DIVIPOL (H06) y el sexto se descarta; con otra cantidad, ambos códigos son `null`.

#### Scenario: Departamento de 2 y municipio de 3
- **WHEN** se parsea `C(P3)` (bloque `0F19700101310190AB+`)
- **THEN** `codigoDepartamentoNacimiento` es `"31"` y `codigoMunicipioNacimiento` es `"019"`, y no `"310"` ni `"190"`

#### Scenario: Códigos en cero se conservan
- **WHEN** se parsea `C(P5)`
- **THEN** `codigoDepartamentoNacimiento` es `"00"` y `codigoMunicipioNacimiento` es `"000"`

#### Scenario: Cantidad inesperada de dígitos
- **WHEN** se parsean `C(P1)` con el bloque `0M2000022916001O+` (5 dígitos) y con el bloque `0M200002291600100O+` (7 dígitos)
- **THEN** ambos tienen `ok` `true`, `trama.modo` `"patrones"`, los dos códigos en `null` con confianza `0`, la validación `divipol-codigos` con `estado` `"fallida"` y detalle `"longitud-inesperada"`, y `warnings` es `[]`

### Requirement: PA-12 Bloque demográfico fecha primero
El parser SHALL reconocer en modo patrones el bloque fecha primero (H08): dos dígitos ignorados, fecha `YYYYMMDD`, sexo `M` o `F`, un run de dígitos y el RH. De este bloque MUST NOT extraer códigos DIVIPOL: ambos son `null` con confianza `0` y `trama.bloqueDemografico` es `"fecha-primero"`.

#### Scenario: Fecha primero en trama completa
- **WHEN** se parsea `C_F(P1)` (bloque `0220000229M160010O+`)
- **THEN** `trama` es `{ "variante": "completa", "modo": "patrones", "bloqueDemografico": "fecha-primero" }`, `campos.sexo` es `"M"`, `campos.fechaNacimiento` es `"2000-02-29"`, `campos.rh` es `"O+"`, los dos códigos son `null` y `warnings` es `["H08"]`

#### Scenario: Fecha primero en trama truncada con RH AB
- **WHEN** se parsea `W_F(P3)`
- **THEN** `campos.sexo` es `"F"`, `campos.fechaNacimiento` es `"1970-01-01"`, `campos.rh` es `"AB+"` y la validación `divipol-codigos` es `{ "id": "divipol-codigos", "estado": "no-aplica", "campos": ["codigoDepartamentoNacimiento", "codigoMunicipioNacimiento"], "detalle": "bloque-sin-divipol" }`

### Requirement: PA-13 Grupo sanguíneo y RH
El RH SHALL ser uno de `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+` y `O-`, leído con `AB` antes que `A` o `B` y conservando el signo. El signo MUST ser el último byte que el parser interpreta en la trama.

#### Scenario: Los ocho valores en la trama completa
- **WHEN** se parsean `C(P1)`, `C(P2)`, `C(P3)`, `C(P4)`, `C(P5)`, `C(P6)`, `C(P7)` y `C(P8)`
- **THEN** `campos.rh` es, en orden, `"O+"`, `"AB-"`, `"AB+"`, `"O-"`, `"B-"`, `"A-"`, `"B+"` y `"A+"`

#### Scenario: AB y negativos en modo patrones
- **WHEN** se parsean `W(P2)`, `W(P3)`, `S(P4)` y `S(P6)`
- **THEN** `campos.rh` es, en orden, `"AB-"`, `"AB+"`, `"O-"` y `"A-"`

### Requirement: PA-14 Fecha de nacimiento
`fechaNacimiento` SHALL ser la fecha del bloque demográfico en formato ISO 8601 `YYYY-MM-DD`. La fecha MUST ser una fecha real del calendario gregoriano con año entre 1900 y 2099; si no lo es, MUST devolver `fecha-nacimiento-invalida`. La fecha de expedición no está en el PDF417 y MUST NOT aparecer en el resultado.

#### Scenario: Fechas válidas en los límites
- **WHEN** se parsean `C(P1)` con las fechas `20000229`, `19000101` y `20991231`
- **THEN** `campos.fechaNacimiento` es, en orden, `"2000-02-29"`, `"1900-01-01"` y `"2099-12-31"`

#### Scenario: Fechas inválidas
- **WHEN** se parsean `C(P1)` con las fechas `19000229`, `20000230`, `20001301`, `20000100`, `18991231` y `21000101`
- **THEN** los seis resultados son exactamente `{ "ok": false, "error": "fecha-nacimiento-invalida" }`

### Requirement: PA-15 Opciones y resolutor DIVIPOL
`opciones` SHALL ser `undefined`, `null` o un objeto no array; su propiedad `divipol`, leída una vez, MUST ser `undefined` o una función con la firma de `buscarDivipol` (cambio `divipol-registraduria`). Otro valor MUST dar `opciones-invalidas`. Con códigos y resolutor, el parser MUST llamarlo una sola vez con el texto de 5 dígitos depto + mpio y traducir su respuesta según los escenarios; sin códigos MUST NOT llamarlo. Los códigos y la confianza no cambian.

#### Scenario: Opciones inválidas
- **WHEN** se parsea `C(P1)` con `opciones` `5`, `"x"`, `true`, `[]`, `() => 1`, `{ divipol: null }`, `{ divipol: 5 }`, `{ divipol: {} }` y `{ divipol: "16001" }`
- **THEN** los nueve resultados son exactamente `{ "ok": false, "error": "opciones-invalidas" }`

#### Scenario: Opciones ausentes
- **WHEN** se parsea `C(P1)` con `opciones` `undefined`, `null` y `{}`
- **THEN** los tres resultados son profundamente iguales al de PA-02

#### Scenario: Código encontrado
- **WHEN** se parsea `C(P1)` con un resolutor espía que devuelve `{ "encontrado": true, "codigo": "16001", "warnings": [] }`
- **THEN** el espía se llamó exactamente una vez con `"16001"`, la validación `divipol-existe` es `{ "id": "divipol-existe", "estado": "ok", "campos": ["codigoDepartamentoNacimiento", "codigoMunicipioNacimiento"], "detalle": null }` y `campos`, `confianza` y `warnings` son iguales a los de PA-02

#### Scenario: Código desconocido con su hipótesis
- **WHEN** se parsea `C(P1)` con un resolutor que devuelve `{ "encontrado": false, "codigo": "16001", "motivo": "desconocido", "warnings": ["D01"] }`
- **THEN** la validación `divipol-existe` tiene `estado` `"fallida"` y `detalle` `"desconocido"`, y `warnings` es `["D01"]`

#### Scenario: Código sin dato
- **WHEN** se parsea `C(P5)` con un resolutor espía que devuelve `{ "encontrado": false, "codigo": "00000", "motivo": "sin-dato", "warnings": ["D04"] }`
- **THEN** el espía se llamó con `"00000"`, la validación `divipol-existe` tiene `estado` `"no-aplica"` y `detalle` `"sin-dato"`, y `warnings` incluye `"D04"`

#### Scenario: Resolutor defectuoso
- **WHEN** se parsea `C(P1)` con un resolutor que lanza un `Error`, con otro que devuelve `"si"` y con otro que devuelve `{ "encontrado": false, "codigo": null, "motivo": "formato-invalido", "warnings": ["D01"] }`
- **THEN** ninguna llamada lanza y en los tres la validación `divipol-existe` tiene `estado` `"no-aplica"` y `detalle` `"error-resolutor"`, y `warnings` es igual al de PA-02

#### Scenario: Solo se copian IDs de hipótesis bien formados
- **WHEN** se parsea `C(P1)` con un resolutor que devuelve `{ "encontrado": true, "codigo": "16001", "warnings": ["D02", "<b>", 7, "d03", "D02", "D0001"] }`
- **THEN** `warnings` es `["D02"]`

#### Scenario: Sin códigos no se consulta
- **WHEN** se parsea `C_F(P1)` con un resolutor espía
- **THEN** el espía no se llamó y la validación `divipol-existe` tiene `estado` `"no-aplica"` y `detalle` `"sin-codigos"`

#### Scenario: Integración con la búsqueda DIVIPOL real
- **WHEN** se parsea `C(P3)` con `{ divipol: buscarDivipol }`, una vez aplicado el cambio `divipol-registraduria`
- **THEN** la validación `divipol-existe` tiene `estado` `"ok"` y `campos.codigoMunicipioNacimiento` sigue siendo `"019"`

### Requirement: PA-16 Descarte de biometría y datos de control
El resultado MUST NOT depender de la cola (todo byte posterior al signo del RH, H09) ni contener el código AFIS, la tarjeta decadactilar ni el marcador. Para no leer biometría como datos, el parser MUST NOT aceptar un NUIP cuyo último dígito esté en la posición 96 o posterior ni un bloque demográfico que empiece en la posición 192 o posterior.

#### Scenario: La cola no cambia el resultado
- **WHEN** se parsean `C(P1)` y `C(P1)` con la cola sustituida por 363 bytes 0xFF, por 363 bytes 0x00, por nada (la trama termina en el `+` del RH) y por `0M19990101160010AB+PEREZ`
- **THEN** los cinco resultados son profundamente iguales

#### Scenario: Propiedad de independencia de la cola
- **WHEN** para personas del dominio de PA-21 y cada una de las cuatro variantes del generador (`completa`, `windows-truncada`, `sin-pubdsk`, `fecha-primero`) se sustituye la cola declarada (`rangos.cola`) por dos valores de `fc.uint8Array({ maxLength: 1500 })` y se parsean ambas tramas (al menos 1000 casos por variante)
- **THEN** los dos resultados son profundamente iguales en el 100 % de los casos y ambos tienen `ok` `true`

#### Scenario: Datos de control ausentes del resultado
- **WHEN** se parsean `C(P1)`, `W(P1)` y `S(P1)` y se serializa cada resultado con `JSON.stringify`
- **THEN** ningún texto serializado contiene `"99998888"`, `"99997777"` ni `"PubDSK"`

#### Scenario: Límites de posición
- **WHEN** se parsean `C(P1)` con 38 bytes 0x00 insertados en la posición 40, con 39 insertados en la posición 40, con 41 insertados en la posición 150 y con 42 insertados en la posición 150
- **THEN** el primero y el tercero tienen `ok` `true` y los `campos` de `C(P1)`; el segundo es exactamente `{ "ok": false, "error": "nuip-no-encontrado" }` y el cuarto exactamente `{ "ok": false, "error": "bloque-demografico-no-encontrado" }`

### Requirement: PA-17 Confianza por campo
`confianza` SHALL asignar a cada campo: `1` si los modos offsets y patrones dieron el mismo valor; `0.9` si solo hubo un modo con resultado y el campo no depende de H15; `0.6` para `segundoApellido`, `primerNombre` y `segundoNombre` asignados por H15; `0.5` si los dos modos discrepan (prevalece el valor de offsets); y `0` para un código DIVIPOL `null`.

#### Scenario: Un solo modo
- **WHEN** se parsean `W(P1)` y `S(P1)`
- **THEN** en ambos los diez valores de `confianza` son `0.9`

#### Scenario: Discrepancia entre modos
- **WHEN** se parsean `C(P7)` y `C(P8)`
- **THEN** en ambos `confianza.segundoApellido`, `confianza.primerNombre` y `confianza.segundoNombre` son `0.5` y los otros siete valores son `1`

#### Scenario: Respaldo por fallo de offsets
- **WHEN** se parsea `C(P1)` con un byte 0x00 insertado en la posición 150
- **THEN** los diez valores de `confianza` son `0.9`

### Requirement: PA-18 Validaciones
`validaciones` SHALL tener exactamente cuatro entradas, en este orden e ids: `formato-nuip`, `consistencia-modos`, `divipol-codigos` y `divipol-existe`, cada una con `id`, `estado` (`ok`, `fallida` o `no-aplica`), `campos` y `detalle`. `consistencia-modos` MUST ser `fallida` con los campos discrepantes en el orden de `campos`, u `no-aplica` con detalle `trama-no-completa`, `offsets-sin-resultado` o `patrones-sin-resultado`.

#### Scenario: Consistencia fallida
- **WHEN** se parsea `C(P7)`
- **THEN** la segunda validación es exactamente `{ "id": "consistencia-modos", "estado": "fallida", "campos": ["segundoApellido", "primerNombre", "segundoNombre"], "detalle": null }`

#### Scenario: Consistencia no aplicable
- **WHEN** se parsean `W(P1)` y `C_F(P1)`
- **THEN** la segunda validación tiene `estado` `"no-aplica"`, `campos` `[]` y `detalle` `"trama-no-completa"` y `"offsets-sin-resultado"` respectivamente

#### Scenario: Patrones sin resultado en la trama completa
- **WHEN** se parsea `C(P1)` con el byte 10 igual a 0x58 (`X`): la cabecera conserva 13 bytes 0x00 seguidos y el modo patrones toma `0199998888` como número y no encuentra después el bloque demográfico
- **THEN** `trama.modo` es `"offsets"`, `campos` es igual al de `C(P1)`, la segunda validación tiene `estado` `"no-aplica"` y `detalle` `"patrones-sin-resultado"`, y los diez valores de `confianza` son `0.9`

### Requirement: PA-19 Hipótesis aplicadas en warnings
`warnings` SHALL ser la lista ordenada y sin duplicados de las hipótesis no confirmadas que aplicó el camino entregado: `H02` si la variante es truncada; `H07` sin marcador; `H08` con bloque fecha primero; `H15` si el modo patrones asignó nombres por H15; y los IDs que aporte el resolutor (PA-15). MUST NOT incluir hipótesis confirmadas (H01, H03 a H06, H09, H11) ni IDs `G` del generador. Un error MUST NOT incluir `warnings`.

#### Scenario: Warnings por camino
- **WHEN** se parsean `C(P1)`, `W(P1)`, `S(P1)`, `W(P3)`, `S_F(P1)` y `C(P1)` con el bloque `0M2000022916001O+`
- **THEN** `warnings` es, en orden, `[]`, `["H02"]`, `["H07"]`, `["H02", "H15"]`, `["H07", "H08"]` y `[]`

### Requirement: PA-20 Regresión de errores conocidos
El parser SHALL evitar cada error documentado de los repositorios antiguos (skill `formato-cedula`): RH `AB` cortado, sexo por contenido, `-` del RH perdido, Ñ y acentos, apellidos invertidos, fecha mal etiquetada, segundo nombre ausente, apellido compuesto partido, trama de Windows y la lectura P/A/R del primer carácter (H11). Cada uno MUST tener una prueba propia.

#### Scenario: RH AB no se corta
- **WHEN** se parsean `C(P3)` y `C(P2)`
- **THEN** `campos.rh` es `"AB+"` y `"AB-"`, nunca `"B+"` ni `"B-"`

#### Scenario: Sexo F con letras M en nombres
- **WHEN** se parsea `C(P3)` (`MARTINEZ MEJIA MARIA`, sexo F)
- **THEN** `campos.sexo` es `"F"`

#### Scenario: Signo negativo conservado
- **WHEN** se parsean `C(P4)` y `W(P4)`
- **THEN** en ambos `campos.rh` es `"O-"`

#### Scenario: Ñ y acentos no rompen el parser
- **WHEN** se parsean `C(P2)`, `W(P2)` y `S(P2)`
- **THEN** los tres tienen `ok` `true` y `campos.primerApellido` `"PEÑA"` y `campos.segundoApellido` `"NUÑEZ"`

#### Scenario: Apellidos no invertidos
- **WHEN** se parsean `W(P1)` y `S(P1)`
- **THEN** en ambos `campos.primerApellido` es `"PEREZ"` y `campos.segundoApellido` es `"GOMEZ"`

#### Scenario: Fecha de nacimiento etiquetada como tal
- **WHEN** se parsea `C(P1)`
- **THEN** `campos.fechaNacimiento` es `"2000-02-29"` y ninguna clave de `campos` contiene `expedicion`

#### Scenario: Segundo nombre ausente no desplaza campos
- **WHEN** se parsean `C(P5)` y `W(P5)`
- **THEN** en ambos `segundoNombre` es `null`, `sexo` es `"M"`, `fechaNacimiento` es `"2004-03-10"` y `rh` es `"B-"`

#### Scenario: Apellido compuesto entero
- **WHEN** se parsean `C(P4)`, `W(P4)` y `S(P4)`
- **THEN** en los tres `campos.primerApellido` es `"DE LA OSSA"`

#### Scenario: Misma persona en trama completa y truncada
- **WHEN** se parsean `C(p)` y `W(p)` para cada `p` de P1, P2, P4 y P6
- **THEN** para cada persona los `campos` de ambas tramas son profundamente iguales

#### Scenario: Primer carácter P/A/R no se interpreta
- **WHEN** se parsea `C(P1)` con el byte 150 igual a `P` (0x50), de modo que el bloque es `PM20000229160010O+`
- **THEN** el resultado es exactamente `{ "ok": false, "error": "bloque-demografico-no-encontrado" }`, y para `C(P1)` sin cambios las claves de `campos` son exactamente las diez de PA-02 (ninguna de original, duplicado o rectificación)

### Requirement: PA-21 Ida y vuelta con el generador sintético
Para toda persona que acepta `generarPdf417` del cambio `generador-fixtures-sinteticos` con nombres de 1 a 21 bytes, y para cada una de sus cuatro variantes, el parser SHALL devolver `ok` `true`, la `trama` de la variante y `campos` iguales al `esperado` del fixture. En la variante `completa` MUST admitir además nombres de 22 y 23 bytes.

#### Scenario: Ida y vuelta por variante
- **WHEN** se generan al menos 1000 fixtures por variante (`completa`, `windows-truncada`, `sin-pubdsk`, `fecha-primero`) con `arbFixturePdf417({ variantes: [variante], nuipCorto: true })` y se parsea cada `bytes`
- **THEN** el 100 % tiene `ok` `true`; `campos` es igual a `esperado` traducido así: `numeroDocumento` = `esperado.nuip`, nombres iguales con `""` como `null`, mismos `sexo`, `fechaNacimiento` y `rh`, códigos iguales a `departamento` y `municipio` salvo en `fecha-primero`, donde son `null`; y `trama` es, en orden de variante, completa/offsets/sexo-primero, truncada/patrones/sexo-primero, sin-pubdsk/patrones/sexo-primero y completa/patrones/fecha-primero

#### Scenario: Nombres largos en la trama completa
- **WHEN** se generan al menos 1000 fixtures con `generarPdf417(PERSONA_BASE + nombres, { variante: "completa" })`, donde al menos uno de los cuatro nombres es un texto de 22 o 23 letras `A`-`Z` y los demás salen de `arbPersonaFicticia()`, y se parsea cada `bytes`
- **THEN** el 100 % tiene `ok` `true`, `trama.modo` `"offsets"` y `campos` igual a `esperado` traducido como en el escenario anterior

#### Scenario: Salvaguarda de vacuidad
- **WHEN** termina la propiedad de ida y vuelta de cada variante
- **THEN** los contadores muestran, sobre los casos ejecutados de cada variante, al menos 8 % sin segundo nombre, 8 % con espacio en algún nombre, 20 % con Ñ, 10 % con RH `AB`, 25 % con RH negativo y 40 % con NUIP de menos de 10 dígitos; y en el escenario de nombres largos, al menos 25 % con un nombre de exactamente 23 bytes
