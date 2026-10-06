# Spec Delta

## Purpose

Fijar cómo el corredor de evals por campo compara el resultado de un parser con el valor esperado de cada fixture, para que las métricas detecten regresiones de forma reproducible (principio II).

## ADDED Requirements

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

#### Scenario: El corredor propaga la marca del fixture
- **WHEN** se ejecuta `npm run eval:quick` con fixtures de `nuip-formato` que declaran `"clavesExactas": true`
- **THEN** `evals/reports/latest.json` contiene `metricas["nuip-formato"].__claves` con `n` igual al número de esos fixtures

### Requirement: EV-02 Nombre de campo reservado
El nombre `__claves` SHALL estar reservado para EV-01. Si el `esperado` de un caso contiene la clave `__claves`, el corredor MUST fallar con un error que nombre el tipo del caso, en lugar de mezclar ese valor con la métrica de claves.

#### Scenario: Esperado con la clave reservada
- **WHEN** se agrega un caso de tipo `"t"` cuyo `esperado` es `{ "__claves": 1 }`
- **THEN** la agregación lanza un error cuyo mensaje contiene `"__claves"` y `"t"`
