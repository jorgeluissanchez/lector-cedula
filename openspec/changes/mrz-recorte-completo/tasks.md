## 1. Candidato de imagen completa

- [x] 1.1 Prueba en rojo de LMI-10 (orden de candidatos y recorte sintético solo MRZ), implementar el candidato en `localizarFranjaMrz`, actualizar las pruebas de LMI-01 que fijan la longitud de la lista. Tipos: unitaria e integración. Verificación: `npx vitest run packages/capture/test/mrz`.
- [x] 1.2 Prueba en rojo de LMI-11 (cajas literales de las franjas y foto sintética 900x1600 con textura y R centrado), implementar los candidatos "franja", actualizar las pruebas que fijan la lista de candidatos. Tipos: unitaria e integración con OCR. Verificación: `npx vitest run packages/capture/test/mrz` y `npm run eval:mrz-imagen`.

## 2. Imagen girada

- [x] 2.1 Prueba en rojo de LMI-12 (giro puro, OCR inyectado y reverso sintético girado con OCR real), implementar las vistas giradas en el lector. Tipos: unitaria e integración con OCR. Verificación: `npx vitest run packages/capture/test/mrz` y `npm run eval:mrz-imagen`.

## 3. Tarjeta girada pequeña y presupuesto

- [x] 3.1 Prueba en rojo de LMI-12b (plan en dos pasadas sin cajas repetidas sobre lienzo blanco y sobre R; foto sintética 900x1600 con madera y R girado 90° horario a 360 px en (40, 260), leída en `@270` con como mucho 40 llamadas al OCR real), implementar `planIntentosMrz` y el recorrido en dos pasadas en el lector, actualizar las pruebas de LMI-04 y LMI-12 que contaban intentos. Tipos: unitaria e integración con OCR. Verificación: `npx vitest run packages/capture/test/mrz` y `npm run eval:mrz-imagen`.
- [x] 3.2 Prueba en rojo de LMI-13 (corte por llamadas, corte por tiempo con reloj inyectado y mejor intento parcial, presupuesto por defecto, opciones inválidas, reloj por lectura), implementar `maxLlamadasOcr`, `tiempoLimiteMs` y `ahora`. Tipos: unitaria con OCR inyectado. Verificación: `npx vitest run packages/capture/test/mrz`.
