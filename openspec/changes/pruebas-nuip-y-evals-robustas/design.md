# Design

## Context

Motivación: ver `proposal.md` (Why). Estado observado (2026-10-06):

- `packages/parsers/test/nuip-formato.test.ts` (846 líneas). El generador `capturaPlausible` (líneas 52-57) produce cadenas de como máximo 16 caracteres sobre un alfabeto donde los separadores pesan casi la mitad: la mayoría de los casos tiene menos de 5 dígitos o activa la regla NIT. Por eso:
  - "Idempotencia de la normalización" (161-170, cédula) retorna temprano en 931 de 1000 casos y nunca ve un `nuip`;
  - la idempotencia con `"ti"` (561-571) no ve ningún caso válido;
  - "Nunca lanza con capturas plausibles" (141-146) solo comprueba la forma.
- Oráculos que recalculan la implementación: 115-125 (`typeof opciones === "object"`), 651-661 (filtro con `trim().toLowerCase()`), 684-695 (`trim().toLowerCase()` para decidir el esperado). La propiedad 663-682 compara contra la llamada canónica (correcto), pero su generador de blancos incluye U+3000 y U+FEFF, cuyo recorte es el hueco #1 del backlog.
- Ninguna propiedad comprueba el valor de `numero` frente a un valor conocido.
- P3 (471-492) genera N solo con dígitos puros.
- 719-726 duplica la propiedad de NF-02 en 103-112. La línea 708 contiene solo espacios (probable `eslint-disable` perdido sobre `new String`; la configuración actual de ESLint no activa `no-new-wrappers`).
- `evals/runners/metricas.mjs`: `regresiones()` no mira `n`; `agregar()` lanza un `TypeError` del motor si `esperado` es `null` (en `Object.hasOwn`). `evals/runners/eval-campo.mjs` mezcla E/S y construcción de casos, con rutas fijas `evals/fixtures` y `evals/reports`, y nada prueba que copie `clavesExactas`.
- `stryker.config.mjs` muta solo `packages/parsers/src/**/*.ts`. El diseño archivado de `nuip-endurecer-entradas` dejó `evals/` fuera de la mutación (Non-Goals); este cambio lo revierte para `metricas.mjs`.
- `vitest.config.ts` ya incluye `tools/test/**/*.test.mjs`.

Requisitos: `specs/formato-nuip/spec.md` (NF-02, NF-08, NF-10, NF-13 modificados; NF-14 nuevo) y `specs/evals-por-campo/spec.md` (EV-01 modificado; EV-03, EV-04, EV-05 nuevos).

## Goals / Non-Goals

**Goals:**
- Que cada propiedad pueda fallar: generadores válidos por construcción, salvaguarda medible contra vacuidad y oráculos que no copian la implementación.
- Que el harness de evals detecte la pérdida de fixtures y que su cableado (propagación de `clavesExactas`, `esperado` inválido) tenga prueba automática.
- Mutación de `evals/runners/metricas.mjs` con el mismo umbral que los parsers.

**Non-Goals:**
- Cambiar el comportamiento de `validarFormatoNuip`. Si una propiedad nueva falla contra el código actual, el implementador se detiene y lo reporta: la spec vigente decide y no se ajusta la prueba al código.
- Resolver los huecos #1 a #6 y #8 del backlog. Las pruebas nuevas evitan fijar comportamiento en esas zonas (por ejemplo, sin U+3000 ni U+FEFF alrededor de `tipoDocumento`, sin `"Tİ"` ni `"ＴＩ"`, sin dígito suelto tras un dígito de verificación).
- Cambiar el baseline: las métricas de `nuip-formato` no cambian.

## Decisions

1. **Generadores válidos por construcción** (NF-02, NF-14). Se escriben en una sección "Generadores" al inicio de `nuip-formato.test.ts`:
   - `G_cc`: D = `"9999"` + 1 a 6 dígitos (5 a 10 dígitos), de 0 a 5 ceros delante, rachas de 0 a 2 separadores de S (punto, H y W) antes, entre y después de cada carácter, salvo entre los dos últimos dígitos de D. Devuelve `{ entrada, D }`. Cota: 15 caracteres + 16 rachas × 2 = 47 <= 64.
   - `G_ti`: igual con D = `"9999"` + 6 o 7 dígitos. Cota: 16 + 17 × 2 = 50 <= 64.
   - `G_sinGuion`: de 0 a 12 dígitos cualesquiera con rachas de 0 a 3 caracteres de `.` ∪ W. Cota: 12 + 13 × 3 = 51 <= 64. Sin guiones para que la regla NIT no aplique y el oráculo no tenga que reimplementarla.
   - Por qué los dos últimos dígitos pegados: así la regla NIT de NF-08 no puede activarse (exige que entre el guion y el último dígito solo haya separadores), sin filtrar después.
   - Por qué el prefijo `"9999"`: convención de la skill `fixture-sintetico` (números reconocibles como sintéticos en los contraejemplos que imprime fast-check). La variedad del primer dígito (1 a 9 y ceros) la cubre `G_sinGuion`. Alternativa descartada: primer dígito libre de 1 a 9 en `G_cc`, como pedía el hallazgo C1; queda como pregunta abierta 2.
   - Alternativa descartada: ampliar `capturaPlausible` a 64 caracteres con `fc.pre`. Seguiría descartando la mayoría de los casos (vacuidad por filtro).
