# Proposal

## Why

Un análisis de calidad de pruebas (rol `pr-test-analyzer`, 2026-10-06) sobre `formato-nuip` y `evals-por-campo`, ya archivadas, encontró pruebas que pasan sin comprobar nada y que ni Stryker ni el verificador detectan: las propiedades de idempotencia se ejecutan casi siempre sobre resultados inválidos (cédula: 69 de 1000 casos válidos y ninguno `nuip`; tarjeta de identidad: 0 de 1000), ninguna propiedad comprueba el valor de `numero`, varios oráculos recalculan la implementación (`trim().toLowerCase()`, `typeof opciones === "object"`), y nada prueba que el corredor de evals propague `clavesExactas` ni que detecte la pérdida de fixtures (backlog #7). Si la suite no puede fallar, el principio II no se cumple aunque todo esté en verde.

## What Changes

- `formato-nuip`, sin cambio de comportamiento del validador:
  - NF-14 (nuevo): oráculo de normalización. Sobre capturas construidas a partir de un número conocido, `numero` es exactamente ese número y `tipoProbable` sale de la tabla literal de NF-07 y NF-09; sobre capturas sin guion, el resultado coincide con un oráculo independiente (filtrar dígitos, quitar ceros, tabla literal).
  - NF-02: el escenario de idempotencia se fija sobre generadores válidos por construcción, con salvaguarda contra vacuidad (más del 50 % de casos válidos y cobertura mínima de cada `tipoProbable`).
  - NF-08: escenarios de patrón NIT tras agrupación con guiones (`"9999-12345-6"`, `"99.99-123.45 - 6"`) y propiedad con número agrupado.
  - NF-10: listas literales de variantes aceptadas y de casos frontera rechazados (`"ti."`, `"tì"`, `"tı"`, `"tii"`), propiedades sin oráculo copiado y lectura única de `tipoDocumento` (decisión 3 del diseño archivado, ahora escenario).
  - NF-13: propiedades de prioridad (`tipo-documento-invalido` con cualquier cadena binaria; `entrada-no-texto` con cualquier `opciones`).
- `evals-por-campo`, cambio del harness:
  - EV-01: una clave con valor `undefined` cuenta como sobrante; solo el booleano `true` activa la comparación; el escenario de propagación por el corredor pasa a ser una prueba automática sobre directorios temporales.
  - EV-03 (nuevo): una caída de `n` frente al baseline es regresión (backlog #7).
  - EV-04 (nuevo): directorios de fixtures y reportes configurables (`--fixtures`, `--reportes`) para probar el corredor sin tocar `evals/reports/`.
  - EV-05 (nuevo): un `esperado` ausente, `null` o que no es objeto falla con un mensaje que nombra la ruta y el tipo.
- Pruebas: reescritura de las propiedades vacías o tautológicas de `packages/parsers/test/nuip-formato.test.ts`, eliminación del duplicado de NF-11, limpieza de la línea 708; pruebas nuevas del corredor.
- Mutación: Stryker pasa a mutar también `evals/runners/metricas.mjs`, con umbral `break` 85.

Fuera de alcance: los huecos #1, #2, #3, #4, #5, #6 y #8 de `docs/decisiones/backlog-formato-nuip.md` (requieren decisión humana; el #3 queda como pregunta abierta en `design.md`).

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `formato-nuip`: se modifican NF-02, NF-08, NF-10 y NF-13 (escenarios más precisos y propiedades sin vacuidad ni oráculos copiados) y se añade NF-14 (oráculo de normalización). El comportamiento observable del validador no cambia.
- `evals-por-campo`: se modifica EV-01 (valor `undefined`, solo `true`, propagación probada) y se añaden EV-03 (caída de `n`), EV-04 (directorios configurables) y EV-05 (`esperado` inválido).

## Impact

- `packages/parsers/test/nuip-formato.test.ts`: reescritura de propiedades; `packages/parsers/src/` no cambia salvo que una prueba nueva encuentre un incumplimiento de la spec vigente (se reportaría antes de tocarlo).
- `evals/runners/metricas.mjs`: `regresiones()` compara `n`; nueva función pura que construye los casos desde los fixtures; `agregar()` valida `esperado`.
- `evals/runners/eval-campo.mjs`: usa la función pura, acepta `--fixtures` y `--reportes`.
- `tools/test/metricas.test.mjs` (ampliado) y `tools/test/eval-campo.test.mjs` (nuevo, integración con `spawnSync`).
- `stryker.config.mjs` y una configuración de Vitest para Stryker que excluye la prueba de integración.
- `.claude/skills/eval-campo/SKILL.md`: documentar las banderas nuevas y la regresión por `n`.
- Sin dependencias nuevas. El baseline no cambia (las métricas de `nuip-formato` siguen iguales).
