# Tasks

Reglas para todas las tareas: TDD (principio II), primero la prueba en rojo y luego la implementación; datos sintéticos únicamente (skill `fixture-sintetico`); recetas de la skill `estrategia-pruebas`; código con barras invertidas escrito con la herramienta de escritura de archivos, no con heredoc. La tabla por requisito está en `design.md`, sección `## Pruebas`. Cada tarea declara sus **tipos de prueba** obligatorios:

- **Unitaria**: un `it` por escenario citado, nombrado con ID + escenario, con los valores literales de la spec y `toStrictEqual`.
- **Propiedad**: `fast-check` con `numRuns >= 1000` por propiedad.
- **Fuzz de entrada**: propiedades con `fc.anything()` y `fc.string({ unit: "binary" })` que exigen 0 excepciones y el resultado exacto del escenario.
- **Mutación**: `npm run test:mutacion` con puntuación >= 85 % sobre `packages/parsers/src/nuip-formato.ts` (umbral `break` 85).
- **Cobertura**: `npx vitest run packages/parsers --coverage` con ramas >= 95 % en `nuip-formato.ts`.
- **Eval de campo**: `npm run eval:quick` con `exact_match` 100.0 % y CER 0.00 % en todos los campos de `nuip-formato`, incluido `__claves`, 0 excepciones y sin regresión frente a `baseline.json`.

Pruebas del validador en `packages/parsers/test/nuip-formato.test.ts`; del corredor en `tools/test/metricas.test.mjs`.

## 1. Pruebas de mutación

- [x] 1.1 Configurar Stryker para `packages/parsers` según design.md (decisiones 7 y 14):
  - `stryker.config.mjs` en la raíz con `testRunner: "vitest"`, `mutate` sobre `packages/parsers/src/**/*.ts` sin `index.ts`, `thresholds: { high: 95, low: 85, break: 85 }`, `coverageAnalysis: "perTest"` y reportes `clear-text`, `progress` y `html` (en `reports/mutation/`).
  - Scripts raíz en `package.json`: `"test:mutacion": "stryker run"` y `"check:completo": "npm run check && npm run test:mutacion"`. `npm run check` NO incluye la mutación.
  - Job `mutacion` separado en `.github/workflows/ci.yml` (Node 24, `npm ci`, `npm run test:mutacion`, sube `reports/mutation/` como artefacto con `if: always()`).
  - Sin dependencias nuevas (ya instaladas).
  - Si la puntuación del código actual es < 85 %, añadir pruebas unitarias que maten los mutantes supervivientes usando solo escenarios existentes de NF-01 a NF-09, sin tocar código de producto. Los mutantes equivalentes se marcan con `// Stryker disable next-line <mutador>: <razón>`.

  Cubre el principio II sobre NF-01 a NF-09 (base para las tareas siguientes). Tipos de prueba: **mutación** (y **unitaria** solo si hace falta subir la puntuación). Verificación: `npm run test:mutacion` sale con código 0 e informa >= 85 % para `nuip-formato.ts`; `npm run check:completo` en verde; `npm run check` en verde sin ejecutar Stryker; el job `mutacion` aparece y pasa en la ejecución de CI del PR.

## 2. Corredor de evals: claves exactas

- [x] 2.1 Ampliar `agregar` en `evals/runners/metricas.mjs` para aceptar `clavesExactas?: boolean` por caso y producir el campo `__claves` (design.md, decisión 6), y lanzar `Error` si `esperado` contiene `__claves`. Escribir antes en `tools/test/metricas.test.mjs` un caso por escenario de EV-01 (salvo "El corredor propaga la marca del fixture") y el de EV-02, con valores exactos (`{ n, exact_match, cer }` con `toStrictEqual`). Las pruebas existentes de `agregar` siguen en verde sin cambios. Cubre EV-01, EV-02. Tipos de prueba: **unitaria**. Verificación: `npx vitest run tools/test/metricas.test.mjs` en verde y `npm test` en verde.
- [x] 2.2 Hacer que `evals/runners/eval-campo.mjs` copie `clavesExactas: f.clavesExactas === true` en cada caso, y añadir `"clavesExactas": true` a los 18 fixtures existentes de `evals/fixtures/sinteticos/nuip-formato/` sin cambiar su `esperado`. Documentar el campo en el comentario de formato de fixture de `eval-campo.mjs`. Cubre EV-01 (escenario "El corredor propaga la marca del fixture") y NF-01 por eval. Tipos de prueba: **eval de campo**. Verificación: `npm run eval:quick` muestra `nuip-formato.__claves` con `n=18`, `exact=100.0%`, `CER=0.00%`, 0 excepciones y sin regresiones; `npm run check` en verde.

## 3. Entrada que no es texto y tipo de documento

