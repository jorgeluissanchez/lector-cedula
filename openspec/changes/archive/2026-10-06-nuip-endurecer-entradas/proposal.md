# Proposal

## Why

El validador de `formato-nuip` (cambio `validador-formato-nuip`, commit 68c2ddc) cumple su spec, pero el verificador encontró entradas que la spec deja abiertas y que hoy producen resultados peligrosos o indefinidos: un dígito de verificación estilo NIT se absorbe en silencio cuando lleva espacios o un separador final (`"999.912.345- 6"`, `"999.912.345-6."`), un `tipoDocumento` desconocido cae en cédula sin avisar, una entrada que no es texto lanza excepción, cualquier espacio Unicode (BOM, U+2028, U+3000) se acepta como separador y no hay límite de longitud. Además las evals no detectan claves sobrantes en el resultado, aunque NF-01 exige claves exactas. Absorber un dígito es peor que un error visible (principio V), así que hay que cerrar estos huecos antes de que los parsers PDF417, MRZ y OCR reutilicen la función.

## What Changes

- **BREAKING** Regla NIT endurecida (NF-08): si tras el último guion solo queda un dígito rodeado únicamente de separadores, el resultado es `posible-digito-verificacion`. Entradas que hoy son válidas (`"999.912.345-6."`, `"9999123456 - 7"` con `ti`) pasan a rechazarse.
- **BREAKING** Separadores restringidos (NF-03, NF-05): solo espacio U+0020, tabulador, CR, LF, espacio duro U+00A0 y espacio estrecho sin corte U+202F como espacio en blanco; BOM, U+2028, U+2029, U+3000, U+2007 y cualquier otro espacio Unicode pasan a `caracteres-invalidos`. Las variantes de guion U+2010, U+2011, U+2013 y U+2212 se aceptan como guion.
- **BREAKING** Tres motivos nuevos en el tipo de resultado (NF-01): `entrada-no-texto`, `tipo-documento-invalido` y `entrada-demasiado-larga`, con prioridad total (NF-13): `entrada-no-texto` > `tipo-documento-invalido` > `entrada-demasiado-larga` > `caracteres-invalidos` > `posible-digito-verificacion` > `vacio` > `longitud-invalida`.
- Función total sobre cualquier valor (NF-02, NF-11): una entrada que no es string (número, `null`, `undefined`, objeto) devuelve `entrada-no-texto` y nunca lanza.
- Tipo de documento normalizado (NF-09, NF-10): se recorta y pasa a minúsculas (`"TI"` -> `"ti"`); otro valor da `tipo-documento-invalido`.
- Longitud máxima de entrada (NF-12): más de 64 unidades UTF-16 da `entrada-demasiado-larga` sin procesar el contenido.
- Escenarios nuevos que fijan `"-6"` y `"0-0"` como `posible-digito-verificacion`, `"-"` como `vacio` y la TI con ceros a la izquierda `"09999123456"`.
- Evals: el corredor compara el conjunto de claves del resultado con el de `esperado` mediante el campo especial `__claves` cuando el fixture declara `"clavesExactas": true` (EV-01).
- Pruebas de mutación: Stryker sobre `packages/parsers` con `npm run test:mutacion` y umbral de corte 85 %, fuera de `npm run check` y dentro del nuevo `npm run check:completo` y de un job de CI separado.

Fuera de alcance: cambiar el rango de longitudes de CC o TI, la hipótesis N01, la corrección de confusiones OCR y la validación de NIT, CE o pasaporte.

## Capabilities

### New Capabilities

- `evals-por-campo`: reglas de comparación del corredor de evals por campo; este cambio solo introduce la comparación exacta del conjunto de claves (EV-01).

### Modified Capabilities

- `formato-nuip`: se modifican NF-01, NF-02, NF-03, NF-05, NF-06, NF-08 y NF-09 y se añaden NF-10 (tipo de documento), NF-11 (entrada no texto) y NF-12 (longitud máxima de entrada). NF-04 y NF-07 no cambian.

## Orden de archivo

`formato-nuip` todavía no existe en `openspec/specs/`: lo crea el cambio `validador-formato-nuip`, que está implementado y verificado pero no archivado. Los deltas `MODIFIED` de este cambio se aplican sobre la spec principal, así que `openspec archive` de este cambio solo puede funcionar si `validador-formato-nuip` se archivó ANTES. Orden obligatorio: (1) `openspec archive validador-formato-nuip`, (2) implementar y verificar este cambio, (3) `openspec archive nuip-endurecer-entradas`. Los encabezados `MODIFIED` copian literalmente los de `openspec/changes/validador-formato-nuip/specs/formato-nuip/spec.md`; si alguien los edita antes de archivar, hay que actualizar este delta.

## Impact

- Código: `packages/parsers/src/nuip-formato.ts` (firma `entrada: unknown`, `opciones?: unknown`; tipo `MotivoFormatoInvalido` ampliado), `packages/parsers/test/nuip-formato.test.ts`.
- Evals: `evals/runners/metricas.mjs`, `evals/runners/eval-campo.mjs`, `tools/test/metricas.test.mjs`, fixtures en `evals/fixtures/sinteticos/nuip-formato/` (nuevos y `"clavesExactas": true` en los existentes). El baseline gana el campo `nuip-formato.__claves`; lo fija el orquestador.
- Herramientas: configuración de Stryker en la raíz, scripts `test:mutacion` y `check:completo` en `package.json` y job `mutacion` en `.github/workflows/ci.yml`. Sin dependencias nuevas: `@stryker-mutator/core` y `@stryker-mutator/vitest-runner` ya están instaladas (Apache-2.0).
- Consumidores: ninguno todavía fuera de pruebas y evals; el cambio de tipo es seguro ahora y costoso después.
- Sin E/S, sin datos reales (principios III y VII).
