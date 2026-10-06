# Spec Delta

## Purpose

Leer de forma determinista y sin E/S la MRZ TD1 de la cédula digital colombiana a partir de las tres líneas de texto que entrega un OCR, validar sus cuatro dígitos de control ICAO 9303 y devolver campos normalizados, declarando como hipótesis (`docs/decisiones/hipotesis-formato.md`) cada parte del mapeo colombiano que aún no está confirmada. Según la evidencia de `docs/decisiones/2026-10-06-evidencia-hipotesis-formato.md`, M01 está confirmada, M02 confirmada con corrección (campo de 11 caracteres con un NUIP de 10 cifras y relleno) y M03 sigue pendiente (codificación DIVIPOL, pero sin saber si el lugar es de expedición o de nacimiento, y puede venir vacío).

Convenciones de los escenarios. Todos los datos son sintéticos (NUIP que empiezan por `9999`, nombres inventados) salvo la MRZ del espécimen ficticio anterior de la Registraduría que publica Eitol (MZ-20, persona ficticia, caso negativo). Las líneas se numeran 1, 2 y 3 y las columnas desde 0. Base sintética B:

- `B1` = `"ICCOL999900123816001<<<<<<<<<<"`
- `B2` = `"9007150F3407150COL9999123456<5"`
- `B3` = `"FICTICIO<EJEMPLO<<ANA<MARIA<<<"`
- `REF` = `{ "fechaReferencia": "2026-10-06" }`

"Se parsea B" es llamar al parser con `[B1, B2, B3]` y `REF`. "B con L2 = `x`" es `[B1, x, B3]` con `REF` (igual para L1 y L3). Si no se indican opciones, se usa `REF`. `R1` es el resultado completo de B dado en MZ-01; "R1 salvo `k`" significa profundamente igual a `R1` excepto en las claves indicadas. Una entrada `{ estado, leido, calculado }` de `digitosControl` se abrevia `[estado, leido, calculado]`, por ejemplo `["valido", "8", 8]`.

## ADDED Requirements

### Requirement: MZ-01 Forma del resultado
El parser SHALL devolver un objeto discriminado por `ok`. Con `ok: false` MUST contener exactamente `ok` y `motivo` (MZ-03), más `linea` (1, 2 o 3) solo con los motivos `entrada-demasiado-larga`, `caracteres-invalidos` y `longitud-linea-invalida`. Con `ok: true` MUST contener exactamente `ok`, `valido`, `campos`, `digitosControl`, `correcciones`, `errores`, `warnings` y `lineasCorregidas`, y `campos` MUST tener exactamente las 11 claves de R1.

#### Scenario: Cédula sintética válida completa (R1)
- **WHEN** se parsea B
- **THEN** el resultado es exactamente `{ "ok": true, "valido": true, "campos": { "serial": "999900123", "codigoLugarMrz": "16001", "fechaNacimiento": "1990-07-15", "sexo": "F", "fechaVencimiento": "2034-07-15", "nacionalidad": "COL", "nuip": "9999123456", "nuipTipoProbable": "nuip", "apellidos": "FICTICIO EJEMPLO", "nombres": "ANA MARIA", "nombresPosiblementeTruncados": false }, "digitosControl": { "serial": { "estado": "valido", "leido": "8", "calculado": 8 }, "nacimiento": { "estado": "valido", "leido": "0", "calculado": 0 }, "vencimiento": { "estado": "valido", "leido": "0", "calculado": 0 }, "compuesto": { "estado": "valido", "leido": "5", "calculado": 5 } }, "correcciones": [], "errores": [], "warnings": ["M03"], "lineasCorregidas": ["ICCOL999900123816001<<<<<<<<<<", "9007150F3407150COL9999123456<5", "FICTICIO<EJEMPLO<<ANA<MARIA<<<"] }`

#### Scenario: Rechazo de una línea concreta
- **WHEN** se parsea B con L3 = `"FICTICIO<EJEMPLO<<ANA<MARIA<<"` (29 caracteres)
- **THEN** el resultado es exactamente `{ "ok": false, "motivo": "longitud-linea-invalida", "linea": 3 }`

#### Scenario: Rechazo sin línea
- **WHEN** se parsea `[B1, B2]` con `REF`
- **THEN** el resultado es exactamente `{ "ok": false, "motivo": "numero-lineas-invalido" }`

### Requirement: MZ-02 Función pura y total
El parser MUST ser puro: sin E/S, sin estado compartido, sin leer la hora ni el entorno. MUST devolver un resultado con la forma de MZ-01, sin lanzar, para cualquier valor de JavaScript como líneas y como opciones, salvo objetos cuyos accesores o proxies lancen al leerse. Dos llamadas con los mismos argumentos MUST dar resultados profundamente iguales, y el parser MUST NOT modificar sus argumentos.

#### Scenario: Nunca lanza con valores arbitrarios
- **WHEN** se parsea cualquier valor generado por `fc.anything()` como líneas, con `REF` (al menos 1000 casos)
- **THEN** ninguna llamada lanza y cada resultado cumple la forma de MZ-01

#### Scenario: Nunca lanza con tres cadenas arbitrarias
- **WHEN** se parsean arrays de exactamente 3 cadenas generadas por `fc.string({ unit: "binary" })` y por `fc.string()` (al menos 1000 casos cada uno), con `REF`
- **THEN** ninguna llamada lanza y cada resultado cumple la forma de MZ-01

#### Scenario: Nunca lanza con opciones arbitrarias
- **WHEN** se parsea `[B1, B2, B3]` con opciones generadas por `fc.anything()` (al menos 1000 casos)
- **THEN** ninguna llamada lanza y cada resultado es exactamente `{ "ok": false, "motivo": "fecha-referencia-invalida" }` o tiene `ok: true` y `valido: true`

