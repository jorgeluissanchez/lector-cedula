# Delta de divipol

## Purpose

Traducir los códigos de lugar de 5 dígitos de la Registraduría (DIVIPOL) que aparecen en la cédula a departamento y municipio, con una tabla trazable a una fuente versionada, y ofrecer su equivalencia con DIVIPOLA del DANE sin mezclar ambos sistemas.

## ADDED Requirements

### Requirement: DV-01 Entrada estricta de cinco dígitos
`buscarDivipol(codigo)` MUST aceptar como código válido únicamente un valor de tipo `string` compuesto por exactamente 5 dígitos ASCII (`0`-`9`). Cualquier otro valor SHALL producir `{ encontrado: false, codigo: null, motivo: "formato-invalido", warnings: [] }`, sin recortar, rellenar ni convertir la entrada.

#### Scenario: Cadena con espacios
- **WHEN** se llama `buscarDivipol(" 01001")`
- **THEN** devuelve `{ encontrado: false, codigo: null, motivo: "formato-invalido", warnings: [] }`

#### Scenario: Longitudes distintas de cinco
- **WHEN** se llama `buscarDivipol` con `""`, `"0100"`, `"010010"` y `"1001"`
- **THEN** cada llamada devuelve `{ encontrado: false, codigo: null, motivo: "formato-invalido", warnings: [] }`

#### Scenario: Número en lugar de texto
- **WHEN** se llama `buscarDivipol(1001)` y `buscarDivipol(31019)`
- **THEN** ambas devuelven `{ encontrado: false, codigo: null, motivo: "formato-invalido", warnings: [] }`

#### Scenario: Dígitos no ASCII
- **WHEN** se llama `buscarDivipol("０１００１")` (dígitos de ancho completo U+FF10 a U+FF19) y `buscarDivipol("٠١٠٠١")` (dígitos arábigo-índicos U+0660 a U+0669)
- **THEN** ambas devuelven `{ encontrado: false, codigo: null, motivo: "formato-invalido", warnings: [] }`

#### Scenario: Separador entre departamento y municipio
- **WHEN** se llama `buscarDivipol("01-001")` y `buscarDivipol("01 001")`
- **THEN** ambas devuelven `{ encontrado: false, codigo: null, motivo: "formato-invalido", warnings: [] }`

### Requirement: DV-02 Búsqueda de un código existente
Para un código presente en la tabla, `buscarDivipol` SHALL devolver `{ encontrado: true, codigo, codigoDepartamento, codigoMunicipio, departamento, municipio, tipo, warnings }`, donde `codigoDepartamento` son los 2 primeros dígitos, `codigoMunicipio` los 3 últimos, los nombres son los de la tabla generada y `tipo` es `"consulado"` si el departamento es `88` y `"municipio"` en otro caso.

#### Scenario: Antioquia es 01
- **WHEN** se llama `buscarDivipol("01001")`
- **THEN** devuelve exactamente `{ encontrado: true, codigo: "01001", codigoDepartamento: "01", codigoMunicipio: "001", departamento: "ANTIOQUIA", municipio: "MEDELLIN", tipo: "municipio", warnings: [] }`

#### Scenario: Valle es 31
- **WHEN** se llama `buscarDivipol("31001")` y `buscarDivipol("31019")`
- **THEN** devuelven `{ encontrado: true, codigo: "31001", codigoDepartamento: "31", codigoMunicipio: "001", departamento: "VALLE", municipio: "CALI", tipo: "municipio", warnings: [] }` y `{ encontrado: true, codigo: "31019", codigoDepartamento: "31", codigoMunicipio: "019", departamento: "VALLE", municipio: "BUENAVENTURA", tipo: "municipio", warnings: [] }`

#### Scenario: Bogotá es 16
- **WHEN** se llama `buscarDivipol("16001")`
- **THEN** devuelve exactamente `{ encontrado: true, codigo: "16001", codigoDepartamento: "16", codigoMunicipio: "001", departamento: "BOGOTA D.C", municipio: "BOGOTA, D.C.", tipo: "municipio", warnings: [] }`

