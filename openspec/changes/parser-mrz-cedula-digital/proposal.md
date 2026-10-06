# Proposal

## Why

La cédula digital colombiana (desde diciembre de 2020) no tiene PDF417: su único código legible por máquina descifrable es la MRZ TD1 del reverso, y el principio V la hace fuente preferida frente al OCR. Hoy `packages/parsers` no puede leerla, y es la tarea 2 de la Fase 1 de `PLAN.md` (meta: 98 % de campos MRZ con checksum válido). Las líneas llegan de un OCR, con confusiones OCR-B típicas, y el mapeo colombiano (serial, NUIP en el opcional, DIVIPOL de expedición) es ingeniería inversa sin especificación oficial (hipótesis M01 a M04).

## What Changes

- Nueva función pura en `packages/parsers` que recibe las 3 líneas de la MRZ TD1 (texto posiblemente con errores de OCR) y una fecha de referencia, y devuelve:
  - rechazo estructural con motivo enumerado (no son 3 líneas de 30 caracteres del alfabeto MRZ, o no es una cédula `IC` de `COL`); o
  - campos normalizados (serial, DIVIPOL de expedición, fechas ISO, sexo, nacionalidad, NUIP, apellidos, nombres), el estado de los 4 dígitos de control ICAO 9303 (serial, nacimiento, vencimiento, compuesto), las correcciones OCR aplicadas, los errores de campo, los IDs de hipótesis aplicadas y un indicador global `valido`.
- Correcciones OCR-B (O y Q a 0, I a 1, Z a 2, S a 5, G a 6, B a 8) solo en zonas numéricas; la única corrección alfabética es `C0L` a `COL` en los campos de país, cuyo único valor admitido es `COL`.
- NUIP del opcional de la línea 2 validado con `validarFormatoNuip` (capacidad `formato-nuip`, sin cambiarla).
- Regla de siglo explícita para fechas YYMMDD: nacimiento en 19YY o 20YY según la fecha de referencia que pasa quien llama; vencimiento siempre 20YY.
- Exportación pública del cálculo del dígito de control ICAO 9303.
- Evaluador `mrz-cedula-digital` registrado en `evals/runners/registro.mjs` y fixtures sintéticos en `evals/fixtures/sinteticos/mrz-cedula-digital/`.
- `mrz` 5.0.2 (cheminfo, MIT) entra solo como `devDependency` y oráculo diferencial de las pruebas; el producto no depende de ella (ver `design.md`, decisión 1).

Fuera de alcance: decodificar el QR de la cédula digital (principio V: está cifrado), leer el chip NFC, el RH (la MRZ no lo trae), extraer las líneas de una imagen (OCR, Fase 2 y 3), traducir el código DIVIPOL a nombre de municipio (cambio `divipol-registraduria`), decidir si el documento está vencido o si la persona es mayor de edad (validadores de la Fase 1), la MRZ de la cédula de extranjería y la tarjeta de identidad digital.

## Capabilities

### New Capabilities

- `mrz-cedula-digital`: lectura determinista de la MRZ TD1 de la cédula digital colombiana a partir de texto, con validación de los dígitos de control ICAO 9303, corrección OCR-B en zonas numéricas y mapeo de los campos colombianos como hipótesis declaradas.

### Modified Capabilities

(ninguna; `formato-nuip` se reutiliza sin cambiar sus requisitos)

## Impact

- Código: `packages/parsers/src/` (módulo nuevo y exports públicos en `index.ts`), `packages/parsers/test/` (unitarias, propiedades, fuzz, diferencial).
- Dependencias: `mrz@5.0.2` como `devDependency` del paquete raíz (licencia MIT, `node tools/licencia-check.mjs --package mrz` -> OK el 2026-10-06; sin dependencias transitivas de producción). La instala el implementador.
- Dependencia de planificación: el generador sintético de MRZ TD1 del cambio paralelo `generador-fixtures-sinteticos` (interfaz esperada en `design.md`, decisión 11).
- Evals: `evals/runners/registro.mjs`, `evals/fixtures/sinteticos/mrz-cedula-digital/*.json`. Aparecen campos nuevos en `evals/reports/latest.json`; el baseline lo fija el orquestador.
- Mutación: el módulo nuevo queda bajo `mutate` de `stryker.config.mjs` (ya cubre `packages/parsers/src/**/*.ts`).
- Documentación: propuestas de actualización de M01 a M04 en `design.md` para que un humano las aplique a `docs/decisiones/hipotesis-formato.md`. Sin datos reales (principio III).