#### Scenario: Fuzz sobre MRZ válidas
- **WHEN** a MRZ válidas de `generarMrzTd1` con variante `"valida"` (MZ-21) se les sustituyen de 1 a 5 posiciones al azar por caracteres de `"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789< "` y se parsean (al menos 5000 casos)
- **THEN** ninguna llamada lanza y cada resultado cumple la forma de MZ-01

#### Scenario: Determinismo y argumentos intactos
- **WHEN** se parsea dos veces `Object.freeze([B1, B2, B3])` con `Object.freeze({ "fechaReferencia": "2026-10-06" })`
- **THEN** ninguna llamada lanza y ambos resultados son profundamente iguales a R1

### Requirement: MZ-03 Rechazo estructural y prioridad de motivos
El parser SHALL rechazar con `ok: false` y el primer motivo aplicable, en este orden: `entrada-no-valida` (no es un array o algún elemento no es string), `numero-lineas-invalido` (no tiene 3 elementos), `fecha-referencia-invalida` (MZ-04), `entrada-demasiado-larga` (alguna línea original supera 64 unidades UTF-16), `caracteres-invalidos` y `longitud-linea-invalida` (MZ-05) y `no-es-cedula-digital` (MZ-06). Cada motivo de línea revisa las líneas 1 a 3 en orden e informa la primera afectada.

#### Scenario: No es un array
- **WHEN** se parsean `"ICCOL999900123816001<<<<<<<<<<"` (una cadena) y `null`, con `REF`
- **THEN** ambos resultados son exactamente `{ "ok": false, "motivo": "entrada-no-valida" }`

#### Scenario: Elemento que no es cadena
- **WHEN** se parsea `[B1, B2, 3]` con `REF`
- **THEN** el resultado es exactamente `{ "ok": false, "motivo": "entrada-no-valida" }`

#### Scenario: Dos o cuatro líneas
- **WHEN** se parsean `[B1, B2]` y `[B1, B2, B3, ""]`, con `REF`
- **THEN** ambos resultados son exactamente `{ "ok": false, "motivo": "numero-lineas-invalido" }`

#### Scenario: Línea demasiado larga
- **WHEN** se parsea B con L2 = `"<".repeat(65)`
- **THEN** el resultado es exactamente `{ "ok": false, "motivo": "entrada-demasiado-larga", "linea": 2 }`

#### Scenario: La longitud máxima se revisa en todas las líneas antes que los caracteres
- **WHEN** se parsea `["Ñ", "<".repeat(65), B3]` con `REF`
- **THEN** el resultado es exactamente `{ "ok": false, "motivo": "entrada-demasiado-larga", "linea": 2 }`

#### Scenario: La fecha de referencia se revisa antes que las líneas
- **WHEN** se parsea `[B1, "<".repeat(65), B3]` sin opciones
- **THEN** el resultado es exactamente `{ "ok": false, "motivo": "fecha-referencia-invalida" }`

#### Scenario: Longitud antes que tipo de documento
- **WHEN** se parsea `["IDCOL999900123816001<<<<<<<<<<", B2, "FICTICIO<EJEMPLO<<ANA<MARIA<<"]` con `REF`
- **THEN** el resultado es exactamente `{ "ok": false, "motivo": "longitud-linea-invalida", "linea": 3 }`

### Requirement: MZ-04 Fecha de referencia explícita
`opciones.fechaReferencia` MUST ser una propiedad propia de tipo string con forma `AAAA-MM-DD`, una fecha que exista en el calendario gregoriano y un año entre 2000 y 2099. En cualquier otro caso, incluidas las opciones ausentes, el parser MUST devolver `{ "ok": false, "motivo": "fecha-referencia-invalida" }`. El parser MUST NOT usar la fecha del sistema.

#### Scenario: Opciones ausentes
- **WHEN** se parsea `[B1, B2, B3]` sin opciones y con opciones `{}`
- **THEN** ambos resultados son exactamente `{ "ok": false, "motivo": "fecha-referencia-invalida" }`

#### Scenario: Fechas de referencia inválidas
- **WHEN** se parsea `[B1, B2, B3]` con `fechaReferencia` igual a `"2026-02-30"`, `"2026-10-6"`, `"06/10/2026"`, `"1999-12-31"`, `"2100-01-01"`, `" 2026-10-06"` y `20261006` (número)
- **THEN** los siete resultados son exactamente `{ "ok": false, "motivo": "fecha-referencia-invalida" }`

#### Scenario: Propiedad heredada
- **WHEN** se parsea `[B1, B2, B3]` con opciones `Object.create({ "fechaReferencia": "2026-10-06" })`
- **THEN** el resultado es exactamente `{ "ok": false, "motivo": "fecha-referencia-invalida" }`

#### Scenario: Límites admitidos
- **WHEN** se parsea `[B1, B2, B3]` con `fechaReferencia` igual a `"2000-02-29"` y a `"2099-12-31"`
- **THEN** ambos resultados tienen `ok: true` y `valido: true`

### Requirement: MZ-05 Normalización y alfabeto MRZ
Antes de validar, el parser SHALL eliminar de cada línea, en cualquier posición, los caracteres U+0020, U+0009, U+000D y U+000A, y pasar a mayúsculas solo las letras ASCII `a` a `z`. Si luego una línea tiene un carácter fuera de `A`-`Z`, `0`-`9` y `<`, MUST rechazar con `caracteres-invalidos`; si una línea no mide 30, con `longitud-linea-invalida`. La normalización MUST NOT registrarse en `correcciones`.

