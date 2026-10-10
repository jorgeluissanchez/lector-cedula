## Contexto

El lector admite hoy la cédula de ciudadanía (amarilla PDF417 y digital MRZ TD1 `IC`+`COL`) y rechaza menores (OFF-24). El usuario pidió CE, pasaporte, TI parametrizable y detección automática (2026-10-08). La meta comercial es el punto 8 del benchmark (multi-documento CO).

### Formato de la cédula de extranjería (lo que se sabe y lo que no)

- Resolución UAEMC 0086 de 2017 (https://www.cancilleria.gov.co/normograma/compilacion/docs/resolucion_uaemc_0086_2017.htm, citada en `docs/investigacion/01-formato-cedula-y-repos.md` §4): tarjeta ID-1 (ISO/IEC 7810) conforme a ICAO 9303, reverso con "código de barras bidimensional" y zona MRZ, sin chip. Esto respalda que la MRZ es TD1 (formato de tarjeta ID-1 en ICAO 9303 parte 5), pero la resolución no publica el contenido de los campos.
- El rediseño de 2025 es la Res. UAEMC 1395 de 2025 (16-05-2025): mantiene MRZ y código 2D en el reverso; las CE de la Res. 2570/2019 siguen válidas hasta vencer. El layout de la MRZ no está publicado (CE07). Ver docs/investigacion/05-cedula-extranjeria-y-ti.md.
- Las Res. 86/2017, 2570/2019 y 1395/2025 exigen un código de barras bidimensional en el reverso sin publicar su simbología ni contenido; ningún repositorio lo decodifica (CE04).
- La investigación de 2026-10-08 (docs/investigacion/05-cedula-extranjeria-y-ti.md) no halló espécimen con MRZ legible: los offsets de la CE, T01 y P01 siguen como hipótesis pendientes.

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

## Decisiones del orquestador por delegación del usuario, 2026-10-08

1. **TI solo por PDF417.** Una MRZ TD1 con código `IT` o `TI` y emisor `COL` (hipótesis T01) no se admite: `clasificarDocumento` da `documento-no-admitido` con el warning `"T01"` (OD-11b, OD-33).
2. **Menores de 7 años.** Con la TI encendida, una persona menor de 7 años a la `fechaReferencia` se rechaza con `documento-no-admitido`: su documento es el registro civil, no la TI (OD-32b).
3. **CE y pasaporte de menores** se admiten solo con el parámetro encendido y la misma autorización del representante de OD-34 (OD-32a).
4. **Pasaporte vencido** es el warning `"documento-vencido"`, no un rechazo; decide el integrador (OD-05).
5. **`tipo` obsoleto** se mantiene un ciclo y se retira en el próximo cambio (OD-22).
6. **P01**: el dato opcional del pasaporte se devuelve sin interpretar; no se valida como NUIP ni se expone como `nuip` (OD-01c).
7. **Autorización sin identificar al representante**: la pregunta jurídica va a `docs/legal/PARA-EL-ABOGADO.md` (OD-34b).
8. **CE con hipótesis**: se implementa con CE01, CE02, CE03, CE05, CE06 y CE07 como warnings hasta confirmar con espécimen (docs/investigacion/05-cedula-extranjeria-y-ti.md); CE04 no es warning porque se cumple no decodificando el 2D (OD-11a, OD-13).

### Decisiones del implementador de la fase 1 (trasladadas a la spec)

9. `nombrePaisEmisor` y `nombreNacionalidad` van en la raíz del resultado de `parsearMrzTd3` y `parsearMrzTd1`, no en `campos`, para que `campos` sea exactamente el de OD-01a (OD-01b, OD-10b).
10. Una `fechaReferencia` presente que no sea `AAAA-MM-DD` existente da `error: "fecha-referencia-invalida"` en ambos parsers; ausente usa la fecha del sistema en `America/Bogota` (OD-05a).
11. `parsearMrzTd3` y `parsearMrzTd1` no normalizan espacios ni minúsculas: cualquier carácter fuera de `0-9A-Z<` da `formato-td3` o `formato-td1`; la limpieza del OCR es del lector de imagen (OD-01b, OD-10b).


## OFF-27c: presupuesto del respaldo MRZ tras una pista PDF417 (2026-10-09)

Con el plan de 4 vistas (LMI-12c) y el TD1 genérico (OD-11), el respaldo MRZ de `tarjeta-ilegible-1080p` gastaba las 12 llamadas de OFF-23 (unos 11,6 s) y la primera lectura llegaba a unos 19 s, sin margen para el reintento de OFF-26 dentro de 20 s. La presencia ya dijo PDF417, así que el respaldo es improbable; las vistas se ordenan por evidencia (LMI-14b) y una MRZ real queda en las primeras llamadas. El tope solo puede convertir una lectura en `mrz-no-encontrada`: no añade lecturas falsas.

## Evals y E2E de la TI: decisiones del orquestador (2026-10-10, tareas 3.1, 6.3 y 7.1)

12. **Ampliación del baseline de `eval-campo`.** `evals/reports/baseline.json` solo tenía `nuip-formato`; se le añaden, sin tocar lo existente ni el modo, las métricas actuales de `mrz-td3` y `clasificar-documento` (todas con exact match 100 % y CER 0). Desde ahora una caída en esos tipos o la pérdida de fixtures es regresión. Golden nuevos de `clasificar-documento`: `pasaporte-extranjero` (ESP), `pasaporte-ven`, `ce-2025` (6 cifras, ECU), `ti-mrz-it` y `ti-mrz-ti` (TI por MRZ rechazada con T01, decisión 1). La TI amarilla no tiene golden de `eval-campo` propio: su PDF417 es el de la amarilla y la TI se decide por edad en `leerDocumento` (unitarias de 2.4 y E2E de 6.3).
13. **`eval:mrz-imagen` con pasaporte y CE.** Además del conjunto E de LMI-06, 40 pasaportes sintéticos (colombianos y extranjeros, semilla 20261010, leídos con `formato: "td3"`) y 40 CE sintéticas (semilla 20261011), con las 9 distorsiones sobre los 20 primeros de cada tipo (`evals/sinteticos/generador-icao.mjs`, nombres de sílabas al azar). Umbral por grupo: 90 % correctas y 0 falsas (tabla de Pruebas, OD-21); un documento con campos distintos de su verdad es falso. Primera corrida: 40/40 y 20/20 en cada grupo de ambos tipos, 0 falsas. Escenario "Eval de imagen de pasaporte y CE" en la spec. Se corrigió el ruido gaussiano del renderizador, que solo cubría el lienzo TD1 (1011x638) y dejaba sin ruido (en negro) el resto del lienzo TD3.
14. **Marcador `URL-AUTORIZACION-TI`.** Los borradores de `docs/legal/` lo conservan (lo llena quien despliega, como los demás `URL-*`); la compilación de la PWA lo sustituye en `politica-tratamiento.html` por `/assets/autorizacion-representante-ti.html` con `VITE_ADMITIR_TI=true` y lo quita (queda el texto) con `false`. `mdAHtml` solo convierte en `<a>` los enlaces a `/assets/<archivo>.html`. Escenario "Marcador URL-AUTORIZACION-TI en la política publicada".
15. **E2E de la TI.** `e2e/lectura/tarjeta-identidad.spec.ts` compila la PWA con `VITE_ADMITIR_TI=true` en un temporal fuera del repositorio y la sirve con `servidor-copia` (sin tocar `playwright.config.ts` ni `apps/pwa/dist`); vídeo `ti-amarilla-1080p` con `PERSONA_TI` (PERSONA_BASE con nacimiento 2014-03-14, 12 años el 2026-10-06). En Pixel 7 las URL largas de la plantilla ensanchaban la página y tapaban "Cancelar"; `.autorizacion-representante` corta las palabras largas.