#### Scenario: Departamento con Ñ en la fuente
- **WHEN** se llama `buscarDivipol("23001")`
- **THEN** devuelve `{ encontrado: true, codigo: "23001", codigoDepartamento: "23", codigoMunicipio: "001", departamento: "NARIÑO", municipio: "PASTO", tipo: "municipio", warnings: [] }`, con `departamento` codificado como U+00D1 y no como `N` + U+0303

### Requirement: DV-03 DIVIPOL no es DIVIPOLA
`buscarDivipol` MUST interpretar todo código exclusivamente como DIVIPOL de la Registraduría. Un código que en DIVIPOLA del DANE designa otro lugar SHALL resolverse según DIVIPOL, y un departamento que solo existe en DIVIPOLA SHALL resultar desconocido.

#### Scenario: 05001 es Cartagena, no Medellín
- **WHEN** se llama `buscarDivipol("05001")`
- **THEN** devuelve `{ encontrado: true, codigo: "05001", codigoDepartamento: "05", codigoMunicipio: "001", departamento: "BOLIVAR", municipio: "CARTAGENA", tipo: "municipio", warnings: [] }`

#### Scenario: 11001 es Popayán, no Bogotá
- **WHEN** se llama `buscarDivipol("11001")`
- **THEN** devuelve `{ encontrado: true, codigo: "11001", codigoDepartamento: "11", codigoMunicipio: "001", departamento: "CAUCA", municipio: "POPAYAN", tipo: "municipio", warnings: [] }`

#### Scenario: 76001 no existe en DIVIPOL
- **WHEN** se llama `buscarDivipol("76001")`
- **THEN** devuelve `{ encontrado: false, codigo: "76001", motivo: "desconocido", warnings: [] }`

### Requirement: DV-04 Bogotá duplicada como 15/001
El código `15001` (CUNDINAMARCA / BOGOTA, D.C.) MUST resolverse como entrada válida y SHALL incluir la hipótesis `D02` en `warnings`. El código `16001` SHALL resolverse sin esa advertencia. Son las dos únicas entradas de la tabla que designan la misma entidad territorial.

#### Scenario: Código histórico de Bogotá
- **WHEN** se llama `buscarDivipol("15001")`
- **THEN** devuelve exactamente `{ encontrado: true, codigo: "15001", codigoDepartamento: "15", codigoMunicipio: "001", departamento: "CUNDINAMARCA", municipio: "BOGOTA, D.C.", tipo: "municipio", warnings: ["D02"] }`

#### Scenario: Código vigente de Bogotá sin advertencia
- **WHEN** se llama `buscarDivipol("16001")`
- **THEN** `warnings` es `[]`

### Requirement: DV-05 Consulados con código 88
Todo código con departamento `88` presente en la tabla MUST devolverse con `departamento: "CONSULADOS"`, `tipo: "consulado"` y la hipótesis `D03` en `warnings`, porque la numeración de consulados cambió entre versiones de DIVIPOL.

#### Scenario: Consulado existente
- **WHEN** se llama `buscarDivipol("88815")`
- **THEN** devuelve exactamente `{ encontrado: true, codigo: "88815", codigoDepartamento: "88", codigoMunicipio: "815", departamento: "CONSULADOS", municipio: "VENEZUELA", tipo: "consulado", warnings: ["D03"] }`

#### Scenario: Consulado con Ñ restaurada
- **WHEN** se llama `buscarDivipol("88355")`
- **THEN** devuelve `municipio: "ESPAÑA"`, `tipo: "consulado"` y `warnings: ["D03"]`

#### Scenario: Consulado ausente de la tabla
- **WHEN** se llama `buscarDivipol("88470")`
- **THEN** devuelve `{ encontrado: false, codigo: "88470", motivo: "desconocido", warnings: ["D01"] }`

