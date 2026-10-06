# Spec Delta

Convenciones de los escenarios: las entradas se escriben como expresiones de JavaScript; las secuencias `\uXXXX`, `\t`, `\r` y `\n` dentro de comillas se interpretan como en JavaScript (`" "` es el espacio duro) y `"x".repeat(n)` repite la cadena. "Se valida X con tipo de documento T" significa llamar con `opciones` `{ tipoDocumento: T }`; sin tipo de documento se llama sin `opciones`. Todos los números son sintéticos (empiezan por `9999` tras normalizar, son solo ceros o tienen menos de cinco dígitos). Los motivos se eligen según la prioridad de NF-13.

## MODIFIED Requirements

### Requirement: NF-01 Forma del resultado
El validador SHALL devolver un objeto discriminado por `valido`. Si `valido` es `true` MUST contener exactamente `numero` (string), `tipoProbable` (`"nuip"`, `"cedula-antigua"` o `"ti-antigua"`), `digitos` (longitud de `numero`) y `warnings` (IDs de hipótesis). Si es `false` MUST contener exactamente `motivo`, uno de los siete motivos enumerados en NF-13 y elegido según su prioridad.

#### Scenario: Resultado válido con todas sus claves
- **WHEN** se valida `"9999123456"`
- **THEN** el resultado es exactamente `{ "valido": true, "numero": "9999123456", "tipoProbable": "nuip", "digitos": 10, "warnings": [] }`

#### Scenario: Resultado inválido con solo valido y motivo
- **WHEN** se valida `"9999"`
- **THEN** el resultado es exactamente `{ "valido": false, "motivo": "longitud-invalida" }`

#### Scenario: Motivos nuevos con solo valido y motivo
- **WHEN** se valida `9999123456` (número), se valida `"9999123456"` con tipo de documento `"xx"` y se valida `"9".repeat(65)`
- **THEN** los resultados son exactamente `{ "valido": false, "motivo": "entrada-no-texto" }`, `{ "valido": false, "motivo": "tipo-documento-invalido" }` y `{ "valido": false, "motivo": "entrada-demasiado-larga" }`

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
- **WHEN** una entrada cualquiera produce un resultado válido con `numero` = N y se valida de nuevo N con el mismo tipo de documento
- **THEN** el segundo resultado es profundamente igual al primero

### Requirement: NF-03 Separadores admitidos
El validador SHALL eliminar, en cualquier posición, solo estos separadores: punto `.` (U+002E); guion `-` (U+002D) y sus variantes U+2010, U+2011, U+2013 y U+2212, que cuentan como guion a todos los efectos; y el espacio en blanco admitido: espacio U+0020, tabulador U+0009, LF U+000A, CR U+000D, espacio duro U+00A0 y espacio estrecho sin corte U+202F. MUST NOT validar la posición ni la agrupación de los separadores, salvo la regla de NF-08.

#### Scenario: Puntos de miles
- **WHEN** se valida `"9.999.123.456"`
- **THEN** `valido` es `true`, `numero` es `"9999123456"` y `digitos` es `10`

#### Scenario: Espacios, guiones y espacio duro
- **WHEN** se validan `"9 999 123 456"`, `"9999-123-456"` y `"9 999 123 456"`
- **THEN** los tres resultados son `valido: true` con `numero` `"9999123456"`

#### Scenario: Espacio en blanco alrededor de la captura
- **WHEN** se validan `"  9999123456\n"`, `"9999123456\r\n"` y `"\t9999\t123456"`
- **THEN** los tres resultados son `valido: true` con `numero` `"9999123456"`

#### Scenario: Agrupación irregular no se valida
- **WHEN** se valida `"99.99-12 3456"`
- **THEN** `valido` es `true` y `numero` es `"9999123456"`

#### Scenario: Espacio estrecho sin corte de PDF
- **WHEN** se valida `"9 999 123 456"`
- **THEN** el resultado es exactamente `{ "valido": true, "numero": "9999123456", "tipoProbable": "nuip", "digitos": 10, "warnings": [] }`

#### Scenario: Variantes de guion de OCR y PDF
- **WHEN** se validan `"9999‐123‐456"`, `"9999‑123‑456"`, `"9999–123–456"` y `"9999−123−456"`
- **THEN** los cuatro resultados son exactamente `{ "valido": true, "numero": "9999123456", "tipoProbable": "nuip", "digitos": 10, "warnings": [] }`

