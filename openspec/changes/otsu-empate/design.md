## Decisión

Con `N` píxeles, suma total `S`, y para cada `t` la clase baja con `n0` píxeles y suma `S0` (clase alta: `n1 = N - n0`, `S1 = S - S0`):

`n0 * n1 * (m0 - m1)^2 = (S0 * N - S * n0)^2 / (n0 * n1)`

porque `m0 - m1 = (S0 * n1 - S1 * n0) / (n0 * n1)` y `S0 * n1 - S1 * n0 = S0 * N - S * n0`. Se guarda el mejor como par (numerador, denominador) y un candidato gana solo si `d^2 * den_mejor > num_mejor * n0 * n1` (estrictamente mayor: el primer máximo se conserva). Con imágenes de hasta 12 MP, `S0 * N` supera 2^53, así que se usa BigInt; son 256 iteraciones por imagen, coste despreciable frente al recorrido de píxeles.

## Pruebas

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| LMI-01b | Unitaria de regresión (contraejemplo del empate, un nivel, dos niveles) | Vitest | `npx vitest run packages/capture/test/mrz/localizar.test.ts --maxWorkers=1` | 100 % verde |
| LMI-01b | Propiedad contra oráculo exacto con BigInt | fast-check | `npx vitest run packages/capture/test/mrz/localizar.test.ts --maxWorkers=1` | numRuns >= 1000, 0 contraejemplos; corrida puntual con 10 000 |
| LMI-01b | Mutación | Stryker | `npm run test:mutacion` | mutation score >= 85 % (break 80) en `localizar.ts`; se corre en CI o fuera de las restricciones de carga |
| LMI-01b | Regresión de captura MRZ | Vitest | `npx vitest run packages/capture/test/mrz/<archivo> --maxWorkers=1` por archivo | 100 % verde |
