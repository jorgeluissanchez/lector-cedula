# Delta de formato-nuip

## MODIFIED Requirements

### Requirement: NF-02 Función pura y total
El validador MUST ser puro: sin E/S, sin estado compartido, sin depender de la hora ni del entorno. MUST devolver un resultado con la forma de NF-01, sin lanzar excepción, para cualquier valor de JavaScript en `entrada` y en `opciones`, salvo objetos cuyos accesores o proxies lancen al leerse. Dos llamadas con los mismos argumentos MUST producir resultados profundamente iguales.

#### Scenario: Nunca lanza con cadenas arbitrarias
- **WHEN** se valida cualquier cadena generada por `fc.string({ unit: "binary" })` y por `fc.string()` de `fast-check` (al menos 1000 casos cada una)
- **THEN** ninguna llamada lanza excepción y cada resultado cumple la forma de NF-01

#### Scenario: Nunca lanza con valores arbitrarios como entrada
- **WHEN** se valida cualquier valor generado por `fc.anything()` (al menos 1000 casos), sin `opciones`
- **THEN** ninguna llamada lanza excepción, cada resultado cumple la forma de NF-01 y, si el valor no es de tipo `"string"`, el resultado es exactamente `{ "valido": false, "motivo": "entrada-no-texto" }`

#### Scenario: Nunca lanza con opciones arbitrarias
- **WHEN** se valida `"9999123456"` con `opciones` igual a cualquier valor generado por `fc.anything()` (al menos 1000 casos)
- **THEN** ninguna llamada lanza excepción y cada resultado es exactamente `{ "valido": true, "numero": "9999123456", "tipoProbable": "nuip", "digitos": 10, "warnings": [] }` o exactamente `{ "valido": false, "motivo": "tipo-documento-invalido" }`

#### Scenario: Determinismo
- **WHEN** se valida dos veces `"9.999.123.456"`
- **THEN** ambos resultados son profundamente iguales

#### Scenario: Idempotencia de la normalización
- **WHEN** cada entrada de los generadores de capturas válidas por construcción `G_cc` y `G_ti` de NF-14 (al menos 1000 casos por generador) se valida con su tipo de documento y produce un resultado válido con `numero` = N, y se valida de nuevo N con el mismo tipo de documento
- **THEN** el segundo resultado es profundamente igual al primero, y más del 50 % de los casos de cada generador producen un primer resultado válido; si no se alcanza ese porcentaje, la prueba falla por vacuidad aunque ninguna comparación haya fallado

### Requirement: NF-08 Sin dígito de control
El validador MUST NOT aplicar ningún dígito de control ni checksum (ni el módulo 11 de la DIAN para NIT). Si la entrada original termina en un guion de NF-03 seguido de exactamente un dígito ASCII, y entre ese guion y el dígito, y después del dígito, solo hay separadores admitidos, MUST devolver `motivo` `"posible-digito-verificacion"` en lugar de absorber ese dígito.

#### Scenario: Cualquier último dígito es válido
- **WHEN** se validan los diez números `"9999123450"`, `"9999123451"`, ..., `"9999123459"` (difieren solo en el último dígito)
- **THEN** los diez resultados son `valido: true` con `tipoProbable` `"nuip"` y `numero` igual a la entrada

#### Scenario: Formato estilo NIT con guion se rechaza
- **WHEN** se validan `"999.912.345-6"`, `"999912345-6"` y `"999.912.345-6 "`
- **THEN** los tres resultados son `{ "valido": false, "motivo": "posible-digito-verificacion" }`

#### Scenario: Dígito de verificación separado por espacios
- **WHEN** se validan `"999.912.345- 6"` y `"999.912.345 - 6"`
- **THEN** ambos resultados son `{ "valido": false, "motivo": "posible-digito-verificacion" }`

#### Scenario: Separador después del dígito de verificación
- **WHEN** se validan `"999.912.345-6."` y `"999.912.345-6-"`
- **THEN** ambos resultados son `{ "valido": false, "motivo": "posible-digito-verificacion" }`

#### Scenario: Variantes de guion activan la regla
- **WHEN** se validan `"999.912.345–6"`, `"999912345 − 6"`, `"999912345‐6"` y `"999912345‑ 6"`
- **THEN** los cuatro resultados son `{ "valido": false, "motivo": "posible-digito-verificacion" }`

