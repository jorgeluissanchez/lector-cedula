# Tasks

Reglas para todas las tareas: TDD (principio II): cada prueba nueva se ve fallar antes de implementar y la salida en rojo se adjunta como evidencia en el PR. Datos sintéticos únicamente (skill `fixture-sintetico`); todo archivo de prueba que contenga el literal del marcador lleva `// fixture-sintetico` en la primera línea. Código con barras invertidas o escapes `\u` escrito con la herramienta de escritura de archivos, no con heredoc, y bytes comprobados después (errores pasados de `CLAUDE.md`). Toda prueba que lance procesos declara `{ timeout: 60_000 }`. La tabla por requisito y los comandos `V`, `C`, `M`, `T`, `E`, `P`, `L` y `K` están en `design.md`, sección `## Pruebas`. Tipos de prueba:

- **Unitaria**: un `it` por escenario, nombrado `"<PA-xx> <escenario> (atrapa: <fallo>)"`, con los literales de la spec y `toStrictEqual`.
- **Propiedad**: fast-check, `numRuns >= 1000`, oráculo independiente (literales, `esperado` del generador o `validarFormatoNuip`).
- **Vacuidad**: contadores comprobados con `expect` tras `fc.assert`, con los umbrales de la tabla.
- **Fuzz**: `fc.anything()` y `fc.uint8Array` con 0 excepciones.
- **Metamórfica**: misma persona en varias variantes de trama, mismos `campos`.
- **Mutación**: Stryker, >= 85 % por archivo.
- **Eval**: `npm run eval:quick` sin regresión.

## 1. Contrato y entrada

- [x] 1.1 Crear `packages/parsers/test/ayudas/tramas-referencia.ts` con la tabla literal de personas P1 a P8 y los constructores `C`, `W`, `S` y el sufijo `F` según las convenciones de la spec (disposición escrita a mano, sin importar nada del parser), y `packages/parsers/test/tramas-referencia.test.ts` con literales de bytes: `C(P1)` mide 531, `[24,32)` es el marcador, `[48,58)` es `9999123456`, el byte 60 de `C(P2)` es 0xD1, `W(P1)` mide 520 con el marcador en 13, `S(P1)` mide 531 sin marcador y con el NUIP en `[49,59)`, la cola sigue `(i * 73 + 41) mod 256` y el bloque de `C_F(P1)` es `0220000229M160010O+`. Cubre: convenciones de PA-01 a PA-21. Tipos de prueba: **unitaria**. Verificación: `npx vitest run packages/parsers` en verde; bytes de `Ñ`, `É` y `Á` comprobados con `node -e` sobre el archivo.
- [x] 1.2 Añadir los tipos públicos de `design.md` (decisión 1) y `parsearPdf417Amarilla` en `packages/parsers/src/pdf417-amarilla/index.ts`, exportados desde `packages/parsers/src/index.ts`, con la validación de `bytes` y `opciones` y la prioridad de los motivos de entrada; toda entrada válida devuelve por ahora `nuip-no-encontrado`. Actualizar `packages/parsers/test/index.test.ts` con los exports nuevos. Cubre: PA-01, PA-03 (motivos de entrada), PA-04 (fuzz con `fc.anything()` y entradas largas), PA-15 (opciones inválidas). Tipos de prueba: **unitaria**, **fuzz**, **propiedad**. Verificación: `npx vitest run packages/parsers` y `npm run typecheck` en verde.

## 2. Bytes y clasificación de la trama

- [x] 2.1 Implementar `bytes.ts` (clase de letra Latin-1, decodificación con `String.fromCharCode` sin `TextDecoder`, marcador como arreglo de bytes) y `trama.ts` (variante por H02 y H07, búsqueda solo en `[0,64)`), con pruebas unitarias de módulo: tabla de los 256 bytes contra los rangos literales de PA-05, `0x80` no es letra ni `"€"`, y las tres variantes de PA-06 incluido "Marcador en el byte 24 sin run de NUL" y "Marcador en la cola se ignora". Cubre: PA-05, PA-06. Tipos de prueba: **unitaria**. Verificación: `npx vitest run packages/parsers` en verde y `npm run check:privacidad` con 0 hallazgos (sin literal del marcador en `src/`).

## 3. Modo patrones