### Requirement: NF-05 Rechazo de caracteres no admitidos
Si la entrada es un string de hasta 64 caracteres que contiene cualquier carácter que no sea un dígito ASCII `0`-`9` ni un separador admitido por NF-03, el validador MUST devolver `motivo` `"caracteres-invalidos"`, sin corregir el carácter (ni confusiones OCR como O->0 o I->1). Esto incluye todo espacio en blanco o guion Unicode no listado en NF-03 y los surrogates aislados.

#### Scenario: Letra confundible con dígito
- **WHEN** se valida `"9999I23456"` (I mayúscula en lugar de 1)
- **THEN** el resultado es `{ "valido": false, "motivo": "caracteres-invalidos" }`

#### Scenario: Letra O en lugar de cero
- **WHEN** se valida `"99991234O6"`
- **THEN** el resultado es `{ "valido": false, "motivo": "caracteres-invalidos" }`

#### Scenario: Signos que no son separadores admitidos
- **WHEN** se validan `"9,999,123,456"`, `"9999/123456"`, `"+9999123456"` y `"9999_123456"`
- **THEN** los cuatro resultados son `{ "valido": false, "motivo": "caracteres-invalidos" }`

#### Scenario: Dígitos no ASCII
- **WHEN** se valida `"９９９９１２３４５６"` (dígitos de ancho completo)
- **THEN** el resultado es `{ "valido": false, "motivo": "caracteres-invalidos" }`

#### Scenario: Prioridad sobre la longitud
- **WHEN** se valida `"9A"`
- **THEN** el resultado es `{ "valido": false, "motivo": "caracteres-invalidos" }`

#### Scenario: Espacios Unicode no admitidos
- **WHEN** se validan `"﻿9999123456"` (BOM), `"9999123456 "`, `"9999 123456"`, `"9999　123456"` y `"9 999 123 456"`
- **THEN** los cinco resultados son `{ "valido": false, "motivo": "caracteres-invalidos" }`

#### Scenario: Otros espacios fuera de la lista
- **WHEN** se validan `"9999\u000B123456"`, `"9999\u000C123456"`, `"9999\u0085123456"`, y `"9999 123456"`
- **THEN** los cuatro resultados son `{ "valido": false, "motivo": "caracteres-invalidos" }`

#### Scenario: Guiones fuera de la lista
- **WHEN** se validan `"9999‒123456"`, `"9999—123456"`, `"9999﹣123456"` y `"9999－123456"`
- **THEN** los cuatro resultados son `{ "valido": false, "motivo": "caracteres-invalidos" }`

#### Scenario: Surrogate aislado
- **WHEN** se valida `"9999123456\uD800"`
- **THEN** el resultado es `{ "valido": false, "motivo": "caracteres-invalidos" }`

### Requirement: NF-06 Entrada vacía
Si la entrada es un string de hasta 64 caracteres sin ningún dígito y que solo contiene separadores admitidos por NF-03 (o es la cadena vacía), el validador MUST devolver `motivo` `"vacio"`.

#### Scenario: Cadena vacía
- **WHEN** se valida `""`
- **THEN** el resultado es `{ "valido": false, "motivo": "vacio" }`

#### Scenario: Solo separadores
- **WHEN** se validan `"   "` y `" .-. \t"`
- **THEN** ambos resultados son `{ "valido": false, "motivo": "vacio" }`

#### Scenario: Guion solo
- **WHEN** se validan `"-"` y `"– −"`
- **THEN** ambos resultados son `{ "valido": false, "motivo": "vacio" }`

#### Scenario: Espacio no admitido no cuenta como vacío
- **WHEN** se validan `"　"` y `"﻿"`
- **THEN** ambos resultados son `{ "valido": false, "motivo": "caracteres-invalidos" }`

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

### Requirement: NF-09 Tarjeta de identidad
El validador SHALL aceptar un tipo de documento opcional, normalizado según NF-10, `"cc"` (por defecto) o `"ti"`. Con `"ti"` MUST aceptar solo 10 dígitos (`"nuip"`, `warnings` `[]`) u 11 dígitos (`"ti-antigua"`, `warnings` `["N01"]`, hipótesis pendiente de `docs/decisiones/hipotesis-formato.md`, ligada a H10 y M02); otra longitud MUST dar `"longitud-invalida"`. NF-03 a NF-06, NF-08, NF-11 y NF-12 aplican igual.

