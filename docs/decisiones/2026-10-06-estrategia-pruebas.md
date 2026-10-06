# Estrategia de pruebas obligatoria

**Fecha:** 2026-10-06. **Estado:** aceptada (pedido explícito del usuario).

## Contexto

El usuario pidió que toda spec exija todo tipo de testing y que los agentes no improvisen, sino que usen herramientas y skills concretas como Playwright.

## Decisión

1. Constitución 1.1.0: el principio II exige una sección `## Pruebas` por spec con tipo, herramienta, comando y umbral por requisito.
2. Skill de proyecto `estrategia-pruebas` con la matriz por componente, recetas y antipatrones. La cargan siempre `spec-writer`, `implementador` y `verificador`; el verificador rechaza si falta.
3. `openspec/config.yaml` añade reglas para `design` y `tasks` con el mismo requisito.
4. Herramientas instaladas y verificadas en esta máquina: Playwright 1.63 con Chromium y cámara simulada, Playwright Test Agents (planner, generator, healer) para Claude Code, Stryker 10 con vitest-runner, @axe-core/playwright, fast-check.
5. Descartada la skill `webapp-testing` de anthropics/skills: depende de Python local, que la directiva de Control de aplicaciones bloquea.
6. Las herramientas aún marcadas [E] en `docs/investigacion/04-testing-herramientas-y-skills.md` no se instalan hasta la segunda pasada del investigador.

## Consecuencias

- Las specs serán más largas, pero cada requisito tendrá su verificación nombrada de antemano.
- Los planes de Playwright viven en `e2e/planes/`, porque `specs/` pertenece a Spec Kit.