- [x] 3.1 Implementar en `patrones.ts` el normalizador 1:1, el segmentador por fronteras de 2 o más espacios y el localizador del NUIP (H03, límite 96) con `validarFormatoNuip`. Cubre: PA-08 (normalización), PA-09, PA-16 ("Límites de posición", casos 38 y 39). Tipos de prueba: **unitaria**, **propiedad** (oráculo de PA-09 con `"0".repeat(k)` + dígitos), **vacuidad**. Verificación: `npx vitest run packages/parsers` en verde con válidos >= 25 % e inválidos >= 10 % en la propiedad.
- [x] 3.2 Implementar `bloque-demografico.ts`: reconocedores sexo primero y fecha primero de un solo paso, RH con `AB` primero y signo, fecha gregoriana 1900-2099, códigos DIVIPOL 2 + 3 con exactamente 6 dígitos. Cubre: PA-11, PA-12, PA-13, PA-14. Tipos de prueba: **unitaria**, **propiedad** (fechas válidas por construcción con tabla literal de días e imposibles), **vacuidad**. Verificación: `npx vitest run packages/parsers` en verde con inválidas >= 30 % y 29 de febrero bisiesto >= 1 %.
- [x] 3.3 Completar el modo patrones: primer apellido, clasificación de segmentos, asignación H15, `caracteres-invalidos-en-nombre` con comprobación de bytes crudos, límite 192, y conectar el modo en `parsearPdf417Amarilla` para las variantes `truncada` y `sin-pubdsk` (aún sin confianza ni validaciones definitivas). Cubre: PA-05 (UTF-8 y byte C1), PA-08, PA-10 (escenarios con `W` y `S`), PA-16 ("Límites de posición", casos 41 y 42). Tipos de prueba: **unitaria**. Verificación: `npx vitest run packages/parsers` en verde.

## 4. Modo offsets e híbrido

- [x] 4.1 Implementar `offsets.ts` (G01, H04, H05) y la elección de modo: offsets en la trama completa, respaldo por patrones si falla, y ejecución de patrones para la comparación. Cubre: PA-07, PA-10 (escenarios con `C`), PA-13 (las 8 tramas completas). Tipos de prueba: **unitaria**. Verificación: `npx vitest run packages/parsers` en verde.

## 5. Ensamblaje del resultado

- [x] 5.1 Implementar en `ensamblar.ts` la confianza por campo y `consistencia-modos` (tablas de las decisiones 8 y 9). Cubre: PA-17, PA-18. Tipos de prueba: **unitaria**. Verificación: `npx vitest run packages/parsers` en verde.
- [x] 5.2 Implementar `formato-nuip`, `divipol-codigos` y `divipol-existe` sin resolutor, y `warnings` (decisión 11), y escribir la prueba del objeto completo de `C(P1)`. Cubre: PA-02, PA-18, PA-19 (escenario de caminos). Tipos de prueba: **unitaria**. Verificación: `npx vitest run packages/parsers` en verde con `toStrictEqual` del objeto completo.
- [x] 5.3 Implementar el resolutor DIVIPOL inyectado: lectura única de `divipol`, una sola llamada con el código de 5 dígitos, traducción defensiva de la respuesta y copia filtrada de sus IDs. Cubre: PA-15 (todos los escenarios salvo la integración), PA-04 (fuzz de `opciones` con `C(P1)`). Tipos de prueba: **unitaria** con espías `vi.fn`, **fuzz**. Verificación: `npx vitest run packages/parsers` en verde; ninguna prueba importa `buscarDivipol`.

## 6. Biometría, errores conocidos y pureza

- [x] 6.1 Escribir las pruebas de PA-16 (cola fija, datos de control ausentes) y de PA-03 (cadena de motivos de interpretación). Si pasan sin cambios en `src/`, verlas fallar contra un mutante manual temporal (por ejemplo, leer dos bytes más allá del signo del RH o incluir el run completo de dígitos en el número), revertido antes del commit. Cubre: PA-03, PA-16. Tipos de prueba: **unitaria**. Verificación: `npx vitest run packages/parsers` en verde; evidencia del fallo contra el mutante adjunta.
- [x] 6.2 Escribir las 10 pruebas de errores conocidos de PA-20, cada una vista fallar contra el mutante manual del error histórico que atrapa (RH con `slice(-2)`, sexo con `includes("M")`, normalizador que borra `-`, clase `[A-Za-z]` sin Ñ, apellidos intercambiados, clave `fechaExpedicion`, nombres por posición fija en patrones, separación por espacio simple, offsets absolutos en la trama truncada, primer carácter `P` aceptado). Cubre: PA-20. Tipos de prueba: **unitaria**. Verificación: `npx vitest run packages/parsers` en verde; tabla mutante -> prueba que lo mata en el PR.
- [x] 6.3 Escribir las pruebas de PA-04 "Determinismo y entrada intacta" y "Nunca lanza con bytes arbitrarios" (`fc.uint8Array({ maxLength: 2048 })`) y la de PA-02 "Solo datos planos". Cubre: PA-02, PA-04. Tipos de prueba: **unitaria**, **fuzz**. Verificación: `npx vitest run packages/parsers` en verde con 0 excepciones.

## 7. Propiedades con el generador sintético (requiere `generador-fixtures-sinteticos` aplicado)