2. **Salvaguarda contra vacuidad.** Cada propiedad con categorías lleva contadores locales que el predicado incrementa (casos ejecutados, válidos, por `tipoProbable`, con ceros, con guion) y, después de `fc.assert`, aserciones `expect(cuenta.x / cuenta.total).toBeGreaterThanOrEqual(umbral)` con los umbrales de los escenarios (válidos > 50 %; categorías >= 10 %, >= 25 % o >= 3 %). El denominador es el contador de ejecuciones, no la constante 1000. `fc.statistics` puede usarse para diagnosticar, pero no cuenta como salvaguarda porque solo imprime. Los umbrales tienen al menos 4 desviaciones típicas de margen con 1000 casos y semilla aleatoria (por ejemplo, `nuip` en `G_cc` sale en torno al 16,7 % frente al 10 % exigido; `ti` válido en `G_sinGuion` en torno al 15 %). Alternativa descartada: semilla fija. Haría reproducible un umbral demasiado justo y ocultaría el problema.
3. **Nombres que dicen qué atrapan.** Formato: `"<ID> <escenario> (atrapa: <fallo>)"`; por ejemplo `"NF-14 Captura válida por construcción en cédula (atrapa: numero distinto de D o tipoProbable fuera de la tabla)"` y `"NF-02 Idempotencia de la normalización en cédula (atrapa: segunda validación distinta o generador vacío)"`.
4. **Oráculos independientes** (NF-10, NF-14). El valor esperado nunca se calcula con `trim()`, `toLowerCase()`, las expresiones de `nuip-formato.ts` ni una clasificación por `typeof` equivalente a la de la implementación. Se permite: (a) tablas literales de la spec (longitud -> `tipoProbable` y `warnings`); (b) filtrar los caracteres `0` a `9` y quitar ceros iniciales en `G_sinGuion`, que no usa la lista de separadores de la implementación; (c) restringir el generador (por ejemplo `fc.anything().filter((v) => typeof v !== "string")`), que acota la entrada sin calcular la salida. Comprobación automática: `grep -nE "trim\(\)\.toLowerCase\(\)|typeof opciones ===" packages/parsers/test/nuip-formato.test.ts` no devuelve nada.
5. **Listas literales de `tipoDocumento` solo con W.** Las variantes aceptadas usan solo caracteres de W, donde `trim()` y la propuesta del hueco #1 coinciden. La propiedad de las líneas 663-682 restringe su generador de blancos a W (se quitan U+3000 y U+FEFF) hasta que se decida el hueco #1 (pregunta abierta 4). Los casos frontera excluyen `"Tİ"` y `"ＴＩ"` (hueco #6).
6. **Particiones de `opciones` arbitrarias** (NF-02, NF-10). La prueba de 115-125 se divide en: primitivas -> `tipo-documento-invalido`; objetos y arrays sin `tipoDocumento` propio -> NUIP válido; `fc.anything()` -> exactamente uno de los dos objetos del escenario de NF-02 (disyunción literal, sin clasificar por tipo). Las claves `"__proto__"` se excluyen del diccionario para no tocar el hueco #2.
7. **Lectura única de `tipoDocumento`** (NF-10, decisión 3 del diseño archivado). Prueba con `Object.defineProperty(opciones, "tipoDocumento", { get })` cuyo accesor incrementa un contador y devuelve `"ti"` y luego `"xx"`.
8. **P3 con número agrupado** (NF-08). N se genera como dígitos con rachas de S (incluidos guiones) entre ellos; a, b y c con rachas de 0 a 10. Cota: 11 + 10 × 2 + 3 × 10 + 2 = 63 <= 64. Contador: al menos 25 % de casos con guion dentro de N.
9. **Duplicado de NF-11 y línea 708.** Se elimina la propiedad de 719-726 y la de 103-112 pasa a llamarse `"NF-02 / NF-11 Nunca lanza con valores arbitrarios como entrada (atrapa: ...)"` para conservar la trazabilidad del escenario de NF-11 "sin opciones". La línea 708 se borra; si ESLint marca `new String`, se restaura `// eslint-disable-next-line no-new-wrappers -- NF-11 exige probar el envoltorio`.
10. **Función pura `construirCasos`** (EV-01, EV-05). Se añade en `evals/runners/metricas.mjs` (así la muta Stryker sin tocar la configuración de archivos): `construirCasos(fixtures, evaluar)` recibe `[{ ruta, tipo, entrada, opciones, esperado, clavesExactas }]` y una función `evaluar(tipo, entrada, opciones)`, y devuelve `{ casos, errores }`. Primero valida el `esperado` de todos los fixtures (lanza `Error` con ruta, tipo y `esperado`) y después evalúa; copia `clavesExactas: f.clavesExactas === true`; captura las excepciones del evaluador en `errores` con la ruta, como hoy. `eval-campo.mjs` conserva solo la E/S (listar, leer, marca `sintetico`, `tsc -b`, cargar evaluadores, escribir reportes). Alternativas descartadas: solo `spawnSync` (lento, sin mutación) o solo la función pura (no prueba el cableado del CLI). Se hacen las dos.
11. **Banderas `--fixtures` y `--reportes`** (EV-04). Se resuelven con `path.resolve` desde el directorio de trabajo. Sin ellas, los valores actuales. Si el directorio de fixtures no existe, error con la ruta y código 1, antes de compilar.
12. **Regresión por `n`** (EV-03). `regresiones()` añade `"<tipo>.<campo>: n bajó de <base> a <actual> (se perdieron casos)"` cuando `act.n < base.n`. Es independiente de las comprobaciones de `exact_match` y CER. Hoy `--quick` y el modo completo ven los mismos fixtures (no hay carpeta `lentos`), así que no hay falsos positivos (pregunta abierta 3).
13. **Validación en `agregar`** (EV-05). Antes de la comprobación de EV-02: si `esperado` no es un objeto no nulo ni array, `Error` con el tipo y `esperado`.
14. **Stryker sobre `metricas.mjs`.** `mutate` añade `"evals/runners/metricas.mjs"`. Se crea `vitest.stryker.config.ts`, que extiende `vitest.config.ts` y excluye `tools/test/eval-campo.test.mjs`: esa prueba lanza `node` y `tsc -b` en otro proceso, no está instrumentada y en el sandbox de Stryker solo añade tiempo. `stryker.config.mjs` apunta a ese archivo. Umbral `break` 85 global y, además, cada archivo mutado >= 85 % en la tabla `clear-text` (lo comprueba el verificador). Sin dependencias nuevas.
15. **Prueba de integración del corredor** (`tools/test/eval-campo.test.mjs`). Usa `spawnSync(process.execPath, ["evals/runners/eval-campo.mjs", "--quick", "--fixtures", tmpF, "--reportes", tmpR], { cwd: RAIZ, encoding: "utf8" })` con directorios de `fs.mkdtempSync(os.tmpdir())`, fixtures sintéticos (`9999...`, `"sintetico": true`), timeout de la prueba de 120 s, y borra los temporales en `afterEach`. Comprueba que `evals/reports/latest.json` y `baseline.json` no cambian (bytes antes y después).
16. **TDD de la salvaguarda.** Antes de sustituir `capturaPlausible`, la salvaguarda se ejecuta una vez con el generador viejo y debe fallar (69/1000 válidos en cédula, 0/1000 en tarjeta de identidad). Esa salida es la evidencia de que la salvaguarda funciona.