#### Scenario: Espacios, saltos y minúsculas del OCR
- **WHEN** se parsea `[" iccol999900123816001<<<<<<<<<<\r\n", "9007150F 3407150COL 9999123456<5", "FICTICIO<EJEMPLO<<ANA<MARIA<<<\t"]` con `REF`
- **THEN** el resultado es profundamente igual a R1

#### Scenario: Ñ en el nombre
- **WHEN** se parsea B con L3 = `"PEÑA<FICTICIO<<ANA<<<<<<<<<<<<"`
- **THEN** el resultado es exactamente `{ "ok": false, "motivo": "caracteres-invalidos", "linea": 3 }`

#### Scenario: Relleno leído como comillas angulares o espacio duro
- **WHEN** se parsean B con L1 = `"ICCOL999900123816001<<<<<<<<<«"` y B con L1 = `"ICCOL999900123816001<<<<<<<<< "` (el último carácter es U+00A0)
- **THEN** ambos resultados son exactamente `{ "ok": false, "motivo": "caracteres-invalidos", "linea": 1 }`

#### Scenario: Línea de 31 caracteres
- **WHEN** se parsea B con L1 = `"ICCOL999900123816001<<<<<<<<<<<"`
- **THEN** el resultado es exactamente `{ "ok": false, "motivo": "longitud-linea-invalida", "linea": 1 }`

### Requirement: MZ-06 Identificación de la cédula digital
El parser SHALL exigir que la línea 1 empiece por `IC` y que sus columnas 2 a 4, tras cambiar cada `0` por `O`, sean `COL`; en otro caso MUST rechazar con `no-es-cedula-digital`. Cada `0` cambiado en esas columnas MUST registrarse en `correcciones`.

#### Scenario: Otro tipo de documento u otro país
- **WHEN** se parsean B con L1 = `"IDCOL999900123816001<<<<<<<<<<"`, B con L1 = `"ICVEN999900123816001<<<<<<<<<<"` y B con L1 = `"I<COL999900123816001<<<<<<<<<<"`
- **THEN** los tres resultados son exactamente `{ "ok": false, "motivo": "no-es-cedula-digital" }`

#### Scenario: Espécimen TD1 de ICAO
- **WHEN** se parsea `["I<UTOD231458907<<<<<<<<<<<<<<<", "7408122F1204159UTO<<<<<<<<<<<6", "ERIKSSON<<ANNA<MARIA<<<<<<<<<<"]` con `REF`
- **THEN** el resultado es exactamente `{ "ok": false, "motivo": "no-es-cedula-digital" }`

#### Scenario: País emisor C0L
- **WHEN** se parsea B con L1 = `"ICC0L999900123816001<<<<<<<<<<"`
- **THEN** el resultado es R1 salvo `correcciones`, que es exactamente `[{ "linea": 1, "columna": 3, "original": "0", "corregido": "O" }]`

### Requirement: MZ-07 Corrección OCR-B solo en zonas numéricas
El parser SHALL cambiar `O` y `Q` por `0`, `I` por `1`, `Z` por `2`, `S` por `5`, `G` por `6` y `B` por `8` solo en las zonas numéricas: línea 1 columnas 5 a 14, línea 2 columnas 0 a 6, 8 a 14 y 18 a 29, y línea 1 columnas 15 a 19 según MZ-11. Otros caracteres MUST NOT cambiarse ahí, y fuera de esas zonas nada se corrige salvo MZ-06 y MZ-15. Cada cambio MUST registrarse en `correcciones` como `{ linea, columna, original, corregido }`, por línea y columna.

#### Scenario: Confusiones OCR-B en todas las zonas numéricas
- **WHEN** se parsea `["ICCOL9999OO123BI6001<<<<<<<<<<", "9Q071S0F3407I50C0L99991Z345G<S", B3]` con `REF`
- **THEN** el resultado es R1 salvo `correcciones`, que es exactamente `[{ "linea": 1, "columna": 9, "original": "O", "corregido": "0" }, { "linea": 1, "columna": 10, "original": "O", "corregido": "0" }, { "linea": 1, "columna": 14, "original": "B", "corregido": "8" }, { "linea": 1, "columna": 15, "original": "I", "corregido": "1" }, { "linea": 2, "columna": 1, "original": "Q", "corregido": "0" }, { "linea": 2, "columna": 5, "original": "S", "corregido": "5" }, { "linea": 2, "columna": 12, "original": "I", "corregido": "1" }, { "linea": 2, "columna": 16, "original": "0", "corregido": "O" }, { "linea": 2, "columna": 23, "original": "Z", "corregido": "2" }, { "linea": 2, "columna": 27, "original": "G", "corregido": "6" }, { "linea": 2, "columna": 29, "original": "S", "corregido": "5" }]`

#### Scenario: Letras confundibles en los nombres no se tocan
- **WHEN** se parsea B con L3 = `"BOZGIS<QUIROS<<SOL<<<<<<<<<<<<"`
- **THEN** `ok` es `true`, `valido` es `true`, `campos.apellidos` es `"BOZGIS QUIROS"`, `campos.nombres` es `"SOL"` y `correcciones` es `[]`

#### Scenario: Letra fuera de la tabla en una zona numérica
- **WHEN** se parsea B con L1 = `"ICCOL99990012X816001<<<<<<<<<<"` (la `X` vale 33 y no la detecta ningún dígito de control)
- **THEN** `campos.serial` es `null`, `errores` es `["serial-invalido"]`, `digitosControl.serial` es `["valido", "8", 8]`, `digitosControl.compuesto` es `["valido", "5", 5]`, `correcciones` es `[]` y `valido` es `false`