- [x] 3.1 Escribir las pruebas de NF-11 (todos sus escenarios), de NF-01 "Motivos nuevos con solo valido y motivo" (parte de `entrada-no-texto`) y de NF-02 "Nunca lanza con valores arbitrarios como entrada". Ampliar `MOTIVOS` y `cumpleFormaNf01` con `entrada-no-texto` y `tipo-documento-invalido`. Verlas fallar. Luego cambiar la firma a `validarFormatoNuip(entrada: unknown, opciones?: unknown)`, ampliar `MotivoFormatoInvalido` con esos dos motivos e implementar el paso (a) de la decisión 1 de design.md. Cubre NF-01, NF-02, NF-11, NF-13. Tipos de prueba: **unitaria** (escenarios de NF-11 y NF-01), **fuzz de entrada** (`fc.anything()` como entrada, con y sin `{ tipoDocumento: "ti" }`, numRuns >= 1000), **mutación**. Verificación: `npx vitest run packages/parsers` en verde, `npm run typecheck` en verde y `npm run test:mutacion` >= 85 %.
- [x] 3.2 Escribir las pruebas de todos los escenarios de NF-10, de NF-01 "Motivos nuevos..." (parte de `tipo-documento-invalido`) y de NF-02 "Nunca lanza con opciones arbitrarias". Verlas fallar. Luego implementar la lectura del tipo de documento (design.md, decisiones 1b, 3 y 13). Cubre NF-01, NF-02, NF-09 (tipo normalizado), NF-10, NF-13. Tipos de prueba:
  - **unitaria**: escenarios de NF-10.
  - **fuzz de entrada**: `fc.anything()` como `opciones` con entrada `"9999123456"`.
  - **propiedad**: para todo `t` de `fc.string()` cuyo `trim().toLowerCase()` no sea `"cc"` ni `"ti"`, el resultado con `{ tipoDocumento: t }` es exactamente `{ valido: false, motivo: "tipo-documento-invalido" }`. numRuns >= 1000.
  - **mutación**.

  Verificación: `npx vitest run packages/parsers` en verde y `npm run test:mutacion` >= 85 %.

## 4. Longitud máxima de la entrada

- [x] 4.1 Escribir las pruebas de todos los escenarios de NF-12, de NF-01 "Motivos nuevos..." (parte de `entrada-demasiado-larga`) y de los dos escenarios de NF-13. Añadir `entrada-demasiado-larga` a `MOTIVOS`. Verlas fallar. Luego ampliar `MotivoFormatoInvalido` con `"entrada-demasiado-larga"` e implementar el paso (c) de la decisión 1 de design.md. Cubre NF-01, NF-12, NF-13. Tipos de prueba:
  - **unitaria**: límites 64/65, unidades UTF-16, 1 000 000 de caracteres, cadena de prioridades.
  - **fuzz de entrada**: `fc.string({ unit: "binary", minLength: 65 })`, con y sin `"ti"`. numRuns >= 1000.
  - **mutación**: el mutante `> 64` -> `>= 64` debe morir con el escenario del límite exacto.

  Verificación: `npx vitest run packages/parsers` en verde y `npm run test:mutacion` >= 85 %.

## 5. Separadores admitidos

- [ ] 5.1 Escribir las pruebas de los escenarios nuevos o modificados de NF-03, NF-05 y NF-06: variantes de guion, CR/LF/tab, espacio estrecho U+202F, espacios Unicode no admitidos, otros espacios, guiones fuera de la lista, surrogate aislado, `"-"`, `"– −"`, `"　"` y `"﻿"`. Ampliar el generador `capturaPlausible` con U+2010, U+2011, U+2013, U+2212, U+202F y `\r`. Verlas fallar. Luego sustituir `\s` por los conjuntos explícitos H y W de la decisión 2 de design.md, tanto en la comprobación de caracteres como en la eliminación de separadores. Cubre NF-03, NF-05, NF-06. Tipos de prueba:
  - **unitaria**: los escenarios citados.
  - **propiedad P1**: toda cadena de hasta 64 caracteres formada solo por dígitos ASCII y separadores de NF-03 nunca da `caracteres-invalidos`.
  - **fuzz de entrada P2**: insertar en cualquier posición de una cadena de P1 un carácter de `fc.string({ unit: "binary", minLength: 1, maxLength: 1 })` que no sea dígito ASCII ni separador de NF-03, sin superar 64 caracteres, da exactamente `{ valido: false, motivo: "caracteres-invalidos" }`.
  - Ambas propiedades con numRuns >= 1000.
  - **mutación**: cada carácter de H y W debe tener una prueba que mate su eliminación de la clase.

  Verificación: `npx vitest run packages/parsers` en verde y `npm run test:mutacion` >= 85 %.

## 6. Regla del dígito de verificación (NIT)