### Requirement: DV-06 Código desconocido
Un código de 5 dígitos que no está en la tabla y no es `00000` MUST devolver `{ encontrado: false, codigo, motivo: "desconocido", warnings }`. `warnings` SHALL ser `["D01"]` si los dos primeros dígitos son un departamento de la tabla (posible municipio posterior a la fuente) y `[]` si no lo son.

#### Scenario: Municipio creado después de la fuente
- **WHEN** se llama `buscarDivipol("17082")`
- **THEN** devuelve `{ encontrado: false, codigo: "17082", motivo: "desconocido", warnings: ["D01"] }`

#### Scenario: Departamento inexistente
- **WHEN** se llama `buscarDivipol("99001")` y `buscarDivipol("02001")`
- **THEN** devuelven `{ encontrado: false, codigo: "99001", motivo: "desconocido", warnings: [] }` y `{ encontrado: false, codigo: "02001", motivo: "desconocido", warnings: [] }`

#### Scenario: Municipio 000 de un departamento existente
- **WHEN** se llama `buscarDivipol("01000")`
- **THEN** devuelve `{ encontrado: false, codigo: "01000", motivo: "desconocido", warnings: ["D01"] }`

### Requirement: DV-07 Código sin dato
El código `00000` MUST devolver `{ encontrado: false, codigo: "00000", motivo: "sin-dato", warnings: ["D04"] }`, distinto de un código desconocido, porque aparece en bloques demográficos publicados y se interpreta como lugar no registrado (hipótesis D04).

#### Scenario: Ceros
- **WHEN** se llama `buscarDivipol("00000")`
- **THEN** devuelve exactamente `{ encontrado: false, codigo: "00000", motivo: "sin-dato", warnings: ["D04"] }`

#### Scenario: Departamento 00 con municipio distinto de 000
- **WHEN** se llama `buscarDivipol("00001")`
- **THEN** devuelve `{ encontrado: false, codigo: "00001", motivo: "desconocido", warnings: [] }`

### Requirement: DV-08 Función pura y total
`buscarDivipol` MUST ser total (nunca lanza, con cualquier valor de JavaScript), determinista, sin E/S ni estado observable: mutar un resultado devuelto no SHALL alterar resultados posteriores.

#### Scenario: Nunca lanza con valores arbitrarios
- **WHEN** se llama `buscarDivipol` con 1000 o más valores generados por `fc.anything()`, `fc.string()` y `fc.string({ unit: "binary" })`
- **THEN** ninguna llamada lanza y cada resultado que no sea una cadena de 5 dígitos ASCII es `{ encontrado: false, codigo: null, motivo: "formato-invalido", warnings: [] }`

#### Scenario: Determinismo
- **WHEN** se llama dos veces `buscarDivipol` con la misma entrada, para 1000 o más entradas generadas
- **THEN** ambos resultados son estructuralmente iguales (`toStrictEqual`)

#### Scenario: Resultado mutado no contamina la tabla
- **WHEN** se llama `buscarDivipol("15001")`, se asigna `municipio = "X"` y se vacía `warnings` en el resultado, y se vuelve a llamar `buscarDivipol("15001")`
- **THEN** la segunda llamada devuelve `municipio: "BOGOTA, D.C."` y `warnings: ["D02"]`

#### Scenario: Objetos con toString o valueOf
- **WHEN** se llama `buscarDivipol({ toString: () => "01001" })` y `buscarDivipol(new String("01001"))`
- **THEN** ambas devuelven `{ encontrado: false, codigo: null, motivo: "formato-invalido", warnings: [] }`

### Requirement: DV-09 Cobertura exacta y ida y vuelta
El conjunto de códigos con `encontrado: true` MUST ser exactamente el conjunto de la tabla generada, y para cada código `c` de la tabla el resultado SHALL cumplir `codigo === c`, `codigoDepartamento + codigoMunicipio === c` y `buscarDivipol(resultado.codigo)` igual al resultado.

