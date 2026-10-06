# Design

## Context

`packages/parsers` solo exporta `VERSION` (ver `packages/parsers/src/index.ts`); no hay specs en `openspec/specs/`. Las evals (`evals/runners/eval-campo.mjs`) importan una función compilada de `dist/` registrada en `evals/runners/registro.mjs` y hoy la llaman con un único argumento, `fn(entrada)`; el orquestador la ampliará para llamar `fn(entrada, opciones)` cuando el fixture traiga `opciones`. Las métricas comparan, campo por campo, las claves de `esperado` contra el resultado; un campo ausente en el resultado cuenta como error. `evals/reports/baseline.json` está vacío (`"metricas": {}`), así que los campos nuevos no son regresión. Motivación: ver `proposal.md`. Requisitos: `specs/formato-nuip/spec.md` (NF-01 a NF-09).

## Goals / Non-Goals

**Goals:**
- Una sola función pura, sin dependencias nuevas, publicable con el paquete.
- Cada escenario de la spec traducible 1:1 a una prueba de Vitest.

**Non-Goals:**
- Extraer el número de un payload PDF417 o de la MRZ (lo harán sus parsers, que podrán reutilizar esta función).
- Corrección de confusiones OCR-B: vive solo en las zonas numéricas de la MRZ (skill `formato-cedula`, regla 7).
- Validar NIT, cédula de extranjería, pasaporte o PEP.

## Decisions

1. **API pública.** `validarFormatoNuip(entrada: string, opciones?: { tipoDocumento?: "cc" | "ti" }): ResultadoFormatoNuip`, exportada desde `packages/parsers/src/index.ts` junto con los tipos `ResultadoFormatoNuip`, `MotivoFormatoInvalido` (`"caracteres-invalidos" | "posible-digito-verificacion" | "vacio" | "longitud-invalida"`), `TipoProbable` (`"nuip" | "cedula-antigua" | "ti-antigua"`) y `TipoDocumento`. Módulo sugerido: `packages/parsers/src/nuip-formato.ts`. Alternativa descartada: devolver `null` o lanzar en caso inválido; el motivo enumerado es necesario para la UI y para las evals.
2. **`numero` como string, no `number`.** Conserva el valor exacto sin depender de la precisión numérica y sin ambigüedad con ceros. `digitos` se deriva de `numero.length`.
3. **Orden de evaluación.** (a) Si hay algún carácter fuera de `[0-9]`, `.`, `-` y `\s` -> `caracteres-invalidos`. (b) Si la entrada cumple `/-[0-9]\s*$/` -> `posible-digito-verificacion`. (c) Quitar separadores; si queda vacío -> `vacio`. (d) Quitar ceros a la izquierda. (e) Aplicar la tabla de longitudes del tipo de documento. Así `"9A"` es `caracteres-invalidos` (NF-05), `"99-6"` es `posible-digito-verificacion` (NF-08) y `"0.000.000"` es `longitud-invalida` (NF-04), no `vacio`. `vacio` y `posible-digito-verificacion` nunca coinciden (el patrón exige un dígito).
4. **Regla `>= 1.000.000.000` implícita.** Tras quitar ceros, un número de 10 dígitos siempre es mayor o igual a 1.000.000.000, por lo que la regla se implementa como "10 dígitos" y se prueba con `"0999912345"` (NF-04).
5. **Rango de cédula 5 a 10.** Se adopta la referencia comercial de Verifik (CC de 5 a 10 dígitos) como política de aceptación, no como hipótesis de ingeniería inversa del documento; por eso no emite warning. `tipoProbable` es solo "probable": un número de 10 dígitos se reporta como `nuip` aunque hipotéticamente pudiera ser una cédula antigua larga.
6. **Separadores sin posición.** Se eliminan donde aparezcan; validar la agrupación de miles rechazaría capturas OCR legítimas con espacios irregulares. Única excepción: el guion final seguido de exactamente un dígito (decisión 2 del orquestador). Coma rechazada: en Colombia el separador de miles es el punto y la coma es ambigua con el decimal.
7. **Tarjeta de identidad y N01.** Con 11 dígitos el tipo probable es `ti-antigua`, no `nuip`. La regla de 11 dígitos se registra como hipótesis pendiente `N01` en `docs/decisiones/hipotesis-formato.md` (relacionada con H10 y con M02, donde fgardila lee 11 caracteres de NUIP en la MRZ). `warnings` es un array de IDs (`["N01"]`), como pide el principio VI. Se usa el prefijo `N` porque H y M están reservados para PDF417 y MRZ.
8. **Evals con opciones.** El corredor llamará `fn(entrada, opciones)` cuando el fixture traiga `opciones` (cambio del orquestador), así que los fixtures de TI llevan `"opciones": { "tipoDocumento": "ti" }` y los de CC lo omiten. Registro: `"nuip-formato": { modulo: "packages/parsers/dist/index.js", exportar: "validarFormatoNuip" }` sin `adaptar` (el resultado ya es plano). Para fixtures válidos `esperado` lleva `valido`, `numero`, `tipoProbable`, `digitos`; para inválidos, `valido` y `motivo`.
9. **Pruebas.** Vitest con un caso por escenario en `packages/parsers/test/nuip-formato.test.ts`, y propiedades con `fast-check` (ya en devDependencies) para NF-02.

## Risks / Trade-offs

- [El rechazo del patrón NIT puede rechazar una captura legítima cuya agrupación termine en un solo dígito, p. ej. `"9999-123-45-6"`] -> Es preferible un error visible a absorber un dígito de verificación (principio V); el usuario puede recapturar sin el guion.
- [Rango 5-10 basado en un proveedor comercial, no en la Registraduría] -> Documentado como política; cambiarlo es un cambio OpenSpec posterior.
- [La regla de 11 dígitos de la TI puede ser incorrecta (las TI antiguas de 11 dígitos podrían no ser NUIP)] -> Se emite `N01` en `warnings` hasta confirmarla o refutarla.
- [El baseline vacío no protege los campos nuevos] -> Lo fija el orquestador con `--guardar-baseline` tras verificar la tarea 3 (paso del orquestador en tasks.md).

## Decisiones del orquestador (2026-10-06, pendientes de ratificación humana)

1. **Rango 5-10 para cédula de ciudadanía:** se mantiene como política de aceptación, sin warning. Fuente: Verifik, que acepta CC de 5 a 10 dígitos (referencia comercial, no fuente oficial de la Registraduría).
2. **Guion final con un solo dígito (patrón NIT):** se rechaza con el motivo nuevo `posible-digito-verificacion` (NF-01, NF-03, NF-08). Prioridad de motivos: `caracteres-invalidos` > `posible-digito-verificacion` > `vacio` > `longitud-invalida`. Los diez números `9999123450` a `9999123459` siguen siendo válidos.
3. **Coma:** se rechaza como `caracteres-invalidos` (sin cambio).
4. **TI de 11 dígitos:** `tipoProbable` `"ti-antigua"` con `warnings` `["N01"]` (NF-01, NF-09; fila N01 actualizada).
5. **Evals con opciones:** el corredor acepta un campo opcional `opciones` en el fixture y llama `fn(entrada, opciones)`; lo implementa el orquestador. La tarea 3 incluye fixtures de TI.
6. **Baseline:** lo fija el orquestador tras verificar la tarea 3; no es paso del implementador.
7. **OpenSpec** es adecuado para este cambio aunque la capacidad sea nueva.

## Migration Plan

No aplica: función nueva y aditiva. Revertir es eliminar el export y la entrada de registro.
