# divipol-consulados-2018

## Purpose

Consulados DIVIPOL (departamento 88) que la Registraduría publicó en 2018 (datos.gov.co `vh8b-jfhg`, CC BY-SA 4.0), en un punto de entrada separado del principal, y su uso al resolver el lugar de nacimiento.

## ADDED Requirements

### Requirement: DC-01 Punto de entrada separado
Los consulados de 2018 MUST publicarse en el punto de entrada `@lector-cedula/parsers/divipol-2018` (fuente `packages/parsers/src/divipol-2018/index.ts`), que SHALL exportar `buscarConsulado2018`, `RENOMBRADOS_2018` y `DIVIPOL_2018_METADATOS`. El punto de entrada principal MUST NOT importar ningún módulo de `packages/parsers/src/divipol-2018/`, y `packages/parsers/src/divipol/tabla.generated.ts` MUST NOT cambiar.

#### Scenario: Exportación declarada
- **WHEN** se lee el campo `exports` de `packages/parsers/package.json`
- **THEN** contiene `"./divipol-2018": { "types": "./dist/divipol-2018/index.d.ts", "default": "./dist/divipol-2018/index.js" }`

#### Scenario: El principal no alcanza el módulo 2018
- **WHEN** se recorre el grafo de importaciones estáticas relativas desde `packages/parsers/src/index.ts`
- **THEN** ningún módulo alcanzado está bajo `packages/parsers/src/divipol-2018/` ni contiene la cadena `CC-BY-SA`

#### Scenario: Tabla principal intacta
- **WHEN** se inspecciona `FILAS_DIVIPOL` del punto de entrada principal
- **THEN** tiene 1190 filas, 67 con departamento 88, y `buscarDivipol("88115")` devuelve `{ encontrado: false, codigo: "88115", motivo: "desconocido", warnings: ["D01"] }`

#### Scenario: Metadatos de atribución
- **WHEN** se lee `DIVIPOL_2018_METADATOS`
- **THEN** contiene `fuente: "Registraduría Nacional del Estado Civil - Divipole Exterior Presidente 2018 (datos.gov.co vh8b-jfhg)"`, `licencia: "CC-BY-SA-4.0"`, la `url` exacta del manifiesto, un `sha256` igual al de la instantánea versionada, `cambios` que nombra cada corrección de DC-09 y `filas: 71`

### Requirement: DC-02 Consulados nuevos
`buscarConsulado2018(codigo)` MUST resolver los 11 consulados ausentes de la tabla principal con el resultado `{ encontrado: true, codigo, codigoDepartamento: "88", codigoMunicipio, departamento: "CONSULADOS", municipio, tipo: "consulado", warnings: ["D03"] }`.

#### Scenario: Los 11 consulados nuevos
- **WHEN** se llama `buscarConsulado2018` con cada código de la tabla
- **THEN** `municipio` es el literal: `88115` GHANA, `88130` ARGELIA, `88135` AZERBAIYAN, `88350` EMIRATOS ARABES UNIDOS, `88415` BELICE, `88470` IRLANDA, `88540` LUXEMBURGO, `88625` NUEVA ZELANDIA, `88688` SINGAPUR, `88690` VIETNAM, `88765` TAILANDIA

#### Scenario: Resultado completo
- **WHEN** se llama `buscarConsulado2018("88115")`
- **THEN** devuelve `{ encontrado: true, codigo: "88115", codigoDepartamento: "88", codigoMunicipio: "115", departamento: "CONSULADOS", municipio: "GHANA", tipo: "consulado", warnings: ["D03"] }`

### Requirement: DC-03 Renombres con el nombre vigente
Para los 4 consulados renombrados, `buscarConsulado2018` MUST devolver el nombre de 2018, y `RENOMBRADOS_2018` MUST ser exactamente `["88140", "88160", "88370", "88435"]`. El tipo público del punto de entrada principal MUST NOT ganar campos de alias.

#### Scenario: Nombres vigentes
- **WHEN** se llama `buscarConsulado2018` con `88140`, `88160`, `88370` y `88435`
- **THEN** `municipio` es `CURAZAO`, `ARUBA`, `REPUBLICA DE FILIPINAS` y `PAISES BAJOS`, respectivamente

