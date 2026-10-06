# Delta de evals-por-campo

## MODIFIED Requirements

### Requirement: EV-01 Comparación exacta del conjunto de claves
Si un fixture declara `"clavesExactas": true`, el corredor SHALL añadir a ese caso el campo de métrica `__claves`: cuenta como exacto solo si el conjunto de claves propias enumerables del resultado es igual al de `esperado` (sin importar el orden), con CER 0 si es exacto y 1 si no. Un resultado que no es objeto o es `null` tiene el conjunto vacío. Sin la marca, `__claves` MUST NOT aparecer para ese caso.

#### Scenario: Mismas claves
- **WHEN** se agrega un caso de tipo `"t"` con `clavesExactas` `true`, `esperado` `{ "valido": false, "motivo": "vacio" }` y resultado `{ "valido": false, "motivo": "vacio" }`
- **THEN** la métrica `t.__claves` es `{ "n": 1, "exact_match": 1, "cer": 0 }`

#### Scenario: Clave sobrante
- **WHEN** se agrega un caso de tipo `"t"` con `clavesExactas` `true`, `esperado` `{ "valido": false, "motivo": "vacio" }` y resultado `{ "valido": false, "motivo": "vacio", "numero": "9999" }`
- **THEN** `t.__claves` es `{ "n": 1, "exact_match": 0, "cer": 1 }`, y `t.valido` y `t.motivo` siguen con `exact_match` 1

#### Scenario: Clave faltante
- **WHEN** se agrega un caso de tipo `"t"` con `clavesExactas` `true`, `esperado` `{ "valido": true, "numero": "9999123456" }` y resultado `{ "valido": true }`
- **THEN** `t.__claves` tiene `exact_match` 0 y `cer` 1

#### Scenario: El orden de las claves no importa
- **WHEN** se agrega un caso de tipo `"t"` con `clavesExactas` `true`, `esperado` `{ "valido": false, "motivo": "vacio" }` y resultado `{ "motivo": "vacio", "valido": false }`
- **THEN** `t.__claves` tiene `exact_match` 1 y `cer` 0

#### Scenario: Resultado que no es objeto
- **WHEN** se agregan tres casos de tipo `"t"` con `clavesExactas` `true`, `esperado` `{ "valido": false }` y resultados `null`, `undefined` y `"x"`
- **THEN** `t.__claves` es `{ "n": 3, "exact_match": 0, "cer": 1 }`

#### Scenario: Sin la marca no se compara
- **WHEN** se agregan dos casos de tipo `"t"` con el resultado `{ "valido": false, "motivo": "vacio", "numero": "9999" }`, uno sin `clavesExactas` y otro con `clavesExactas` `false`
- **THEN** la métrica `t` no contiene el campo `__claves`

#### Scenario: Mezcla de casos con y sin marca
- **WHEN** se agregan dos casos de tipo `"t"` con `esperado` `{ "valido": false }` y resultado `{ "valido": false }`, uno con `clavesExactas` `true` y otro sin la marca
- **THEN** `t.__claves.n` es `1` y `t.valido.n` es `2`

#### Scenario: Clave con valor undefined cuenta como sobrante
- **WHEN** se agrega un caso de tipo `"t"` con `clavesExactas` `true`, `esperado` `{ "valido": false, "motivo": "vacio" }` y resultado `{ valido: false, motivo: "vacio", numero: undefined }`
- **THEN** `t.__claves` es `{ "n": 1, "exact_match": 0, "cer": 1 }`, y `t.valido` y `t.motivo` siguen con `exact_match` 1

#### Scenario: Solo el booleano true activa la comparación
- **WHEN** se agregan tres casos de tipo `"t"` con `esperado` `{ "valido": false }` y resultado `{ "valido": false, "numero": "9999" }`, con `clavesExactas` igual a `"true"` (texto), `1` y `{}` respectivamente
- **THEN** la métrica `t` no contiene el campo `__claves` y `t.valido.n` es `3`