#### Scenario: Guion y un solo dígito sin número delante
- **WHEN** se validan `"-6"` y `"0-0"`
- **THEN** ambos resultados son `{ "valido": false, "motivo": "posible-digito-verificacion" }`

#### Scenario: Guion final seguido de más de un dígito es separador
- **WHEN** se valida `"9999-123-456"`
- **THEN** el resultado es `{ "valido": true, "numero": "9999123456", "tipoProbable": "nuip", "digitos": 10, "warnings": [] }`

#### Scenario: Guion final aislado es separador
- **WHEN** se validan `"9999123456-"` y `"9999123456 - "`
- **THEN** ambos resultados son `valido: true` con `numero` `"9999123456"`

#### Scenario: Dígito final aislado sin guion no activa la regla
- **WHEN** se validan `"9999-123-45 6"` y `"999912345.6"`
- **THEN** ambos resultados son `{ "valido": true, "numero": "9999123456", "tipoProbable": "nuip", "digitos": 10, "warnings": [] }`

#### Scenario: Prioridad de caracteres inválidos sobre el patrón NIT
- **WHEN** se validan `"999A12345-6"` y `"999912345-6　"`
- **THEN** ambos resultados son `{ "valido": false, "motivo": "caracteres-invalidos" }`

#### Scenario: Prioridad del patrón NIT sobre la longitud
- **WHEN** se valida `"99-6"`
- **THEN** el resultado es `{ "valido": false, "motivo": "posible-digito-verificacion" }`

#### Scenario: Patrón NIT tras agrupación con guiones
- **WHEN** se validan `"9999-12345-6"` y `"99.99-123.45 - 6"`, cada uno sin tipo de documento y con tipo de documento `"ti"`
- **THEN** los cuatro resultados son `{ "valido": false, "motivo": "posible-digito-verificacion" }`

#### Scenario: Propiedad del patrón NIT con número agrupado
- **WHEN** se valida, sin tipo de documento y con tipo de documento `"ti"` (al menos 1000 casos por tipo), cada entrada N + a + h + b + d + c, donde N es vacío o de 1 a 11 dígitos ASCII con rachas de 0 a 2 separadores de NF-03 (guiones incluidos) entre dígitos consecutivos y terminado en dígito; a, b y c son rachas de 0 a 10 separadores de NF-03; h es un guion de NF-03 y d un dígito ASCII
- **THEN** cada entrada mide 64 caracteres o menos, todos los resultados son `{ "valido": false, "motivo": "posible-digito-verificacion" }` y al menos el 25 % de los casos lleva un guion de NF-03 dentro de N

### Requirement: NF-10 Normalización y rechazo del tipo de documento
Si `opciones` es `undefined` o `null`, o su `tipoDocumento` es `undefined`, el validador SHALL usar `"cc"`. Si `tipoDocumento` es un string, MUST quitarle el espacio en blanco inicial y final y pasarlo a minúsculas; si queda `"cc"` o `"ti"`, usa ese tipo. En cualquier otro caso (otro texto, otro tipo de valor u `opciones` primitivo) MUST devolver exactamente `{ "valido": false, "motivo": "tipo-documento-invalido" }`. `tipoDocumento` MUST leerse una sola vez por llamada.

#### Scenario: Mayúsculas se normalizan
- **WHEN** se validan `"99991234567"` con tipo de documento `"TI"` y `"9999123456"` con tipo de documento `"Ti"`
- **THEN** los resultados son `{ "valido": true, "numero": "99991234567", "tipoProbable": "ti-antigua", "digitos": 11, "warnings": ["N01"] }` y `{ "valido": true, "numero": "9999123456", "tipoProbable": "nuip", "digitos": 10, "warnings": [] }`

#### Scenario: Espacio en blanco alrededor del tipo
- **WHEN** se valida `"99991234567"` con tipo de documento `" ti\n"`
- **THEN** el resultado es `{ "valido": true, "numero": "99991234567", "tipoProbable": "ti-antigua", "digitos": 11, "warnings": ["N01"] }`

#### Scenario: CC en mayúsculas se trata como cédula
- **WHEN** se valida `"99991234567"` con tipo de documento `"CC"`
- **THEN** el resultado es `{ "valido": false, "motivo": "longitud-invalida" }`

