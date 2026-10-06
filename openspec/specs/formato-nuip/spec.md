# formato-nuip Specification

## Purpose
Decidir de forma determinista y sin E/S si un texto capturado tiene el formato de un número de identificación colombiano (cédula de ciudadanía o tarjeta de identidad) y devolverlo normalizado, sin afirmar nunca que el número exista o pertenezca a alguien.

Convenciones de los escenarios: las entradas se escriben como literales de cadena de JavaScript (`" "` es el espacio duro U+00A0, `"\n"` el salto de línea). Cuando no se indica tipo de documento, se usa el valor por defecto (cédula de ciudadanía). Todos los números son sintéticos (empiezan por `9999` tras normalizar o son solo ceros).

## Requirements

### Requirement: NF-01 Forma del resultado
El validador SHALL devolver un objeto discriminado por `valido`. Si `valido` es `true` MUST contener exactamente `numero` (string), `tipoProbable` (`"nuip"`, `"cedula-antigua"` o `"ti-antigua"`), `digitos` (longitud de `numero`) y `warnings` (IDs de hipótesis). Si es `false` MUST contener exactamente `motivo`, uno de `"caracteres-invalidos"`, `"posible-digito-verificacion"`, `"vacio"` o `"longitud-invalida"`, con esa prioridad cuando aplica más de uno.

#### Scenario: Resultado válido con todas sus claves
- **WHEN** se valida `"9999123456"`
- **THEN** el resultado es exactamente `{ "valido": true, "numero": "9999123456", "tipoProbable": "nuip", "digitos": 10, "warnings": [] }`

#### Scenario: Resultado inválido con solo valido y motivo
- **WHEN** se valida `"9999"`
- **THEN** el resultado es exactamente `{ "valido": false, "motivo": "longitud-invalida" }`

### Requirement: NF-02 Función pura y total
El validador MUST ser puro: sin E/S, sin estado compartido, sin depender de la hora ni del entorno, y MUST devolver un resultado (nunca lanzar excepción) para cualquier cadena de entrada. Dos llamadas con los mismos argumentos MUST producir resultados profundamente iguales.

#### Scenario: Nunca lanza con cadenas arbitrarias
- **WHEN** se valida cualquier cadena generada por `fc.string({ unit: "binary" })` y por `fc.string()` de `fast-check` (al menos 1000 casos cada una)
- **THEN** ninguna llamada lanza excepción y cada resultado cumple la forma de NF-01

#### Scenario: Determinismo
- **WHEN** se valida dos veces `"9.999.123.456"`
- **THEN** ambos resultados son profundamente iguales

#### Scenario: Idempotencia de la normalización
- **WHEN** una entrada cualquiera produce un resultado válido con `numero` = N y se valida de nuevo N con el mismo tipo de documento
- **THEN** el segundo resultado es profundamente igual al primero

### Requirement: NF-03 Separadores admitidos
El validador SHALL eliminar, en cualquier posición, los separadores admitidos: punto `.`, guion `-` (U+002D) y todo carácter de la clase de espacio en blanco `\s` de JavaScript (incluye espacio, tabulador, saltos de línea y U+00A0). No MUST validar la posición ni la agrupación de los separadores, salvo la única excepción del guion final de NF-08.

#### Scenario: Puntos de miles
- **WHEN** se valida `"9.999.123.456"`
- **THEN** `valido` es `true`, `numero` es `"9999123456"` y `digitos` es `10`

#### Scenario: Espacios, guiones y espacio duro
- **WHEN** se validan `"9 999 123 456"`, `"9999-123-456"` y `"9 999 123 456"`
- **THEN** los tres resultados son `valido: true` con `numero` `"9999123456"`

#### Scenario: Espacio en blanco alrededor de la captura
- **WHEN** se valida `"  9999123456\n"`
- **THEN** `valido` es `true` y `numero` es `"9999123456"`

