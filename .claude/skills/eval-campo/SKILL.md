---
name: eval-campo
description: Cómo correr, interpretar y extender las evals por campo (exact match y CER) y su baseline. Cárgala al registrar un parser nuevo, al verificar una entrega o cuando el hook de Stop reporte regresión.
---

# Evals por campo

## Comandos

```
npm run eval:quick                                  # fixtures sintéticos, lo usa el hook de Stop
npm run eval                                        # todos los fixtures
node evals/runners/eval-campo.mjs --guardar-baseline  # fija el baseline (solo con aprobación); registra el modo
node evals/runners/eval-campo.mjs --quick --fixtures <dir> --reportes <dir>  # corre aislado (EV-04)
```

Salida: `evals/reports/latest.json` y una tabla por tipo y campo. Código 1 si hay regresión frente a `evals/reports/baseline.json`, si algún caso lanza excepción o si algún fixture tiene un `esperado` ausente, `null`, array o que no es objeto (EV-05, antes de evaluar nada).

- `--fixtures <dir>`: lee fixtures solo de ese directorio y sus subdirectorios. Si no existe, código 1 con la ruta.
- `--reportes <dir>`: lee `baseline.json` y escribe `latest.json` (y el baseline con `--guardar-baseline`) solo ahí. Úsalo en pruebas para no tocar `evals/reports/` (ver `tools/test/eval-campo.test.mjs`).
- Las rutas se resuelven desde el directorio de trabajo.

## Registrar un parser

1. Exporta una función pura desde el paquete (por ejemplo `parsePdf417` en `packages/parsers/src/index.ts`).
2. Añade en `evals/runners/registro.mjs`:
   ```js
   export const EVALUADORES = {
     "pdf417-co": { modulo: "packages/parsers/dist/index.js", exportar: "parsePdf417", adaptar: (r) => r.campos },
   };
   ```
3. Crea fixtures en `evals/fixtures/sinteticos/pdf417-co/` (ver skill `fixture-sintetico`).
4. Corre `npm run eval`; si el resultado es una mejora aprobada, actualiza el baseline.

## Cómo leer las métricas

- `exact_match`: fracción de casos con el valor idéntico. Meta de producto: 95 % o más en amarilla y digital.
- `cer`: ediciones por carácter de referencia. Meta: 2 % o menos por campo.
- Un campo que desaparece del reporte cuenta como regresión.
- Una caída de `n` de un campo frente al baseline cuenta como regresión (EV-03: se perdieron fixtures). Un `n` igual o mayor no lo es. Solo se compara si el baseline se guardó en el mismo modo (`quick` o `completo`) o si no registra modo (baselines anteriores, o `"modo": null`).
- `__claves` aparece solo para fixtures con `"clavesExactas": true` (el booleano; `"true"` o `1` no cuentan).

## Nunca

- Bajar el baseline para que una regresión pase.
- Evaluar datos reales dentro del repositorio: el set de campo se evalúa fuera, cifrado.
