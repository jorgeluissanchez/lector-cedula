# Tasks

Todas las tareas siguen TDD (principio II): primero la prueba en rojo, luego la implementación. Datos sintéticos únicamente (skill `fixture-sintetico`).

## 1. Validador para cédula de ciudadanía

- [x] 1.1 Escribir `packages/parsers/test/nuip-formato.test.ts` con un caso por escenario de NF-01 a NF-08 (valores exactos de la spec, `toStrictEqual`) y las propiedades de NF-02 con `fast-check` (no lanza en `fc.string()` ni en `fc.string({ unit: "binary" })`, determinismo, idempotencia); verlas fallar; implementar `validarFormatoNuip` en `packages/parsers/src/nuip-formato.ts` con los tipos de design.md (decisión 1) y exportarlos desde `packages/parsers/src/index.ts`. Cubre NF-01, NF-02, NF-03, NF-04, NF-05, NF-06, NF-07, NF-08. Verificación: `npm test` en verde y `npm run check` en verde.

## 2. Tarjeta de identidad

- [x] 2.1 Añadir a `packages/parsers/test/nuip-formato.test.ts` los seis escenarios de NF-09 (incluidos `tipoProbable: "ti-antigua"` con `warnings: ["N01"]` para 11 dígitos y el patrón NIT rechazado), verlos fallar e implementar la opción `tipoDocumento: "ti"`. Comprobar que la fila `N01` existe en `docs/decisiones/hipotesis-formato.md` con estado pendiente. Cubre NF-09. Verificación: `npm test` en verde y `npm run check` en verde.

## 3. Evals por campo

- [x] 3.1 Registrar `"nuip-formato": { modulo: "packages/parsers/dist/index.js", exportar: "validarFormatoNuip" }` en `evals/runners/registro.mjs` y crear en `evals/fixtures/sinteticos/nuip-formato/` un JSON por caso, cada uno con `"sintetico": true`, `"tipo": "nuip-formato"`, `"descripcion"`, `"entrada"`, `"esperado"` (válidos: `valido`, `numero`, `tipoProbable`, `digitos`, `warnings`; inválidos: `valido`, `motivo`) y, solo en los de TI, `"opciones": { "tipoDocumento": "ti" }`. Requiere que el orquestador haya ampliado antes el corredor para pasar `opciones`. Casos mínimos de CC: `puntos-de-miles` (`"9.999.123.456"`), `ceros-izquierda` (`"0009999123456"`), `espacios-y-salto` (`"  9999123456\n"`), `estilo-nit-guion` (`"999.912.345-6"`, motivo `posible-digito-verificacion`), `guion-agrupacion` (`"9999-123-456"`), `cedula-antigua-9` (`"999.912.345"`), `cedula-antigua-5` (`"99991"`), `diez-con-cero-inicial` (`"0999912345"`), `vacio` (`""`), `solo-separadores` (`" .-. "`), `letra-i` (`"9999I23456"`), `coma` (`"9,999,123,456"`), `cuatro-digitos` (`"9999"`), `once-digitos-cc` (`"99991234567"`), `solo-ceros` (`"0.000.000"`). Casos de TI: `ti-10` (`"9999123456"`, `nuip`), `ti-11` (`"99991234567"`, `ti-antigua`, `warnings` `["N01"]`), `ti-corta` (`"999912345"`, `longitud-invalida`). Valores esperados exactos de la spec. Cubre NF-03 a NF-09 por eval. Verificación: `npm run eval:quick` reporta `nuip-formato` con `exact_match` 100.0 % y CER 0.00 % en todos sus campos, 0 excepciones, y `npm run check` en verde.

## Workflow follow-up

- Paso del orquestador (no del implementador), antes de la tarea 3.1: ampliar `evals/runners/eval-campo.mjs` para llamar `fn(entrada, opciones)` cuando el fixture traiga `opciones`.
- Paso del orquestador (no del implementador), después de verificar la tarea 3.1: fijar el baseline con `node evals/runners/eval-campo.mjs --guardar-baseline` (skill `eval-campo`).
- Cerrar con un subagente `verificador` distinto del implementador y luego `/opsx:verify` y `/opsx:archive`.
