# Tasks

Reglas para todas las tareas: TDD (principio II): la prueba se escribe y se ve fallar antes de implementar. Solo datos sintéticos (`@lector-cedula/fixtures`, `evals/sinteticos/fraude/`). Comandos `U`, `T`, `B`, `M`, `E(x)`, `EV`, `G`, `L`, `P`, `C` y la tabla por requisito: `design.md`, `## Pruebas`. Pruebas que lancen procesos o navegadores declaran `{ timeout: 60_000 }`. Código con `\` o escapes `\u` se escribe con la herramienta de escritura y se comprueban los bytes. Toda decisión que cambie comportamiento se lleva en el momento a `specs/` con su escenario.

## 0. Revisión previa

- [ ] 0.1 `revisor-licencias`: auditar augraphy, kornia y los candidatos de Fase B (IDNet-2025, IDSpace, FantasyID, DLC-2021, MIDV-Holo) y registrar la decisión en `docs/decisiones/`. Cubre FRA-13, FRA-16. Tipos de prueba: **licencias**. Verificación: `L` con código 0 y decisión escrita.
- [ ] 0.2 `revisor-privacidad`: revisar FRA-03, FRA-15 y el flujo de frames en el Worker antes de implementar. Cubre FRA-03, FRA-15. Tipos de prueba: **seguridad estática de privacidad**. Verificación: `P` con código 0 e informe del revisor.

## Fase A. Heurísticas (sin ML)

### 1. Andamiaje y contrato

- [x] 1.1 Crear `packages/fraud` (workspace npm, export de tipos `SenalRiesgo`, `ConfigFraude`), proyecto `fraud-browser` de Vitest y `src/**` en `mutate`. Cubre FRA-01 (contrato). Tipos de prueba: **contrato de tipos**, **unitaria**. Verificación: `T` y `U`.
- [x] 1.2 Registrar H-FRA-1 y H-FRA-3 (H-FRA-2 descartada, P7) como `pendiente` en `docs/decisiones/hipotesis-formato.md`. Cubre FRA-08, FRA-09, FRA-11. Tipos de prueba: ninguno de comportamiento; la unitaria de `warnings` llega en 4.2. Verificación: `C`.
- [x] 1.3 Configuración y política: `validarConfigFraude`, niveles y `accion`. Cubre FRA-04, FRA-05. Tipos de prueba: **unitaria**, **propiedad**. Verificación: `U`.
- [ ] 1.4 Agregación `agregarMotivos`. Cubre FRA-06. Tipos de prueba: **unitaria**, **propiedad**, **mutación**. Verificación: `U` y `M` >= 85 %.

### 2. Dataset sintético y corredor

- [x] 2.1 Generador `npm run fraude:sinteticos` con las siete clases y manifiesto. Cubre FRA-13. Tipos de prueba: **unitaria** (determinismo, manifiesto), **licencias**, **privacidad**. Verificación: `G`, `npx vitest run tools`, `L`, `P`.
- [ ] 2.2 Corredor `npm run eval:fraude` con APCER, BPCER, AUC, Wilson 95 % y comparación contra `baseline-fraude.json`; esquema del reporte de campo. Cubre FRA-14, FRA-15. Tipos de prueba: **unitaria**, **mutación**. Verificación: `npx vitest run evals` y `M`.

### 3. Consistencia de datos

- [ ] 3.1 Detector `inconsistencia` reutilizando validadores de `packages/parsers` y reloj inyectado. Cubre FRA-11. Tipos de prueba: **unitaria**, **propiedad**, **errores pasados**, **mutación**. Verificación: `U` y `M`.

### 4. Detectores de imagen

- [x] 4.1 Primitivas: FFT 2D, DCT 8x8, HSV, rectificación a 1024 px. Base de FRA-07 a FRA-10. Tipos de prueba: **unitaria** con oráculos analíticos (seno puro, impulso), **propiedad** (Parseval). Verificación: `U`.
- [x] 4.2 Detector `pantalla` y detector `fotocopia`. Cubre FRA-07, FRA-08. Tipos de prueba: **unitaria**, **metamórfica**, **eval**. Verificación: `U` y `EV` con metas de FRA-14.
- [ ] 4.3 Detectores `recorte` y `edicion`. Cubre FRA-09, FRA-10. Tipos de prueba: **unitaria**, **propiedad**, **eval**. Verificación: `U` y `EV`.
- [ ] 4.4 `evaluarFraude` y manejador del Worker con buffers a cero. Cubre FRA-01, FRA-03. Tipos de prueba: **unitaria**, **propiedad** (no lanza), **mutación**. Verificación: `U`, `M`, `P`.
- [ ] 4.5 Rendimiento y presupuesto. Cubre FRA-12. Tipos de prueba: **rendimiento** en navegador, **unitaria** de bundle. Verificación: `B` y `npm run build -w @lector-cedula/pwa` + `U`.
- [ ] 4.6 Fijar `evals/reports/baseline-fraude.json` con la primera corrida aprobada por humano. Cubre FRA-14. Tipos de prueba: **eval**. Verificación: `EV` con código 0.

### 5. Integración PWA

- [ ] 5.1 Vídeos `amarilla-pantalla-1080p` y `amarilla-fotocopia-1080p` desde el generador; invocación en el Worker tras la lectura; atributos `data-riesgo-*` en `resultado`. Plan E2E con `playwright-test-planner` en `e2e/planes/deteccion-fraude.md`. Cubre FRA-02, FRA-17. Tipos de prueba: **E2E**, **accesibilidad**. Verificación: `E(offline)`, `E(resultado-riesgo)`, `E(accesibilidad)`.

## Fase B. Modelo ligero opcional

- [ ] 6.1 Carga opcional del modelo con sesión inyectada y omisión segura; entrada en `models/manifest.json` con `licenciaDatos`; extender `licencia-check` para exigir ese campo. Cubre FRA-16. Tipos de prueba: **unitaria**, **golden**, **licencias**. Verificación: `U`, `L`. Bloqueada por 0.1.
- [ ] 6.2 Entrenamiento en Docker y eval del modelo; precaché con `sha256`. Cubre FRA-16, FRA-02. Tipos de prueba: **eval**, **E2E** offline. Verificación: `EV` (AUC >= 0,95 held-out) y `E(offline)`.
- [ ] 6.3 Set de campo con consentimiento (fuera del repo), solo métricas agregadas. Cubre FRA-15. Tipos de prueba: **eval**, **privacidad**. Verificación: reporte validado por el esquema de 2.2 y `P`. Bloqueada por 6.4 (P4).
- [ ] 6.4 Revisión legal del set de campo con fotocopias y pantallas de cédulas reales (P4). Tipos de prueba: ninguno; aprobación escrita en `docs/legal/`. Bloquea 6.3.

## 7. Cierre

- [ ] 7.1 `revisor-privacidad` sobre el código implementado. Verificación: `P` e informe sin hallazgos críticos.
- [ ] 7.2 `revisor-licencias` sobre dependencias y modelos. Verificación: `L` e informe.
- [ ] 7.3 En paralelo: `verificador` (spec contra código, todos los FRA con su fila de `## Pruebas` ejecutada) y `pr-test-analyzer` (calidad de pruebas). Verificación: `C` en verde y ambos informes; hallazgos críticos abren un cambio nuevo.
- [ ] 7.4 `eval-runner` y `revisor-producto` contra el listón comercial. Verificación: `EV` sin regresión.
