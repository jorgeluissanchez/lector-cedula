## 1. Otsu exacto con empate al umbral más bajo

- [x] 1.1 Pruebas en rojo de LMI-01b: caso fijo `[245, 109, 146, 217, 13]` -> `109` y propiedad contra un oráculo exacto con BigInt (1000 casos). Tipos: unitaria de regresión y propiedad. Verificación: `npx vitest run packages/capture/test/mrz/localizar.test.ts --maxWorkers=1`.
- [x] 1.2 Implementar `umbralOtsu` con aritmética entera exacta (BigInt, comparación en cruz, `>` estricto). Tipos: unitaria, propiedad y regresión de las pruebas MRZ de captura por archivo. Verificación: `npx vitest run packages/capture/test/mrz/localizar.test.ts --maxWorkers=1` (una vez con la propiedad a 10 000 casos) y el resto de `packages/capture/test/mrz/*.test.ts` por archivo.