#### Scenario: El corredor propaga la marca del fixture
- **WHEN** el corredor se ejecuta con `--quick`, `--fixtures` apuntando a un directorio temporal con tres fixtures sintéticos de tipo `"nuip-formato"`, todos con `entrada` `"9999123456"` y `esperado` `{ "valido": true, "numero": "9999123456", "tipoProbable": "nuip", "digitos": 10, "warnings": [] }`, dos con `"clavesExactas": true` y uno con `"clavesExactas": "true"` (texto), y `--reportes` apuntando a otro directorio temporal vacío
- **THEN** el corredor sale con código 0 y el `latest.json` de ese directorio de reportes contiene `metricas["nuip-formato"].__claves` igual a `{ "n": 2, "exact_match": 1, "cer": 0 }` y `metricas["nuip-formato"].valido.n` igual a `3`

## ADDED Requirements

### Requirement: EV-03 Caída del número de casos
El corredor SHALL tratar como regresión que el `n` de un campo de un tipo sea menor que el `n` de ese campo en el baseline, con un mensaje que nombre `tipo.campo` y los dos valores de `n`. Un `n` igual o mayor MUST NOT ser regresión por sí solo. La comparación de `n` SHALL aplicarse solo si el baseline no registra `modo` o si su `modo` coincide con el de la ejecución (`quick` o `completo`); `exact_match` y `cer` se comparan siempre. Si hay alguna regresión, el corredor MUST salir con código 1.

#### Scenario: Caída de n
- **WHEN** se comparan las métricas actuales `{ "tipo-x": { "a": { "n": 39, "exact_match": 1, "cer": 0 } } }` con el baseline `{ "tipo-x": { "a": { "n": 40, "exact_match": 1, "cer": 0 } } }`
- **THEN** se reporta exactamente una regresión y su mensaje contiene `"tipo-x.a"`, `"40"` y `"39"`

#### Scenario: n igual o mayor
- **WHEN** se comparan con ese mismo baseline las métricas actuales con `n` `40` y, por separado, con `n` `41`, ambas con `exact_match` 1 y `cer` 0
- **THEN** ninguna de las dos comparaciones reporta regresiones

#### Scenario: Caída de n junto con caída de exact match
- **WHEN** se comparan las métricas actuales `{ "tipo-x": { "a": { "n": 39, "exact_match": 0.5, "cer": 0 } } }` con el baseline `{ "tipo-x": { "a": { "n": 40, "exact_match": 1, "cer": 0 } } }`
- **THEN** se reportan exactamente dos regresiones: una de `n` y otra de `exact_match`

#### Scenario: El corredor falla si se pierden fixtures
- **WHEN** el corredor se ejecuta con `--quick`, `--reportes` apuntando a un directorio temporal cuyo `baseline.json` es `{ "metricas": { "nuip-formato": { "valido": { "n": 3, "exact_match": 1, "cer": 0 } } } }` y `--fixtures` apuntando a un directorio temporal con dos fixtures sintéticos de tipo `"nuip-formato"` con `entrada` `"9999123456"` y `esperado` `{ "valido": true }`
- **THEN** el corredor sale con código 1 y su salida de error contiene `"nuip-formato.valido"`, `"3"` y `"2"`

#### Scenario: Un baseline de otro modo no compara n
- **WHEN** el corredor se ejecuta como en el escenario anterior pero el `baseline.json` temporal es `{ "modo": "completo", "metricas": { "nuip-formato": { "valido": { "n": 3, "exact_match": 1, "cer": 0 } } } }`
- **THEN** el corredor sale con código 0

#### Scenario: Un baseline del mismo modo sí compara n
- **WHEN** el corredor se ejecuta como en "El corredor falla si se pierden fixtures" pero el `baseline.json` temporal incluye `"modo": "quick"`
- **THEN** el corredor sale con código 1 y su salida de error contiene `"n bajó de 3 a 2"`

