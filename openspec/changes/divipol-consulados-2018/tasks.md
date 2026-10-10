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

- [x] 5.1 `revisor-licencias` sobre la fuente CC BY-SA y su llegada a la PWA y la CLI. Revisado 2026-10-10: licencia CC BY-SA 4.0 confirmada en la metadata de datos.gov.co (vh8b-jfhg, autor Registraduría); atribución, cambios, sin garantías y sin aval presentes en `LICENSES.md`, `THIRD_PARTY_NOTICES.md`, la pantalla de licencias de la PWA, `THIRD_PARTY_LICENSES.txt` del paquete web y `--licencias`/`fuentes` de la CLI; compartir igual limitado a los datos (punto de entrada separado, código MIT fuera del alcance). Observación menor: el título oficial del conjunto en datos.gov.co es "Dipole Exterior Presidente 2018" (los avisos dicen "Divipole"); alinear el título en un cambio posterior.
- [x] 5.2 Mutación de `divipol-lib.mjs` y `src/divipol-2018/index.ts` (`npm run test:mutacion`, >= 85 %).
- [ ] 5.3 `npm run check` en verde.

## 6. Condiciones del revisor de licencias (C4 a C6) y servidor

- [x] 6.1 CLI `--licencias` y campo `fuentes` (DC-10). Pruebas: integración (proceso hijo). Verificación: `npx vitest run tools/test/leer-foto-licencias.test.mjs tools/test/leer-foto.test.mjs`.
- [x] 6.2 DV-17 sobre fuente y compilado (DC-11). Pruebas: integridad. Verificación: `npx vitest run packages/parsers/test/divipol-2018.test.ts`.
- [x] 6.3 Puerta de avisos CC BY-SA en `tools/licencia-check.mjs` (DC-12, DC-15, DC-16). Pruebas: unitaria (cada regla con su caso negativo) e integración (`npm run check:licencias`). Verificación: `npx vitest run tools/test/licencia-check.test.mjs`.
- [x] 6.4 Avisos completos en `THIRD_PARTY_NOTICES.md` y `LICENSES.md` (DC-13). Pruebas: integridad. Verificación: `npx vitest run tools/test/avisos-cc-by-sa.test.mjs`.
- [x] 6.5 Nombre vigente del lugar en el servidor y aviso en la imagen (DC-14, DC-17, DC-18). Pruebas: integración en Docker. Verificación: `docker compose -f server/compose.yaml run --rm pruebas`.