#### Scenario: Tarjeta de identidad de 10 dígitos
- **WHEN** se valida `"9999123456"` con tipo de documento `"ti"`
- **THEN** el resultado es `{ "valido": true, "numero": "9999123456", "tipoProbable": "nuip", "digitos": 10, "warnings": [] }`

#### Scenario: Tarjeta de identidad de 11 dígitos marca la hipótesis
- **WHEN** se valida `"99991234567"` con tipo de documento `"ti"`
- **THEN** el resultado es `{ "valido": true, "numero": "99991234567", "tipoProbable": "ti-antigua", "digitos": 11, "warnings": ["N01"] }`

#### Scenario: Patrón NIT también se rechaza en tarjeta de identidad
- **WHEN** se valida `"9999123456-7"` con tipo de documento `"ti"`
- **THEN** el resultado es `{ "valido": false, "motivo": "posible-digito-verificacion" }`

#### Scenario: Patrón NIT con espacios o separador final en tarjeta de identidad
- **WHEN** se validan `"9999123456 - 7"`, `"9999123456- 7"` y `"9999123456-7."` con tipo de documento `"ti"`
- **THEN** los tres resultados son `{ "valido": false, "motivo": "posible-digito-verificacion" }`

#### Scenario: Tarjeta de identidad con ceros a la izquierda
- **WHEN** se valida `"09999123456"` con tipo de documento `"ti"`
- **THEN** el resultado es `{ "valido": true, "numero": "9999123456", "tipoProbable": "nuip", "digitos": 10, "warnings": [] }`

#### Scenario: Tarjeta de identidad corta
- **WHEN** se valida `"999912345"` con tipo de documento `"ti"`
- **THEN** el resultado es `{ "valido": false, "motivo": "longitud-invalida" }`

#### Scenario: Tarjeta de identidad de 12 dígitos
- **WHEN** se valida `"999912345678"` con tipo de documento `"ti"`
- **THEN** el resultado es `{ "valido": false, "motivo": "longitud-invalida" }`

#### Scenario: Tipo explícito cc equivale al defecto
- **WHEN** se valida `"99991"` con tipo de documento `"cc"` y sin tipo de documento
- **THEN** ambos resultados son profundamente iguales

## ADDED Requirements

### Requirement: NF-10 Normalización y rechazo del tipo de documento
Si `opciones` es `undefined` o `null`, o su `tipoDocumento` es `undefined`, el validador SHALL usar `"cc"`. Si `tipoDocumento` es un string, MUST quitarle el espacio en blanco inicial y final y pasarlo a minúsculas; si queda `"cc"` o `"ti"`, usa ese tipo. En cualquier otro caso (otro texto, otro tipo de valor u `opciones` primitivo) MUST devolver exactamente `{ "valido": false, "motivo": "tipo-documento-invalido" }`.

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

### Requirement: NF-11 Entrada que no es texto
Si `entrada` no es un string primitivo (su `typeof` no es `"string"`), el validador MUST devolver exactamente `{ "valido": false, "motivo": "entrada-no-texto" }` sin lanzar excepción y sin convertir la entrada a texto, con prioridad sobre cualquier otro motivo.

#### Scenario: Números y otros primitivos
- **WHEN** se validan `9999123456`, `9999123456n`, `true`, `null`, `undefined` y `Symbol("x")`
- **THEN** los seis resultados son `{ "valido": false, "motivo": "entrada-no-texto" }`

#### Scenario: Objetos
- **WHEN** se validan `{}`, `["9999123456"]`, `new String("9999123456")` y `{ toString: () => "9999123456" }`
- **THEN** los cuatro resultados son `{ "valido": false, "motivo": "entrada-no-texto" }`

#### Scenario: Prioridad sobre el tipo de documento inválido
- **WHEN** se valida `9999123456` (número) con tipo de documento `"xx"`
- **THEN** el resultado es `{ "valido": false, "motivo": "entrada-no-texto" }`

#### Scenario: Propiedad sobre valores arbitrarios que no son texto
- **WHEN** se valida cualquier valor de `fc.anything()` filtrado a `typeof v !== "string"` (al menos 1000 casos), con y sin `opciones` `{ tipoDocumento: "ti" }`
- **THEN** todos los resultados son exactamente `{ "valido": false, "motivo": "entrada-no-texto" }`