#### Scenario: Propiedad de inyección de confusiones OCR-B
- **WHEN** en MRZ válidas de `generarMrzTd1` con variante `"valida"` (MZ-21) se sustituye un subconjunto no vacío de dígitos de las zonas numéricas por una letra confundible (`0` por `O` o `Q`, `1` por `I`, `2` por `Z`, `5` por `S`, `6` por `G`, `8` por `B`) y se parsean (al menos 1000 casos)
- **THEN** `campos`, `digitosControl`, `valido` y `lineasCorregidas` son iguales a los de la MRZ sin sustituir, y `correcciones` lista exactamente las posiciones sustituidas

### Requirement: MZ-08 Cálculo del dígito de control ICAO 9303
El paquete SHALL exportar el cálculo del dígito de control ICAO 9303: `0`-`9` valen su cifra, `A`-`Z` valen 10 a 35, `<` vale 0, los valores se multiplican por los pesos 7, 3, 1 repetidos y se suma módulo 10. Si la entrada no es un string o tiene un carácter fuera de `0`-`9`, `A`-`Z` y `<`, MUST devolver `null` sin lanzar.

#### Scenario: Ejemplos de ICAO Doc 9303
- **WHEN** se calcula el dígito de `"D23145890"`, `"740812"`, `"120415"` y `"L898902C3"`
- **THEN** los resultados son `7`, `2`, `9` y `6`

#### Scenario: Relleno y cadena vacía
- **WHEN** se calcula el dígito de `"<<<<<<<<<"`, `""` y `"999900123"`
- **THEN** los resultados son `0`, `0` y `8`

#### Scenario: Entradas fuera del alfabeto
- **WHEN** se calcula el dígito de `"99990012x"`, `"Ñ"`, `"9 9"` y `42` (número)
- **THEN** los cuatro resultados son `null`

#### Scenario: Toda sustitución de una cifra cambia el dígito
- **WHEN** en cualquier cadena de 1 a 30 cifras se sustituye una cifra por otra distinta (al menos 1000 casos)
- **THEN** el dígito de control calculado cambia

#### Scenario: El relleno final no cambia el dígito
- **WHEN** a cualquier cadena del alfabeto MRZ de 0 a 27 caracteres se le añaden de 1 a 3 `<` al final (al menos 1000 casos)
- **THEN** el dígito de control calculado no cambia

### Requirement: MZ-09 Los cuatro dígitos de control
`digitosControl` SHALL tener `serial` (datos línea 1 col. 5-13, dígito col. 14), `nacimiento` (línea 2 col. 0-5, dígito col. 6), `vencimiento` (línea 2 col. 8-13, dígito col. 14) y `compuesto` (línea 1 col. 5-29 + línea 2 col. 0-6, 8-14 y 18-28, dígito línea 2 col. 29), cada uno `{ estado, leido, calculado }` sobre `lineasCorregidas`. `estado` MUST ser `valido` o `invalido` si `leido` es una cifra, `ilegible` si no, y `ausente` solo según MZ-10.

#### Scenario: Dígito del serial alterado
- **WHEN** se parsea B con L1 = `"ICCOL999900123716001<<<<<<<<<<"`
- **THEN** `digitosControl` es `{ serial: ["invalido", "7", 8], nacimiento: ["valido", "0", 0], vencimiento: ["valido", "0", 0], compuesto: ["invalido", "5", 8] }` y `valido` es `false`

#### Scenario: Dígito de nacimiento alterado
- **WHEN** se parsea B con L2 = `"9007151F3407150COL9999123456<5"`
- **THEN** `digitosControl` es `{ serial: ["valido", "8", 8], nacimiento: ["invalido", "1", 0], vencimiento: ["valido", "0", 0], compuesto: ["invalido", "5", 8] }` y `valido` es `false`

#### Scenario: Dígito de vencimiento alterado
- **WHEN** se parsea B con L2 = `"9007150F3407151COL9999123456<5"`
- **THEN** `digitosControl` es `{ serial: ["valido", "8", 8], nacimiento: ["valido", "0", 0], vencimiento: ["invalido", "1", 0], compuesto: ["invalido", "5", 6] }` y `valido` es `false`

#### Scenario: Dígito compuesto alterado
- **WHEN** se parsea B con L2 = `"9007150F3407150COL9999123456<6"`
- **THEN** `digitosControl` es `{ serial: ["valido", "8", 8], nacimiento: ["valido", "0", 0], vencimiento: ["valido", "0", 0], compuesto: ["invalido", "6", 5] }`, `valido` es `false` y `campos` es igual a `R1.campos`

#### Scenario: Dígito ilegible
- **WHEN** se parsea B con L1 = `"ICCOL999900123X16001<<<<<<<<<<"`
- **THEN** `digitosControl.serial` es `["ilegible", "X", 8]`, `digitosControl.compuesto` es `["invalido", "5", 0]` y `valido` es `false`

#### Scenario: Propiedad de alteración de cada dígito de control
- **WHEN** en MRZ válidas de `generarMrzTd1` con variante `"valida"` (MZ-21) se cambia el dígito de una de las 4 posiciones por cualquier otra cifra (al menos 1000 casos por posición)
- **THEN** ese dígito tiene estado `invalido`, `compuesto` tiene estado `invalido`, los demás dígitos tienen estado `valido` y `valido` es `false`

#### Scenario: Propiedad de sustitución de una cifra de datos
- **WHEN** en MRZ válidas de `generarMrzTd1` con variante `"valida"` (MZ-21) se cambia una cifra de datos de las columnas cubiertas por algún dígito de control (línea 1 col. 5-13 y 15-19, línea 2 col. 0-5, 8-13 y 18-28) por otra cifra distinta (al menos 1000 casos)
- **THEN** `valido` es `false`

