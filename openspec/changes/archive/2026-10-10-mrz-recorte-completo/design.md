## Decisión

El candidato `"imagen-completa"` va al final: en un reverso completo no cambia el resultado de los candidatos anteriores (el lector se detiene en el primero con 4 dígitos válidos); en un recorte, es el que lee.

## Pruebas

| Requisito | Tipo | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| LMI-10 | Unitaria (orden y caja literales) | Vitest | `npx vitest run packages/capture/test/mrz` | escenarios en verde |
| LMI-10 | Integración con OCR sobre recorte sintético | Vitest + Tesseract.js | `npx vitest run packages/capture/test/mrz` | 4 dígitos válidos |
| LMI-10 | Regresión del eval | `npm run eval:mrz-imagen` | 200/200 limpias y 0 falsas |
| LMI-11 | Unitaria (cajas literales de las franjas en lienzo blanco 1000x1000, orden de abajo arriba y por alto) | Vitest | `npx vitest run packages/capture/test/mrz` | escenarios en verde |
| LMI-11 | Integración con OCR sobre foto sintética 900x1600 con madera y R centrado | Vitest + Tesseract.js | `npx vitest run packages/capture/test/mrz` | 4 dígitos válidos, `intento` `"franja"` |
| LMI-11b | Unitaria (ajuste al trío de rectángulos con y sin vetas verticales, caja literal del escenario) | Vitest | `npx vitest run packages/capture/test/mrz` | `{ x: 91, y: 892, ancho: 807, alto: 91 }` |
| LMI-12 | Unitaria (giro puro 3x2 a 90° y 270°, entrada intacta) | Vitest | `npx vitest run packages/capture/test/mrz` | escenario en verde |
| LMI-12 | Unitaria con OCR inyectado (giro solo si la derecha falla, nada legible) | Vitest | `npx vitest run packages/capture/test/mrz` | conteos exactos de llamadas |
| LMI-12 | Integración con OCR sobre R girado 90° antihorario | Vitest + Tesseract.js | `npx vitest run packages/capture/test/mrz` | 4 dígitos válidos, `@90` |
| LMI-11, LMI-11b, LMI-12 | Regresión del eval | `npm run eval:mrz-imagen` | 0 falsas, umbrales de LMI-06 |
| LMI-12b | Unitaria (plan literal en lienzo blanco, sin cajas repetidas, ajustadas antes que literales) | Vitest | `npx vitest run packages/capture/test/mrz` | escenarios en verde |
| LMI-12b | Integración con OCR sobre tarjeta pequeña girada sintética | Vitest + Tesseract.js | `npx vitest run packages/capture/test/mrz` | 4 dígitos válidos, `@270`, <= 40 llamadas |
| LMI-13 | Unitaria con OCR y reloj inyectados | Vitest | `npx vitest run packages/capture/test/mrz` | cortes exactos (5 llamadas; 2 llamadas a 60000 ms) |
| LMI-12b, LMI-13 | Regresión del eval | `npm run eval:mrz-imagen` | 200/200 limpias y 0 falsas |

## Decisión (LMI-12b y LMI-13)

Una foto real con la tarjeta en vertical y la MRZ a la izquierda solo se lee en la vista `@270`, que antes llegaba tras agotar ~90 ventanas literales de las vistas derecha y `@90` (más de 4 minutos). Se reordena en dos pasadas: primero los candidatos baratos y las franjas ya ajustadas a un trío de líneas en las tres vistas; después, las ventanas literales. Se eliminan además las cajas repetidas (muchas ventanas se ajustan a la misma caja). El presupuesto (40 llamadas o 60 s por defecto) acota el peor caso; el reloj es inyectable para probar el corte sin esperas.
