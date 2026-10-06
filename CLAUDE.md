# Lector de cédula colombiana

Lector autoalojado de la cédula colombiana (PDF417 amarilla, MRZ digital, OCR), a nivel de servicios comerciales. Plan: `PLAN.md`. Constitución: `.specify/memory/constitution.md` (prevalece sobre todo lo demás).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run check` | Puerta completa: tipos, lint, pruebas, licencias, privacidad, evals rápidas |
| `npm test` | Vitest (paquetes, herramientas y hooks) |
| `npm run eval:quick` / `npm run eval` | Evals por campo contra el baseline |
| `npm run check:licencias` / `npm run check:privacidad` | Controles de los principios IV y III |
| `openspec list` | Cambios OpenSpec en curso |
| `docker compose -f server/compose.yaml run --rm pruebas` | Pruebas del servidor Python |

## Mapa del repositorio

- `packages/parsers/`: parsers puros en TypeScript (PDF417, MRZ, DIVIPOL, validadores).
- `packages/capture`, `ocr`, `fraud`, `sdk`; `apps/pwa`, `apps/mobile`: fases 2 a 5.
- `server/`: FastAPI de respaldo, siempre en Docker.
- `specs/` (Spec Kit) y `openspec/` (OpenSpec): los contratos.
- `evals/`: fixtures sintéticos, corredores y reportes.
- `tools/`: `licencia-check`, `privacidad-check` y sus pruebas.
- `.claude/`: agentes, skills, hooks y configuración del harness.
- `docs/investigacion/`: formato, benchmark y stack. `docs/decisiones/`: decisiones e hipótesis.

## Flujo de trabajo

1. Nada se implementa sin spec: `/speckit-specify` para capacidades nuevas, `/opsx:propose` para cambios.
2. El orquestador delega cada tarea a un subagente `implementador` y la cierra un `verificador` distinto.
3. Cambios que tocan captura, servidor o datos: `revisor-privacidad`. Dependencias o modelos: `revisor-licencias`.
4. Fin de fase: `eval-runner` y `revisor-producto`.

## Reglas no negociables

1. Spec antes que código.
2. Sin prueba automática no hay tarea terminada.
3. Nunca persistir imágenes ni biometría; nunca datos reales en el repositorio.
4. Solo licencias de la lista permitida (skill `licencia-check`).
5. Ningún modelo generativo decide un número; nunca decodificar el QR de la digital.
6. Todo offset del formato es hipótesis hasta probarse (skill `formato-cedula`).
7. TypeScript para producto; Python solo en `server/`.

## Entorno de desarrollo (restricciones de esta máquina)

- `pnpm.exe` y el módulo SSL de Python local están bloqueados por la directiva de Control de aplicaciones de Windows. No intentes sortearla.
- Usa npm workspaces. Todo Python (servidor, Spec Kit CLI, entrenamiento) corre en Docker.
- Spec Kit CLI: `docker run --rm -v "$(pwd -W):/work" -w /work ghcr.io/astral-sh/uv:python3.12-bookworm-slim uvx --from specify-cli specify <cmd>`.

## Errores pasados

Lo alimentan los revisores. Cada entrada: qué pasó y cómo evitarlo.

- Repos antiguos cortaban el RH `AB+` a `B+`, detectaban el sexo con `contains("M")`, borraban el `-` del RH, rompían con la Ñ e invertían los apellidos. Cada caso necesita una prueba (skill `formato-cedula`).
- Al escribir archivos con heredoc de bash se perdieron barras invertidas en expresiones regulares. Usa la herramienta de escritura de archivos para código con `\`.