#### Scenario: El principal conserva el nombre histórico
- **WHEN** se llama `buscarDivipol` con `88140`, `88160`, `88370` y `88435`
- **THEN** `municipio` es `PAISES BAJ-ANTILLAS HOLANDESAS`, `PAISES BAJOS - ARUBA`, `FILIPINAS` y `HOLANDA`

### Requirement: DC-04 Belice e Irlanda con ambos códigos
Por excepción explícita y literal (como Bogotá en DV-04), el módulo 2018 MUST aceptar los dos códigos de Belice (`88195` y `88415`) y de Irlanda (`88480` y `88470`). Ningún otro código tiene alterno.

#### Scenario: Ambos códigos
- **WHEN** se llama `buscarConsulado2018` con `88195`, `88415`, `88480` y `88470`
- **THEN** `municipio` es `BELICE`, `BELICE`, `IRLANDA` e `IRLANDA`, y `codigo` es el código de entrada

### Requirement: DC-05 Función pura y total
`buscarConsulado2018` MUST NOT lanzar con ninguna entrada y MUST devolver objetos y arreglos nuevos en cada llamada. Una entrada que no sea una cadena de 5 dígitos ASCII devuelve `{ encontrado: false, codigo: null, motivo: "formato-invalido", warnings: [] }`; un código de 5 dígitos fuera de la tabla devuelve `{ encontrado: false, codigo, motivo: "desconocido", warnings: [] }`.

#### Scenario: Formato inválido
- **WHEN** se llama con `"8811"`, `88115` (número), `null` o `"88 15"`
- **THEN** devuelve `{ encontrado: false, codigo: null, motivo: "formato-invalido", warnings: [] }`

#### Scenario: Código fuera de la tabla
- **WHEN** se llama con `"88300"` (Checoslovaquia, solo en Eitol) o `"01001"`
- **THEN** devuelve `{ encontrado: false, codigo, motivo: "desconocido", warnings: [] }`

#### Scenario: Recorrido exhaustivo y fuzz
- **WHEN** se recorre `"00000"` a `"99999"` y se prueban `fc.anything()`, `fc.string()` y cadenas binarias (numRuns >= 1000)
- **THEN** hay exactamente 71 encontrados, todos con departamento 88, y 0 excepciones

### Requirement: DC-06 Fuente verificada y extracto mínimo
El manifiesto `tools/divipol/fuentes.json` MUST declarar la fuente `registraduria-consulados-2018` (archivo `consulados-2018.csv`, licencia `CC-BY-SA-4.0`, URL exacta de la consulta y SHA-256). El extracto MUST tener solo las columnas `dd`, `mm` y `municipio`, y el generador MUST validar cabecera, 69 filas, `dd` = `88`, `mm` de 3 dígitos sin repetidos y nombres no vacíos.

#### Scenario: Entrada del manifiesto
- **WHEN** se lee la fuente `registraduria-consulados-2018` del manifiesto
- **THEN** su `url` es `https://www.datos.gov.co/resource/vh8b-jfhg.csv?$select=dd,mm,municipio&$group=dd,mm,municipio&$order=mm&$limit=500` y su `sha256` es `135dee55ab72b439500ebad609c825404f1d4fa6aefbf127da684fa652704724`

#### Scenario: Checksum y columnas
- **WHEN** se recalcula el SHA-256 de `tools/divipol/fuentes/consulados-2018.csv` y se lee su cabecera
- **THEN** coincide con el manifiesto y la cabecera es `"dd","mm","municipio"`

#### Scenario: Fuente con 68 filas
- **WHEN** el generador recibe el extracto sin su última fila
- **THEN** falla con un mensaje que nombra `69` y no escribe archivos

### Requirement: DC-09 Correcciones declaradas
El generador SHALL aplicar solo estas correcciones de erratas, cada una declarada como cambio en la atribución CC BY-SA: `88135` ARZERBAIYAN a AZERBAIYAN, `88688` REPUBLICA DE SINGAPUR a SINGAPUR, `88690` REPUBLICA SOCIALISTA DEVIETNAM a VIETNAM. Si el nombre de la fuente no coincide con el original de la corrección, MUST fallar.