#### Scenario: Texto de tipo desconocido
- **WHEN** se valida `"9999123456"` con tipo de documento `"xx"`, `""`, `"   "`, `"t i"`, `"nuip"` y `"ce"`
- **THEN** los seis resultados son `{ "valido": false, "motivo": "tipo-documento-invalido" }`

#### Scenario: Tipo de documento que no es texto
- **WHEN** se valida `"9999123456"` con `opciones` `{ tipoDocumento: 1 }`, `{ tipoDocumento: true }`, `{ tipoDocumento: null }`, `{ tipoDocumento: {} }` y `{ tipoDocumento: ["ti"] }`
- **THEN** los cinco resultados son `{ "valido": false, "motivo": "tipo-documento-invalido" }`

#### Scenario: Opciones primitivas
- **WHEN** se valida `"9999123456"` con `opciones` `"ti"`, `0` y `true`
- **THEN** los tres resultados son `{ "valido": false, "motivo": "tipo-documento-invalido" }`

#### Scenario: Opciones ausentes o vacías equivalen a cédula
- **WHEN** se valida `"99991234567"` con `opciones` `undefined`, `null` y `{}`
- **THEN** los tres resultados son `{ "valido": false, "motivo": "longitud-invalida" }`

#### Scenario: Prioridad del tipo inválido sobre los motivos de la entrada
- **WHEN** se validan `"9999I23456"`, `""`, `"99-6"` y `"9".repeat(65)`, cada uno con tipo de documento `"xx"`
- **THEN** los cuatro resultados son `{ "valido": false, "motivo": "tipo-documento-invalido" }`

#### Scenario: tipoDocumento se lee una sola vez
- **WHEN** se valida `"99991234567"` con `opciones` igual a un objeto cuyo `tipoDocumento` es un accesor que cuenta sus lecturas y devuelve `"ti"` en la primera lectura y `"xx"` en las siguientes
- **THEN** el resultado es exactamente `{ "valido": true, "numero": "99991234567", "tipoProbable": "ti-antigua", "digitos": 11, "warnings": ["N01"] }` y el accesor se leyó exactamente 1 vez

#### Scenario: Variantes aceptadas del tipo de documento
- **WHEN** se valida `"99991234567"` con cada tipo de documento de la lista `"cc"`, `"CC"`, `"Cc"`, `"cC"`, `" cc"`, `"cc\t"`, `"\ncC\r"`, `" CC "` y con cada uno de la lista `"ti"`, `"TI"`, `"Ti"`, `"tI"`, `" ti"`, `"ti\n"`, `"\tTI\r"`, `" Ti "`
- **THEN** cada resultado de la primera lista es exactamente `{ "valido": false, "motivo": "longitud-invalida" }` y cada resultado de la segunda es exactamente `{ "valido": true, "numero": "99991234567", "tipoProbable": "ti-antigua", "digitos": 11, "warnings": ["N01"] }`

#### Scenario: Casos frontera rechazados
- **WHEN** se valida `"9999123456"` con cada tipo de documento `"ti."`, `"tì"` (i con acento grave), `"tı"` (i sin punto), `"tii"`, `"t"`, `"i"`, `"c"`, `"ccc"`, `"c c"`, `"cc-"`, `"-ti"` y `"t-i"`
- **THEN** los doce resultados son `{ "valido": false, "motivo": "tipo-documento-invalido" }`

#### Scenario: Propiedad sobre texto sin las letras de cc ni ti
- **WHEN** se valida `"9999123456"` con `tipoDocumento` igual a cualquier cadena de `fc.string()` y de `fc.string({ unit: "binary" })` que no contenga ninguno de los caracteres `c`, `C`, `t`, `T`, `i`, `I` (al menos 1000 casos por generador)
- **THEN** todos los resultados son exactamente `{ "valido": false, "motivo": "tipo-documento-invalido" }`