#### Scenario: Oráculo diferencial con la librería mrz
- **WHEN** se parsean MRZ válidas del generador y sus variantes del escenario de fuzz de MZ-02 cuyo resultado tiene `ok: true` y cuya línea 1 col. 14 es una cifra (al menos 1000 casos), y se pasan sus `lineasCorregidas` a `parse` de `mrz` 5.0.2
- **THEN** para cada uno de los 4 dígitos, `estado === "valido"` coincide con `valid` del campo correspondiente de `mrz` (`documentNumberCheckDigit`, `birthDateCheckDigit`, `expirationDateCheckDigit`, `compositeCheckDigit`)

### Requirement: MZ-10 Serial del documento
El parser SHALL devolver en `campos.serial` las columnas 5 a 13 corregidas de la línea 1, conservando los ceros a la izquierda, si son 9 cifras; si no, `null` y el error `serial-invalido`. Si la columna 14 es `<`, el dígito del serial MUST tener estado `ausente`, `leido` `"<"` y `calculado` el valor ICAO de las columnas 5 a 13. Sigue M01 (confirmada).

#### Scenario: Serial con ceros a la izquierda
- **WHEN** se parsea `["ICCOL000000012516001<<<<<<<<<<", "9007150F3407150COL9999123456<1", B3]` con `REF`
- **THEN** `campos.serial` es `"000000012"`, `digitosControl.serial` es `["valido", "5", 5]` y `valido` es `true`

#### Scenario: Dígito del serial ausente
- **WHEN** se parsea `["ICCOL999900123<16001<<<<<<<<<<", "9007150F3407150COL9999123456<9", B3]` con `REF`
- **THEN** `digitosControl.serial` es `["ausente", "<", 8]`, `digitosControl.compuesto` es `["valido", "9", 9]`, `campos.serial` es `"999900123"` y `valido` es `true`

### Requirement: MZ-11 Código de lugar en el opcional de la línea 1
Si las columnas 15 a 19 de la línea 1, tras la corrección OCR-B, son 5 cifras y las columnas 20 a 29 son todas `<`, el parser SHALL devolver `campos.codigoLugarMrz` = las 5 cifras crudas, sin traducirlas (DIVIPOL; expedición o nacimiento sin decidir, M03), conservar esas correcciones y emitir `M03`. En otro caso MUST devolver `null`, MUST NOT corregir las columnas 15 a 19, MUST NOT emitir `M03` y MUST NOT añadir un error.

#### Scenario: Código de lugar presente
- **WHEN** se parsea B
- **THEN** `campos.codigoLugarMrz` es `"16001"` y `warnings` contiene `"M03"`

#### Scenario: Opcional vacío
- **WHEN** se parsea B con L1 = `"ICCOL9999001238<<<<<<<<<<<<<<<"`
- **THEN** `campos.codigoLugarMrz` es `null`, `warnings` es `[]` y `valido` es `true`

#### Scenario: Opcional con letra no corregible
- **WHEN** se parsea `["ICCOL9999001238I6A01<<<<<<<<<<", "9007150F3407150COL9999123456<6", B3]` con `REF`
- **THEN** `campos.codigoLugarMrz` es `null`, `correcciones` es `[]`, `lineasCorregidas[0]` es `"ICCOL9999001238I6A01<<<<<<<<<<"`, `warnings` es `[]` y `valido` es `true`

#### Scenario: Opcional corregible
- **WHEN** se parsea B con L1 = `"ICCOL9999001238I600I<<<<<<<<<<"`
- **THEN** `campos.codigoLugarMrz` es `"16001"`, `correcciones` es exactamente `[{ "linea": 1, "columna": 15, "original": "I", "corregido": "1" }, { "linea": 1, "columna": 19, "original": "I", "corregido": "1" }]`, `lineasCorregidas[0]` es `B1` y `valido` es `true`

#### Scenario: Resto del opcional no vacío
- **WHEN** se parsea `["ICCOL999900123816001<<<<<<<<<X", "9007150F3407150COL9999123456<6", B3]` con `REF`
- **THEN** `campos.codigoLugarMrz` es `null`, `warnings` es `[]` y `valido` es `true`

### Requirement: MZ-12 NUIP en el opcional de la línea 2
El parser SHALL tomar como NUIP (M02, confirmada con corrección) la serie inicial sin `<` de las columnas 18 a 28 corregidas de la línea 2, que MUST ir seguida solo de `<`. Si `validarFormatoNuip` la acepta con tipo `cc`, `campos.nuip` y `campos.nuipTipoProbable` MUST ser su `numero` y su `tipoProbable`; si no, ambos `null` y el error `nuip-invalido`. MUST NOT validarla con tipo `ti`: ninguna fuente muestra un número de 11 cifras en una MRZ.

#### Scenario: NUIP de 10 cifras
- **WHEN** se parsea B
- **THEN** `campos.nuip` es `"9999123456"` y `campos.nuipTipoProbable` es `"nuip"`

#### Scenario: Número de 11 cifras rechazado
- **WHEN** se parsea B con L2 = `"9007150F3407150COL999912345676"`
- **THEN** `campos.nuip` y `campos.nuipTipoProbable` son `null`, `errores` es `["nuip-invalido"]`, `digitosControl.compuesto` es `["valido", "6", 6]`, `warnings` es `["M03"]` y `valido` es `false`

#### Scenario: Cero a la izquierda
- **WHEN** se parsea B con L2 = `"9007150F3407150COL099991234565"`
- **THEN** `campos.nuip` es `"9999123456"` y `campos.nuipTipoProbable` es `"nuip"`

