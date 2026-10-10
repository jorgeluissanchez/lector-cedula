# Lector de cédula colombiana

Lector autoalojado de la cédula colombiana (PDF417 amarilla, MRZ digital, OCR), a nivel de servicios comerciales. Plan: `PLAN.md`. Constitución: `.specify/memory/constitution.md` (prevalece sobre todo lo demás).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run check` | Puerta completa: tipos, lint, pruebas, licencias, privacidad, evals rápidas |
| `npm test` | Vitest (paquetes, herramientas y hooks) |
| `npm run test:e2e` | Playwright con cámara simulada (Chromium escritorio y Pixel 7) |
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

0. Toda spec y toda tarea declaran sus pruebas con la skill `estrategia-pruebas` (tipo, herramienta, comando, umbral). E2E con los agentes `playwright-test-planner`, `-generator` y `-healer`.
1. Nada se implementa sin spec: `/speckit-specify` para capacidades nuevas, `/opsx:propose` para cambios.
2. El orquestador delega cada tarea a un subagente `implementador`. Al terminar el cambio, en paralelo: un `verificador` distinto (spec contra código) y el agente `pr-test-analyzer` del plugin pr-review-toolkit (calidad de las pruebas). Se archiva solo si el verificador confirma; los hallazgos críticos del analizador abren un cambio nuevo.
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

## Carga de la máquina (portátil de 8 núcleos y 22 GB, el usuario trabaja en ella)

- Tope: CPU 70 % y RAM 80 %. `node tools/carga.mjs` mide; `node tools/carga.mjs --esperar` espera a que la CPU baje del 45 % antes de algo pesado.
- Pesado: `npm run check` completo, `npm test` completo, Playwright, `docker build`/Gradle, Stryker, evals completas. Ligero: pruebas de un archivo, lint de un archivo, edición.
- Turnos: o varios agentes con tareas ligeras (máximo 3), o una sola tarea pesada con todo lo demás en pausa. Nunca dos pesadas a la vez.
- Vitest siempre con `--maxWorkers=2`, también la suite completa: con 3 llegó al 100 % porque muchas pruebas lanzan procesos. `vitest.config.ts` ya fija `maxWorkers: 2` y los hooks `post-edit` (1), `stop` y `subagent-stop` (2) también; no lo subas.
- La suite completa, la mutación, Playwright y Gradle corren en GitHub Actions, no en este portátil (su base con VS Code ya es 40-60 % de CPU). En local, solo archivos de prueba sueltos con `--maxWorkers=1`. Para matar un bucle en segundo plano, detén la tarea entera, no solo el comando en curso.
- Una sola carga pesada a la vez: o Vitest o Docker, nunca ambos. Los hooks corren Vitest tras cada edición, así que un agente con Docker en marcha suma esa carga. No dejes daemons vivos: `--no-daemon` en Gradle y cierra servidores de prueba al terminar.
- Docker: `--cpus=3 --memory=5g` como máximo y Gradle `--no-daemon --max-workers=1`; con 4 CPUs más los programas del usuario llegó al 96 %.
- `.vscode/settings.json` impide que las extensiones de Java importen `native/android` con Gradle; no lo quites.

## Errores pasados

Lo alimentan los revisores. Cada entrada: qué pasó y cómo evitarlo.

- Repos antiguos cortaban el RH `AB+` a `B+`, detectaban el sexo con `contains("M")`, borraban el `-` del RH, rompían con la Ñ e invertían los apellidos. Cada caso necesita una prueba (skill `formato-cedula`).
- Al escribir archivos con heredoc de bash se perdieron barras invertidas en expresiones regulares. Usa la herramienta de escritura de archivos para código con `\`.
- El hook `pre-bash` tomó `2>&1` y el texto de heredocs como nombres de paquete. Ya se ignoran redirecciones y cuerpos de heredoc; si vuelve a bloquear sin motivo, añade el caso a `tools/test/hooks.test.mjs` antes de corregir.
- Edit y Write convirtieron escapes `\uXXXX` en caracteres literales invisibles; ESLint (`no-irregular-whitespace`) lo detectó. Tras escribir código con escapes Unicode, comprueba los bytes; si se perdieron, regenéralos con un script que emita la barra con `String.fromCharCode(92)`.
- Una prueba que lanza un proceso de Node excedió los 5 s por defecto de Vitest mientras dos agentes corrían pruebas en paralelo, y el hook de Stop bloqueó el cierre. Toda prueba que lance procesos declara `{ timeout: 60_000 }` en su `describe`.
- El orquestador tomó dos decisiones durante la implementación (modo del baseline, latest.json efímero), las anotó en design.md y no en la spec delta; el verificador rechazó el cambio por divergencia spec-código. Toda decisión que cambie comportamiento se traslada en el momento a `specs/` con su escenario, no solo a design.md.
- El scratchpad es compartido entre agentes paralelos y un agente perdió su registro de Stryker por un nombre repetido. Cada agente usa un subdirectorio propio del scratchpad (`scratchpad/<frente>/`) y directorios temporales de Stryker con nombre único.
- Los agentes definidos en `.claude/agents/` solo se registran al reiniciar la sesión; hasta entonces, usa un agente de propósito general que lea el archivo del rol.
- MOT-07 fallaba al azar en CI: una prueba de tiempo agotado con un `setTimeout` real de 1 ms dependía del orden frente a un `await` interno y su `expect.poll` de 120 s no podía cumplirse. Usa un reloj inyectado y espera el evento concreto; nunca polls largos ni timeouts mayores.
- Un agente hizo `git stash` / `git stash pop` para validar una versión anterior y durante segundos retiró del disco el trabajo sin commit de otros agentes en paralelo. Nunca uses `git stash`, `git checkout -- .`, `git reset` ni `git clean` con agentes en paralelo; para comparar con HEAD usa `git show HEAD:<ruta>` o `git worktree add` en un directorio aparte.
