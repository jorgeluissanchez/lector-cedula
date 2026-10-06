# Lector Cédula CO Constitution

## Core Principles

### I. Spec antes que código (NON-NEGOTIABLE)

- Ningún código de producto MUST escribirse sin una spec aprobada en `specs/` (Spec Kit) o un
  cambio activo en `openspec/changes/` (OpenSpec).
- Cada tarea delegada a un subagente MUST citar el ID del requisito o escenario que implementa.
- Si el código y la spec divergen, la spec manda: se corrige el código o se abre un cambio
  OpenSpec que modifique la spec. Nunca se edita la spec para que encaje con el código sin
  aprobación humana.

Razón: el trabajo lo ejecutan agentes; la spec es el único contrato estable entre sesiones.

### II. Verificación automática o no cuenta (NON-NEGOTIABLE)

- Todo requisito MUST tener al menos una prueba, eval o hook que lo compruebe de forma
  automática y reproducible.
- TDD obligatorio: la prueba se escribe, se ve fallar y luego se implementa.
- Una tarea solo se marca completa con evidencia: salida de pruebas en verde y, cuando aplique,
  reporte de evals sin regresión frente a `evals/reports/baseline.json`.
- "Funciona en mi celular" o "lo probé a mano" no es evidencia.

Razón: los agentes declaran éxito con facilidad; el harness debe impedir cierres sin prueba.

### III. Privacidad por diseño (NON-NEGOTIABLE)

- El procesamiento MUST ocurrir en el dispositivo por defecto; el servidor solo procesa en
  memoria y nunca escribe imágenes a disco.
- MUST NOT persistirse ninguna imagen de documento, selfie ni el bloque biométrico del PDF417.
- El parser PDF417 MUST descartar el código AFIS, la tarjeta decadactilar y todo byte posterior
  al RH antes de devolver resultados.
- MUST NOT entrar al repositorio ningún dato de una persona real: ni imágenes, ni payloads, ni
  números de cédula. Los fixtures son sintéticos o provienen de especímenes públicos.
- Logs y telemetría MUST NOT contener datos personales.
- Toda validación MUST exigir autorización expresa del titular (Ley 1581 de 2012).

Razón: la biometría es dato sensible en Colombia y la SIC sanciona su tratamiento indebido.

### IV. Licencias limpias

- Solo se admiten dependencias, modelos y datasets de entrenamiento bajo MIT, Apache-2.0, BSD,
  ISC, MPL-2.0, CC0, CC BY o CC BY-SA (este último solo para datos, revisando el share-alike).
- Prohibidos en producción: AGPL/GPL (Ultralytics, fastmrz, alsenet mrz-scanner), packs de
  InsightFace sin licencia comercial, pesos de Surya (RAIL-M), Qwen2.5-VL, pyiqa, DocScanner,
  DocTr, TruFor y DocXPand-25k como dato de entrenamiento.
- Componentes con licencia dudosa (pesos de DocAligner, SIDTD) MUST registrarse en
  `docs/decisiones/` y no desplegarse hasta resolverse.
- ML Kit (propietario, gratuito) se permite solo en la app nativa y declarado en el aviso de
  privacidad.

Razón: el producto debe poder comercializarse y autoalojarse sin riesgo legal.

### V. Determinismo sobre fluidez

- Ningún modelo generativo (VLM/LLM) MUST decidir el valor de un número de identidad, fecha o
  código. Los VLM solo actúan como respaldo asíncrono y su salida MUST validarse contra
  checksums o contra otra fuente.
- La fuente preferida es siempre el código legible por máquina (PDF417, MRZ); el OCR es respaldo.
- El QR de la cédula digital MUST NOT intentar decodificarse: está cifrado por la Registraduría.

Razón: un dígito inventado con fluidez es peor que un error visible.

### VI. El formato es ingeniería inversa

- Cada offset, marcador o variante del PDF417 y de la MRZ colombiana es una hipótesis hasta que
  una prueba con un payload real o un espécimen público la confirme.
- Las hipótesis MUST listarse en `docs/decisiones/hipotesis-formato.md` con su estado
  (confirmada, refutada, pendiente) y la evidencia.
- El parser MUST exponer en `warnings[]` cada hipótesis no confirmada que haya aplicado.

Razón: no existe especificación oficial publicada; la comunidad discrepa en varios offsets.

### VII. Una sola base de código

- Cliente, SDK y parsers en TypeScript estricto; la misma UI corre como PWA y como app Capacitor.
- Python solo en `server/` y en `evals/` de entrenamiento.
- Los parsers MUST ser puros (sin E/S) y publicables como paquete npm independiente.

Razón: minimiza duplicación y permite que los agentes razonen sobre un solo lenguaje de producto.

## Restricciones técnicas y metas de calidad

- Monorepo con npm workspaces (pnpm está bloqueado por la política de control de aplicaciones
  del equipo de desarrollo). Node 24, TypeScript 5 strict, Vitest, ESLint.
- Servidor: FastAPI en contenedor Docker; el desarrollo Python local también corre en Docker.
- Metas de producto (ver `PLAN.md`, sección 0): 95 % de éxito al primer intento en cédula amarilla
  y digital; 98 % de campos MRZ con checksum válido; CER por campo menor o igual a 2 %;
  p95 menor a 3 s por documento.
- Ningún dato real se usa fuera del set de campo cifrado, que vive fuera del repositorio.

## Flujo de desarrollo y puertas de calidad

- Capacidades nuevas: `/speckit-specify` -> `/speckit-clarify` -> `/speckit-plan` ->
  `/speckit-tasks` -> `/speckit-analyze` -> `/speckit-implement` -> `/speckit-converge`.
- Cambios sobre capacidades ya especificadas: `/opsx:propose` -> `/opsx:apply` ->
  `/opsx:verify` -> `/opsx:archive`.
- Cada tarea la ejecuta un subagente `implementador` en un worktree aislado y la cierra un
  subagente `verificador` distinto, que no modifica código.
- Puertas automáticas en cada commit (hooks y CI): typecheck, pruebas, `licencia-check`,
  `privacidad-check`, evals rápidos sin regresión.
- La revisión humana se concentra en specs, decisiones de licencias, consentimientos y reportes
  de evals; no en cada línea del diff.

## Governance

- Esta constitución prevalece sobre cualquier otra práctica, prompt o instrucción de agente.
- Enmiendas: por `/speckit-constitution` con aprobación humana explícita, registrando el motivo
  en `docs/decisiones/`.
- Versionado semántico: MAJOR al eliminar o redefinir principios, MINOR al añadir principios o
  secciones, PATCH en aclaraciones.
- El subagente `verificador` y los revisores MUST comprobar el cumplimiento en cada entrega; un
  incumplimiento de los principios I, II o III bloquea la integración.
- `CLAUDE.md` es la guía operativa en tiempo de ejecución y MUST mantenerse coherente con esta
  constitución.

**Version**: 1.0.0 | **Ratified**: 2026-10-06 | **Last Amended**: 2026-10-06
