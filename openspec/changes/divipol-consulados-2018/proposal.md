# Proposal

## Why

La tabla DIVIPOL principal (Eitol, MIT) está congelada en 2011: no conoce 11 consulados que la Registraduría ya usaba en 2018 (Ghana, Argelia, Azerbaiyán, Emiratos Árabes Unidos, Belice 88415, Irlanda 88470, Luxemburgo, Nueva Zelandia, Singapur, Vietnam, Tailandia) y muestra nombres viejos en cuatro (Antillas Holandesas, Aruba, Filipinas, Holanda). Una cédula expedida en esos consulados sale hoy con `lugarNacimiento: null` o con el nombre histórico. Evidencia en `docs/decisiones/fuentes-divipol-oficiales.md`. Decisión del usuario del 2026-10-07: incorporar los consulados de 2018 (opción B: módulo aparte bajo CC BY-SA 4.0, la librería principal sigue MIT pura).

## What Changes

- Nueva fuente verificada `registraduria-consulados-2018`: extracto mínimo (`dd`, `mm`, `municipio`, agrupado) del conjunto `vh8b-jfhg` de datos.gov.co (Registraduría, CC BY-SA 4.0), con URL exacta de la consulta y SHA-256 en `tools/divipol/fuentes.json`.
- El generador `tools/divipol` produce `packages/parsers/src/divipol-2018/consulados.generated.ts` con los 69 consulados de 2018 (3 erratas corregidas y declaradas como cambios) más los códigos alternos de Belice (88195) e Irlanda (88480).
- Nuevo punto de entrada `@lector-cedula/parsers/divipol-2018` con `buscarConsulado2018`, `RENOMBRADOS_2018` y `DIVIPOL_2018_METADATOS`. El punto de entrada principal no lo importa (DV-17 y la decisión 6 de `divipol-registraduria` se mantienen) y `tabla.generated.ts` no cambia.
- `conLugarNacimiento` (`packages/capture/src/lectura/lugar.ts`, usada por la PWA y la CLI `tools/leer-foto.mjs`) consulta el módulo 2018 cuando el principal devuelve no encontrado o para los 4 renombres.

## Capabilities

### New Capabilities

- `divipol-consulados-2018`: consulados DIVIPOL de 2018 de la Registraduría en un punto de entrada CC BY-SA separado y su uso en el lugar de nacimiento.

### Modified Capabilities

Ninguna. `divipol` (cambio `divipol-registraduria`) no cambia: misma tabla, mismos conteos, mismo DV-17.

## Impact

- `tools/divipol/` (lib, CLI, manifiesto, instantánea y LICENSES.md), `packages/parsers` (nuevo submódulo, `exports`, THIRD_PARTY_NOTICES.md), `packages/capture/src/lectura/lugar.ts`.
- Licencias: la PWA y la CLI pasan a incluir datos CC BY-SA 4.0 de la Registraduría (atribución requerida). Revisión de `revisor-licencias` pendiente.
- Privacidad: el extracto solo tiene códigos y nombres de país; sin datos personales.