## Pruebas

Según el principio II y la matriz de `.claude/skills/estrategia-pruebas/SKILL.md` (filas "Parsers" y "Evals de campo"). Comandos: `V` = `npx vitest run packages/parsers`; `T` = `npx vitest run tools/test/metricas.test.mjs`; `I` = `npx vitest run tools/test/eval-campo.test.mjs`; `M` = `npm run test:mutacion`; `E` = `npm run eval:quick`; `L` = `npx eslint packages/parsers/test/nuip-formato.test.ts`. Toda propiedad usa `numRuns >= 1000`. "Vacuidad" = proporción medida con contadores (decisión 2) y comprobada con `expect` tras `fc.assert`.

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| NF-02 | Propiedad: idempotencia sobre `G_cc` y `G_ti` | fast-check | V | numRuns >= 1000 por generador; 0 fallos; vacuidad: válidos > 50 % de los casos ejecutados en cada generador |
| NF-02 | Fuzz de entrada: no lanza con `fc.string()`, binario y `fc.anything()` (pruebas existentes) | fast-check | V | numRuns >= 1000 cada una; 0 excepciones |
| NF-02, NF-10 | Fuzz de opciones: `fc.anything()` con disyunción literal; particiones primitivas y objetos | fast-check | V | numRuns >= 1000 cada una; resultado exacto del escenario |
| NF-08 | Unitaria: `"9999-12345-6"` y `"99.99-123.45 - 6"`, cc y ti | Vitest | V | 4 de 4 `toStrictEqual` |
| NF-08 | Propiedad P3 con N agrupado | fast-check | V | numRuns >= 1000 por tipo; 100 % NIT; 100 % entradas <= 64; vacuidad: >= 25 % con guion en N |
| NF-10 | Unitaria: lectura única con accesor contador | Vitest | V | resultado exacto y contador = 1 |
| NF-10 | Unitaria: 16 variantes aceptadas y 12 casos frontera | Vitest | V | 28 de 28 `toStrictEqual` |
| NF-10 | Propiedad: texto sin c/t/i; variantes generadas con W; tipo no texto | fast-check | V | numRuns >= 1000 cada una; esperado literal; 0 coincidencias de `trim().toLowerCase()` en el archivo de pruebas |
| NF-13 | Propiedad: binario (y binario >= 65) con `"xx"`; no texto con `opciones` arbitrarias | fast-check | V | numRuns >= 1000 cada una; 100 % del motivo esperado |
| NF-14 | Propiedad: `G_cc` | fast-check | V | numRuns >= 1000; resultado exacto con D; vacuidad: válidos > 50 %, `nuip` >= 10 %, `cedula-antigua` >= 10 %, con ceros >= 10 %, con guion >= 10 % |
| NF-14 | Propiedad: `G_ti` | fast-check | V | numRuns >= 1000; resultado exacto con D y `warnings` de N01; vacuidad: válidos > 50 %, `nuip` >= 25 %, `ti-antigua` >= 25 %, con ceros >= 10 %, con guion >= 10 % |
| NF-14 | Propiedad de oráculo: `G_sinGuion`, cc y ti | fast-check | V | numRuns >= 1000 por tipo; igualdad exacta con el oráculo; vacuidad por tipo: válidos >= 10 %, `longitud-invalida` >= 10 %, `vacio` >= 3 % |
| NF-14 | Unitaria: ejemplos fijos | Vitest | V | 3 de 3 `toStrictEqual` |
| NF-02 a NF-14 | Mutación de `nuip-formato.ts` | Stryker | M | >= 85 % en el archivo y no menor que el último reporte |
| NF-02 a NF-14 | Eval de campo (sin cambios de fixtures) | `eval-campo` | E | sin regresión; `nuip-formato.__claves` n=40, exact 100 % |
| EV-01 | Unitaria: valor `undefined` sobrante; solo `true` activa | Vitest | T | `toStrictEqual` con `{ n, exact_match, cer }` exactos |
| EV-01 | Unitaria: `construirCasos` copia `clavesExactas === true` | Vitest | T | 100 % en verde |
| EV-01 | Integración del corredor (`spawnSync`, directorios temporales) | Vitest + node | I | código 0; `__claves` `{ n: 2, exact_match: 1, cer: 0 }`; `valido.n` 3; <= 120 s |
| EV-03 | Unitaria: caída de n, n igual o mayor, caída combinada | Vitest | T | 1, 0, 0 y 2 regresiones exactas; mensaje con `tipo-x.a`, `40` y `39` |
| EV-03 | Integración: fixtures perdidos | Vitest + node | I | código 1; stderr con `nuip-formato.valido`, `3` y `2` |
| EV-04 | Integración: ejecución aislada y directorio inexistente | Vitest + node | I | códigos 0 y 1; `evals/reports/*.json` idénticos en bytes; sin `latest.json` en el segundo caso |
| EV-05 | Unitaria: `construirCasos` con `null`, `[]`, `"x"`; `agregar` con `null` | Vitest | T | error con ruta, `tipo-x` y `esperado`; evaluador no invocado (contador 0); no es `TypeError` |
| EV-05 | Integración: fixture sin `esperado` | Vitest + node | I | código 1; stderr con `sin-esperado.json`, `nuip-formato` y `esperado`; sin `latest.json` |
| EV-01, EV-03, EV-05 | Mutación de `evals/runners/metricas.mjs` | Stryker | M | >= 85 % en `metricas.mjs`; `break` 85 global |
| Higiene (S3) | Lint y línea en blanco con espacios | ESLint, grep | L y `grep -nE "^[[:space:]]+$" packages/parsers/test/nuip-formato.test.ts` | 0 problemas; 0 líneas |

