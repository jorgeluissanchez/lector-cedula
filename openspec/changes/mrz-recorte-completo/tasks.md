## 1. Candidato de imagen completa

- [x] 1.1 Prueba en rojo de LMI-10 (orden de candidatos y recorte sintético solo MRZ), implementar el candidato en `localizarFranjaMrz`, actualizar las pruebas de LMI-01 que fijan la longitud de la lista. Tipos: unitaria e integración. Verificación: `npx vitest run packages/capture/test/mrz`.
- [x] 1.2 Prueba en rojo de LMI-11 (cajas literales de las franjas y foto sintética 900x1600 con textura y R centrado), implementar los candidatos "franja", actualizar las pruebas que fijan la lista de candidatos. Tipos: unitaria e integración con OCR. Verificación: `npx vitest run packages/capture/test/mrz` y `npm run eval:mrz-imagen`.

## 2. Imagen girada

- [x] 2.1 Prueba en rojo de LMI-12 (giro puro, OCR inyectado y reverso sintético girado con OCR real), implementar las vistas giradas en el lector. Tipos: unitaria e integración con OCR. Verificación: `npx vitest run packages/capture/test/mrz` y `npm run eval:mrz-imagen`.