#### Scenario: Un baseline con modo null compara n
- **WHEN** el corredor se ejecuta como en "El corredor falla si se pierden fixtures" pero el `baseline.json` temporal es `{ "modo": null, "metricas": { "nuip-formato": { "valido": { "n": 3, "exact_match": 1, "cer": 0 } } } }` (un `modo` `null` cuenta como baseline que no registra modo) y `--fixtures` contiene los mismos dos fixtures
- **THEN** el corredor sale con código 1 y su salida de error contiene `"n bajó de 3 a 2"`

### Requirement: EV-04 Directorios de fixtures y reportes configurables
El corredor SHALL aceptar `--fixtures <dir>` y `--reportes <dir>`; sin ellas usa `evals/fixtures` y `evals/reports`. Con `--fixtures` MUST leer fixtures solo de ese directorio y sus subdirectorios; con `--reportes` MUST leer `baseline.json` y escribir `latest.json` (y el baseline con `--guardar-baseline`) solo en ese directorio. Un directorio de fixtures inexistente MUST hacer salir al corredor con código 1 y un mensaje que contenga esa ruta.

#### Scenario: Ejecución aislada en directorios temporales
- **WHEN** el corredor se ejecuta con `--quick`, `--fixtures` apuntando a un directorio temporal con un fixture sintético válido de tipo `"nuip-formato"` y `--reportes` apuntando a otro directorio temporal vacío
- **THEN** el corredor sale con código 0, existe `latest.json` en el directorio temporal de reportes con `casos` igual a `1`, y los bytes de `evals/reports/baseline.json` son idénticos antes y después de la ejecución (`evals/reports/latest.json` es efímero y no versionado: otras ejecuciones concurrentes pueden reescribirlo, por lo que la prueba solo protege el baseline)

#### Scenario: Directorio de fixtures inexistente
- **WHEN** el corredor se ejecuta con `--fixtures` apuntando a una ruta temporal que no existe y `--reportes` apuntando a un directorio temporal vacío
- **THEN** el corredor sale con código 1, su salida de error contiene esa ruta y no se escribe `latest.json` en el directorio de reportes

### Requirement: EV-05 Esperado inválido
Si el `esperado` de un fixture falta, es `null`, es un array o no es un objeto, el corredor MUST salir con código 1 antes de evaluar ningún caso, con un mensaje que contenga la ruta del fixture, su tipo y la palabra `esperado`. La agregación de métricas MUST lanzar un error que contenga el tipo y la palabra `esperado` si recibe un caso cuyo `esperado` no es un objeto no nulo ni array.

#### Scenario: Fixture sin esperado
- **WHEN** el corredor se ejecuta con `--quick`, `--reportes` apuntando a un directorio temporal vacío y `--fixtures` apuntando a un directorio temporal con un fixture sintético válido de tipo `"nuip-formato"` y el fixture `sin-esperado.json` `{ "sintetico": true, "tipo": "nuip-formato", "entrada": "9999123456" }`
- **THEN** el corredor sale con código 1, su salida de error contiene `"sin-esperado.json"`, `"nuip-formato"` y `"esperado"`, y no se escribe `latest.json` en el directorio de reportes

#### Scenario: Esperado nulo, array o texto
- **WHEN** el corredor convierte en casos, por separado, los fixtures de tipo `"tipo-x"` con rutas `"a.json"`, `"b.json"` y `"c.json"` cuyo `esperado` es `null`, `[]` y `"x"`
- **THEN** cada conversión falla con un error cuyo mensaje contiene la ruta correspondiente, `"tipo-x"` y `"esperado"`, sin invocar al evaluador

#### Scenario: Agregación con esperado nulo
- **WHEN** se agrega un caso de tipo `"tipo-x"` con `esperado` `null` y resultado `{}`
- **THEN** la agregación lanza un error (no un `TypeError` del motor) cuyo mensaje contiene `"tipo-x"` y `"esperado"`