#### Scenario: Propiedad sobre variantes generadas de cc y ti
- **WHEN** se valida `"99991234567"` con `tipoDocumento` formado por una racha de 0 a 3 caracteres del espacio admitido de NF-03, las dos letras de `"cc"` o de `"ti"` cada una en mayúscula o minúscula al azar, y otra racha de 0 a 3 caracteres del espacio admitido de NF-03 (al menos 1000 casos)
- **THEN** cada variante de `"cc"` da exactamente `{ "valido": false, "motivo": "longitud-invalida" }` y cada variante de `"ti"` da exactamente `{ "valido": true, "numero": "99991234567", "tipoProbable": "ti-antigua", "digitos": 11, "warnings": ["N01"] }`

#### Scenario: Propiedad sobre opciones primitivas
- **WHEN** se valida `"9999123456"` con `opciones` igual a cualquier valor de `fc.string()`, `fc.integer()`, `fc.double()`, `fc.boolean()` o `fc.bigInt()`, o a un símbolo (al menos 1000 casos)
- **THEN** todos los resultados son exactamente `{ "valido": false, "motivo": "tipo-documento-invalido" }`

#### Scenario: Propiedad sobre objetos sin tipoDocumento
- **WHEN** se valida `"9999123456"` con `opciones` igual a cualquier objeto de `fc.dictionary` con claves de `fc.string()` distintas de `"tipoDocumento"` y de `"__proto__"` y valores de `fc.anything()`, o a cualquier array de `fc.array(fc.anything())` (al menos 1000 casos)
- **THEN** todos los resultados son exactamente `{ "valido": true, "numero": "9999123456", "tipoProbable": "nuip", "digitos": 10, "warnings": [] }`

#### Scenario: Propiedad sobre tipoDocumento que no es texto
- **WHEN** se valida `"99991234567"` con `opciones` `{ tipoDocumento: v }`, donde v es cualquier valor de `fc.anything()` que no es de tipo `"string"` ni `undefined` (al menos 1000 casos)
- **THEN** todos los resultados son exactamente `{ "valido": false, "motivo": "tipo-documento-invalido" }`

### Requirement: NF-13 Prioridad de motivos
Cuando una entrada cumple las condiciones de varios motivos, el validador MUST devolver el de mayor prioridad, en este orden estricto: `entrada-no-texto` (NF-11), `tipo-documento-invalido` (NF-10), `entrada-demasiado-larga` (NF-12), `caracteres-invalidos` (NF-05), `posible-digito-verificacion` (NF-08), `vacio` (NF-06) y `longitud-invalida` (NF-07, NF-09).

#### Scenario: Cadena de prioridades
- **WHEN** se validan, en orden, `(9999123456, { tipoDocumento: "xx" })`, `("A".repeat(65), { tipoDocumento: "xx" })`, `("A".repeat(65))`, `("999A12345-6")`, `("99-6")`, `("")` y `("9999")`
- **THEN** los motivos son, en orden, `"entrada-no-texto"`, `"tipo-documento-invalido"`, `"entrada-demasiado-larga"`, `"caracteres-invalidos"`, `"posible-digito-verificacion"`, `"vacio"` y `"longitud-invalida"`

#### Scenario: Vacío prevalece sobre la cantidad de dígitos
- **WHEN** se valida `" .-. "` (cero dígitos)
- **THEN** el resultado es `{ "valido": false, "motivo": "vacio" }` y no `"longitud-invalida"`

#### Scenario: Propiedad: el tipo inválido prevalece sobre cualquier cadena
- **WHEN** se valida cualquier cadena de `fc.string({ unit: "binary" })` y de `fc.string({ unit: "binary", minLength: 65 })` (al menos 1000 casos por generador) con `opciones` `{ tipoDocumento: "xx" }`
- **THEN** todos los resultados son exactamente `{ "valido": false, "motivo": "tipo-documento-invalido" }`

#### Scenario: Propiedad: la entrada no texto prevalece sobre cualquier opción
- **WHEN** se valida cualquier valor de `fc.anything()` que no es de tipo `"string"` con `opciones` igual a cualquier valor de `fc.anything()` (al menos 1000 casos)
- **THEN** todos los resultados son exactamente `{ "valido": false, "motivo": "entrada-no-texto" }`

## ADDED Requirements

