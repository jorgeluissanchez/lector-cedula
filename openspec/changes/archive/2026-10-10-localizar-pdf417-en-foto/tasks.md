# Tasks

Reglas: TDD (la prueba se ve fallar antes de implementar). Datos sintéticos generados en la prueba; ninguna imagen en el repositorio. Comandos `U`, `P`, `C` de `design.md`.

## 1. Imagen sintética difícil

- [x] 1.1 Helper `packages/capture/test/pdf417/sintetica-dificil.ts` que genera D y D-EXIF6. Cubre: convenciones de LPI-10, LPI-11. Tipos de prueba: unitaria de humo (dimensiones, fracción de área). Verificación: `U`.

## 2. Decodificador

- [x] 2.1 Gris y orientación EXIF en `packages/capture/src/pdf417/pixeles.ts`. Cubre: LPI-09, LPI-10. Tipos de prueba: unitaria, integración con D-EXIF6. Verificación: `U`.
- [x] 2.2 Banda, rejilla, aceptación por el parser y límite de tiempo en `packages/capture/src/pdf417/`. Cubre: LPI-11, LPI-12, LPI-14. Tipos de prueba: unitaria con lector inyectado, integración con D. Verificación: `U`.

## 3. Verificación

- [x] 3.1 Prueba de CLI sobre D-EXIF6 y `npm run check:privacidad`. Cubre: LPI-13. Tipos de prueba: integración de CLI, privacidad estática. Verificación: `U`, `P`, `C`.
