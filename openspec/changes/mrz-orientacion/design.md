## Contexto

LMI-12b fija el orden de vistas (derecha, 90, 270). Una foto con la MRZ a la izquierda solo se lee en `@270`, que es la última, y el presupuesto de LMI-13 corta antes.

## Decisión: evidencia de MRZ horizontal por vista (LMI-14)

Se reutiliza el ajuste de franjas de LMI-11b. En cada trío encontrado se cuentan, por línea, los tramos: rachas maximales de columnas útiles con algún borde dentro de la línea. Una línea MRZ de 30 caracteres da decenas de tramos; en la vista equivocada el trío "atraviesa" las 3 columnas de texto girado y da muy pocos (medido: 40 a 54 frente a 9 a 18 en R, F y sus distorsiones). Para descartar texturas periódicas (vetas de madera, que dan muchos tramos pero líneas muy altas) se exige además que `tramos * alto medio de línea / ancho del trío` esté en [0,5; 2,5] (MRZ medida: 1,1 a 2,1; madera: 2,8 a 5,4).

Entre 90 y 270 (180° de diferencia) decide la posición: la MRZ está al pie de la tarjeta, así que va primero la vista cuyo trío con evidencia está más abajo.

Coste: con evidencia en la vista derecha no se gira nada por adelantado (el caso común no paga). Sin ella se calculan las dos vistas giradas antes del primer OCR (cientos de ms, frente a segundos por llamada de OCR).

Tesseract OSD descartado: modelo adicional (`osd.traineddata`) y motor legacy; además no evitaría girar la imagen.

Riesgo conocido: si la vista derecha no muestra evidencia (foto muy borrosa) y una girada sí por azar, la derecha pierde la prioridad. No se puede medir sin fotos reales; el eval sintético no tiene regresiones.

## Decisión: tríos pegados al borde de la ventana (LMI-11c)

Al probar la tarjeta grande antihoraria apareció una lectura con 4 dígitos válidos y la línea de nombres ilegible: la ventana literal cortaba la tercera línea y LMI-11b aceptaba el trío recortado. Se descarta todo trío con la primera línea en la primera fila de la ventana (salvo y = 0) o la última en la última fila (salvo el pie de la imagen); otra ventana más alta contiene las 3 líneas completas.

## Decisión: recorte horizontal al bloque de texto (LMI-11d)

Prueba con la foto real (899x1599, JPEG de WhatsApp, MRZ en x 8-29 %, y 17-80 %): `documento-no-encontrado` en 76 s. Fixture sintético equivalente (R girado a 829 px, mano, JPEG 40): la vista `@270` iba primera (LMI-14 puntúa bien con JPEG), pero Tesseract leía el borde de la tarjeta como una `E` pegada al principio o al final de cada línea (`EICCOL...<< E`) y LMI-03 descartaba las líneas de 31 o más caracteres: 40 llamadas sin lectura. La franja ajustada tomaba x de todas las columnas con borde, incluido el borde de la tarjeta. Ahora toma el grupo de columnas más poblado, separado por huecos de más de un alto de línea (en la MRZ no hay huecos: `<` también tiene tinta). Resultado: 3 llamadas. No se relaja LMI-03 (quitar caracteres de los extremos podría producir lecturas falsas de la línea de nombres, que no tiene dígito de control).

## Decisión: umbral de borde relativo (LMI-11e) y diagnóstico (LMI-11f)

Con LMI-11d la foto real seguía sin leerse (67 s). El script de diagnóstico (solo números) sobre la foto real mostró: sin EXIF, evidencia nula en las 3 vistas y 45 de 45 ventanas por vista sin 3 bandas. El texto de la foto (WhatsApp, borroso, poco contraste) casi no da saltos de 40 entre píxeles vecinos. Réplica sintética: la de LMI-11d con 2 pasadas de media 3x3, contraste 0,6 y JPEG 50 reproduce el 45 de 45. El umbral pasa a ser `min(40, max(12, round(0,5 * p99)))` por ventana: con texto nítido sigue en 40 (no cambia ninguna caja literal anterior), con la réplica borrosa baja y la vista `@270` se lee en 3 llamadas. `analizarVentana` expone umbral, bandas y motivo para que el diagnóstico use la función real y no una copia.

## Decisión: orden por número de ventanas (LMI-14b revisado) y columnas de texto (LMI-11g)