#### Scenario: Agrupación irregular no se valida
- **WHEN** se valida `"99.99-12 3456"`
- **THEN** `valido` es `true` y `numero` es `"9999123456"`

### Requirement: NF-04 Ceros a la izquierda
Tras eliminar separadores, el validador SHALL quitar todos los ceros a la izquierda. `numero` MUST NOT empezar por `0`, y la longitud y el tipo probable MUST calcularse sobre el número ya sin ceros.

#### Scenario: Ceros a la izquierda en un NUIP
- **WHEN** se valida `"0009999123456"`
- **THEN** el resultado es `{ "valido": true, "numero": "9999123456", "tipoProbable": "nuip", "digitos": 10, "warnings": [] }`

#### Scenario: Diez caracteres con cero inicial no son NUIP
- **WHEN** se valida `"0999912345"`
- **THEN** el resultado es `{ "valido": true, "numero": "999912345", "tipoProbable": "cedula-antigua", "digitos": 9, "warnings": [] }`

#### Scenario: Solo ceros
- **WHEN** se valida `"0.000.000"`
- **THEN** el resultado es `{ "valido": false, "motivo": "longitud-invalida" }`

### Requirement: NF-05 Rechazo de caracteres no admitidos
Si la entrada contiene cualquier carácter que no sea un dígito ASCII `0`-`9` ni un separador admitido, el validador MUST devolver `motivo` `"caracteres-invalidos"`, sin corregir el carácter (ni confusiones OCR como O->0 o I->1). Esta comprobación MUST tener prioridad sobre `"vacio"` y `"longitud-invalida"`.

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

### Requirement: NF-06 Entrada vacía
Si la entrada no contiene ningún dígito y solo contiene separadores admitidos (o es la cadena vacía), el validador MUST devolver `motivo` `"vacio"`.

#### Scenario: Cadena vacía
- **WHEN** se valida `""`
- **THEN** el resultado es `{ "valido": false, "motivo": "vacio" }`

#### Scenario: Solo separadores
- **WHEN** se validan `"   "` y `" .-. \t"`
- **THEN** ambos resultados son `{ "valido": false, "motivo": "vacio" }`

### Requirement: NF-07 Longitud y tipo probable para cédula de ciudadanía
Con el tipo de documento por defecto (cédula de ciudadanía), el validador SHALL aceptar números normalizados de 5 a 10 dígitos: 10 dígitos MUST dar `tipoProbable` `"nuip"` (equivale a valor mayor o igual a 1.000.000.000) y 5 a 9 dígitos MUST dar `"cedula-antigua"`. Cualquier otra longitud MUST dar `motivo` `"longitud-invalida"`. `warnings` MUST ser `[]`.

#### Scenario: Límite inferior aceptado
- **WHEN** se valida `"99991"`
- **THEN** el resultado es `{ "valido": true, "numero": "99991", "tipoProbable": "cedula-antigua", "digitos": 5, "warnings": [] }`

#### Scenario: Cuatro dígitos
- **WHEN** se valida `"9999"`
- **THEN** el resultado es `{ "valido": false, "motivo": "longitud-invalida" }`

#### Scenario: Nueve dígitos
- **WHEN** se valida `"999.912.345"`
- **THEN** el resultado es `{ "valido": true, "numero": "999912345", "tipoProbable": "cedula-antigua", "digitos": 9, "warnings": [] }`

#### Scenario: Diez dígitos es NUIP
- **WHEN** se valida `"9999123456"`
- **THEN** `tipoProbable` es `"nuip"` y `digitos` es `10`

#### Scenario: Once dígitos en cédula
- **WHEN** se valida `"99991234567"`
- **THEN** el resultado es `{ "valido": false, "motivo": "longitud-invalida" }`

