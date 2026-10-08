# Design

## Contexto

Decisiones del usuario del 2026-10-07 (chat con el orquestador): opción B (módulo aparte CC BY-SA, principal MIT puro), corregir erratas declarándolas como cambios, el módulo 2018 devuelve el nombre vigente sin campo alias en el principal, Belice e Irlanda con ambos códigos en el módulo 2018, avisos en `tools/divipol/fuentes/LICENSES.md` y `packages/parsers/THIRD_PARTY_NOTICES.md`.

## Decisiones

1. **Extracto mínimo como instantánea.** La URL del manifiesto es una consulta SoQL agrupada que solo devuelve `dd`, `mm` y `municipio` (69 filas). Se comprobó que dos descargas con curl y una con `fetch` de Node dan el mismo SHA-256. `--descargar` la refresca como las demás fuentes.
2. **Generador independiente de Eitol para el módulo 2018.** `parsearConsulados2018` valida la estructura y `construirConsulados2018` aplica las correcciones literales y los alternos literales (`88195` a la fila de `88415`, `88480` a la de `88470`). El contraste con la tabla principal (11 nuevos, 4 renombres, 54 iguales) es oráculo de las pruebas de integridad, no del generador; así las fuentes sintéticas de las pruebas de la CLI siguen siendo válidas.
3. **Renombres literales.** `RENOMBRADOS_2018` es una lista literal en `divipol-lib.mjs` serializada al módulo; la prueba de integridad la compara con la diferencia real.
4. **Nombres sin tildes**, como el resto de la tabla (convención de Eitol y de la fuente): `AZERBAIYAN`, no `AZERBAIYÁN`.
5. **Consumidor.** `lugar.ts` importa `buscarConsulado2018` y `RENOMBRADOS_2018` del punto de entrada `@lector-cedula/parsers/divipol-2018`. El servidor (`server/interprete`) no usa `conLugarNacimiento` y no se toca.
6. **Licencias.** El paquete ya declara `MIT AND CC-BY-SA-4.0`. La PWA y la CLI que empaquetan `capture` reciben datos CC BY-SA: requiere atribución visible en esas distribuciones (pendiente de `revisor-licencias`).

## Pruebas

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| DC-01 | Integridad (exports, grafo de importaciones, tabla principal intacta, metadatos) | Vitest | `npx vitest run packages/parsers` | 100 % escenarios |
| DC-02, DC-03, DC-04 | Unitaria con literales | Vitest | `npx vitest run packages/parsers` | 100 % escenarios |
| DC-05 | Propiedad, fuzz, exhaustiva | Vitest + fast-check | `npx vitest run packages/parsers` | numRuns >= 1000, 0 excepciones, 71 encontrados |
| DC-06, DC-09 | Unitaria del parser y correcciones; integridad de checksum | Vitest | `npx vitest run tools/test/divipol-lib.test.mjs` | 100 % escenarios |
| DC-06, DC-07 | Integración de la CLI (`spawnSync`) | Vitest | `npx vitest run tools/test/divipol-cli.test.mjs` | código 0/1 y archivos según escenario |
| DC-07 | Integridad contra la tabla principal | Vitest | `npx vitest run packages/parsers` y `npm run divipol:verificar` | conteos literales; código 0 |
| DC-08 | Unitaria | Vitest | `npx vitest run packages/capture/test/lectura` | 100 % escenarios |
| Todos | Mutación | Stryker | `npm run test:mutacion` | >= 85 % en archivos mutados (pendiente si no cabe en la sesión) |
| Todos | Licencias y privacidad | scripts del repo | `npm run check:licencias`, `npm run check:privacidad` | 0 hallazgos |
