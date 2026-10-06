# Design

## Context

Motivación: ver `proposal.md` (Why). Estado observado en el código (commit 68c2ddc):

- `packages/parsers/src/nuip-formato.ts` evalúa en este orden: `SOLO_ADMITIDOS = /^[0-9.\-\s]*$/` -> `caracteres-invalidos`; `PATRON_NIT = /-[0-9]\s*$/` -> `posible-digito-verificacion`; quitar `/[.\-\s]/g` -> `vacio`; quitar ceros; tabla de longitudes. `\s` de JavaScript incluye BOM, U+2028/2029, U+3000, U+2007 y otros; `PATRON_NIT` no admite separadores entre guion y dígito ni después del dígito salvo `\s`. `opciones?.tipoDocumento === "ti"` decide la tabla, así que `"TI"` o `"xx"` caen en cédula. La firma es `entrada: string`; con `null` lanza en `.test()`/`.replace()` cuando se llama desde JavaScript.
- `packages/parsers/test/nuip-formato.test.ts` ya usa `fast-check` y la función auxiliar `cumpleFormaNf01`, cuya lista `MOTIVOS` hay que ampliar.
- `evals/runners/metricas.mjs` (`agregar`) recorre solo las claves de `esperado`: una clave sobrante en el resultado no se detecta. `evals/runners/eval-campo.mjs` arma `casos` con `{ tipo, esperado, obtenido }` y ya pasa `opciones`.
- Stryker 10 (`@stryker-mutator/core`, `@stryker-mutator/vitest-runner`) está instalado pero sin configurar. `.gitignore` ya ignora `.stryker-tmp/` y `reports/mutation/`; ESLint ya ignora `reports/**`.
- `formato-nuip` aún no está en `openspec/specs/`: ver la sección "Orden de archivo" de `proposal.md`.

Requisitos: `specs/formato-nuip/spec.md` (NF-01, NF-02, NF-03, NF-05, NF-06, NF-08, NF-09 modificados; NF-10 a NF-13 nuevos) y `specs/evals-por-campo/spec.md` (EV-01, EV-02).

## Goals / Non-Goals

**Goals:**
- Que ningún dígito de verificación estilo NIT se absorba por variaciones de espaciado o puntuación.
- Función total sobre cualquier valor de JavaScript, con prioridad de motivos única y probada.
- Conjunto de separadores cerrado y explícito, en lugar de depender de la definición de `\s` del motor.
- Evidencia de calidad de las pruebas por mutación (>= 85 %), no solo por cobertura.

**Non-Goals:**
- Cambiar rangos de longitud de CC (5-10) o TI (10/11) ni el estado de N01.
- Normalizar Unicode (NFKC) de la entrada: convertiría dígitos de ancho completo en ASCII, que NF-05 rechaza a propósito.
- Mutación de `evals/` o `tools/` (son `.mjs` de herramientas; se cubren con pruebas unitarias).

## Decisions

1. **Orden de evaluación** (implementa NF-13):
   (a) `typeof entrada !== "string"` -> `entrada-no-texto`.
   (b) Resolver el tipo de documento (NF-10) -> `tipo-documento-invalido` si no es `cc`/`ti`.
   (c) `entrada.length > 64` -> `entrada-demasiado-larga`, sin ejecutar ninguna expresión regular sobre la entrada.
   (d) Algún carácter fuera de `[0-9]` y del conjunto S de separadores -> `caracteres-invalidos`.
   (e) Regla NIT sobre la entrada original -> `posible-digito-verificacion`.
   (f) Quitar S; si queda vacío -> `vacio`.
   (g) Quitar ceros a la izquierda y aplicar la tabla de longitudes.
   Alternativa descartada: comprobar la longitud antes que el tipo de documento; un error de configuración del llamador (tipo inválido) es más útil que un error de dato y no cuesta procesar la entrada.
