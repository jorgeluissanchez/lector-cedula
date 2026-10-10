# Tasks

Reglas: TDD (principio II), cada prueba se ve fallar antes de implementar. Datos sintéticos (`PERSONA_BASE`, `PERSONA_TI`, NUIP `9999123456`). Pruebas nombradas `DOP-xx <escenario>`. Comandos `U` y `E` en `design.md`, `## Pruebas`. Revisores: `revisor-privacidad` (almacenamiento y captura), `revisor-producto` (panel).

## 1. Lógica pura

- [x] 1.1 `apps/pwa/src/preferencias.ts` (DOP-02) y excepción de `tools/privacidad-check.mjs` y CAM-11 (DOP-06). Tipos: **unitaria**, **propiedad**, **análisis estático**. Verificación: `U`, `npm run check:privacidad`.
- [x] 1.2 `apps/pwa/src/opciones.ts` (`tiDisponible`, `tiEfectiva`, `fraudeEfectivo`; DOP-04, DOP-05). Tipos: **unitaria** (tablas de 8 casos). Verificación: `U`.
- [x] 1.3 `apps/pwa/src/forma.ts` sobre `@lector-cedula/web` (DOP-03, DOP-07) y dependencia en `apps/pwa/package.json`. Tipos: **unitaria**, **análisis estático** de imports. Verificación: `U`.

## 2. Interfaz y sesión

- [x] 2.1 `sesion.ts`: opciones como función y guía de la forma al Worker y al cuadrilátero; `App.tsx`: panel "Opciones", escena con recuadro, enlace de la TI efectiva; `vite.config.ts`: `tiDisponible` y alias de `@lector-cedula/web`. Tipos: **unitaria** (regresión de `apps/pwa/test`), **tipos**. Verificación: `U`, `npx vitest run apps/pwa --maxWorkers=1`, `npm run check` (CI).
- [x] 2.2 Textos legales (DOP-08). Tipos: **análisis estático**. Verificación: `U`.

## 3. E2E y CI

- [x] 3.1 E2E en `e2e/demo/opciones-*.spec.ts` (panel, persistencia, 3 formas con `amarilla-1080p`, `amarilla-de-pie-vertical` y `digital-de-pie-vertical`, TI con `ti-amarilla-1080p`, fraude), proyecto `demo-pixel7` y job `e2e-demo` en `.github/workflows/ci.yml`. Plan en `e2e/planes/demo-opciones.md`. Tipos: **E2E** (Chromium y Pixel 7), **accesibilidad**, **privacidad**. Verificación: `E` en CI.
- [x] 3.2 Nota de estado en la tarea 3.6 de `sdk-integracion` (migración parcial, DOP-07).
