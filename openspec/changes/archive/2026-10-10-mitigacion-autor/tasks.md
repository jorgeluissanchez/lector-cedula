# Tasks

Reglas: TDD; sin datos reales.

## 1. Demo de la PWA

- [x] 1.1 Pruebas de `leerDemo` y de la meta CSP (MA-01, MA-03); implementar en `apps/pwa/config.ts` y `vite.config.ts`. Tipos: **unitaria de configuración**. Verificación: `npx vitest run apps/pwa/test/ma-01-03-demo.test.ts`.
- [x] 1.2 Aviso en `App.tsx` (MA-02) y E2E con axe y control de peticiones `e2e/demo/aviso.spec.ts` (proyecto `demo-chromium`). Tipos: **E2E**, **accesibilidad**. Verificación: `npx playwright test --project=demo-chromium`.
- [x] 1.3 `ARG VITE_DEMO=true` en `apps/pwa/Dockerfile` y guía en `docs/despliegue/README.md` (MA-04).

## 2. Documentos

- [x] 2.1 Prueba `tools/test/mitigacion-autor.test.mjs` (MA-04 a MA-07); README raíz, `SECURITY.md`, `DISCLAIMER.md`, `packages/*/README.md` publicables y `.github/ISSUE_TEMPLATE`. Verificación: `npx vitest run tools/test/mitigacion-autor.test.mjs` y `npm run check:privacidad`.