## Risks / Trade-offs

- [Umbrales de vacuidad con semilla aleatoria pueden fallar de forma intermitente] -> Márgenes de al menos 4 desviaciones típicas (decisión 2); si aun así fallan, se corrige el generador, nunca se baja el umbral.
- [La prueba de integración del corredor es lenta (`tsc -b` en otro proceso) y corre en `npm test`] -> Una sola ejecución por escenario, timeout de 120 s, excluida de Stryker (decisión 14).
- [Una propiedad nueva puede descubrir que el código incumple la spec vigente] -> El implementador para y reporta; se abre otra decisión. Este cambio no toca `packages/parsers/src/`.
- [Restringir a W el generador de 663-682 deja sin prueba el recorte de U+3000 y U+FEFF] -> Es comportamiento no especificado (hueco #1); fijarlo ahora sería decidir por el humano.
- [La regresión por `n` daría falsos positivos si el baseline se guarda en modo completo y luego hay fixtures `lentos`] -> Hoy no existen; pregunta abierta 3.

## Migration Plan

1. Implementar las tareas en orden; cada una deja `npm test` en verde.
2. No hace falta volver a fijar el baseline (las métricas no cambian); `npm run eval:quick` debe seguir sin regresiones.
3. Archivar con `/opsx:archive` tras el verificador.
Reversión: revertir los commits; ningún consumidor depende de las banderas nuevas.

## Open Questions

Requieren decisión humana; ninguna bloquea las tareas, que evitan fijar comportamiento en esas zonas.

1. **Hueco #3 del backlog (principio V).** `"999912345-6 7"` con `ti` y `"99991234-5 6"` se aceptan absorbiendo un posible dígito de verificación. ¿Debe rechazarse siempre un grupo final de un solo dígito tras un guion seguido de otro grupo? Los generadores de este cambio no producen ese patrón (los dos últimos dígitos de D van pegados y P3 termina en separadores), así que no lo fijan en ningún sentido.
2. **Prefijo `"9999"` en `G_cc` y `G_ti`.** El hallazgo C1 pedía "dígito 1-9 + 4-9 dígitos"; se eligió `"9999"` + resto por la convención de `fixture-sintetico`, y la variedad del primer dígito la cubre `G_sinGuion`. ¿Se ratifica, o se prefiere primer dígito libre aceptando contraejemplos con números no reconocibles como sintéticos?
3. **Modo `--quick` frente a modo completo y regresión por `n`.** Cuando existan fixtures en `lentos/`, ¿el baseline se guarda por modo, o la comparación de `n` solo aplica si el baseline y la ejecución tienen el mismo modo?
4. **Blancos Unicode alrededor de `tipoDocumento` (hueco #1).** Tras decidirlo, ¿se reincorporan U+3000 y U+FEFF a la propiedad de variantes, con el resultado que se decida?
5. **Umbrales de cobertura de categorías** (10 %, 25 %, 3 %). Los fijó el redactor; ¿se ratifican?
6. Sigue pendiente la ratificación de las 15 decisiones del orquestador del cambio archivado `nuip-endurecer-entradas`.

## Decisiones del orquestador (2026-10-06, pendientes de ratificación humana)

- Pregunta 2: se ratifica el prefijo `"9999"` en `G_cc` y `G_ti` (convención de `fixture-sintetico`); la variedad del primer dígito la cubre `G_sinGuion`.
- Pregunta 3: el baseline registra el modo (`quick` o `completo`) y la regresión por `n` solo se evalúa entre ejecuciones del mismo modo.
- Pregunta 5: se aceptan los umbrales de cobertura de categorías propuestos.
- Preguntas 1, 4 y 6: quedan para decisión humana (backlog de formato-nuip).
- Ejecución: un implementador por grupo numerado de tareas (1 a 7), porque las tareas de cada grupo tocan el mismo bloque de pruebas; cada grupo cierra con `npm run check` en verde.
- Baseline oficial: se fija siempre en modo `quick` (`node evals/runners/eval-campo.mjs --quick --guardar-baseline`), porque es el modo que ejecuta el hook de Stop. Un baseline sin `modo` (anteriores) compara `n` siempre. `evals/reports/latest.json` deja de versionarse: lo reescribe cada ejecución.
- Ampliación de la decisión 14: `vitest.stryker.config.ts` excluye también `tools/test/hooks.test.mjs`, porque lanza procesos y escribe archivos temporales en el repositorio; Stryker no muta los hooks.