2. **Conjuntos de caracteres.** H (guiones) = U+002D, U+2010, U+2011, U+2013, U+2212. W (espacio admitido) = U+0020, U+0009, U+000A, U+000D, U+00A0, U+202F. S = `.` ∪ H ∪ W. Se escriben como clases explícitas con escapes `\u`, nunca con `\s`. Expresiones orientativas (no normativas):
   - Admitidos: `/^[0-9.\-‐‑–− \t\n\r  ]*$/`
   - NIT: `/[\-‐‑–−][.\-‐‑–− \t\n\r  ]*[0-9][.\-‐‑–− \t\n\r  ]*$/`
   Es la generalización del patrón propuesto `/-[\s.\-]*[0-9][\s.\-]*$/` con H y W en lugar de `-` y `\s`. Como antes de (e) ya se garantizó que solo hay dígitos y S, la expresión implica que el último dígito de la entrada no tiene otro dígito pegado antes y que entre él y el dígito anterior hay al menos un guion. Escribir el código con la herramienta de escritura de archivos, no con heredoc (errores pasados de `CLAUDE.md`).
3. **Lectura del tipo de documento.** `opciones` `undefined` o `null` -> `cc`. `opciones` primitivo (string, number, boolean, bigint, symbol) -> inválido. Objeto o función: se lee `tipoDocumento` una sola vez; `undefined` -> `cc`; string -> `trim()` y `toLowerCase()` (sin `toLocaleLowerCase`, para no depender del entorno, NF-02); otro valor -> inválido. La firma pública pasa a `validarFormatoNuip(entrada: unknown, opciones?: unknown)`; se mantiene exportado `OpcionesFormatoNuip` como documentación del uso correcto. Alternativa descartada: lanzar `TypeError`; rompe NF-02 y obliga a cada parser a envolver la llamada.
4. **Objetos hostiles.** Proxies o accesores que lanzan quedan fuera de NF-02 (no se envuelve en `try/catch`): capturar excepciones arbitrarias ocultaría errores de programación y `fc.anything()` no genera accesores.
5. **Límite de 64 en unidades UTF-16.** Es `entrada.length`, O(1), y acota el trabajo de las expresiones regulares (ninguna tiene retroceso catastrófico, pero el límite evita depender de ello). 64 deja margen sobre los 10-11 dígitos con separadores, ceros y espacios de OCR. Motivo propio `entrada-demasiado-larga` (decisión 11 del orquestador) para que la UI distinga "texto anómalo" de "número con cantidad de dígitos incorrecta".
6. **Evals `__claves` (EV-01, EV-02).** `agregar(casos)` acepta en cada caso un `clavesExactas?: boolean` opcional. Si es `true`: valor esperado = `JSON.stringify(Object.keys(esperado).sort())`, obtenido = lo mismo sobre el resultado (o `"[]"` si no es objeto no nulo); exacto si son iguales; CER 0/1 (no Levenshtein: una cadena JSON de claves no tiene sentido como CER). Si `esperado` contiene `__claves`, `agregar` lanza `Error` (EV-02). `eval-campo.mjs` copia `f.clavesExactas === true` en el caso. Todos los fixtures de `nuip-formato` pasan a llevar `"clavesExactas": true`. Alternativa descartada: comparar claves siempre; rompería fixtures de otros evaluadores que comparan solo un subconjunto de campos a propósito.
7. **Stryker.** Archivo `stryker.config.mjs` en la raíz con `testRunner: "vitest"`, `mutate: ["packages/parsers/src/**/*.ts", "!packages/parsers/src/index.ts"]`, `thresholds: { high: 95, low: 85, break: 85 }`, `reporters: ["clear-text", "progress", "html"]` (HTML en `reports/mutation/`, ya ignorado), `coverageAnalysis: "perTest"`, y `vitest: { configFile: "vitest.config.ts" }`. Script raíz `"test:mutacion": "stryker run"` y `"check:completo": "npm run check && npm run test:mutacion"`; job `mutacion` separado en `.github/workflows/ci.yml` (Node 24, `npm ci`, `npm run test:mutacion`, sube `reports/mutation/` como artefacto). No se usa el checker de TypeScript (no instalado; añadirlo sería una dependencia nueva, skill `licencia-check`). `index.ts` se excluye porque solo reexporta y define `VERSION`. Hoy el único módulo mutado es `nuip-formato.ts`, que es donde se exige el 85 %; cuando entren otros parsers el umbral aplica al conjunto. No entra en `npm run check` por su duración (decisión 14 del orquestador). Umbral `break` 85, más estricto que el mínimo de la matriz de `estrategia-pruebas` (break 80, objetivo 85). Mutantes equivalentes: se marcan con `// Stryker disable next-line <mutador>: <razón>` y la razón se revisa en la verificación; nunca para ocultar una prueba que falta.
8. **Estrategia de pruebas por tarea.** Cada tarea de `tasks.md` declara sus tipos de prueba y su comando según la sección `## Pruebas` y la skill `estrategia-pruebas`. TDD: la prueba se ve fallar antes de implementar (principio II).

