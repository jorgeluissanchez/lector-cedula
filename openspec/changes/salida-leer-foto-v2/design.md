# Design: salida-leer-foto-v2

## Decisiones

1. Una sola función de máscara numérica (2 últimos caracteres, el resto `*`) para `numeroDocumento`, `nuip` y `serial`.
2. `lugarNacimiento` se calcula en la CLI (no en el parser) concatenando `codigoDepartamentoNacimiento + codigoMunicipioNacimiento` y llamando a `buscarDivipol`; solo para PDF417 (en MRZ el código de lugar es ambiguo, M03).
3. Si cualquiera de los códigos es `null` o `buscarDivipol` devuelve `encontrado: false`, `lugarNacimiento` es `null` y se añade `lugar-nacimiento-no-resuelto` a `resultado.warnings`.

## Pruebas

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| LPI-06 | Integración de CLI (proceso hijo) | Vitest + `child_process` | `npx vitest run tools/test/leer-foto.test.mjs` | escenarios de máscara verdes con literales |
| LPI-08 | Integración de CLI (proceso hijo) | Vitest + `child_process` | `npx vitest run tools/test/leer-foto.test.mjs` | escenarios de lugar verdes con literales |
| LPI-06, LPI-08 | Repositorio (privacidad, licencias, evals) | `npm run check` | `npm run check` | verde |
