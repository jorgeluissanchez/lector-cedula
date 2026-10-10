# Proposal: salida-leer-foto-v2

## Why

Una lectura de prueba de `npm run leer-foto` mostró que la máscara por defecto deja ver 6 de 8 dígitos de una cédula antigua (patrón 4 primeros + 2 últimos), demasiado para un número tan corto. Además la salida PDF417 solo trae `codigoDepartamentoNacimiento` y `codigoMunicipioNacimiento`, sin el nombre del lugar.

## What Changes

- Máscara: `numeroDocumento` (PDF417), `nuip` y `serial` (MRZ) conservan SOLO los 2 últimos dígitos, sea cual sea la longitud. Nombres: solo la inicial de cada palabra (sin cambio).
- Nuevo campo `resultado.campos.lugarNacimiento` en la salida PDF417, resuelto con `buscarDivipol`: `{ codigo, departamento, municipio }` o `null` con el warning `lugar-nacimiento-no-resuelto` en `resultado.warnings`. No se enmascara: un municipio no identifica a la persona.

## Capabilities

### Modified Capabilities
- `lectura-pdf417-imagen`: LPI-06 (máscara) y nuevo LPI-08 (lugar de nacimiento).

## Impact

- `tools/leer-foto.mjs`, `tools/test/leer-foto.test.mjs`. Sin dependencias nuevas.
- Depende de que `leer-pdf417-desde-imagen` y `leer-mrz-desde-imagen` estén archivados antes de archivar este cambio (LPI-06 debe existir en `openspec/specs/`).
