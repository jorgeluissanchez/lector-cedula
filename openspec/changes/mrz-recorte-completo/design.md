## Decisión

El candidato `"imagen-completa"` va al final: en un reverso completo no cambia el resultado de los candidatos anteriores (el lector se detiene en el primero con 4 dígitos válidos); en un recorte, es el que lee.

## Pruebas

| Requisito | Tipo | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| LMI-10 | Unitaria (orden y caja literales) | Vitest | `npx vitest run packages/capture/test/mrz` | escenarios en verde |
| LMI-10 | Integración con OCR sobre recorte sintético | Vitest + Tesseract.js | `npx vitest run packages/capture/test/mrz` | 4 dígitos válidos |
| LMI-10 | Regresión del eval | `npm run eval:mrz-imagen` | 200/200 limpias y 0 falsas |