#### Scenario: Recorrido exhaustivo de los 100000 códigos
- **WHEN** se llama `buscarDivipol` con cada cadena de `"00000"` a `"99999"`
- **THEN** exactamente 1190 devuelven `encontrado: true`, todas ellas pertenecen a la tabla generada, y el resto devuelve `motivo: "desconocido"` salvo `"00000"`, que devuelve `motivo: "sin-dato"`

#### Scenario: Ida y vuelta de cada fila
- **WHEN** para cada fila de la tabla generada se llama `buscarDivipol(fila.codigo)` y luego `buscarDivipol(resultado.codigo)`
- **THEN** ambos resultados son iguales (`toStrictEqual`), `resultado.codigo === fila.codigo` y `resultado.codigoDepartamento + resultado.codigoMunicipio === fila.codigo`, en las 1190 filas

### Requirement: DV-10 Integridad de la tabla generada
La tabla generada MUST contener exactamente 1190 filas con código único de 5 dígitos ASCII, 34 departamentos con un único nombre cada uno, y los conteos por departamento de la fuente fijada. No SHALL haber dos filas con el mismo par departamento-municipio.

#### Scenario: Número de filas y departamentos
- **WHEN** se carga la tabla generada
- **THEN** tiene 1190 filas, 1190 códigos distintos, 34 códigos de departamento distintos, 1123 filas con `tipo: "municipio"` y 67 con `tipo: "consulado"`

#### Scenario: Conteo por departamento
- **WHEN** se agrupan las filas por `codigoDepartamento`
- **THEN** los conteos son exactamente: 01: 125, 03: 23, 05: 46, 07: 123, 09: 27, 11: 42, 12: 25, 13: 30, 15: 117, 16: 1, 17: 30, 19: 37, 21: 30, 23: 64, 24: 14, 25: 40, 26: 12, 27: 87, 28: 26, 29: 47, 31: 42, 40: 7, 44: 16, 46: 19, 48: 15, 50: 9, 52: 29, 54: 4, 56: 2, 60: 11, 64: 13, 68: 6, 72: 4, 88: 67

#### Scenario: Nombres de departamento
- **WHEN** se toma el nombre de departamento de cada código
- **THEN** es exactamente: 01 ANTIOQUIA, 03 ATLANTICO, 05 BOLIVAR, 07 BOYACA, 09 CALDAS, 11 CAUCA, 12 CESAR, 13 CORDOBA, 15 CUNDINAMARCA, 16 BOGOTA D.C, 17 CHOCO, 19 HUILA, 21 MAGDALENA, 23 NARIÑO, 24 RISARALDA, 25 NORTE DE SANTANDER, 26 QUINDIO, 27 SANTANDER, 28 SUCRE, 29 TOLIMA, 31 VALLE, 40 ARAUCA, 44 CAQUETA, 46 CASANARE, 48 LA GUAJIRA, 50 GUAINIA, 52 META, 54 GUAVIARE, 56 SAN ANDRES, 60 AMAZONAS, 64 PUTUMAYO, 68 VAUPES, 72 VICHADA, 88 CONSULADOS

#### Scenario: Único duplicado documentado
- **WHEN** se buscan las filas con `municipio: "BOGOTA, D.C."` y los pares (`codigoDepartamento`, `municipio`) repetidos
- **THEN** las filas son exactamente `15001` y `16001`, y ningún par se repite

#### Scenario: Caracteres de los nombres
- **WHEN** se recorren todos los nombres de departamento y municipio de la tabla
- **THEN** ninguno contiene `/` ni U+2010, ninguno tiene espacios al inicio o al final, y todos los caracteres pertenecen a `A`-`Z`, `0`-`9`, espacio, `Ñ` (U+00D1), `.`, `,`, `(`, `)` y `-`