- [ ] 6.1 Escribir las pruebas de todos los escenarios de NF-08 y de los escenarios nuevos de NF-09 ("Patrón NIT con espacios o separador final en tarjeta de identidad" y "Tarjeta de identidad con ceros a la izquierda"). Verlas fallar. Luego implementar la regla NIT con H y los separadores de NF-03 (design.md, decisión 2). Cubre NF-08, NF-09, NF-13. Tipos de prueba:
  - **unitaria**: cada entrada citada en los escenarios, incluidas `"-6"`, `"0-0"`, `"9999-123-456"`, `"9999123456-"`, `"9999-123-45 6"` y `"999912345.6"`.
  - **propiedad P3**: para N de 4 a 9 dígitos ASCII, un dígito d, un guion h de H y secuencias a, b, c de separadores de NF-03 con longitud total <= 64, `N + a + h + b + d + c` da exactamente `{ valido: false, motivo: "posible-digito-verificacion" }`, con y sin `"ti"`.
  - **propiedad P4**: toda cadena de hasta 64 caracteres de dígitos y separadores sin ningún carácter de H nunca da `posible-digito-verificacion`.
  - Ambas propiedades con numRuns >= 1000.
  - **mutación**.
  - **cobertura**: ramas >= 95 % en `nuip-formato.ts`.

  Verificación: `npx vitest run packages/parsers --coverage` en verde con ramas >= 95 % en `nuip-formato.ts`, y `npm run test:mutacion` >= 85 %.

## 7. Evals de los casos nuevos

- [ ] 7.1 Crear en `evals/fixtures/sinteticos/nuip-formato/` un JSON por caso. Cada fixture lleva:
  - `"sintetico": true`, `"tipo": "nuip-formato"`, `"descripcion"` con el ID del requisito y `"entrada"`.
  - `"esperado"` exacto de la spec. Válidos: `valido`, `numero`, `tipoProbable`, `digitos`, `warnings`. Inválidos: `valido`, `motivo`.
  - `"clavesExactas": true` y, cuando aplique, `"opciones"`.

  Casos:
  - `nit-espacio-tras-guion` (`"999.912.345- 6"`)
  - `nit-espacios-alrededor` (`"999.912.345 - 6"`)
  - `nit-punto-final` (`"999.912.345-6."`)
  - `nit-guion-final` (`"999.912.345-6-"`)
  - `nit-en-dash` (`"999.912.345–6"`)
  - `guion-digito` (`"-6"`)
  - `cero-guion-cero` (`"0-0"`)
  - `guion-solo` (`"-"`, `vacio`)
  - `digito-aislado-sin-guion` (`"9999-123-45 6"`, válido)
  - `guiones-unicode` (`"9999−123−456"`, válido)
  - `espacio-estrecho` (`"9 999 123 456"`, válido)
  - `bom` (`"﻿9999123456"`)
  - `espacio-ideografico` (`"9999　123456"`)
  - `ti-nit-espacios` (`"9999123456 - 7"`, ti)
  - `ti-nit-nbsp` (`"9999123456- 7"`, ti)
  - `ti-nit-punto` (`"9999123456-7."`, ti)
  - `ti-ceros` (`"09999123456"`, ti, `nuip`)
  - `tipo-mayusculas` (`"99991234567"`, `{ "tipoDocumento": "TI" }`, `ti-antigua`, `["N01"]`)
  - `tipo-invalido` (`"9999123456"`, `{ "tipoDocumento": "xx" }`)
  - `entrada-numero` (`9999123456` como número JSON, `entrada-no-texto`)
  - `entrada-null` (`null`, `entrada-no-texto`)

  Más `entrada-65` (`"A"` repetida 65 veces, `entrada-demasiado-larga`), con lo que son 22 casos nuevos y 40 en total. Cubre NF-03, NF-05, NF-06, NF-08, NF-09, NF-10, NF-11, NF-12 y EV-01 por eval. Tipos de prueba: **eval de campo**. Verificación: `npm run eval:quick` reporta `nuip-formato` con `exact_match` 100.0 % y CER 0.00 % en todos sus campos, `__claves` con `n=40`, 0 excepciones y sin regresiones; `npm run check` en verde.

## 8. Integración

- [ ] 8.1 Actualizar el comentario de cabecera de `packages/parsers/src/nuip-formato.ts` para citar los dos cambios (`validador-formato-nuip` y `nuip-endurecer-entradas`) y NF-01 a NF-13, y correr la puerta completa. Cubre la trazabilidad de NF-01 a NF-13 y de EV-01 y EV-02 (todas las filas de `## Pruebas` de design.md). Tipos de prueba: integración de todos los anteriores (unitaria, propiedad, fuzz de entrada, mutación, cobertura, eval de campo). Verificación: `npm run check:completo` en verde (incluye `npm run check` y `npm run test:mutacion` >= 85 %), `npx vitest run packages/parsers --coverage` con ramas >= 95 % en `nuip-formato.ts`, y `openspec validate nuip-endurecer-entradas --strict` sin errores.

## Workflow follow-up

- Paso del orquestador, ANTES de implementar: archivar `validador-formato-nuip` (`openspec archive validador-formato-nuip`), porque los deltas `MODIFIED` de este cambio necesitan `openspec/specs/formato-nuip/spec.md` (ver `proposal.md`, "Orden de archivo").
- Paso del orquestador, después de verificar 2.2 y de nuevo tras 7.1: fijar el baseline con `node evals/runners/eval-campo.mjs --guardar-baseline` (skill `eval-campo`).
- Ratificación humana de las decisiones 1 a 15 del orquestador en `design.md` antes de 3.1.
- Cerrar con un subagente `verificador` distinto del implementador, luego `/opsx:verify` y `/opsx:archive`.