#### Scenario: Cédula antigua de 8 cifras
- **WHEN** se parsea B con L2 = `"9007150F3407150COL99991234<<<8"`
- **THEN** `campos.nuip` es `"99991234"`, `campos.nuipTipoProbable` es `"cedula-antigua"` y `valido` es `true`

#### Scenario: NUIP corto, vacío o con hueco
- **WHEN** se parsean B con L2 = `"9007150F3407150COL9999<<<<<<<0"`, B con L2 = `"9007150F3407150COL<<<<<<<<<<<8"` y B con L2 = `"9007150F3407150COL99991234<561"`
- **THEN** en los tres `campos.nuip` y `campos.nuipTipoProbable` son `null`, `errores` es `["nuip-invalido"]`, `digitosControl.compuesto` tiene estado `valido` y `valido` es `false`

### Requirement: MZ-13 Fechas con regla de siglo explícita
El parser SHALL convertir nacimiento (línea 2 col. 0-5) y vencimiento (col. 8-13), en AAMMDD, a `AAAA-MM-DD`. Nacimiento MUST ser `20AA` si esa fecha es menor o igual a `fechaReferencia` y `19AA` si no; vencimiento MUST ser siempre `20AA`. Si no son 6 cifras o la fecha no existe, MUST dar `null` y el error `fecha-nacimiento-invalida` o `fecha-vencimiento-invalida`. MUST NOT juzgar si el documento está vencido.

#### Scenario: Nacimiento en el siglo XX y en el XXI
- **WHEN** se parsean B y B con L2 = `"0403151F3407150COL9999123456<3"`
- **THEN** `campos.fechaNacimiento` es `"1990-07-15"` y `"2004-03-15"`

#### Scenario: Frontera de la fecha de referencia
- **WHEN** se parsean B con L2 = `"2610069F3407150COL9999123456<9"` y B con L2 = `"2610070F3407150COL9999123456<9"`
- **THEN** `campos.fechaNacimiento` es `"2026-10-06"` y `"1926-10-07"`

#### Scenario: La fecha de referencia decide el siglo
- **WHEN** se parsea `[B1, B2, B3]` con `fechaReferencia` `"2090-07-14"` y con `"2090-07-15"`
- **THEN** `campos.fechaNacimiento` es `"1990-07-15"` y `"2090-07-15"`

#### Scenario: Año bisiesto y fecha inexistente
- **WHEN** se parsean B con L2 = `"0002299F3407150COL9999123456<9"` y B con L2 = `"9002306F3407150COL9999123456<5"`
- **THEN** el primero da `campos.fechaNacimiento` `"2000-02-29"` y `valido` `true`; el segundo da `campos.fechaNacimiento` `null`, `errores` `["fecha-nacimiento-invalida"]`, `digitosControl.nacimiento` `["valido", "6", 6]` y `valido` `false`

#### Scenario: Vencimiento siempre en el siglo XXI y sin juicio de vigencia
- **WHEN** se parsean B, B con L2 = `"9007150F9901018COL9999123456<9"` y B con L2 = `"9007150F2001012COL9999123456<3"`
- **THEN** `campos.fechaVencimiento` es `"2034-07-15"`, `"2099-01-01"` y `"2020-01-01"`, y los tres tienen `valido` `true`

#### Scenario: Vencimiento inexistente
- **WHEN** se parsea B con L2 = `"9007150F3402317COL9999123456<9"`
- **THEN** `campos.fechaVencimiento` es `null`, `errores` es `["fecha-vencimiento-invalida"]` y `valido` es `false`

### Requirement: MZ-14 Sexo
El parser SHALL leer el sexo solo de la columna 7 de la línea 2 y sin corrección OCR: `M` da `"M"`, `F` da `"F"`, y `X` o `<` dan `"X"` (no especificado en ICAO 9303). Cualquier otro carácter MUST dar `null` y el error `sexo-invalido`. El sexo MUST NOT inferirse de ninguna otra posición.

#### Scenario: Masculino, no especificado e inválido
- **WHEN** se parsean B con L2 = `"9007150M3407150COL9999123456<5"`, `"9007150<3407150COL9999123456<5"`, `"9007150X3407150COL9999123456<5"`, `"9007150H3407150COL9999123456<5"` y `"9007150O3407150COL9999123456<5"`
- **THEN** `campos.sexo` es `"M"`, `"X"`, `"X"`, `null` y `null`; los dos últimos tienen `errores` `["sexo-invalido"]` y `correcciones` `[]`

#### Scenario: Apellido con M y sexo femenino
- **WHEN** se parsea B con L3 = `"MUESTRA<MODELO<<MARIA<<<<<<<<<"`
- **THEN** `campos.sexo` es `"F"` y `campos.apellidos` es `"MUESTRA MODELO"`

### Requirement: MZ-15 Nacionalidad
El parser SHALL devolver `campos.nacionalidad` `"COL"` si las columnas 15 a 17 de la línea 2, tras cambiar cada `0` por `O`, son `COL`, registrando cada cambio en `correcciones`. En otro caso MUST devolver `null`, añadir el error `nacionalidad-invalida` y MUST NOT registrar correcciones en esas columnas.

#### Scenario: Nacionalidad leída como C0L
- **WHEN** se parsea B con L2 = `"9007150F3407150C0L9999123456<5"`
- **THEN** el resultado es R1 salvo `correcciones`, que es exactamente `[{ "linea": 2, "columna": 16, "original": "0", "corregido": "O" }]`

