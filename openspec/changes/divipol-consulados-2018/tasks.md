# Tasks

## 1. Fuente

- [x] 1.1 Descargar el extracto `consulados-2018.csv`, registrarlo en `tools/divipol/fuentes.json` con URL exacta, SHA-256 y licencia, y en `tools/divipol/fuentes/LICENSES.md` y `packages/parsers/THIRD_PARTY_NOTICES.md`. Cubre DC-06. Pruebas: integridad (checksum y cabecera). Verificación: `npx vitest run tools/test/divipol-lib.test.mjs`, `npm run check:licencias`, `npm run check:privacidad`.

## 2. Generador

- [x] 2.1 `parsearConsulados2018`, `construirConsulados2018` y `serializarConsulados2018` en `tools/divipol/divipol-lib.mjs`; la CLI genera y verifica `divipol-2018/consulados.generated.ts`. Cubre DC-06, DC-07, DC-09. Pruebas: unitaria (cabecera, 68 filas, corrección que no aplica, alternos) e integración (deriva detectada). Verificación: `npx vitest run tools/test/divipol*` y `npm run divipol:verificar`.

## 3. Punto de entrada

- [x] 3.1 `packages/parsers/src/divipol-2018/index.ts` con `buscarConsulado2018`, `RENOMBRADOS_2018`, `DIVIPOL_2018_METADATOS`; `exports` en `package.json`; pruebas de DC-01 a DC-05 y DC-07. Pruebas: unitaria, propiedad, fuzz, exhaustiva, integridad. Verificación: `npx vitest run packages/parsers`.

## 4. Consumidor

- [x] 4.1 `conLugarNacimiento` consulta el módulo 2018 (DC-08). Pruebas: unitaria. Verificación: `npx vitest run packages/capture/test/lectura`.

## 5. Revisión

- [ ] 5.1 `revisor-licencias` sobre la fuente CC BY-SA y su llegada a la PWA y la CLI.
- [x] 5.2 Mutación de `divipol-lib.mjs` y `src/divipol-2018/index.ts` (`npm run test:mutacion`, >= 85 %).
- [ ] 5.3 `npm run check` en verde.