### Requirement: DV-11 Trazabilidad y checksum de la fuente
La tabla generada MUST declarar su fuente: repositorio, commit, ruta, licencia y SHA-256 de los bytes usados. `DIVIPOL_METADATOS` SHALL exponer esos valores y el número de filas. La instantánea versionada de la fuente MUST tener ese SHA-256.

#### Scenario: Metadatos exportados
- **WHEN** se lee `DIVIPOL_METADATOS`
- **THEN** es `{ fuente: "Eitol/colombian-cedula-reader", commit: "d72a342deb7255ca49cafe16bb3f8c0b6e54869a", ruta: "src/barcode/localities.py", licencia: "MIT", sha256: "56f8f44122bca69d492d6353369d64febb836b0d31d91d5e1cd84de8a0f832a1", filas: 1190 }`

#### Scenario: Checksum de la instantánea
- **WHEN** se calcula el SHA-256 de la instantánea versionada de `localities.py`
- **THEN** es `56f8f44122bca69d492d6353369d64febb836b0d31d91d5e1cd84de8a0f832a1` y coincide con `DIVIPOL_METADATOS.sha256` y con la cabecera del archivo generado

### Requirement: DV-12 Descarga verificada de fuentes
El generador MUST obtener cada fuente desde una URL fijada (commit o recurso con SHA-256 declarado en el manifiesto de fuentes) y verificar su SHA-256 antes de guardarla. Si el checksum no coincide, SHALL terminar con código 1, nombrar la fuente y los dos checksums, y no escribir ningún archivo.

#### Scenario: Checksum correcto
- **WHEN** se ejecuta el generador en modo descarga con una fuente cuyo contenido tiene el SHA-256 declarado
- **THEN** guarda la instantánea con esos bytes exactos y termina con código 0

#### Scenario: Checksum distinto
- **WHEN** se ejecuta el generador en modo descarga con una fuente local de 3 bytes `abc` cuyo SHA-256 declarado es el de `localities.py`
- **THEN** termina con código 1, la salida de error contiene `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad` y `56f8f44122bca69d492d6353369d64febb836b0d31d91d5e1cd84de8a0f832a1`, y el directorio de instantáneas y los archivos generados quedan sin cambios

### Requirement: DV-13 Generación reproducible
El generador MUST producir los archivos generados solo a partir de las instantáneas versionadas, sin red, y dos ejecuciones sobre las mismas instantáneas SHALL producir bytes idénticos. El modo verificación MUST terminar con código 1 si los archivos versionados difieren de una regeneración.

#### Scenario: Dos ejecuciones idénticas
- **WHEN** se ejecuta el generador dos veces sobre las mismas instantáneas en directorios de salida temporales distintos
- **THEN** los archivos generados son idénticos byte a byte y terminan en `\n` con fin de línea LF

#### Scenario: Deriva detectada
- **WHEN** se modifica un nombre de municipio en una copia temporal del archivo generado y se ejecuta el modo verificación contra esa copia
- **THEN** termina con código 1 y la salida de error nombra el archivo que difiere

#### Scenario: Archivos versionados al día
- **WHEN** se ejecuta el modo verificación sobre el repositorio
- **THEN** termina con código 0

### Requirement: DV-14 Transformaciones documentadas de la fuente
Al leer `localities.py`, el generador MUST aplicar solo estas transformaciones a los nombres: `/` por `Ñ` (U+00D1), U+2010 por `-` (U+002D) y recorte de espacios en los extremos. Cualquier otro valor SHALL copiarse literal. Una fila que no siga el patrón de cuatro cadenas entre comillas MUST abortar la generación con código 1.

#### Scenario: Ñ restaurada
- **WHEN** la fuente contiene `['01', '062', 'ANTIOQUIA', 'BRICE/O']`
- **THEN** la fila generada es `codigo: "01062"`, `departamento: "ANTIOQUIA"`, `municipio: "BRICEÑO"`

