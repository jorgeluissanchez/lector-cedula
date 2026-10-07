## Decisión

El candidato `"imagen-completa"` va al final: en un reverso completo no cambia el resultado de los candidatos anteriores (el lector se detiene en el primero con 4 dígitos válidos); en un recorte, es el que lee.

## Pruebas

| Requisito | Tipo | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| LMI-10 | Unitaria (orden y caja literales) | Vitest | `npx vitest run packages/capture/test/mrz` | escenarios en verde |
| LMI-10 | Integración con OCR sobre recorte sintético | Vitest + Tesseract.js | `npx vitest run packages/capture/test/mrz` | 4 dígitos válidos |
| LMI-10 | Regresión del eval | `npm run eval:mrz-imagen` | 200/200 limpias y 0 falsas |
| LMI-12b | Unitaria (plan literal en lienzo blanco, sin cajas repetidas, ajustadas antes que literales) | Vitest | `npx vitest run packages/capture/test/mrz` | escenarios en verde |
| LMI-12b | Integración con OCR sobre tarjeta pequeña girada sintética | Vitest + Tesseract.js | `npx vitest run packages/capture/test/mrz` | 4 dígitos válidos, `@270`, <= 40 llamadas |
| LMI-13 | Unitaria con OCR y reloj inyectados | Vitest | `npx vitest run packages/capture/test/mrz` | cortes exactos (5 llamadas; 2 llamadas a 60000 ms) |
| LMI-12b, LMI-13 | Regresión del eval | `npm run eval:mrz-imagen` | 200/200 limpias y 0 falsas |

## Decisión (LMI-12b y LMI-13)

Una foto real con la tarjeta en vertical y la MRZ a la izquierda solo se lee en la vista `@270`, que antes llegaba tras agotar ~90 ventanas literales de las vistas derecha y `@90` (más de 4 minutos). Se reordena en dos pasadas: primero los candidatos baratos y las franjas ya ajustadas a un trío de líneas en las tres vistas; después, las ventanas literales. Se eliminan además las cajas repetidas (muchas ventanas se ajustan a la misma caja). El presupuesto (40 llamadas o 60 s por defecto) acota el peor caso; el reloj es inyectable para probar el corte sin esperas.
