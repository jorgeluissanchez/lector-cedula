# Entorno de desarrollo bajo la directiva de Control de aplicaciones

**Fecha:** 2026-10-06. **Estado:** aceptada.

## Contexto

La directiva de Control de aplicaciones de Windows del equipo de desarrollo bloquea:

- `pnpm.exe` (instalado por mise).
- `_ssl.pyd` del Python local, por lo que pip no puede descargar paquetes por HTTPS.

Node 24, npm, git, gh y Docker Desktop funcionan.

## Decisión

1. **npm workspaces** en lugar de pnpm. El `PLAN.md` mencionaba pnpm; los comandos equivalentes son `npm run` y `npm test`.
2. **Todo Python en Docker**: el servidor FastAPI, el CLI de Spec Kit (`uvx --from specify-cli`) y el entrenamiento de modelos. Coincide con el despliegue en el VPS, que también será en contenedor.
3. No se intenta sortear la directiva. Si el equipo de TI habilita Python local, se puede usar `uv` nativo sin cambiar el repositorio.

## Consecuencias

- Los hooks de Claude Code no ejecutan pruebas de Python tras cada edición (sería lento en Docker); las cubre el CI y el comando `docker compose -f server/compose.yaml run --rm pruebas`.
- Los scripts de Spec Kit se instalaron en su variante PowerShell, que es la shell principal del equipo.