#### Scenario: Guion tipográfico normalizado
- **WHEN** la fuente contiene `['01', '168', 'ANTIOQUIA', 'PUERTO NARE‐LA MAGDALENA']` con U+2010
- **THEN** la fila generada tiene `municipio: "PUERTO NARE-LA MAGDALENA"` con U+002D

#### Scenario: Fila malformada
- **WHEN** una fuente sintética contiene la línea `    ['01', '06', 'ANTIOQUIA', 'X'],` (municipio de 2 dígitos)
- **THEN** el generador termina con código 1, la salida de error indica el número de línea y no escribe archivos

#### Scenario: Código repetido en la fuente
- **WHEN** una fuente sintética contiene dos filas con `'01', '001'`
- **THEN** el generador termina con código 1 y la salida de error contiene `01001`

### Requirement: DV-15 Equivalencia DIVIPOL a DIVIPOLA
`divipolADivipola(codigo)` MUST devolver, para un código DIVIPOL de la tabla con `tipo: "municipio"`, `{ equivalente: true, divipol, divipola, metodo, warnings }` con el código DANE de 5 dígitos; para un consulado, `{ equivalente: false, divipol, motivo: "consulado", warnings }`. Los demás casos siguen los motivos de DV-01, DV-06 y DV-07.

#### Scenario: Antioquia 01 a 05
- **WHEN** se llama `divipolADivipola("01001")`
- **THEN** devuelve exactamente `{ equivalente: true, divipol: "01001", divipola: "05001", metodo: "nombre-exacto", warnings: [] }`

#### Scenario: Valle 31 a 76
- **WHEN** se llama `divipolADivipola("31001")`
- **THEN** devuelve exactamente `{ equivalente: true, divipol: "31001", divipola: "76001", metodo: "manual", warnings: [] }`

#### Scenario: Bogotá 16 a 11 y su duplicado
- **WHEN** se llama `divipolADivipola("16001")` y `divipolADivipola("15001")`
- **THEN** devuelven `{ equivalente: true, divipol: "16001", divipola: "11001", metodo: "nombre-exacto", warnings: [] }` y `{ equivalente: true, divipol: "15001", divipola: "11001", metodo: "manual", warnings: ["D02"] }`

#### Scenario: San Andrés 56 a 88 sin confundirse con consulados
- **WHEN** se llama `divipolADivipola("56001")` y `divipolADivipola("88815")`
- **THEN** devuelven `{ equivalente: true, divipol: "56001", divipola: "88001", metodo: "nombre-exacto", warnings: [] }` y `{ equivalente: false, divipol: "88815", motivo: "consulado", warnings: ["D03"] }`

#### Scenario: Nombre con alias entre paréntesis
- **WHEN** se llama `divipolADivipola("11058")` (PATIA (EL BORDO))
- **THEN** devuelve `{ equivalente: true, divipol: "11058", divipola: "19532", metodo: "nombre-sin-parentesis", warnings: [] }`

#### Scenario: Mapiripana equivale a Barrancominas
- **WHEN** se llama `divipolADivipola("50050")` (MAPIRIPANA) y `divipolADivipola("50070")` (BARRANCOMINAS)
- **THEN** devuelven `{ equivalente: true, divipol: "50050", divipola: "94343", metodo: "manual", warnings: [] }` y `{ equivalente: true, divipol: "50070", divipola: "94343", metodo: "nombre-sin-parentesis", warnings: [] }` (la Ordenanza 248 de 2019 de Guainía creó Barrancominas uniendo las áreas no municipalizadas de Barranco Minas y Mapiripana; corrección del 2026-10-07)

#### Scenario: Entradas no resolubles
- **WHEN** se llama `divipolADivipola("17082")`, `divipolADivipola("00000")` y `divipolADivipola(" 01001")`
- **THEN** devuelven `{ equivalente: false, divipol: "17082", motivo: "desconocido", warnings: ["D01"] }`, `{ equivalente: false, divipol: "00000", motivo: "sin-dato", warnings: ["D04"] }` y `{ equivalente: false, divipol: null, motivo: "formato-invalido", warnings: [] }`