- [x] 7.1 Comprobar `VERSION_CONTRATO === "1.0.0"` y que, para `PERSONA_BASE` y las cuatro variantes, los `rangos` de `generarPdf417` coinciden con las posiciones del ayudante de 1.1. Escribir la propiedad de ida y vuelta por variante y la de nombres largos de PA-21 con su salvaguarda de vacuidad. Cubre: PA-21. Tipos de prueba: **propiedad**, **vacuidad**, **unitaria**. Verificación: `npx vitest run packages/parsers` en verde con numRuns >= 1000 por variante y los umbrales de vacuidad de PA-21.
- [x] 7.2 Escribir la propiedad de independencia de la cola (PA-16), la metamórfica completa/truncada/sin `PubDSK` (PA-08, PA-20), la de `warnings` bien formados (PA-19) y la de tramas mutadas con invariantes por campo (PA-04). Cubre: PA-04, PA-08, PA-16, PA-19, PA-20. Tipos de prueba: **propiedad**, **metamórfica**, **fuzz**, **vacuidad**. Verificación: `npx vitest run packages/parsers` en verde con numRuns >= 1000 cada una; `ok` > 50 % y errores >= 5 % en tramas mutadas.

## 8. Evals de campo (requiere el grupo 7)

- [x] 8.1 Crear `evals/runners/adaptadores/pdf417-amarilla.mjs` (decisión 15) con `tools/test/adaptador-pdf417-amarilla.test.mjs` (hex inválido lanza con `hex` en el mensaje, éxito aplanado con claves exactas, error con `ok` y `error`) y añadir `"evals/runners/adaptadores/**/*.mjs"` a `mutate` en `stryker.config.mjs`. Cubre: harness de evals de PA-02 y PA-03. Tipos de prueba: **unitaria**, **mutación**. Verificación: `npx vitest run tools/test/adaptador-pdf417-amarilla.test.mjs` en verde y `npm run test:mutacion -- --mutate "evals/runners/adaptadores/**/*.mjs"` >= 85 %.
- [x] 8.2 Crear `tools/fixtures/pdf417-amarilla.mjs` (12 casos de `casosPdf417()` y 6 de error derivados de `completa-base`), generar `evals/fixtures/sinteticos/pdf417-amarilla/*.json` con `"sintetico": true` y `"clavesExactas": true`, escribir `tools/test/fixtures-pdf417-amarilla.test.mjs` (regenerar en memoria da los mismos archivos) y registrar `pdf417-amarilla` en `evals/runners/registro.mjs`. Documentar el tipo en `.claude/skills/eval-campo/SKILL.md`. Cubre: PA-02, PA-03, PA-21 (eval). Tipos de prueba: **unitaria**, **eval**. Verificación: `npx vitest run tools/test/fixtures-pdf417-amarilla.test.mjs` en verde y `npm run eval:quick` con 0 excepciones, `exact_match` 100 % en cada campo de `pdf417-amarilla` y sin regresión en los demás tipos; `evals/reports/baseline.json` sin cambios (lo actualiza el orquestador).

## 9. Cierre de calidad del cambio

- [x] 9.1 Medir cobertura y mutación de `src/pdf417-amarilla/` tras los grupos 1 a 8; matar cada mutante superviviente con una prueba nueva o justificarlo como equivalente en el PR. Cubre: PA-01 a PA-21. Tipos de prueba: **mutación**, cobertura. Verificación: `npx vitest run packages/parsers --coverage --coverage.include="packages/parsers/src/pdf417-amarilla/**"` con ramas >= 95 %; `npm run test:mutacion -- --mutate "packages/parsers/src/pdf417-amarilla/**/*.ts,evals/runners/adaptadores/**/*.mjs"` >= 85 % por archivo; `npm run check` en verde.

## 10. Integración con DIVIPOL (requiere `divipol-registraduria` aplicado)

- [x] 10.1 Escribir el escenario "Integración con la búsqueda DIVIPOL real" de PA-15 importando `buscarDivipol` solo en la prueba. Cubre: PA-15. Tipos de prueba: **unitaria** de integración. Verificación: `npx vitest run packages/parsers` en verde; `grep -rn "buscarDivipol" packages/parsers/src/pdf417-amarilla` sin resultados.

## Workflow follow-up

- El orquestador registra en `docs/decisiones/hipotesis-formato.md` la fila `H15` y las enmiendas de H04, H06 y H08 propuestas en `design.md` antes de archivar; si `H15` cambia de número, se actualizan spec, pruebas y código en el mismo PR.
- El orquestador fija el baseline de evals con el tipo `pdf417-amarilla` tras el veredicto del `verificador`.
- En paralelo al cierre: `verificador` (spec contra código) y `pr-test-analyzer` (calidad de las pruebas); `revisor-privacidad` por tocar biometría (principio III).
- Archivar el cambio tras la confirmación del `verificador`.
