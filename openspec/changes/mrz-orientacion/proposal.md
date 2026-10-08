## Why

Prueba con una foto real (2026-10-07, 899x1599): tarjeta girada 90° (líneas MRZ verticales, MRZ a la izquierda). El plan de LMI-12b recorre la vista derecha y la `@90` antes de la `@270`, y el presupuesto de LMI-13 (40 llamadas, 60 s) se agota antes de llegar a la vista correcta. Recortada y enderezada, la MRZ se lee perfecta.

## What Changes

- LMI-14 y LMI-14b (ADDED): antes del primer OCR se estima, sin modelos ni OCR, si una vista contiene un trío de líneas con forma de MRZ horizontal (evidencia de orientación) y se ordenan las vistas: la derecha va primero si tiene evidencia (sin regresión); si no, las vistas giradas con evidencia pasan delante, la de la MRZ más baja primero.
- LMI-11c (ADDED): el ajuste de franjas descarta tríos con una línea pegada a un borde interior de la ventana. Con el nuevo orden, R girado antihorario a 700 px se leía en 3 llamadas pero con la línea de nombres cortada (también ocurría con el orden anterior, en la llamada 18).
- LMI-11d (ADDED): la franja ajustada recorta en x al grupo de columnas de texto más poblado, sin el borde de la tarjeta ni el fondo (foto real 899x1599 en JPEG de WhatsApp: el OCR leía el borde como una `E` pegada a cada línea).
- Se descarta Tesseract OSD: exige `osd.traineddata` y el motor legacy (otro modelo y otro core WASM); la estimación por bordes basta y no añade dependencias ni modelos.

## Impact

- `packages/capture/src/mrz/localizar.ts` (evidencia por vista) y `lector.ts` (orden de vistas en `intentosMrz` / `planIntentosMrz`), y sus pruebas. Archivar después de `mrz-recorte-completo`.
