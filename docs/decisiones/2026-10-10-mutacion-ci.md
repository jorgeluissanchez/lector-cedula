# Mutación en CI por áreas (2026-10-10)

## Contexto

`npm run test:mutacion` (Stryker, `coverageAnalysis: "perTest"`) en un solo job superaba el límite de 6 h de GitHub.
Desde el PR #1 corre en `.github/workflows/mutacion.yml` como matriz por área (`AREAS` de `stryker.config.mjs`), cada
una con break 85, en push a main, cada noche y a mano.

## Causa de los fallos de la corrida inicial (run 38070027054)

Stryker instrumenta cada expresión de los archivos mutados (interruptor de mutante) y, en la corrida inicial, añade un
contador de cobertura por sentencia y por prueba. En los bucles por píxel (`packages/capture/src/{mrz,calidad,pdf417}`,
`packages/fraud/src/detectores`) eso multiplica el tiempo de las pruebas que procesan imágenes (LMI-02 pasa de 1,2 s en
`npm test` a más de 60 s). No es un fallo del producto: las mismas pruebas pasan en `npm test`.

| Área | Prueba | Síntoma |
|---|---|---|
| capture-mrz | LMI-02 Opciones del worker (`mrz/lector.test.ts`, renderiza con Chromium) | timeout de 60 s |
| capture-calidad | OD-20 Rendimiento (`lectura/od-20-presencia-td3.test.ts`, Chromium y Worker de calidad) | 268 ms > presupuesto de 250 ms |
| capture-pdf417 | OFF-28 Frame degradado (`pdf417/off-28-realce.test.ts`) | el presupuesto de reloj del decodificador (LPI-12) se agota antes del realce |
| fraude | FRA-01 frames inválidos (`fraud/test/evaluar-entrada.test.ts`, frame de 32 x 8192) | timeout de 5 s |
| servidor-web | (ninguna) | puntuación real 82,98 < 85: falta de pruebas, no de entorno |

## Decisión

1. Sin subir timeouts ni quitar pruebas de `npm test`.
2. Se excluyen de la ejecución de Stryker (solo `vitest.stryker.config.ts`) las pruebas de integración que lanzan
   procesos o Workers (Chromium, OCR real, Worker de calidad) y que con el código instrumentado superan su timeout o su
   presupuesto de reloj: `mrz/lector.test.ts`, `mrz/td3-real.test.ts`, `lectura/od-20-presencia-td3.test.ts`. Siguen en
   `npm test`. El break 85 de cada área se mantiene; si una exclusión lo hace caer, se revierte y se escribe la prueba
   unitaria que falte.
3. FRA-01 y OFF-28 no lanzan procesos: quedan pendientes de decisión (ver el PR).
4. servidor-web: abrir un cambio con pruebas para los supervivientes (`nucleo-js/src/nucleo.ts`, `url.ts`,
   `web/src/controlador.ts`, `servidor/src/lector/nodo.ts`).