#### Scenario: Corrección que ya no aplica
- **WHEN** la fuente trae `88135` con un nombre distinto de `ARZERBAIYAN`
- **THEN** el generador falla nombrando `88135`

### Requirement: DC-07 Integridad del módulo generado
`packages/parsers/src/divipol-2018/consulados.generated.ts` MUST contener 71 filas: los 69 códigos de 2018 y los alternos `88195` y `88480`. Frente a la tabla principal: 11 códigos nuevos (DC-02), 4 renombres (DC-03), 54 códigos con nombre idéntico, y ningún código principal distinto de 88 aparece en el módulo. `npm run divipol:verificar` MUST detectar una deriva de este archivo.

#### Scenario: Conteos frente a la tabla principal
- **WHEN** se comparan las filas del módulo 2018 con `FILAS_DIVIPOL`
- **THEN** 71 filas, 11 ausentes del principal, 4 con nombre distinto (exactamente `RENOMBRADOS_2018`), 56 con nombre idéntico (54 de 2018 más `88195` y `88480`)

#### Scenario: Deriva detectada
- **WHEN** se ejecuta `--verificar` contra una copia del módulo 2018 con un nombre alterado
- **THEN** termina con código 1 y nombra `divipol-2018/consulados.generated.ts`

### Requirement: DC-08 Lugar de nacimiento con el nombre vigente
`conLugarNacimiento` (`packages/capture/src/lectura/lugar.ts`) MUST consultar `buscarConsulado2018` cuando la búsqueda principal devuelve `encontrado: false` o cuando el código está en `RENOMBRADOS_2018`, y usar su resultado si es `encontrado: true`. En los demás casos el comportamiento de OFF-08 no cambia.

#### Scenario: Consulado nuevo
- **WHEN** los códigos de nacimiento son `88` y `690`
- **THEN** `lugarNacimiento` es `{ codigo: "88690", departamento: "CONSULADOS", municipio: "VIETNAM" }` y no se añade `lugar-nacimiento-no-resuelto`

#### Scenario: Consulado renombrado
- **WHEN** los códigos de nacimiento son `88` y `140`
- **THEN** `lugarNacimiento` es `{ codigo: "88140", departamento: "CONSULADOS", municipio: "CURAZAO" }`

#### Scenario: Código desconocido en ambos
- **WHEN** los códigos de nacimiento son `99` y `999`
- **THEN** `lugarNacimiento` es `null` y se añade `lugar-nacimiento-no-resuelto`

#### Scenario: Municipio nacional sin cambios
- **WHEN** los códigos de nacimiento son `16` y `001`
- **THEN** el resultado es el de la búsqueda principal y no se consulta el módulo 2018

### Requirement: DC-10 Atribución en la CLI leer-foto
La CLI `tools/leer-foto.mjs` usa datos CC BY-SA 4.0 al resolver el lugar de nacimiento (DC-08). Con la opción `--licencias` MUST escribir en la salida estándar el contenido íntegro de `packages/parsers/THIRD_PARTY_NOTICES.md` y terminar con código 0 sin leer ninguna imagen ni exigir ruta. Toda salida PDF417 con `ok: true` MUST incluir el campo de primer nivel `fuentes` con el literal `"Datos: DANE y Registraduría, CC BY-SA 4.0; ver --licencias"`. Las demás salidas (errores y MRZ) no cambian.

#### Scenario: Opción --licencias
- **WHEN** se ejecuta `node tools/leer-foto.mjs --licencias`
- **THEN** el código es 0, la salida estándar es igual al contenido de `packages/parsers/THIRD_PARTY_NOTICES.md`, contiene `Registraduría Nacional del Estado Civil`, `DANE` y `https://creativecommons.org/licenses/by-sa/4.0/legalcode.es`, y la salida de errores está vacía

#### Scenario: Campo fuentes en la salida PDF417
- **WHEN** se lee una imagen sintética con PDF417, con o sin máscara
- **THEN** la salida JSON tiene `fuentes: "Datos: DANE y Registraduría, CC BY-SA 4.0; ver --licencias"`