### Requirement: NF-14 Oráculo de normalización
Para toda entrada string de hasta 64 caracteres formada solo por dígitos ASCII y separadores de NF-03 que no active la regla de NF-08, el validador SHALL devolver `vacio` si no contiene dígitos y, si los contiene, el resultado de la tabla de NF-07 (cédula) o de NF-09 (tarjeta de identidad) aplicada a D, donde D son los dígitos de la entrada en su orden y sin ceros a la izquierda; si el resultado es válido, `numero` MUST ser exactamente D.

#### Scenario: Captura válida por construcción en cédula
- **WHEN** se valida, sin tipo de documento, cada entrada del generador `G_cc` (al menos 1000 casos): D es `"9999"` seguido de 1 a 6 dígitos ASCII aleatorios (D de 5 a 10 dígitos), precedido de 0 a 5 ceros, con una racha de 0 a 2 separadores de NF-03 (punto, guiones y espacio admitido) antes del primer carácter, entre cada par de caracteres consecutivos y después del último, salvo entre los dos últimos dígitos de D, que van pegados para que la regla de NF-08 no se active
- **THEN** cada entrada mide 64 caracteres o menos; cada resultado es exactamente `{ "valido": true, "numero": D, "tipoProbable": T, "digitos": longitud de D, "warnings": [] }` con T `"nuip"` si D tiene 10 dígitos y `"cedula-antigua"` si tiene de 5 a 9; y al menos el 10 % de los casos da `"nuip"`, al menos el 10 % da `"cedula-antigua"`, al menos el 10 % lleva ceros a la izquierda y al menos el 10 % contiene un guion de NF-03

#### Scenario: Captura válida por construcción en tarjeta de identidad
- **WHEN** se valida, con tipo de documento `"ti"`, cada entrada del generador `G_ti` (al menos 1000 casos), construido como `G_cc` pero con D igual a `"9999"` seguido de 6 o 7 dígitos ASCII aleatorios (D de 10 u 11 dígitos)
- **THEN** cada entrada mide 64 caracteres o menos; cada resultado es exactamente `{ "valido": true, "numero": D, "tipoProbable": "nuip", "digitos": 10, "warnings": [] }` si D tiene 10 dígitos y `{ "valido": true, "numero": D, "tipoProbable": "ti-antigua", "digitos": 11, "warnings": ["N01"] }` si tiene 11 (hipótesis N01, pendiente en `docs/decisiones/hipotesis-formato.md`); y al menos el 25 % de los casos da `"nuip"`, al menos el 25 % da `"ti-antigua"`, al menos el 10 % lleva ceros a la izquierda y al menos el 10 % contiene un guion de NF-03

#### Scenario: Oráculo independiente sobre capturas sin guion
- **WHEN** se valida, sin tipo de documento y con tipo de documento `"ti"` (al menos 1000 casos por tipo), cada entrada del generador `G_sinGuion`: de 0 a 12 dígitos ASCII aleatorios (el primero puede ser `0`) con rachas de 0 a 3 caracteres del conjunto formado por el punto y el espacio admitido de NF-03 antes, entre y después de ellos
- **THEN** cada resultado es exactamente el del oráculo: `{ "valido": false, "motivo": "vacio" }` si la entrada no tiene dígitos; si no, con D = los caracteres `0` a `9` de la entrada en orden y sin ceros a la izquierda, la tabla literal (cédula: 5 a 9 dígitos `"cedula-antigua"` con `warnings` `[]`, 10 dígitos `"nuip"` con `[]`, otra longitud `"longitud-invalida"`; tarjeta de identidad: 10 dígitos `"nuip"` con `[]`, 11 dígitos `"ti-antigua"` con `["N01"]`, otra longitud `"longitud-invalida"`), con `numero` D y `digitos` igual a la longitud de D; y, por tipo, al menos el 10 % de los casos es válido, al menos el 10 % es `"longitud-invalida"` y al menos el 3 % es `"vacio"`

#### Scenario: Ejemplos fijos del oráculo
- **WHEN** se valida `"0 0.9 999 1"` sin tipo de documento y con tipo de documento `"ti"`, y se valida `"00.000"` sin tipo de documento
- **THEN** los resultados son, en orden, `{ "valido": true, "numero": "99991", "tipoProbable": "cedula-antigua", "digitos": 5, "warnings": [] }`, `{ "valido": false, "motivo": "longitud-invalida" }` y `{ "valido": false, "motivo": "longitud-invalida" }`
