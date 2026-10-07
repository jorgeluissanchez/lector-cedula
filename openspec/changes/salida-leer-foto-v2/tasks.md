# Tasks

## 1. CLI

- [x] 1.1 Cambiar la máscara de `numeroDocumento`, `nuip` y `serial` a solo los 2 últimos dígitos y añadir `lugarNacimiento` (PDF417) en `tools/leer-foto.mjs`, con TDD en `tools/test/leer-foto.test.mjs`. Cubre: LPI-06 (modificado), LPI-08. Tipos de prueba: integración de CLI con procesos hijo. Verificación: `npx vitest run tools/test/leer-foto.test.mjs` y `npm run check`.