#### Scenario: Consulado de 2018 en la CLI
- **WHEN** se lee una imagen sintética con PDF417 cuyo lugar de nacimiento es `88` `690`
- **THEN** `resultado.campos.lugarNacimiento` es `{ "codigo": "88690", "departamento": "CONSULADOS", "municipio": "VIETNAM" }`

#### Scenario: Errores sin cambios
- **WHEN** la imagen no contiene documento
- **THEN** la salida es exactamente `{"ok":false,"error":"documento-no-encontrado"}` sin `fuentes`

### Requirement: DC-11 El principal sigue libre de datos CC BY-SA (DV-17)
El grafo de importaciones estáticas relativas desde `packages/parsers/src/index.ts` MUST NOT alcanzar ningún módulo bajo `src/divipola/` ni `src/divipol-2018/`. El grafo equivalente desde el compilado `packages/parsers/dist/index.js` MUST NOT alcanzar `dist/divipola/` ni `dist/divipol-2018/`, `dist/index.js` MUST NOT contener `88195`, y ningún archivo de ese grafo MUST contener `AZERBAIYAN`.

#### Scenario: Grafo del fuente
- **WHEN** se recorre el grafo desde `src/index.ts`
- **THEN** ninguna ruta empieza por `src/divipola/` ni por `src/divipol-2018/`

#### Scenario: Grafo del compilado
- **WHEN** se recorre el grafo desde `dist/index.js`
- **THEN** ninguna ruta empieza por `dist/divipola/` ni por `dist/divipol-2018/`, `dist/index.js` no contiene `88195` y ningún archivo contiene `AZERBAIYAN`

### Requirement: DC-12 licencia-check exige el aviso de cada artefacto CC BY-SA
`node tools/licencia-check.mjs` (sin argumentos, parte de `npm run check`) MUST fallar con código 1 y nombrar el artefacto si un `*.generated.ts` bajo `packages/*/src/` que contiene `CC-BY-SA` pertenece a un paquete cuyo `license` no incluye `CC-BY-SA-4.0`, cuyo `files` no incluye `THIRD_PARTY_NOTICES.md`, o cuyo `THIRD_PARTY_NOTICES.md` falta, no nombra la ruta del artefacto relativa al paquete o no contiene `https://creativecommons.org/licenses/by-sa/4.0/legalcode.es`.

#### Scenario: Repositorio actual
- **WHEN** se ejecuta `npm run check:licencias`
- **THEN** termina con código 0

#### Scenario: Aviso sin el artefacto
- **WHEN** se evalúa un paquete cuyo `THIRD_PARTY_NOTICES.md` no nombra `src/divipol-2018/consulados.generated.ts`, otro sin `THIRD_PARTY_NOTICES.md` en `files`, otro sin `CC-BY-SA-4.0` en `license`, otro sin el enlace al código legal y otro sin el archivo
- **THEN** cada caso da una infracción que nombra el artefacto

### Requirement: DC-15 licencia-check exige el aviso de cada consumidor CC BY-SA
`node tools/licencia-check.mjs` MUST fallar y nombrar el archivo si un `*.mjs` directo de `tools/` o un `*.mjs` bajo `server/` importa `conLugarNacimiento`, o un especificador que contiene `divipola`, `divipol-2018` o `lectura/lugar`, y no contiene el literal `CC BY-SA 4.0`.

#### Scenario: Consumidor sin aviso
- **WHEN** se evalúa un `.mjs` que importa `conLugarNacimiento`, `@lector-cedula/parsers/divipol-2018` o `.../lectura/lugar.js` sin el literal `CC BY-SA 4.0`
- **THEN** da una infracción que nombra el archivo; con el literal, o sin importar datos CC BY-SA, no la da

### Requirement: DC-16 licencia-check exige el aviso en la imagen del servidor
Si `server/Dockerfile` contiene `packages/parsers/src`, `node tools/licencia-check.mjs` MUST fallar salvo que una instrucción `COPY` copie un archivo `THIRD_PARTY_NOTICES` a `/srv/licencias/`.

#### Scenario: Imagen sin aviso
- **WHEN** se evalúa un Dockerfile que compila `packages/parsers/src` sin copiar avisos a `/srv/licencias/`
- **THEN** da una infracción; con la copia, o sin compilar los parsers, no la da