#### Scenario: Total y determinista
- **WHEN** se llama `divipolADivipola` con 1000 o más valores de `fc.anything()`, `fc.string()` y `fc.string({ unit: "binary" })`, dos veces cada uno
- **THEN** ninguna llamada lanza y ambas llamadas devuelven resultados iguales (`toStrictEqual`)

### Requirement: DV-16 Construcción de la equivalencia por nombres normalizados
El generador MUST emparejar cada fila municipal con DIVIPOLA en tres etapas excluyentes: nombre exacto normalizado, nombre normalizado sin paréntesis y sin espacios, y tabla manual revisada. Solo SHALL aceptar candidatos del departamento DANE que la tabla literal de departamentos asigna, y con un único candidato.

#### Scenario: Normalización de nombres
- **WHEN** se normalizan `"MEDELLÍN"`, `"Piendamó - Tunía"` y `"BOGOTA, D.C."` (NFD, quitar U+0300 a U+036F, mayúsculas, todo carácter fuera de `A`-`Z` y `0`-`9` a espacio, colapsar y recortar)
- **THEN** se obtienen `"MEDELLIN"`, `"PIENDAMO TUNIA"` y `"BOGOTA D C"`

#### Scenario: Normalización sin paréntesis
- **WHEN** se aplica la segunda etapa a `"ALTO BAUDO (PIE DE PATO)"` y a `"EL CANTON DEL SAN PABLO (MAN."`
- **THEN** se obtienen `"ALTOBAUDO"` y `"ELCANTONDELSANPABLO"`

#### Scenario: Tabla literal de departamentos
- **WHEN** el generador asigna el departamento DANE de cada departamento DIVIPOL
- **THEN** usa exactamente: 01-05, 03-08, 05-13, 07-15, 09-17, 11-19, 12-20, 13-23, 15-25, 16-11, 17-27, 19-41, 21-47, 23-52, 24-66, 25-54, 26-63, 27-68, 28-70, 29-73, 31-76, 40-81, 44-18, 46-85, 48-44, 50-94, 52-50, 54-95, 56-88, 60-91, 64-86, 68-97, 72-99, y 88 sin equivalente; y todo `divipola` generado empieza por el código DANE asignado a su departamento

#### Scenario: Conteo por método sobre las fuentes fijadas
- **WHEN** se genera la equivalencia con las instantáneas fijadas
- **THEN** de las 1123 filas municipales, 1042 se resuelven por `nombre-exacto`, 48 por `nombre-sin-parentesis`, 33 por `manual` con código (incluido `50050` -> `94343`) y ninguna por `manual` sin equivalente; las 67 de consulado quedan sin equivalente; los únicos códigos DANE con más de un código DIVIPOL son `11001` (`15001` y `16001`) y `94343` (`50050` y `50070`) y el único código DANE sin pareja es `27493`

#### Scenario: Fila sin resolver
- **WHEN** una fuente sintética contiene una fila municipal que no empareja en las dos primeras etapas y no figura en la tabla manual
- **THEN** el generador termina con código 1, la salida de error contiene su código DIVIPOL y no escribe archivos

#### Scenario: Entrada manual redundante o contradictoria
- **WHEN** la tabla manual contiene un código DIVIPOL que ya empareja en la primera o la segunda etapa
- **THEN** el generador termina con código 1 y la salida de error contiene ese código

#### Scenario: Código DANE repetido
- **WHEN** dos códigos DIVIPOL resultan en el mismo código DANE y no son exactamente `15001` y `16001` en `11001` ni `50050` y `50070` en `94343`
- **THEN** el generador termina con código 1 y la salida de error contiene el código DANE repetido

#### Scenario: Integridad de la fuente DANE
- **WHEN** se lee la instantánea de DIVIPOLA
- **THEN** tiene 1122 filas de datos, 33 departamentos y códigos de municipio únicos de 5 dígitos; si no, el generador termina con código 1

