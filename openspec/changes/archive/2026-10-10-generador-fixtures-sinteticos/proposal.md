# Proposal

## Why

Los parsers de la Fase 1 (`parser-pdf417-amarilla` y `parser-mrz-cedula-digital`, redactados en paralelo) necesitan entradas para sus pruebas unitarias, de propiedad, de mutación y para las evals. No existe ningún dataset público de cédulas colombianas, el principio III prohíbe datos reales en el repositorio y el principio VI obliga a tratar cada offset como hipótesis. Hace falta un único generador sintético, determinista y con una interfaz estable que codifique las hipótesis del formato de forma explícita, para que los dos parsers se prueben contra la misma verdad y para que, cuando una hipótesis se confirme o se refute, baste con cambiar un solo lugar.

## What Changes

- Nuevo paquete de pruebas privado `@lector-cedula/fixtures` en `packages/fixtures/` (`"private": true`, nunca dependencia de producción, nunca publicado).
- Persona ficticia validada: NUIP con prefijo `9999` (5 a 10 dígitos), serial de la digital con prefijo `9999`, nombres en mayúsculas ISO-8859-1. Cualquier entrada fuera del rango sintético se rechaza con `ErrorFixture`; el generador no puede emitir un número fuera del rango.
- Generador del payload binario PDF417 de la cédula amarilla con cuatro variantes estructurales (trama completa con NUL, trama Windows truncada, sin `PubDSK`, bloque fecha-primero) y casos de persona (segundo nombre ausente, apellido compuesto, Ñ en 0xD1, RH `AB-`, `AB+`, `O-`, sexo F con M en el apellido, NUIP corto rellenado con ceros). La cola biométrica es aleatoria y deliberadamente no realista. Cada fixture declara los rangos de bytes de cada campo y los IDs de hipótesis que asume.
- Generador de las 3 líneas MRZ TD1 de la cédula digital con los 4 dígitos de control ICAO 9303 correctos, variantes con cada dígito de control alterado (uno a la vez), con el dígito del documento como `<` (M01) y con errores OCR-B inyectados solo en zonas numéricas.
- Catálogo fijo de casos con nombre (`casosPdf417()`, `casosMrz()`) y arbitrarios de `fast-check` (`arbPersonaFicticia`, `arbFixturePdf417`, `arbFixtureMrz`), válidos por construcción y con proporciones mínimas medidas.
- PRNG propio (mulberry32) con semilla: misma persona, opciones y semilla producen bytes idénticos.
- Nuevas hipótesis `G01` a `G05` en `docs/decisiones/hipotesis-formato.md`: los refinamientos concretos que el generador necesita y que H01 a H11 y M01 a M04 no fijan (offsets exactos, alcance del truncado de Windows, dirección del desplazamiento sin `PubDSK`, orden del bloque fecha-primero, composición de la línea 3 de la MRZ).
- Configuración de pruebas: alias de Vitest para importar el paquete desde su fuente, referencia en `tsconfig.json` y archivos del paquete en `mutate` de Stryker.
- Dependencia de prueba `mrz@5.0.2` (MIT, verificada con `licencia-check`, no instalada aún) como oráculo diferencial de los dígitos de control.

Fuera de alcance (tarea posterior, otro cambio): imágenes PDF417 con el writer de `zxing-wasm` (MIT, 3.1.5, verificada con `node tools/licencia-check.mjs --package zxing-wasm`) y sus distorsiones; truncamiento ICAO de nombres largos en la MRZ; tildes en los nombres; tarjeta de identidad (H10, N01); generación de archivos de eval en `evals/fixtures/` (la hacen los cambios de los parsers con este paquete).

## Capabilities

### New Capabilities

- `fixtures-sinteticos`: generación determinista de payloads PDF417 de la cédula amarilla y líneas MRZ TD1 de la cédula digital a partir de personas ficticias, con variantes que declaran las hipótesis del formato que asumen, catálogo de casos y arbitrarios de `fast-check`, para uso exclusivo en pruebas y evals.

### Modified Capabilities

(ninguna; `formato-nuip` y `evals-por-campo` no cambian de requisitos)

## Impact

- Código nuevo: `packages/fixtures/` (fuente, pruebas, `package.json`, `tsconfig.json`).
- Configuración compartida: `vitest.config.ts` (alias), `tsconfig.json` (referencia), `stryker.config.mjs` (`mutate`). Los cambios paralelos de los parsers tocan los mismos archivos: ver design.md, decisión 10.
- Documentación: `docs/decisiones/hipotesis-formato.md` (sección del generador con `G01` a `G05`).
- Dependencias: `mrz@5.0.2` como `devDependency` de la raíz (MIT). `fast-check` ya está instalado. Ninguna dependencia de producción.
- Consumidores: `parser-pdf417-amarilla` y `parser-mrz-cedula-digital` importan `@lector-cedula/fixtures` solo desde sus pruebas. La interfaz pública (FX-02) es el contrato entre los tres cambios.
- Privacidad: el paquete contiene el literal `PubDSK_1` en una única línea marcada con `privacidad-ok:`; ningún dato real.