### Requirement: DC-13 Contenido de los avisos CC BY-SA
`packages/parsers/THIRD_PARTY_NOTICES.md` y `tools/divipol/fuentes/LICENSES.md` MUST declarar, para cada fuente CC BY-SA 4.0 (DANE y Registraduría): la fecha de descarga de la instantánea (`2026-10-06` para el DANE y `2026-10-07` para la Registraduría), el enlace `https://creativecommons.org/licenses/by-sa/4.0/legalcode.es`, un indicador explícito de cambios (`Cambios:`), las erratas corregidas como modificaciones del material, y que la mención del DANE o de la Registraduría no implica su aval.

#### Scenario: Elementos de atribución
- **WHEN** se lee cada sección CC BY-SA de los dos archivos
- **THEN** contiene `descargado el 2026-10-06` (DANE) o `descargado el 2026-10-07` (Registraduría), el enlace al código legal, `Cambios:`, y `no implica aval`
- **AND** la sección de la Registraduría declara como `modificaciones` `ARZERBAIYAN`, `REPUBLICA DE SINGAPUR` y `REPUBLICA SOCIALISTA DEVIETNAM`

### Requirement: DC-14 Lugar vigente en el intérprete del servidor
El intérprete del servidor (`server/interprete/interpretar.mjs`) MUST añadir a la respuesta PDF417 con `ok: true` la clave `lugar_nacimiento` con `{ codigo, departamento, municipio }` resuelta con `conLugarNacimiento` de `packages/capture` (misma resolución que la CLI y la PWA, DC-08), o `null` si no se resuelve. `campos` no cambia. El módulo se carga de `RUTA_LUGAR` (por defecto `/srv/lector/node_modules/@lector-cedula/capture/dist/lectura/lugar.js`).

#### Scenario: Municipio nacional
- **WHEN** el intérprete recibe el PDF417 de `pdf417-amarilla/apellido-compuesto` (lugar `16` `001`)
- **THEN** `lugar_nacimiento` es `{ "codigo": "16001", "departamento": "BOGOTA D.C", "municipio": "BOGOTA, D.C." }`

#### Scenario: Consulado de 2018 en el servidor
- **WHEN** el intérprete recibe ese PDF417 con el lugar cambiado a `88` `690`, a `88` `140` o a `99` `999`
- **THEN** `lugar_nacimiento` es `{ "codigo": "88690", "departamento": "CONSULADOS", "municipio": "VIETNAM" }`, tiene `municipio` `CURAZAO`, o es `null`, respectivamente

### Requirement: DC-17 Nombre vigente en el documento de la API
El motor (`server/app/motor_real.py`) MUST añadir a `place_of_birth` `department_name` y `municipality_name` (cadenas de 1 a 64 caracteres) solo cuando `lugar_nacimiento.codigo` del intérprete coincide con el código del documento. El esquema `DivipolPlace` del contrato los declara opcionales.

#### Scenario: Documento con nombres
- **WHEN** el motor arma el documento de una amarilla con lugar `16` `001` resuelto
- **THEN** `place_of_birth` es `{ "divipol_department": "16", "divipol_municipality": "001", "department_name": "BOGOTA D.C", "municipality_name": "BOGOTA, D.C." }`

#### Scenario: Sin nombres
- **WHEN** `lugar_nacimiento` es `null`, tiene otro código, un nombre vacío o no es un objeto
- **THEN** `place_of_birth` solo tiene los dos códigos

### Requirement: DC-18 Datos y aviso en la imagen del servidor
La imagen MUST exponer `@lector-cedula/parsers/divipol-2018` al lector de `packages/capture` y copiar `packages/parsers/THIRD_PARTY_NOTICES.md` (de HEAD) a `/srv/licencias/parsers-THIRD_PARTY_NOTICES.md`.

#### Scenario: Aviso en la imagen
- **WHEN** se inspecciona `/srv/licencias/parsers-THIRD_PARTY_NOTICES.md` en el contenedor
- **THEN** existe y contiene `CC BY-SA 4.0` y `Registraduría Nacional del Estado Civil`
