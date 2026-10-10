## Why

La propiedad "LMI-01b Otsu coincide con el oráculo de varianza entre clases" falla de forma intermitente (semilla -1808592412, contraejemplo `[245, 109, 146, 217, 13]`). Los umbrales 109 y 146 tienen exactamente la misma varianza entre clases (361250 / 3); `umbralOtsu` acumula medias en coma flotante y solo cambia con `entre > mejor`, así que el redondeo puede hacer que 146 parezca mayor y gane en lugar del primer máximo. La spec no fijaba qué pasa ante empate ni que el cálculo fuera exacto.

## What Changes

- LMI-01b (MODIFIED): define la varianza entre clases, fija que ante empate gana el umbral más bajo y exige cálculo exacto (fracción `d^2 / (n0 * n1)` comparada en cruz con BigInt). Escenarios nuevos: empate con el contraejemplo, un nivel y dos niveles (ya probado, ahora en la spec) y oráculo exacto con 1000 casos.
- `umbralOtsu` en `packages/capture/src/mrz/localizar.ts` pasa a aritmética entera exacta. Fuera de los empates exactos el umbral no cambia.

## Impact

- `packages/capture/src/mrz/localizar.ts` y `packages/capture/test/mrz/localizar.test.ts`. `enderezar.ts` y el oráculo de calidad de `packages/nucleo-js` importan `umbralOtsu` desde la fuente, así que heredan el arreglo sin cambios.
- La versión Kotlin (`native/android/nucleo/.../mrz/LocalizarMrz.kt`) no implementa Otsu (localiza por bordes, LMI-11), así que no hay paridad que tocar.