### Requirement: NF-12 Longitud máxima de la entrada
Si `entrada` es un string de más de 64 unidades de código UTF-16 (su `length` es mayor que 64), el validador MUST devolver exactamente `{ "valido": false, "motivo": "entrada-demasiado-larga" }` sin examinar su contenido. El límite se mide sobre la entrada original, antes de quitar separadores o ceros. Las entradas de 64 o menos siguen las demás reglas.

#### Scenario: Límite exacto con separadores
- **WHEN** se validan `"9999123456" + " ".repeat(54)` (64 caracteres) y `"9999123456" + " ".repeat(55)` (65 caracteres)
- **THEN** los resultados son `{ "valido": true, "numero": "9999123456", "tipoProbable": "nuip", "digitos": 10, "warnings": [] }` y `{ "valido": false, "motivo": "entrada-demasiado-larga" }`

#### Scenario: Límite exacto con ceros a la izquierda
- **WHEN** se valida `"0".repeat(54) + "9999123456"` (64 caracteres)
- **THEN** el resultado es `{ "valido": true, "numero": "9999123456", "tipoProbable": "nuip", "digitos": 10, "warnings": [] }`

#### Scenario: El contenido de una entrada larga no se examina
- **WHEN** se validan `"A".repeat(65)` y `"A".repeat(64)`
- **THEN** los resultados son `{ "valido": false, "motivo": "entrada-demasiado-larga" }` y `{ "valido": false, "motivo": "caracteres-invalidos" }`

#### Scenario: Solo separadores por encima del límite
- **WHEN** se validan `" ".repeat(65)` y `" ".repeat(64)`
- **THEN** los resultados son `{ "valido": false, "motivo": "entrada-demasiado-larga" }` y `{ "valido": false, "motivo": "vacio" }`

#### Scenario: Patrón NIT por encima del límite
- **WHEN** se validan `" ".repeat(60) + "99-6"` (64 caracteres) y `" ".repeat(61) + "99-6"` (65 caracteres)
- **THEN** los resultados son `{ "valido": false, "motivo": "posible-digito-verificacion" }` y `{ "valido": false, "motivo": "entrada-demasiado-larga" }`

#### Scenario: Se cuentan unidades UTF-16
- **WHEN** se validan `"\u{1D7FF}".repeat(32)` (64 unidades) y `"\u{1D7FF}".repeat(33)` (66 unidades)
- **THEN** los resultados son `{ "valido": false, "motivo": "caracteres-invalidos" }` y `{ "valido": false, "motivo": "entrada-demasiado-larga" }`

#### Scenario: Entrada muy larga
- **WHEN** se valida `"9".repeat(1000000)`
- **THEN** el resultado es `{ "valido": false, "motivo": "entrada-demasiado-larga" }`

#### Scenario: Propiedad sobre cadenas largas
- **WHEN** se valida cualquier cadena de `fc.string({ unit: "binary", minLength: 65 })` (al menos 1000 casos), con y sin tipo de documento `"ti"`
- **THEN** todos los resultados son exactamente `{ "valido": false, "motivo": "entrada-demasiado-larga" }`

### Requirement: NF-13 Prioridad de motivos
Cuando una entrada cumple las condiciones de varios motivos, el validador MUST devolver el de mayor prioridad, en este orden estricto: `entrada-no-texto` (NF-11), `tipo-documento-invalido` (NF-10), `entrada-demasiado-larga` (NF-12), `caracteres-invalidos` (NF-05), `posible-digito-verificacion` (NF-08), `vacio` (NF-06) y `longitud-invalida` (NF-07, NF-09).

#### Scenario: Cadena de prioridades
- **WHEN** se validan, en orden, `(9999123456, { tipoDocumento: "xx" })`, `("A".repeat(65), { tipoDocumento: "xx" })`, `("A".repeat(65))`, `("999A12345-6")`, `("99-6")`, `("")` y `("9999")`
- **THEN** los motivos son, en orden, `"entrada-no-texto"`, `"tipo-documento-invalido"`, `"entrada-demasiado-larga"`, `"caracteres-invalidos"`, `"posible-digito-verificacion"`, `"vacio"` y `"longitud-invalida"`

#### Scenario: Vacío prevalece sobre la cantidad de dígitos
- **WHEN** se valida `" .-. "` (cero dígitos)
- **THEN** el resultado es `{ "valido": false, "motivo": "vacio" }` y no `"longitud-invalida"`