#### Scenario: Otra nacionalidad
- **WHEN** se parsean B con L2 = `"9007150F3407150VEN9999123456<5"` y B con L2 = `"9007150F3407150CO19999123456<5"`
- **THEN** en ambos `campos.nacionalidad` es `null`, `errores` es `["nacionalidad-invalida"]`, `correcciones` es `[]` y `valido` es `false`

### Requirement: MZ-16 Apellidos y nombres
El parser SHALL leer la línea 3 sin corrección OCR: quitar los `<` finales, partir en el primer `<<` y devolver `apellidos` (antes) y `nombres` (después, o `""` si no hay `<<`), cambiando cada serie de `<` por un espacio. `nombresPosiblementeTruncados` MUST ser `true` si y solo si la columna 29 no es `<`. Si la línea 3 tiene una cifra, MUST añadir el error `nombre-no-alfabetico` sin alterar el texto. MUST NOT separar primer y segundo apellido.

#### Scenario: Apellido compuesto con un solo separador
- **WHEN** se parsea B con L3 = `"DE<LA<OSSA<FICTICIO<<ANA<<<<<<"`
- **THEN** `campos.apellidos` es `"DE LA OSSA FICTICIO"`, `campos.nombres` es `"ANA"` y `valido` es `true`

#### Scenario: Nombres truncados
- **WHEN** se parsea B con L3 = `"FICTICIO<EJEMPLO<<MARIA<FERNAN"`
- **THEN** `campos.nombres` es `"MARIA FERNAN"`, `campos.nombresPosiblementeTruncados` es `true` y `valido` es `true`

#### Scenario: Solo apellido
- **WHEN** se parsea B con L3 = `"FICTICIO<<<<<<<<<<<<<<<<<<<<<<"`
- **THEN** `campos.apellidos` es `"FICTICIO"`, `campos.nombres` es `""` y `campos.nombresPosiblementeTruncados` es `false`

#### Scenario: Cifra en el nombre
- **WHEN** se parsea B con L3 = `"FICTICI0<EJEMPLO<<ANA<MARIA<<<"`
- **THEN** `campos.apellidos` es `"FICTICI0 EJEMPLO"`, `correcciones` es `[]`, `errores` es `["nombre-no-alfabetico"]` y `valido` es `false`

### Requirement: MZ-17 Errores de campo y validez global
`errores` SHALL listar sin repetir, en este orden, los códigos que apliquen de `serial-invalido`, `fecha-nacimiento-invalida`, `sexo-invalido`, `fecha-vencimiento-invalida`, `nacionalidad-invalida`, `nuip-invalido` y `nombre-no-alfabetico`. `valido` MUST ser `true` si y solo si `errores` está vacío, nacimiento, vencimiento y compuesto tienen estado `valido` y el serial `valido` o `ausente`. Los campos MUST devolverse aunque `valido` sea `false`.

#### Scenario: Varios errores en orden fijo
- **WHEN** se parsea `[B1, "9002306H3407150VEN9999<<<<<<<0", "FICTICI0<EJEMPLO<<ANA<MARIA<<<"]` con `REF`
- **THEN** `errores` es exactamente `["fecha-nacimiento-invalida", "sexo-invalido", "nacionalidad-invalida", "nuip-invalido", "nombre-no-alfabetico"]`, los cuatro dígitos de control tienen estado `valido` y `valido` es `false`

### Requirement: MZ-18 Warnings de hipótesis
Con `ok: true`, `warnings` SHALL ser `["M03"]` si `codigoLugarMrz` no es `null` y `[]` en otro caso. MUST NOT contener ningún otro ID (M01 y M02 están confirmadas; M04, M05 y D05 no afectan a la lectura; N01 no aplica porque MZ-12 no admite 11 cifras).

#### Scenario: Warnings por caso
- **WHEN** se parsean B, B con L1 = `"ICCOL9999001238<<<<<<<<<<<<<<<"` y B con L2 = `"9007150F3407150COL999912345676"`
- **THEN** `warnings` es `["M03"]`, `[]` y `["M03"]`

### Requirement: MZ-19 Sin RH ni QR
El resultado MUST NOT contener RH ni ningún dato del QR o del chip, y el paquete MUST NOT exportar ninguna función que decodifique el QR de la cédula digital (principio V: está cifrado por la Registraduría).

#### Scenario: El resultado no trae RH
- **WHEN** se parsea B
- **THEN** ninguna clave de `campos` es `rh`, `RH`, `grupoSanguineo` ni contiene `qr` sin distinguir mayúsculas

#### Scenario: Ningún export de QR
- **WHEN** se enumeran los nombres exportados por el paquete `@lector-cedula/parsers`
- **THEN** ninguno contiene `qr` sin distinguir mayúsculas

### Requirement: MZ-20 Casos de referencia públicos como negativos
El parser SHALL extraer los campos de la MRZ del espécimen ficticio anterior publicada por Eitol y de una MRZ sintética con la forma del espécimen actual `back-ccd.png` (M04 confirmada con corrección: dígito del serial `<`, opcional de la línea 1 vacío, NUIP de 10 cifras y relleno, compuesto impreso 9 y calculado 8), y en ambos `valido` MUST ser `false` por sus dígitos de control. Ninguno MUST usarse como fixture positivo.

