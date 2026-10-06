# Backlog del harness de pruebas

Hallazgos de la revisión pr-test-analyzer del cambio `pruebas-nuip-y-evals-robustas` (2026-10-06). Ninguno crítico. Se abrirán como un cambio OpenSpec cuando termine la ola actual de implementadores de la Fase 1, porque tocan configuración compartida (`vitest.config.ts`, `stryker.config.mjs`, `eval-campo.mjs`).

| # | Hallazgo | Prioridad | Corrección propuesta |
|---|---|---|---|
| I1 | Las pruebas de integración de `eval-campo` lanzan `npx tsc -b` sobre el repositorio real 7 veces, en paralelo con hooks y otras suites | 7 | Banderas `--sin-compilar` y `--registro <archivo>` con evaluador falso; compilar una vez en `beforeAll`; proyecto Vitest de integración con `fileParallelism: false` |
| I2 | La lógica propia de `eval-campo.mjs` (filtro `--quick`, salvaguarda `sintetico !== true`, banderas sin valor) no tiene prueba ni mutación | 6 | Extraer `seleccionarFixtures` y `leerBanderas` a `metricas.mjs`; integración con `lentos/` y con `sintetico: false` |
| I3 | Falta el caso EV-03 de mismo modo explícito; aserciones débiles; `baseline.json` sin `modo` | 6 | Caso `{modo: "quick", n: 3}` con 2 fixtures; `toMatch(/n bajó de 3 a 2/)`; regenerar baseline con `--quick --guardar-baseline` |
| I4 | Umbral de ramas 85 (la matriz pide 95 en parsers), `evals/runners` fuera de cobertura y ningún script ejecuta `--coverage` | 7 | Subir a 95, incluir `evals/runners/**`, `test:cobertura` dentro de `check` |
| I5 | Umbral de mutación solo global | 5 | Reporter `json` y script que falle si un archivo baja de 85 |
| I6 | Hook de licencias evadible | 7 | **Resuelto**: detector tokenizado en `.claude/hooks/instalaciones.mjs` (npm, pnpm, yarn, bun, pip, uv, pipx, poetry, pdm y envoltorios) |
| I7 | Prueba de `post-edit` escribía en el repo real | 5 | **Resuelto**: proyecto temporal y timeouts coherentes |
| S1-S8 | Idempotencia con umbral flojo, oráculo por la propia salida, contador de diccionarios inflado, márgenes de vacuidad, nombres de prueba con números de línea, comentario de equivalencia inexacto, exclusión de Stryker por nombre, comprobación de bytes frágil | 2-4 | Ver informe en la conversación del 2026-10-06; agrupar en el mismo cambio |
| P1 | `privacidad-check` ignora `docs/investigacion/` y no detecta números de cédula reales junto a nombres en documentación; el orquestador copió datos reales de payloads públicos en el documento 01 | **8** | Regla en todo el repo: NUIP de 10 dígitos que no empiece por 9999 seguido de apellidos en mayúsculas, y bloques demográficos `0[MF]\d{16}(AB|A|B|O)[+-]`, salvo marca `privacidad-ok:` |