### Requirement: DV-17 Aislamiento de la licencia CC BY-SA
La equivalencia, derivada de DIVIPOLA (CC BY-SA 4.0), MUST distribuirse en un punto de entrada separado del principal, de modo que importar el principal no cargue datos derivados de DIVIPOLA. Ese punto de entrada SHALL exponer `DIVIPOLA_METADATOS` con atribución, licencia y SHA-256 de la fuente.

#### Scenario: El punto de entrada principal no incluye DIVIPOLA
- **WHEN** se recorre el grafo de importaciones estáticas relativas desde `packages/parsers/src/index.ts`
- **THEN** ningún módulo alcanzado está bajo `packages/parsers/src/divipola/` ni contiene la cadena `CC-BY-SA`

#### Scenario: Metadatos de atribución
- **WHEN** se lee `DIVIPOLA_METADATOS` desde el punto de entrada de la equivalencia
- **THEN** contiene `fuente: "DANE - DIVIPOLA Códigos municipios (datos.gov.co gdxc-w37w)"`, `licencia: "CC-BY-SA-4.0"`, `url: "https://www.datos.gov.co/api/views/gdxc-w37w/rows.csv?accessType=DOWNLOAD"`, un `sha256` de 64 caracteres hexadecimales igual al de la instantánea versionada y `cambios` describiendo que solo se conservan los códigos emparejados

#### Scenario: Avisos de terceros publicados
- **WHEN** se inspecciona la lista `files` y el campo `license` de `packages/parsers/package.json`
- **THEN** `files` incluye el archivo de avisos de terceros, ese archivo contiene el aviso MIT de `Copyright (c) Hector Oliveros` y la atribución CC BY-SA 4.0 del DANE, y `license` es `MIT AND CC-BY-SA-4.0`

### Requirement: DV-18 Contraste con DIVIPOL.TXT oficial
El generador MUST ofrecer un modo de contraste que lea un `DIVIPOL.TXT` local de ancho fijo (Latin-1; departamento 0-1, municipio 2-4, nombre de departamento 9-20, nombre de municipio 21-50) y reporte códigos solo en la tabla, solo en el archivo y con nombre de municipio distinto, sin escribir archivos ni usar red.

#### Scenario: Diferencias en un archivo sintético
- **WHEN** se ejecuta el contraste con un archivo sintético de 3 líneas de 146 caracteres con los códigos `01001` (MEDELLIN), `01062` (BRICEÑO en Latin-1) y `17082` (NUEVO BELEN DE BAJIRA)
- **THEN** termina con código 0 y el informe JSON en la salida estándar tiene `soloEnContraste: ["17082"]`, `nombresDistintos: []` y `soloEnTabla` con 1188 códigos que incluye `"15001"` y excluye `"01001"` y `"01062"`

#### Scenario: Sin efectos en el repositorio
- **WHEN** se ejecuta el contraste con cualquier archivo
- **THEN** ningún archivo versionado cambia (`git status --porcelain` igual antes y después)

#### Scenario: Archivo ausente
- **WHEN** se ejecuta el contraste con una ruta que no existe
- **THEN** termina con código 1 y la salida de error contiene la ruta

#### Scenario: Nombre de municipio distinto
- **WHEN** el archivo trae el código `15001` con el municipio `BOGOTA. D.C.` (varias líneas por código cuentan una vez, con el nombre de la primera)
- **THEN** `nombresDistintos` contiene `{ "codigo": "15001", "tabla": "BOGOTA, D.C.", "contraste": "BOGOTA. D.C." }`, comparando ambos nombres tras las transformaciones de DV-14, y las tres listas van ordenadas por código

#### Scenario: Línea malformada
- **WHEN** una línea no vacía del archivo no empieza por 5 dígitos o tiene menos de 51 caracteres, o el archivo no tiene líneas
- **THEN** termina con código 1 y la salida de error contiene el número de línea (o indica que está sin líneas), sin informe en la salida estándar
