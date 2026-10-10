# Tasks

## 1. CLI

- [x] 1.1 Cambiar la máscara de `numeroDocumento`, `nuip` y `serial` a solo los 2 últimos dígitos y añadir `lugarNacimiento` (PDF417) en `tools/leer-foto.mjs`, con TDD en `tools/test/leer-foto.test.mjs`. Cubre: LPI-06 (modificado), LPI-08. Tipos de prueba: integración de CLI con procesos hijo. Verificación: `npx vitest run tools/test/leer-foto.test.mjs` y `npm run check`.
- [x] 1.2 Backlog F1: LPI-07 "No escribe a disco" con hook de bloqueo de escrituras (`tools/test/ayudas/bloquear-escrituras.mjs`) y directorio aislado en lugar de listar el repositorio, más mutantes del detector; `vitest.config.ts` con `pool: "forks"`, `maxWorkers: "50%"` y `teardownTimeout` contra "Timeout calling onTaskUpdate". Cubre: LPI-07 (modificado). Tipos de prueba: integración de CLI con procesos hijo y mutantes del detector. Verificación: `npx vitest run tools/test/leer-foto.test.mjs` y `npm run check` con Playwright en paralelo.
