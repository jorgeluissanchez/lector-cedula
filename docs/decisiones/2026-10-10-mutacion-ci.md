# Mutación en CI por áreas (2026-10-10)

## Contexto

`npm run test:mutacion` (Stryker, `coverageAnalysis: "perTest"`) en un solo job superaba el límite de 6 h de GitHub.
Desde el PR #1 corre en `.github/workflows/mutacion.yml` como matriz por área (`AREAS` de `stryker.config.mjs`), cada
una con break 85, en push a main, cada noche y a mano.

## Causa de los fallos de la corrida inicial (runs 38070027054 y 38072272628)

Stryker instrumenta cada expresión de los archivos mutados (interruptor de mutante) y, en la corrida inicial, añade un
contador de cobertura por sentencia y por prueba. En los bucles por píxel (`packages/capture/src/{mrz,calidad,pdf417}`,
`packages/fraud/src`) eso multiplica de 10 a 50 veces el tiempo de las pruebas que procesan imágenes. No es un fallo del
producto: las mismas pruebas pasan en `npm test`. Stryker se detiene en la primera prueba que falla, así que cada
corrida muestra una sola por área:

| Área | Prueba | Síntoma |
|---|---|---|
| capture-mrz | LMI-02 Opciones del worker, LMI-14c | timeout de 60 s del `describe` (1,2 s en `npm test`) |
| capture-calidad | OD-20 Rendimiento, OFF-22 Rápido | aserciones de reloj: 268 ms > 250 ms, 187 ms > 20 ms |
| capture-pdf417 | OFF-28 Frame degradado | el presupuesto de reloj de 15 s del decodificador (LPI-12) se agota antes del realce |
| fraude | FRA-01 frames inválidos (frame de 32 x 8192) | timeout por defecto de 5 s |
| servidor-web | (ninguna) | puntuación real 82,98 < 85: faltan pruebas; se trata en un cambio aparte |

## Decisión (orquestador, por delegación del usuario: opción C acotada a Stryker)

`npm test` no cambia: mismas pruebas, mismos timeouts.

1. **Pruebas de rendimiento**: las aserciones de reloj miden a Stryker, no al producto. En la ejecución de Stryker se
   omiten por nombre (`Rendimiento:` o `Rápido:`, hoy OD-20 y OFF-22), no por archivo: el resto de pruebas de esos
   archivos sigue matando mutantes. Vitest fija el filtro por nombre que Stryker reescribe en cada corrida
   (`testNamePattern`), así que la omisión se hace al registrar la prueba con la fachada
   `tools/stryker/vitest-instrumentado.mjs`, alias exacto de `vitest` solo en `vitest.stryker.config.ts`.
2. **Timeouts por 10 solo en Stryker**: `testTimeout` y `hookTimeout` en `vitest.stryker.config.ts`, y los timeouts
   explícitos de `describe`/`it` multiplicados por la misma fachada (Vitest fija el timeout de cada prueba al recogerla,
   y el del `describe` se hereda, así que `testTimeout` no los alcanza). Se mantiene el `timeoutFactor` de Stryker.
3. **OFF-28**: la prueba inyecta un reloj fijo (`ahora: () => 0`, ya existente en `crearDecodificador`) para no
   depender de la velocidad de la máquina. El presupuesto de LPI-12 sigue probado con reloj controlado en
   `pdf417/localizar.test.ts` y el valor por defecto no cambia.
4. `mrz/lector.test.ts` y `lectura/od-20-presencia-td3.test.ts` vuelven a la ejecución de Stryker. `mrz/td3-real.test.ts`
   queda fuera, como `mrz/lector-real.test.ts`: es OCR real con el modelo de Tesseract.
5. No se usa `// Stryker disable` en código de producto ni se sacan archivos de `mutate`. El break 85 de cada área se
   mantiene.
6. servidor-web (82,98 < 85) queda fuera de este cambio: lo abre el orquestador con pruebas nuevas.
