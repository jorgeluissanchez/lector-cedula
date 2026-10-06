# Proposal

## Why

La fuente preferida de la cédula amarilla es su PDF417 (principio V), pero `packages/parsers` todavía no lo lee. Todos los repositorios públicos que lo intentan arrastran los mismos errores: cortan el RH `AB+` a `B+`, deducen el sexo con `contains("M")`, borran el `-` del RH, fallan con la Ñ, invierten los apellidos y fallan con la trama de Windows. La Fase 1 de `PLAN.md` (tarea 1, `pdf417-co`) pide un parser híbrido, determinista y puro que evite todo eso, descarte la biometría (principio III) y declare cada hipótesis de formato que aplique (principio VI).

## What Changes

- Nueva función pura en `packages/parsers` que recibe los bytes crudos (ISO-8859-1) del PDF417 de la cédula amarilla y devuelve un resultado discriminado: éxito con el esquema normalizado del PLAN (`version`, `fuente`, `trama`, `campos`, `confianza`, `validaciones`, `warnings`) o error con un motivo enumerado. Nunca lanza.
- Parser híbrido: offsets fijos (hipótesis H04 y H05) cuando la trama es completa; patrones al estilo fgardila (normalizador 1:1 que conserva las letras Latin-1, fronteras de 2 o más separadores, NUIP por H03) como respaldo y para las tramas truncada (Windows) y sin `PubDSK`. En la trama completa corren ambos modos y su coincidencia fija la confianza.
- Bloques demográficos "sexo primero" (H05) y "fecha primero" (H08). RH con las ocho combinaciones, incluidas `AB+`, `AB-` y los negativos.
- DIVIPOL solo como códigos: departamento (2) y municipio (3). La existencia del código se consulta, si el llamador lo inyecta, con un resolutor cuya interfaz define este cambio; la tabla la entrega el cambio paralelo `divipol-registraduria`.
- Número de documento validado y normalizado con `validarFormatoNuip` (capacidad `formato-nuip`), sin duplicar reglas.
- Descarte obligatorio del código AFIS, de la tarjeta decadactilar, del campo de 6 dígitos que sigue al marcador y de todo byte posterior al RH: el resultado no depende de ellos ni los contiene.
- `warnings[]` con los IDs de las hipótesis pendientes aplicadas en cada camino. Dos hipótesis nuevas propuestas (H12 y H13) quedan en `design.md` para que el orquestador las registre.
- Registro del evaluador `pdf417-amarilla` en `evals/runners/registro.mjs`, adaptador de entrada hexadecimal y fixtures sintéticos en `evals/fixtures/sinteticos/pdf417-amarilla/`.

Fuera de alcance: decodificar la imagen del PDF417 (Fase 2), tarjeta de identidad (H10, Fase 6), nombres de departamento y municipio (cambio `divipol-registraduria`), validadores de negocio como edad mínima (tarea `validadores` del PLAN), JSON Schema publicado del esquema de salida (tarea `salida-json` del PLAN), generar payloads o imágenes (cambio `generador-fixtures-sinteticos`) y editar `docs/decisiones/hipotesis-formato.md`.

## Capabilities

### New Capabilities

- `pdf417-cedula-amarilla`: interpretación determinista de los bytes crudos del PDF417 de la cédula de ciudadanía amarilla en campos normalizados, con descarte de biometría, confianza por campo, validaciones y hipótesis aplicadas.

### Modified Capabilities

(ninguna: `formato-nuip` se reutiliza sin cambiar sus requisitos; `evals-por-campo` no cambia, el adaptador de entrada se registra con el mecanismo existente de `registro.mjs`)

## Impact

- Código: `packages/parsers/src/pdf417-amarilla/` (módulos nuevos) y export público en `packages/parsers/src/index.ts`; pruebas en `packages/parsers/test/pdf417-amarilla*.test.ts`.
- Dependencias entre cambios: consume la interfaz del generador del cambio `generador-fixtures-sinteticos` (solo en pruebas de propiedad y fixtures) y expone la interfaz de resolutor DIVIPOL que implementará `divipol-registraduria`. Ninguna dependencia npm nueva.
- Evals: `evals/runners/registro.mjs`, adaptador nuevo en `evals/runners/adaptadores/`, fixtures en `evals/fixtures/sinteticos/pdf417-amarilla/`. Aparece el tipo `pdf417-amarilla` en `evals/reports/latest.json`; el orquestador fija el baseline tras verificar.
- Harness: `stryker.config.mjs` (añadir el adaptador de evals a `mutate`).
- Privacidad: el código de producto no puede contener el literal del marcador (regla de `privacidad-check`); se construye desde bytes.
