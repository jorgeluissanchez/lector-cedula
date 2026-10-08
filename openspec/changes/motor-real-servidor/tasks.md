# Tasks

Reglas: TDD (principio II), Python solo en Docker, datos sintéticos de `evals/fixtures/sinteticos/`, pruebas `test_MSxx_<escenario>`. Comandos en `design.md`, sección `## Pruebas`.

## 1. Intérprete Node en la imagen

- [x] 1.1 Escribir `server/interprete/interpretar.mjs`; añadir la etapa `parsers` y Node 24 a `server/Dockerfile`, el contexto adicional `parsers` y los montajes de `interprete` y `evals/fixtures/sinteticos` (solo lectura) en `server/compose.yaml`. Pruebas primero: "PDF417 sintético con apellido compuesto", "MRZ sintética con apellido compuesto", "Entrada no válida" y la propiedad de entradas arbitrarias. Cubre MS-01. Tipos de prueba: **integración**, **propiedad**, **seguridad** (licencias de Node y TypeScript). Verificación: `P` en verde; `npm run check:licencias` sin infracciones.

## 2. Motor real

- [x] 2.1 `server/app/motor_real.py`: `Lectura`, `Lector`, `Interprete`, `InterpreteNode` y `MotorReal`. Pruebas primero: los escenarios de MS-02, MS-06 y MS-07 a MS-15, más la propiedad de validez contra el esquema `Validation`. Cubre MS-01, MS-02, MS-06 y MS-07 a MS-15. Tipos de prueba: **unitaria**, **integración**, **propiedad**. Verificación: `P` en verde.

## 3. Activación y privacidad

- [x] 3.1 `Puertos(lector=...)` crea `motor_live`. Pruebas primero: los 3 escenarios de MS-03 y los 3 primeros de MS-04. Cubre MS-03 y MS-04. Tipos de prueba: **unitaria**, **privacidad**. Verificación: `P` en verde.
- [ ] 3.2 Verificación en contenedor: escenario "Contenedor de solo lectura con Node" y "Sin dependencias no aprobadas"; `G`, `C`, `Z`, `npm run check:privacidad`, `npm run check` y `openspec validate motor-real-servidor --strict`. Cubre MS-04 y MS-05. Tipos de prueba: **integración**, **seguridad**, **contrato**. Verificación: los comandos citados en verde y `find /tmp -type f` vacío. Revisión del `revisor-privacidad`.

## 4. Lectores concretos (BLOQUEADO: requiere aprobación del agente `revisor-licencias`)

- [ ] 4.1 Informe del `revisor-licencias` sobre zxing-cpp 3.1.1 (Python), RapidOCR 3.9 y los pesos PP-OCR que use, con `models/manifest.json`. Sin informe aprobatorio no se empieza 4.2 ni 4.3. Cubre MS-05. Tipos de prueba: **seguridad** (licencias). Verificación: informe adjunto y `npm run check:licencias` sin infracciones.
- [ ] 4.2 `LectorPdf417Zxing`: re-decodificación del reverso a resolución completa en memoria, con escenarios propios (añadirlos a la spec antes de implementar) sobre imágenes sintéticas de `@lector-cedula/fixtures`. Cubre MS-03. Tipos de prueba: **unitaria**, **metamórfica**, **eval**. Verificación: `P` y `npm run eval:quick` en verde.
- [ ] 4.3 `LectorMrzRapidOcr`: OCR de la franja MRZ en memoria, con escenarios propios en la spec. Cubre MS-03. Tipos de prueba: **unitaria**, **metamórfica**, **eval**. Verificación: `P` y `npm run eval:quick` en verde.
