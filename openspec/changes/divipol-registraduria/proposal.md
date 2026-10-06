# Proposal

## Why

El bloque demográfico del PDF417 de la cédula amarilla trae un código de lugar de 5 dígitos (departamento 2 + municipio 3) y la MRZ de la digital podría traer otro en el opcional de la línea 1 (hipótesis M03). Ese código es DIVIPOL de la Registraduría, no DIVIPOLA del DANE: Antioquia es 01 (no 05), Valle 31 (no 76), Bogotá 16 (no 11) y 88 son consulados (en DIVIPOLA, 88 es San Andrés). Sin una tabla trazable, los parsers de la Fase 1 (`parser-pdf417-amarilla`, `parser-mrz-cedula-digital`) y el validador "DIVIPOL existente" no pueden traducir el código ni detectar uno inexistente, y una tabla copiada a mano no cumple los principios II, IV y VI.

## What Changes

- Script de Node reproducible (`tools/divipol/`) que descarga fuentes fijadas por commit o por checksum SHA-256, las verifica y genera la tabla DIVIPOL como módulo TypeScript versionado. Sin Python (bloqueado en esta máquina).
- Fuente primaria de la tabla: `localities.py` de Eitol/colombian-cedula-reader (MIT, 1.190 filas: 1.123 nacionales, incluida la duplicada 15/001 de Bogotá, y 67 consulados). `DIVIPOL.TXT` oficial (copia en un repositorio sin licencia) solo se usa como contraste local, sin redistribuirse. Decisión y licencias en `design.md`.
- Función pura y total `buscarDivipol(codigo)` en `packages/parsers` que devuelve `{ codigo, codigoDepartamento, codigoMunicipio, departamento, municipio, tipo, warnings }` o un resultado `encontrado: false` con motivo (`formato-invalido`, `sin-dato`, `desconocido`).
- Equivalencia DIVIPOL -> DIVIPOLA (DANE, CC BY-SA 4.0) construida por join de nombres normalizados, más una tabla manual revisable, publicada en un punto de entrada separado (`@lector-cedula/parsers/divipola`) para aislar el share-alike del resto del paquete MIT.
- Nuevas hipótesis D01 a D05 en `docs/decisiones/hipotesis-formato.md` y registro de la decisión de fuentes en `docs/decisiones/2026-10-06-fuente-divipol.md`.

## Capabilities

### New Capabilities

- `divipol`: códigos de lugar de la Registraduría (DIVIPOL): tabla generada y trazable a su fuente, búsqueda pura por código de 5 dígitos, equivalencia con DIVIPOLA del DANE y el generador reproducible que los produce.

### Modified Capabilities

Ninguna. `formato-nuip` y `evals-por-campo` no cambian.

## Impact

- Código nuevo: `packages/parsers/src/divipol/` (búsqueda y tabla generada), `packages/parsers/src/divipola/` (equivalencia generada), `tools/divipol/` (generador, manifiesto de fuentes, instantáneas de fuentes, equivalencias manuales), `tools/test/divipol-*.test.mjs`.
- `packages/parsers/package.json`: nuevo `exports["./divipola"]`, `files` con `THIRD_PARTY_NOTICES.md`, campo `license` `MIT AND CC-BY-SA-4.0`.
- `packages/parsers/src/index.ts`: exporta `buscarDivipol`, sus tipos y `DIVIPOL_METADATOS`.
- `stryker.config.mjs`: muta la búsqueda y la librería del generador, excluye `*.generated.ts`. `vitest.stryker.config.ts`: excluye la prueba de integración del generador.
- `.gitattributes`: instantáneas de fuentes como binarias (`-text`) para que el checksum no cambie por normalización de fin de línea.
- Sin dependencias nuevas de npm. Datos nuevos: `localities.py` (MIT) y DIVIPOLA DANE (CC BY-SA 4.0), ambos declarados con atribución.
- Consumidores: `parser-pdf417-amarilla`, `parser-mrz-cedula-digital` y el futuro validador "DIVIPOL existente" (contrato en `design.md`, sección "Contrato para consumidores").
