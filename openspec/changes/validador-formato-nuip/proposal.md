# Proposal

## Why

Todos los caminos de lectura (PDF417, MRZ, OCR, captura manual) terminan entregando un número de identificación como texto con ruido de captura (puntos de miles, espacios, guiones, ceros a la izquierda). Hoy `packages/parsers` no tiene una regla única y probada para decidir si ese texto tiene el formato de un número de cédula o de NUIP, ni para normalizarlo. Es además la prueba de humo del harness: un cambio pequeño, puro y 100 % verificable que recorre spec, prueba, eval y verificación.

## What Changes

- Nueva función pura en `packages/parsers` que recibe un texto y devuelve un resultado discriminado: válido (número normalizado, tipo probable, cantidad de dígitos, warnings) o inválido (motivo enumerado).
- Normalización determinista: elimina separadores conocidos (punto, guion, espacios en blanco) y ceros a la izquierda; rechaza cualquier otro carácter sin corregirlo.
- Reglas de longitud: NUIP de 10 dígitos; cédula antigua de 5 a 9 dígitos (rango de referencia comercial de Verifik para CC, 5 a 10).
- Sin dígito de control: la cédula no tiene checksum; el mod-11 de la DIAN (NIT) explícitamente no se aplica. Una entrada que termina en guion seguido de un solo dígito (patrón NIT, `"999.912.345-6"`) se rechaza con el motivo `posible-digito-verificacion`.
- Opción para tarjeta de identidad: acepta 10 dígitos (`nuip`) y, como hipótesis pendiente `N01` (relacionada con `H10` y `M02`), 11 dígitos con tipo probable `ti-antigua`, emitiendo el ID de la hipótesis en `warnings`.
- El corredor de evals acepta un campo opcional `opciones` en el fixture (lo modifica el orquestador).
- Registro del evaluador `nuip-formato` en `evals/runners/registro.mjs` y fixtures sintéticos en `evals/fixtures/sinteticos/nuip-formato/`.
- Nueva fila `N01` en `docs/decisiones/hipotesis-formato.md`.

Fuera de alcance: verificar que el número exista o esté vigente (consulta ANI/Registraduría), validar NIT, cédula de extranjería o pasaporte, corregir confusiones OCR (O->0, I->1) y extraer el número de un payload PDF417 o MRZ.

## Capabilities

### New Capabilities

- `formato-nuip`: validación y normalización del formato de un número de identificación colombiano (cédula de ciudadanía y, opcionalmente, tarjeta de identidad) a partir de texto con ruido de captura.

### Modified Capabilities

(ninguna; no hay specs previas en `openspec/specs/`)

## Impact

- Código: `packages/parsers/src/` (nuevo módulo y export público en `index.ts`), `packages/parsers/test/` (pruebas unitarias y de propiedad con `fast-check`).
- Evals: `evals/runners/registro.mjs`, `evals/fixtures/sinteticos/nuip-formato/*.json`. Aparecen campos nuevos en `evals/reports/latest.json`; el baseline lo fija el orquestador tras verificar la tarea de evals.
- Documentación: `docs/decisiones/hipotesis-formato.md` (fila `N01`).
- Dependencias: ninguna nueva. Sin E/S, sin datos reales (principios III y VII).