Segundo diagnóstico de la foto real (solo números): la vista 270 tenía evidencia 0,81 en 6 ventanas, pero la vista derecha tenía una evidencia espuria (1 ventana, bloque de 190 px junto al borde) y, como la derecha con evidencia iba primero, se gastaban 9 llamadas en ella. Además, en 270 la caja ajustada llegaba al borde derecho (ancho 1318 frente a ~1007 de la MRZ) y el OCR daba 36 a 41 caracteres por línea.

- LMI-14b: se calculan siempre las tres vistas (cuesta girar y localizar dos vistas más, cientos de ms, frente a segundos por llamada de OCR) y se ordenan por número de ventanas con MRZ horizontal, luego por evidencia, luego derecha, 90, 270. Con R, T y el lienzo blanco el orden no cambia.
- LMI-11g: una columna solo cuenta para el recorte en x si su densidad de bordes en los huecos entre líneas es como mucho la mitad que en las líneas. Réplica: líneas oscuras de 2 px cada 20 px a la derecha de la MRZ en la vista 270, suavizadas: la caja llegaba a x = 100 % y ahora termina en 81 %.

## Pruebas

| Requisito | Tipo | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| LMI-14 | Unitaria (evidencia en líneas de rectángulos y en su transpuesta, lienzo blanco sin evidencia, orden de vistas del plan) | Vitest | `npx vitest run packages/capture/test/mrz` | escenarios en verde |
| LMI-14b | Unitaria con OCR inyectado (primera llamada en la vista elegida) | Vitest | `npx vitest run packages/capture/test/mrz` | 1 llamada, sufijo esperado |
| LMI-14b | Integración con OCR real sobre tarjeta pequeña girada horaria y antihoraria en madera | Vitest + Tesseract.js | `npx vitest run packages/capture/test/mrz` | 4 dígitos válidos, `@270` / `@90`, <= 12 llamadas |
| LMI-14b | Regresión (vista derecha primero en R, T, lienzo blanco) | Vitest | `npx vitest run packages/capture/test/mrz` | escenarios en verde |
| LMI-14b | Integración con OCR real sobre tarjeta grande (700 px) girada horaria y antihoraria en madera | Vitest + Tesseract.js | `npx vitest run packages/capture/test/mrz` | líneas de R exactas, sufijo esperado, <= 12 llamadas (antes 21 o más) |
| LMI-11c | Unitaria (ventana que corta la tercera línea: caja ajustada y ventana literal) | Vitest | `npx vitest run packages/capture/test/mrz` | cajas literales del escenario |
| LMI-11d | Unitaria (barra vertical junto a las líneas) | Vitest | `npx vitest run packages/capture/test/mrz` | caja literal del escenario |
| LMI-11d | Integración con OCR real sobre la réplica sintética de la foto real (JPEG 40, mano) y su espejo | Vitest + Tesseract.js | `npx vitest run packages/capture/test/mrz` | líneas de R exactas, `@270` / `@90`, <= 12 llamadas (antes 40 sin lectura) |
| LMI-11e | Unitaria (rectángulos de luminancia 225: falla con umbral fijo 40) | Vitest | `npx vitest run packages/capture/test/mrz` | caja literal del escenario |
| LMI-11e | Integración con OCR real sobre la réplica borrosa | Vitest + Tesseract.js | `npx vitest run packages/capture/test/mrz` | líneas de R exactas, `@270`, <= 12 llamadas |
| LMI-11f | Unitaria (umbral, motivo y bandas literales) | Vitest | `npx vitest run packages/capture/test/mrz` | escenarios en verde |
| LMI-14b | Unitaria (orden puro con los números de la foto real y casos sin evidencia y con derecha mayor) | Vitest | `npx vitest run packages/capture/test/mrz` | órdenes literales |
| LMI-11g | Unitaria (líneas verticales finas junto a las líneas) | Vitest | `npx vitest run packages/capture/test/mrz` | caja literal del escenario |
| LMI-11g | Integración con OCR real sobre la réplica con estructuras a la derecha | Vitest + Tesseract.js | `npx vitest run packages/capture/test/mrz` | líneas de R exactas, `@270`, <= 12 llamadas |
| LMI-11c a LMI-11g, LMI-14, LMI-14b | Regresión del eval | `npm run eval:mrz-imagen` | 0 falsas, umbrales de LMI-06 |