#### Scenario: Espécimen anterior publicado por Eitol
- **WHEN** se parsea `["ICCOL000000012305001<<<<<<<<<<", "0403151F3203190C0L1234567890<0", "WALTEROS<<LAURA<<<<<<<<<<<<<<<"]` con `REF`
- **THEN** `campos` es exactamente `{ "serial": "000000012", "codigoLugarMrz": "05001", "fechaNacimiento": "2004-03-15", "sexo": "F", "fechaVencimiento": "2032-03-19", "nacionalidad": "COL", "nuip": "1234567890", "nuipTipoProbable": "nuip", "apellidos": "WALTEROS", "nombres": "LAURA", "nombresPosiblementeTruncados": false }`, `digitosControl` es `{ serial: ["invalido", "3", 5], nacimiento: ["valido", "1", 1], vencimiento: ["valido", "0", 0], compuesto: ["invalido", "0", 5] }`, `correcciones` es `[{ "linea": 2, "columna": 16, "original": "0", "corregido": "O" }]`, `errores` es `[]` y `valido` es `false`

#### Scenario: Compuesto con la forma del espécimen back-ccd.png
- **WHEN** se parsea `["ICCOL999900123<<<<<<<<<<<<<<<<", "9007150F3407150COL9999123453<9", B3]` con `REF`
- **THEN** `digitosControl` es `{ serial: ["ausente", "<", 8], nacimiento: ["valido", "0", 0], vencimiento: ["valido", "0", 0], compuesto: ["invalido", "9", 8] }`, `campos.codigoLugarMrz` es `null`, `campos.nuip` es `"9999123453"`, `errores` es `[]`, `warnings` es `[]` y `valido` es `false`

### Requirement: MZ-21 Ida y vuelta con el generador sintético
Para toda MRZ que `generarMrzTd1` de `@lector-cedula/fixtures` (cambio `generador-fixtures-sinteticos`, contrato `VERSION_CONTRATO` 1.x) produce con variante `"valida"` a partir de una persona ficticia, parseada con `REF`, el parser SHALL devolver `ok: true`, `valido: true`, `correcciones` y `errores` vacíos y `campos` igual a la traducción de `esperado` del generador según la tabla de la decisión 11 de design.md.

#### Scenario: Persona base del generador
- **WHEN** se parsea `generarMrzTd1(PERSONA_BASE).lineas`, es decir `["ICCOL999912345516001<<<<<<<<<<", "8503149F3503144COL9999123456<5", "PRUEBA<EJEMPLO<<FICTICIA<LUZ<<"]`, con `REF`
- **THEN** `campos` es exactamente `{ "serial": "999912345", "codigoLugarMrz": "16001", "fechaNacimiento": "1985-03-14", "sexo": "F", "fechaVencimiento": "2035-03-14", "nacionalidad": "COL", "nuip": "9999123456", "nuipTipoProbable": "nuip", "apellidos": "PRUEBA EJEMPLO", "nombres": "FICTICIA LUZ", "nombresPosiblementeTruncados": false }` y `valido` es `true`

#### Scenario: Propiedad de ida y vuelta
- **WHEN** se toman al menos 1000 personas de `arbPersonaFicticia()` con `fechaNacimiento` sustituida por una fecha entre `1926-10-07` y `2026-10-06` y `fechaVencimiento` por una entre `2000-01-01` y `2099-12-31`, se generan con `generarMrzTd1(persona, { variante: "valida" })`, descartando solo las rechazadas con `nombre-excede-mrz`, y se parsean con `REF`
- **THEN** cada resultado tiene `ok: true`, `valido: true`, `correcciones: []`, `errores: []` y `campos` igual a la traducción de `esperado`, y los casos descartados son menos del 50 %

#### Scenario: Variantes del generador con dígitos alterados o de relleno
- **WHEN** se parsean con `REF` al menos 1000 casos de `arbFixtureMrz({ variantes: ["cd-documento-alterado", "cd-nacimiento-alterado", "cd-vencimiento-alterado", "cd-compuesto-alterado", "cd-documento-relleno"] })` cuyas fechas cumplen los rangos del escenario anterior
- **THEN** el `estado` de cada dígito es el de `esperado.digitosControl` traducido (`documento` es `serial`, `relleno` es `ausente`), y `valido` es `false` en las variantes `cd-*-alterado` y `true` en `cd-documento-relleno`

#### Scenario: Variante OCR-B del generador
- **WHEN** se parsean con `REF` al menos 1000 casos de `arbFixtureMrz({ variantes: ["ocr-b"] })` cuyas fechas cumplen los rangos de la ida y vuelta
- **THEN** `campos`, `digitosControl` y `valido` son iguales a los de parsear `lineasSinErrores`, `lineasCorregidas` es igual a `lineasSinErrores`, y `correcciones` es exactamente `inyecciones` ordenadas por línea y posición y traducidas a `{ linea, columna: posicion, original: inyectado, corregido: original }`

#### Scenario: Cobertura medida de la ida y vuelta
- **WHEN** se ejecuta la propiedad de ida y vuelta contando cada categoría con `fc.statistics` o contadores
- **THEN** cada categoría aparece en al menos el 5 % de los casos: sexo `M`, sexo `F`, nacimiento `19AA`, nacimiento `20AA`, segundo nombre vacío y apellidos de 3 o más palabras

### Requirement: MZ-22 Evals por campo
El parser SHALL registrarse en las evals como tipo `mrz-cedula-digital`, con fixtures sintéticos que cubran al menos los escenarios literales de MZ-06, MZ-07, MZ-09, MZ-11, MZ-12, MZ-13, MZ-16 y MZ-20, y `npm run eval:quick` MUST reportar para ese tipo exact match 1 y CER 0 en cada campo, sin excepciones.

#### Scenario: Eval rápida del tipo
- **WHEN** se ejecuta `npm run eval:quick`
- **THEN** `evals/reports/latest.json` contiene `metricas["mrz-cedula-digital"]`, cada campo tiene `exact_match` 1 y `cer` 0, `n` del campo `valido` es al menos 20 y `excepciones` es 0
