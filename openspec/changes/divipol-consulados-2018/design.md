# Design

## Contexto

Decisiones del usuario del 2026-10-07 (chat con el orquestador): opción B (módulo aparte CC BY-SA, principal MIT puro), corregir erratas declarándolas como cambios, el módulo 2018 devuelve el nombre vigente sin campo alias en el principal, Belice e Irlanda con ambos códigos en el módulo 2018, avisos en `tools/divipol/fuentes/LICENSES.md` y `packages/parsers/THIRD_PARTY_NOTICES.md`.

## Decisiones

1. **Extracto mínimo como instantánea.** La URL del manifiesto es una consulta SoQL agrupada que solo devuelve `dd`, `mm` y `municipio` (69 filas). Se comprobó que dos descargas con curl y una con `fetch` de Node dan el mismo SHA-256. `--descargar` la refresca como las demás fuentes.
2. **Generador independiente de Eitol para el módulo 2018.** `parsearConsulados2018` valida la estructura y `construirConsulados2018` aplica las correcciones literales y los alternos literales (`88195` a la fila de `88415`, `88480` a la de `88470`). El contraste con la tabla principal (11 nuevos, 4 renombres, 54 iguales) es oráculo de las pruebas de integridad, no del generador; así las fuentes sintéticas de las pruebas de la CLI siguen siendo válidas.
3. **Renombres literales.** `RENOMBRADOS_2018` es una lista literal en `divipol-lib.mjs` serializada al módulo; la prueba de integridad la compara con la diferencia real.
4. **Nombres sin tildes**, como el resto de la tabla (convención de Eitol y de la fuente): `AZERBAIYAN`, no `AZERBAIYÁN`.
5. **Consumidores.** `lugar.ts` importa `buscarConsulado2018` y `RENOMBRADOS_2018` del punto de entrada `@lector-cedula/parsers/divipol-2018`. Consumen `conLugarNacimiento` de `packages/capture`: la CLI `tools/leer-foto.mjs` (DC-10) y el intérprete del servidor `server/interprete/interpretar.mjs`, que añade `lugar_nacimiento` a la respuesta PDF417 (DC-14, cargado de `RUTA_LUGAR`); el motor `server/app/motor_real.py` lo lleva a `place_of_birth` (DC-17) y la imagen copia el aviso a `/srv/licencias/` (DC-18). Ambos consumidores llevan el literal `CC BY-SA 4.0` exigido por DC-15.
6. **Licencias.** El paquete ya declara `MIT AND CC-BY-SA-4.0`. La PWA y la CLI que empaquetan `capture` reciben datos CC BY-SA: requiere atribución visible en esas distribuciones (pendiente de `revisor-licencias`).

## Pruebas

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| DC-01 | Integridad (exports, grafo de importaciones, tabla principal intacta, metadatos) | Vitest | `npx vitest run packages/parsers` | 100 % escenarios |
| DC-02, DC-03, DC-04 | Unitaria con literales | Vitest | `npx vitest run packages/parsers` | 100 % escenarios |
| DC-05 | Propiedad, fuzz, exhaustiva | Vitest + fast-check | `npx vitest run packages/parsers` | numRuns >= 1000, 0 excepciones, 71 encontrados |
| DC-06, DC-09 | Unitaria del parser y correcciones; integridad de checksum | Vitest | `npx vitest run tools/test/divipol-consulados-2018.test.mjs tools/test/divipol-lib.test.mjs` | 100 % escenarios |
| DC-06, DC-07 | Integración de la CLI (`spawnSync`) | Vitest | `npx vitest run tools/test/divipol-cli-consulados-2018.test.mjs` | código 0/1 y archivos según escenario |
| DC-07 | Integridad contra la tabla principal | Vitest | `npx vitest run packages/parsers` y `npm run divipol:verificar` | conteos literales; código 0 |
| DC-08 | Unitaria | Vitest | `npx vitest run packages/capture/test/lectura` | 100 % escenarios |
| DC-10 | Integración: `--licencias` en proceso hijo (`tools/test/leer-foto-licencias.test.mjs`) | Vitest + `spawnSync` | `npx vitest run tools/test/leer-foto-licencias.test.mjs` | 2 de 2: código 0, stdout igual a `THIRD_PARTY_NOTICES.md`, stderr vacío, sin ruta exigida |
| DC-10 | Integración: campo `fuentes`, consulado `88690` y error sin `fuentes` (`tools/test/leer-foto.test.mjs`) | Vitest + `spawnSync` | `npx vitest run tools/test/leer-foto.test.mjs -t DC-10` | 3 de 3 con los literales de la spec |
| DC-11 | Integridad: grafo de importaciones del fuente y del compilado, ausencia de `88195` y `AZERBAIYAN` | Vitest | `npx vitest run packages/parsers/test/divipol-2018.test.ts -t DC-11` | 3 de 3; 0 rutas bajo `divipola/` o `divipol-2018/` |
| DC-12 | Unitaria (5 casos negativos de aviso, 1 positivo) e integración sobre el repositorio | Vitest | `npx vitest run tools/test/licencia-check.test.mjs -t DC-12` y `npm run check:licencias` | 5 de 5 infracciones nombran el artefacto; código 0 en el repositorio |
| DC-13 | Integridad del contenido de `THIRD_PARTY_NOTICES.md` y `LICENSES.md` | Vitest | `npx vitest run tools/test/avisos-cc-by-sa.test.mjs` | 4 de 4: fechas, enlace legal, `Cambios:`, `no implica aval` y 3 modificaciones |
| DC-14 | Integración del intérprete real (`InterpreteNode`) con PDF417 sintético: `16001`, `88690`, `88140`, `99999` (`server/tests/test_DC14_17_18_lugar_vigente.py`) | pytest en Docker | `docker compose -f server/compose.yaml run --rm pruebas` | 3 de 3 `test_DC14_*` con `lugar_nacimiento` exacto o `null` |
| DC-15 | Unitaria: consumidor `.mjs` con y sin `CC BY-SA 4.0` | Vitest | `npx vitest run tools/test/licencia-check.test.mjs -t DC-15` | infracción que nombra el archivo sin el literal; 0 con él o sin importar datos CC BY-SA |
| DC-16 | Unitaria: Dockerfile que compila `packages/parsers/src` con y sin `COPY` a `/srv/licencias/` | Vitest | `npx vitest run tools/test/licencia-check.test.mjs -t DC-16` | 1 infracción sin la copia; 0 con ella o sin compilar los parsers |
| DC-17 | Unitaria del motor: `place_of_birth` con nombres y sin ellos (`null`, otro código, nombre vacío, no objeto) | pytest en Docker | `docker compose -f server/compose.yaml run --rm pruebas` | 2 de 2 `test_DC17_*` con el objeto exacto de la spec |
| DC-18 | Integridad de la imagen: `/srv/licencias/parsers-THIRD_PARTY_NOTICES.md` | pytest en Docker | `docker compose -f server/compose.yaml run --rm pruebas` | `test_DC18_aviso_en_la_imagen`: existe y contiene `CC BY-SA 4.0` y `Registraduría Nacional del Estado Civil` |
| Todos | Mutación | Stryker | `npm run test:mutacion` | >= 85 % en archivos mutados (pendiente si no cabe en la sesión) |
| Todos | Licencias y privacidad | scripts del repo | `npm run check:licencias`, `npm run check:privacidad` | 0 hallazgos |