## Decisiones del orquestador (2026-10-06, pendientes de ratificación humana)

1. **Dígito de verificación con espacios o separador final:** se rechaza con `posible-digito-verificacion` cuando, tras el último guion, solo queda un dígito rodeado únicamente de separadores (NF-08, NF-09). Patrón orientativo `/-[\s.\-]*[0-9][\s.\-]*$/` sobre la entrada original, concretado en la decisión 2 con H y W. Siguen válidos `"9999-123-456"` y `"9999123456-"`.
2. **Tipo de documento en tiempo de ejecución:** se recorta y pasa a minúsculas; si no es `"cc"` ni `"ti"`, motivo nuevo `tipo-documento-invalido` (NF-10). `"TI"` -> `"ti"`.
3. **Entrada que no es string:** nunca lanza; motivo nuevo `entrada-no-texto` (NF-11), con propiedad `fc.anything()` (NF-02).
4. **Separadores Unicode:** espacio admitido solo U+0020, tab, CR, LF y U+00A0 (y U+202F, decisión 11); BOM, U+2028, U+2029, U+3000, U+2007 -> `caracteres-invalidos`. Guiones U+2010, U+2011, U+2013, U+2212 aceptados como guion (frecuentes en OCR/PDF) y cuentan para la regla NIT (NF-03, NF-05, NF-08). Cualquier otro espacio o guion Unicode (U+000B, U+000C, U+0085, U+2009, U+2012, U+2014, U+FE63, U+FF0D) también es `caracteres-invalidos`.
5. **Escenarios fijos:** `"-6"` y `"0-0"` -> `posible-digito-verificacion`; `"-"` -> `vacio` (NF-06, NF-08).
6. **Longitud máxima:** 64 caracteres; más -> rechazo sin procesar (NF-12), con el motivo de la decisión 12.
7. **TI con ceros a la izquierda:** `"09999123456"` con `ti` -> `"9999123456"`, `nuip`, 10 dígitos (NF-09).
8. **Evals con claves exactas:** campo especial `__claves` cuando el fixture trae `"clavesExactas": true` (EV-01), con pruebas en `tools/test/metricas.test.mjs`.
9. **Prioridad de motivos:** `entrada-no-texto` > `tipo-documento-invalido` > `entrada-demasiado-larga` > `caracteres-invalidos` > `posible-digito-verificacion` > `vacio` > `longitud-invalida` (NF-13). Revisada: no se encontró incoherencia. `posible-digito-verificacion` y `vacio` nunca coinciden (la regla NIT exige un dígito), así que su orden relativo no es observable; se mantiene por claridad.
10. **Mutación:** Stryker sobre `packages/parsers`, `npm run test:mutacion`, umbral `break` 85.
11. **U+202F admitido** (respuesta a la pregunta 1 del redactor): el espacio estrecho sin corte, separador de miles en PDF, entra en W. U+2009, U+2012 y el resto siguen como `caracteres-invalidos` (NF-03, NF-05).
12. **Motivo propio para entrada larga** (pregunta 2): `entrada-demasiado-larga` para más de 64 unidades UTF-16 (NF-01, NF-12, NF-13).
13. **`opciones` nulas** (pregunta 3): `opciones: null` equivale a ausente; `{ tipoDocumento: null }` es `tipo-documento-invalido` (NF-10). Ratificado por el orquestador.
14. **Mutación fuera de `check`** (pregunta 4): `npm run test:mutacion` no entra en `npm run check`; se añade `npm run check:completo` que lo incluye y un job de CI separado (tarea 1.1).
15. **Añadidos del redactor aceptados** (pregunta 5): NF-13 como requisito propio de prioridad, capacidad `evals-por-campo` con EV-01 y EV-02.