### Requirement: NF-08 Sin dígito de control
El validador MUST NOT aplicar ningún dígito de control ni checksum (en particular, no el módulo 11 de la DIAN para NIT). Si la entrada, sin caracteres no admitidos, termina en un guion seguido de exactamente un dígito ASCII y opcionalmente espacio en blanco (expresión `/-[0-9]\s*$/`), MUST devolver `motivo` `"posible-digito-verificacion"` en lugar de absorber ese dígito.

#### Scenario: Cualquier último dígito es válido
- **WHEN** se validan los diez números `"9999123450"`, `"9999123451"`, ..., `"9999123459"` (difieren solo en el último dígito)
- **THEN** los diez resultados son `valido: true` con `tipoProbable` `"nuip"` y `numero` igual a la entrada

#### Scenario: Formato estilo NIT con guion se rechaza
- **WHEN** se validan `"999.912.345-6"`, `"999912345-6"` y `"999.912.345-6 "`
- **THEN** los tres resultados son `{ "valido": false, "motivo": "posible-digito-verificacion" }`

#### Scenario: Guion final seguido de más de un dígito es separador
- **WHEN** se valida `"9999-123-456"`
- **THEN** el resultado es `{ "valido": true, "numero": "9999123456", "tipoProbable": "nuip", "digitos": 10, "warnings": [] }`

#### Scenario: Guion final aislado es separador
- **WHEN** se valida `"9999123456-"`
- **THEN** `valido` es `true` y `numero` es `"9999123456"`

#### Scenario: Prioridad de caracteres inválidos sobre el patrón NIT
- **WHEN** se valida `"999A12345-6"`
- **THEN** el resultado es `{ "valido": false, "motivo": "caracteres-invalidos" }`

#### Scenario: Prioridad del patrón NIT sobre la longitud
- **WHEN** se valida `"99-6"`
- **THEN** el resultado es `{ "valido": false, "motivo": "posible-digito-verificacion" }`

### Requirement: NF-09 Tarjeta de identidad
El validador SHALL aceptar un tipo de documento opcional `"cc"` (por defecto) o `"ti"`. Con `"ti"` MUST aceptar solo 10 dígitos (`"nuip"`, `warnings` `[]`) u 11 dígitos (`"ti-antigua"`, `warnings` `["N01"]`, hipótesis pendiente de `docs/decisiones/hipotesis-formato.md`, ligada a H10 y M02); otra longitud MUST dar `"longitud-invalida"`. NF-03 a NF-06 y NF-08 aplican igual.

#### Scenario: Tarjeta de identidad de 10 dígitos
- **WHEN** se valida `"9999123456"` con tipo de documento `"ti"`
- **THEN** el resultado es `{ "valido": true, "numero": "9999123456", "tipoProbable": "nuip", "digitos": 10, "warnings": [] }`

#### Scenario: Tarjeta de identidad de 11 dígitos marca la hipótesis
- **WHEN** se valida `"99991234567"` con tipo de documento `"ti"`
- **THEN** el resultado es `{ "valido": true, "numero": "99991234567", "tipoProbable": "ti-antigua", "digitos": 11, "warnings": ["N01"] }`

#### Scenario: Patrón NIT también se rechaza en tarjeta de identidad
- **WHEN** se valida `"9999123456-7"` con tipo de documento `"ti"`
- **THEN** el resultado es `{ "valido": false, "motivo": "posible-digito-verificacion" }`

#### Scenario: Tarjeta de identidad corta
- **WHEN** se valida `"999912345"` con tipo de documento `"ti"`
- **THEN** el resultado es `{ "valido": false, "motivo": "longitud-invalida" }`

#### Scenario: Tarjeta de identidad de 12 dígitos
- **WHEN** se valida `"999912345678"` con tipo de documento `"ti"`
- **THEN** el resultado es `{ "valido": false, "motivo": "longitud-invalida" }`

#### Scenario: Tipo explícito cc equivale al defecto
- **WHEN** se valida `"99991"` con tipo de documento `"cc"` y sin tipo de documento
- **THEN** ambos resultados son profundamente iguales
