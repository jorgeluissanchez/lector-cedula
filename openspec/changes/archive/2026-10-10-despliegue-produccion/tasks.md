# Tasks

Reglas: TDD; ningún despliegue real ni credencial; datos sintéticos.

## 1. Vercel

- [x] 1.1 Pruebas de `validarVercel` y `cabecerasPara` con los literales de DP-01 a DP-06 (vistas fallar sin `vercel.json`); escribir `tools/despliegue/vercel.mjs` y `vercel.json`. Tipos: **unitaria de configuración**, **integridad del build**. Verificación: `npx vitest run tools/test/despliegue-vercel.test.mjs`.
- [x] 1.2 Servidor local con las cabeceras de `vercel.json` (`tools/despliegue/servir-vercel.mjs`) y E2E `e2e/despliegue/cabeceras.spec.ts` (proyecto `despliegue-chromium`). Cubre DP-07. Tipos: **E2E**. Verificación: `npx playwright test --project=despliegue-chromium`.

## 2. Dokploy

- [x] 2.1 Pruebas de DP-08 y DP-09; escribir `server/compose.dokploy.yaml` y `server/dokploy.env.example`. Tipos: **unitaria de configuración**. Verificación: `npx vitest run tools/test/despliegue-dokploy.test.mjs`.

## 3. Documentación

- [x] 3.1 Prueba de DP-10; escribir `docs/despliegue/README.md`. Tipos: **integridad de documentación**. Verificación: `npx vitest run tools/test/despliegue-dokploy.test.mjs` y `npm run check`.
