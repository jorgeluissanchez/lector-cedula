# Tasks

Reglas: TDD (principio II), Python solo en Docker, datos sintéticos de `evals/fixtures/sinteticos/`, pruebas `test_MSxx_<escenario>`. Comandos en `design.md`, sección `## Pruebas`.

## 1. Intérprete Node en la imagen

- [x] 1.1 Escribir `server/interprete/interpretar.mjs`; añadir la etapa `parsers` y Node 24 a `server/Dockerfile`, el contexto adicional `parsers` y los montajes de `interprete` y `evals/fixtures/sinteticos` (solo lectura) en `server/compose.yaml`. Pruebas primero: "PDF417 sintético con apellido compuesto", "MRZ sintética con apellido compuesto", "Entrada no válida" y la propiedad de entradas arbitrarias. Cubre MS-01. Tipos de prueba: **integración**, **propiedad**, **seguridad** (licencias de Node y TypeScript). Verificación: `P` en verde; `npm run check:licencias` sin infracciones.

## 2. Motor real

- [x] 2.1 `server/app/motor_real.py`: `Lectura`, `Lector`, `Interprete`, `InterpreteNode` y `MotorReal`. Pruebas primero: los escenarios de MS-02, MS-06 y MS-07 a MS-15, más la propiedad de validez contra el esquema `Validation`. Cubre MS-01, MS-02, MS-06 y MS-07 a MS-15. Tipos de prueba: **unitaria**, **integración**, **propiedad**. Verificación: `P` en verde.

## 3. Activación y privacidad

- [x] 3.1 `Puertos(lector=...)` crea `motor_live`. Pruebas primero: los 3 escenarios de MS-03 y los 3 primeros de MS-04. Cubre MS-03 y MS-04. Tipos de prueba: **unitaria**, **privacidad**. Verificación: `P` en verde.
- [x] 3.2 Verificación en contenedor: escenario "Contenedor de solo lectura con Node" y "Sin dependencias no aprobadas"; `G`, `C`, `Z`, `npm run check:privacidad`, `npm run check` y `openspec validate motor-real-servidor --strict`. Cubre MS-04 y MS-05. Tipos de prueba: **integración**, **seguridad**, **contrato**. Verificación: los comandos citados en verde y `find /tmp -type f` vacío. Revisión del `revisor-privacidad`.

## 4. Lector Node de packages/capture (decisión 9: reemplaza zxing-cpp y RapidOCR)

- [x] 4.1 Licencias: LICENSE de Node en la imagen y modelo `tesseract-mrz` empaquetado con su SHA-256. Pruebas primero: escenarios de MS-05. Cubre MS-05. Tipos de prueba: **seguridad** (licencias). Verificación: P y `npm run check:licencias` en verde.
- [x] 4.2 `server/lector/leer.mjs`, etapas `fuente` (HEAD del repositorio) y `lector` del Dockerfile, `LectorNode` y activación por `LECTOR_LIVE`. Pruebas primero: escenarios de MS-16 (los dos en contenedor), MS-17, MS-18 y MS-19. Cubre MS-16 a MS-19. Tipos de prueba: **unitaria**, **integración**, **privacidad**. Verificación: P en verde; `find /tmp -type f` vacío en `api-pruebas` tras una lectura.
- [x] 4.3 Equivalencia con la CLI (MS-16) en `tools/test/lector-servidor.test.mjs`. Tipos de prueba: **integración**, **diferencial**. Verificación: `npx vitest run tools/test/lector-servidor.test.mjs` y `npm run check` en verde.
