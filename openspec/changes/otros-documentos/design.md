## Contexto

El lector admite hoy la cédula de ciudadanía (amarilla PDF417 y digital MRZ TD1 `IC`+`COL`) y rechaza menores (OFF-24). El usuario pidió CE, pasaporte, TI parametrizable y detección automática (2026-10-08). La meta comercial es el punto 8 del benchmark (multi-documento CO).

### Formato de la cédula de extranjería (lo que se sabe y lo que no)

- Resolución UAEMC 0086 de 2017 (https://www.cancilleria.gov.co/normograma/compilacion/docs/resolucion_uaemc_0086_2017.htm, citada en `docs/investigacion/01-formato-cedula-y-repos.md` §4): tarjeta ID-1 (ISO/IEC 7810) conforme a ICAO 9303, reverso con "código de barras bidimensional" y zona MRZ, sin chip. Esto respalda que la MRZ es TD1 (formato de tarjeta ID-1 en ICAO 9303 parte 5), pero la resolución no publica el contenido de los campos.
- Truora distingue `co_foreign-id` y `co_foreign-id-2025`: hubo un rediseño en 2025 cuyo formato no está documentado públicamente (CE07).
- Ningún repositorio público decodifica el 2D de la CE; su simbología (PDF417 o QR) no está confirmada (CE04).
- Este agente no tuvo acceso a la web en esta sesión: la investigación nueva no se pudo ampliar. Todo offset de la CE queda como hipótesis pendiente (CE01 a CE07) y la tarea 1.1 encarga al investigador confirmarlo con especímenes públicos de Migración Colombia.

### TI

- PDF417: H10 (mismo layout) y H12 (prefijo `I3`) pendientes. TI digital con MRZ: hipótesis T01 (código `IT`/`TI`), sin especímenes.

## Decisiones

1. **TD3 propio, no `cheminfo/mrz`.** `parsearMrzTd3` y `parsearMrzTd1` se escriben en `packages/parsers` reutilizando `digitoControlIcao` (MZ-08) para mantener una sola implementación del checksum y de las correcciones OCR-B, y el control de warnings por hipótesis. `cheminfo/mrz` (MIT) puede usarse solo como oráculo diferencial en pruebas (tarea 2.4, revisor-licencias).
2. **Tabla de países embebida** en `packages/parsers/src/paises-icao.ts`, con nombres en español, generada desde ISO 3166-1 (los códigos alfa-3 no tienen restricción de licencia; los nombres en español se redactan en el repo) y la lista de códigos especiales de ICAO 9303 parte 3.
3. **CE por MRZ solamente.** El 2D del reverso no se decodifica (OD-13, principio V por analogía con el QR y principio III por posible biometría).
4. **Parámetro TI en dos lugares**, sin configuración en tiempo de ejecución en la PWA (es estática): `VITE_ADMITIR_TI` (build, `"true"`/`"false"`) y `LECTOR_ADMITIR_TI` (servidor, `"1"`/`"0"`, mismo patrón que `LECTOR_LIVE` en `server/app/config.py`). El servidor expone el valor en `GET /v1/capacidades` para que un SDK sepa qué admite la instancia. Si la PWA usa el servidor de respaldo, manda el menor de los dos (si cualquiera está apagado, se rechaza).
5. **Regla de edad invertida** como OFF-24b dentro de OD-32, sin modificar el texto de OFF-24 (que sigue vigente con el parámetro apagado, OD-31). Así `pwa-lectura-offline` se archiva sin cambios.
6. **Menores sin retención**: los resultados con `menorDeEdad: true` no entran al almacén ni a webhooks con campos (minimización reforzada para datos de NNA).
7. **`tipo` obsoleto**: se conserva un ciclo para no romper integradores; se retira en un cambio posterior.
8. **`"mrz"` como alias** de `"mrz-td1"` en la pista, por OFF-27.

## Riesgos

- Clasificar mal una CE como documento extranjero o viceversa si CE01/CE02 son falsas: mitigado con warnings y con `documento-no-admitido` explícito.
- Pasaportes con MRZ dañada por la costura o laminado: se mide en el eval TD3 con distorsiones.
- Datos de menores: revisor-privacidad obligatorio; parámetro apagado por defecto.

## Pruebas

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| OD-01, OD-01a | Unitaria con literales (espécimen ICAO, pasaportes COL sintéticos, longitudes inválidas) | Vitest | `npx vitest run packages/parsers/test/mrz-td3` | 100 % de escenarios; ramas >= 95 % |
| OD-01, OD-05 | Propiedad: nunca lanza con `fc.anything()`, `fc.string()` y binario | fast-check | `npx vitest run packages/parsers/test/mrz-td3` | numRuns >= 1000, 0 excepciones |
| OD-02 | Propiedad: round-trip generador TD3 -> parser y mutación de un carácter protegido | fast-check + generador de `fixture-sintetico` | `npx vitest run packages/parsers/test/mrz-td3` | numRuns >= 1000; > 50 % de casos útiles medidos con `fc.statistics` |
| OD-02 | Diferencial contra oráculo independiente | `cheminfo/mrz` (solo devDependency, tras revisor-licencias) | `npx vitest run packages/parsers/test/mrz-td3.diferencial` | 0 discrepancias en 1000 casos |
| OD-03 | Unitaria de correcciones OCR-B por zona | Vitest | `npx vitest run packages/parsers/test/mrz-td3` | 100 % de escenarios |
| OD-04 | Unitaria de tabla (249 alfa-3 + especiales, `D<<`, `QQQ`) | Vitest | `npx vitest run packages/parsers/test/paises-icao` | 100 % de escenarios |
| OD-01 a OD-05, OD-10 a OD-12 | Mutación | Stryker | `npm run test:mutacion` | mutation score >= 85 % (break 80) en `mrz-td3.ts`, `mrz-td1.ts`, `paises-icao.ts`, `clasificar-documento.ts` |
| OD-10, OD-10a | Unitaria + propiedad (nunca lanza) + regresión de `parsearMrzCedulaDigital` (`toStrictEqual` con la salida previa) | Vitest, fast-check | `npx vitest run packages/parsers` | numRuns >= 1000; 0 cambios en la digital |
| OD-11, OD-12 | Unitaria de clasificación con warnings de hipótesis | Vitest | `npx vitest run packages/parsers/test/clasificar-documento` | 100 % de escenarios |
| OD-13 | Integración con espías (parser amarilla con bytes aleatorios, bytes a cero) | Vitest | `npx vitest run packages/capture/test/lectura` | 100 % de escenarios |
| OD-20 | Unitaria de presencia sobre imágenes sintéticas + rendimiento | Vitest | `npx vitest run packages/capture/test/calidad` | contenido correcto en 5 de 5; digital al revés < 250 ms (mínimo de 10) |
| OD-21 | Integración con OCR real en 4 orientaciones; metamórficas (rotación ±3°, blur sigma <= 1, brillo ±20 %, JPEG 70) | Vitest | `npx vitest run packages/capture/test/mrz --maxWorkers=2` | 4 de 4 orientaciones; salida idéntica bajo distorsión leve |
| OD-21 | Eval golden TD3 y CE | `eval-campo` | `npm run eval:quick` y `npm run eval:mrz-imagen` | exact match >= 90 % por grupo, 0 lecturas falsas; sin regresión frente a `baseline.json` |
| OD-22, OD-22a | Unitaria de la forma unificada | Vitest | `npx vitest run packages/capture/test/lectura` | 100 % de escenarios |
| OD-22, OD-30, OD-34 | Contrato OpenAPI | Schemathesis | `docker compose -f server/compose.yaml run --rm pruebas` | 0 fallos con `--checks all` |
| OD-30, OD-30a, OD-34, OD-34a | Unitaria y propiedad del servidor (config, 422, retención 0, webhook sin campos) | pytest + Hypothesis | `docker compose -f server/compose.yaml run --rm pruebas` | 100 % de escenarios; 0 alertas ZAP High; ruff S sin hallazgos |
| OD-30 | Unitaria de la configuración de build | Vitest | `npx vitest run apps/pwa/test/config` | 100 % de escenarios |
| OD-23, OD-34b, OD-35 | E2E con cámara simulada y accesibilidad | Playwright + @axe-core/playwright | `npm run test:e2e` | verde en Chromium y Pixel 7; 0 violaciones serious o critical |
| OD-30a, OD-31, OD-32, OD-32a, OD-33 | Unitaria con literales de frontera de edad, en ambos valores del parámetro | Vitest | `npx vitest run packages/capture/test/lectura` | 100 % de escenarios |
| OD-35 | Unitaria de presencia de textos legales | Vitest | `npx vitest run tools/test/legal-ti.test.mjs` | 100 % de escenarios |
| OD-40 | Unitaria de `privacidad-check` con casos que deben fallar | Vitest | `npx vitest run tools/test` y `npm run check:privacidad` | detecta 2 de 2 casos; repo limpio |
| Todos | Puerta completa | npm | `npm run check` | verde |
