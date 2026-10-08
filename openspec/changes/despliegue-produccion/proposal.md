# Proposal

## Why

El usuario publica la PWA en Vercel y el servidor de respaldo en Hostinger con Dokploy. Hoy no hay configuración versionada de ninguno de los dos: sin ella, la PWA saldría con las cabeceras por defecto de Vercel (sin CSP, sin Permissions-Policy, `index.html` y `sw.js` con caché heurística) y el servidor dependería de lo que alguien teclee en el panel de Dokploy (sin sistema de archivos de solo lectura, sin límite de memoria, con riesgo de puertos expuestos o claves en el repositorio).

## What Changes

- `vercel.json` en la raíz del monorepo: instalación, compilación (incluida la descarga verificada del modelo MRZ), directorio de salida y cabeceras (CSP estricta sin terceros, Permissions-Policy, Referrer-Policy, HSTS, nosniff, caché de `sw.js`, `index.html` y recursos con hash, tipos MIME de `.wasm` y `.traineddata`).
- `tools/despliegue/`: validador de `vercel.json` contra esta spec y servidor local que aplica sus cabeceras al build, usado por una E2E.
- `server/compose.dokploy.yaml` y `server/dokploy.env.example`: servicio de producción para Dokploy (solo lectura, `tmpfs` acotado, límites de memoria y procesos, healthcheck, sin puertos publicados, variables obligatorias sin valores).
- `docs/despliegue/README.md`: guía paso a paso y checklist previo a publicar.

Nada se despliega en este cambio; no se guardan credenciales.

## Capabilities

### New Capabilities

- `despliegue-produccion`: configuración versionada y verificable de la publicación de la PWA (Vercel) y del servidor (Dokploy).

### Modified Capabilities

Ninguna.

## Impact

`vercel.json`, `tools/despliegue/`, `tools/test/despliegue-*.test.mjs`, `e2e/despliegue/`, `playwright.config.ts` (un proyecto nuevo), `server/compose.dokploy.yaml`, `server/dokploy.env.example`, `docs/despliegue/`. No cambia código de producto.