## Pruebas

Según el principio II (constitución 1.1.0) y la matriz de `.claude/skills/estrategia-pruebas/SKILL.md`, filas "Parsers" (NF-xx) y "Evals de campo" (EV-xx y evals de NF). Comandos: `V` = `npx vitest run packages/parsers`; `M` = `npm run test:mutacion` (mutación sobre `packages/parsers/src/nuip-formato.ts`); `E` = `npm run eval:quick`; `T` = `npx vitest run tools/test/metricas.test.mjs`. Toda propiedad usa `numRuns >= 1000`. "Unitaria" = un `it` por escenario, nombrado con ID + escenario, con los literales de la spec y `toStrictEqual`. Errores pasados de `CLAUDE.md` (RH, sexo, Ñ, apellidos): no aplican a este validador.

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| NF-01 | Unitaria (forma exacta, 3 escenarios) | Vitest | V | 100 % de escenarios en verde |
| NF-01 | Propiedad (toda salida cumple `cumpleFormaNf01` con los 7 motivos) | fast-check | V | numRuns >= 1000, 0 fallos |
| NF-01 | Eval de campo (claves exactas vía `__claves`) | `eval-campo` | E | `__claves` exact 100 %, sin regresión |
| NF-01 a NF-13 | Mutación | Stryker | M | mutation score >= 85 % (break 85) |
| NF-01 a NF-13 | Cobertura de ramas de `nuip-formato.ts` | Vitest + v8 | `npx vitest run packages/parsers --coverage` | ramas >= 95 % |
| NF-02 | Propiedad: no lanza con `fc.string()` y `fc.string({ unit: "binary" })` (fuzz de entrada) | fast-check | V | numRuns >= 1000 cada una, 0 excepciones |
| NF-02 | Fuzz de entrada: `fc.anything()` como `entrada` y como `opciones` | fast-check | V | numRuns >= 1000 cada una, 0 excepciones, resultado exacto del escenario |
| NF-02 | Propiedad: determinismo e idempotencia | fast-check | V | numRuns >= 1000 |
| NF-03 | Unitaria (5 escenarios + U+202F) | Vitest | V | 100 % en verde |
| NF-03 | Propiedad P1 (dígitos + S, <= 64, nunca `caracteres-invalidos`) | fast-check | V | numRuns >= 1000 |
| NF-03 | Eval de campo (`guiones-unicode`, casos previos) | `eval-campo` | E | exact 100 %, CER 0 %, sin regresión |
| NF-04 | Unitaria (escenarios existentes, sin cambio) | Vitest | V | 100 % en verde |
| NF-05 | Unitaria (9 escenarios, espacios y guiones Unicode, surrogate) | Vitest | V | 100 % en verde |
| NF-05 | Propiedad P2 (inserción de carácter no admitido) con `fc.string({ unit: "binary" })` (fuzz) | fast-check | V | numRuns >= 1000 |
| NF-05 | Eval de campo (`bom`, `espacio-ideografico`) | `eval-campo` | E | exact 100 %, sin regresión |
| NF-06 | Unitaria (4 escenarios) | Vitest | V | 100 % en verde |
| NF-06 | Eval de campo (`guion-solo`) | `eval-campo` | E | exact 100 %, sin regresión |
| NF-07 | Unitaria (escenarios existentes, sin cambio) | Vitest | V | 100 % en verde |
| NF-08 | Unitaria (11 escenarios) | Vitest | V | 100 % en verde |
| NF-08 | Propiedad P3 (N + sep + guion + sep + d + sep -> NIT) y P4 (sin guion nunca NIT) | fast-check | V | numRuns >= 1000 cada una |
| NF-08 | Eval de campo (`nit-*`, `guion-digito`, `cero-guion-cero`, `digito-aislado-sin-guion`) | `eval-campo` | E | exact 100 %, sin regresión |
| NF-09 | Unitaria (8 escenarios) | Vitest | V | 100 % en verde |
| NF-09 | Propiedad P3 con `"ti"` | fast-check | V | numRuns >= 1000 |
| NF-09 | Eval de campo (`ti-*`) | `eval-campo` | E | exact 100 %, sin regresión |
| NF-10 | Unitaria (8 escenarios) | Vitest | V | 100 % en verde |
| NF-10 | Propiedad (todo `tipoDocumento` string que no normaliza a cc/ti -> `tipo-documento-invalido`) | fast-check | V | numRuns >= 1000 |
| NF-10 | Eval de campo (`tipo-mayusculas`, `tipo-invalido`) | `eval-campo` | E | exact 100 %, sin regresión |
| NF-11 | Unitaria (3 escenarios) | Vitest | V | 100 % en verde |
| NF-11 | Fuzz de entrada: `fc.anything()` no string -> `entrada-no-texto` | fast-check | V | numRuns >= 1000 |
| NF-11 | Eval de campo (`entrada-numero`, `entrada-null`) | `eval-campo` | E | exact 100 %, sin regresión |
| NF-12 | Unitaria (7 escenarios, límites 64/65, UTF-16, 1 000 000) | Vitest | V | 100 % en verde |
| NF-12 | Fuzz de entrada: `fc.string({ unit: "binary", minLength: 65 })` | fast-check | V | numRuns >= 1000 |
| NF-12 | Eval de campo (`entrada-65`) | `eval-campo` | E | exact 100 %, sin regresión |
| NF-13 | Unitaria (cadena de 7 prioridades, vacío sobre longitud) | Vitest | V | 100 % en verde |
| EV-01 | Unitaria (7 escenarios sobre `agregar`) | Vitest | T | 100 % en verde |
| EV-01 | Eval de campo (el corredor propaga `clavesExactas`) | `eval-campo` | E | `nuip-formato.__claves` n=40, exact 100 %, sin regresión |
| EV-02 | Unitaria (clave reservada lanza) | Vitest | T | 100 % en verde |

## Risks / Trade-offs

- [Capturas legítimas con espacios Unicode raros (U+2009, U+2012) pasan a rechazarse] -> Error visible y recapturable; ampliar W es un cambio pequeño y aditivo si las evals de campo lo muestran.
- [La regla NIT ampliada rechaza `"9999-123-45-6"` y `"9999.123.45 - 6"` aunque sean agrupaciones raras de un NUIP] -> Preferible al riesgo de absorber un dígito de verificación (principio V); ya estaba aceptado en `validador-formato-nuip`.
- [Cambio de motivo en entradas que hoy son válidas (BREAKING)] -> No hay consumidores fuera de pruebas y evals; los fixtures afectados se actualizan en la tarea de evals y el baseline lo vuelve a fijar el orquestador.
- [Stryker es lento y puede dar mutantes equivalentes en las clases de caracteres] -> Ejecución fuera de `npm run check`; equivalentes documentados en línea con su razón.
- [Archivar en el orden equivocado deja `MODIFIED` sin requisito base] -> Orden obligatorio en `proposal.md` y en `tasks.md` (Workflow follow-up).

## Migration Plan

1. Archivar `validador-formato-nuip` (crea `openspec/specs/formato-nuip/spec.md`).
2. Implementar las tareas en orden; cada una deja `npm test` en verde.
3. El orquestador vuelve a fijar el baseline tras la tarea de evals (aparecen `nuip-formato.__claves` y casos nuevos).
4. Archivar `nuip-endurecer-entradas`.
Reversión: revertir el commit del cambio; la spec archivada de `validador-formato-nuip` sigue siendo coherente por sí sola.

## Open Questions

Ninguna técnica. Las cinco preguntas del redactor quedaron resueltas por el orquestador (decisiones 11 a 15); falta solo la ratificación humana de las decisiones 1 a 15.
