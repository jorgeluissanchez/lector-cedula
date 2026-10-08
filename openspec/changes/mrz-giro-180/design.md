## Contexto

Reporte del 2026-10-08: la digital al revés no se lee. El lector MRZ probaba las vistas 0, 90 y 270 y la presencia solo la derecha en una tarjeta horizontal.

## Decisiones

1. **Vista 180 al final del orden de entrada** (derecha, 90, 270, 180): sin evidencia en ninguna vista (lienzo blanco) el plan empieza igual que antes y la vista 180 queda al final.
2. **Desempate 0 frente a 180 por eje (LMI-14c).** Las vistas opuestas ven las mismas líneas horizontales, así que `ventanasMrz` es casi igual en ambas y una ventana de diferencia era ruido capaz de adelantar la vista equivocada. Se compara por eje el máximo de `ventanasMrz` de la vista y su opuesta, y dentro del eje decide la evidencia de LMI-14a (centro vertical de la MRZ, que en la vista correcta está abajo). No hace falta OCR de prueba: medido con la foto 900x1600 de madera y R centrado, las cuatro orientaciones se leen con 3 llamadas al OCR cada una.
3. **Presencia (OFF-22b)**: con la tarjeta horizontal se mira la derecha y, solo si tiene entre 1 y 6 ventanas con trío pero evidencia baja (líneas arriba), la girada 180. Con tarjeta vertical, 90 y 270 ya cubren las dos orientaciones. La digital al revés cuesta dos vistas (unos 100 ms sin carga frente a 45 ms la derecha); el umbral de coste de ese caso es 250 ms.
4. **Vídeo E2E `digital-girada-180-1080p`**: filtro `hflip,vflip` antes de escalar a la guía en `e2e/videos/cedulas.mjs`. Sin Docker disponible en esta máquina el 2026-10-08, el .y4m local se obtuvo girando 180 los frames I420 de `digital-1080p.y4m` (la guía está centrada en x con 1 px de diferencia y el fondo es uniforme); `npm run e2e:videos` lo regenera con ffmpeg.

## Pruebas

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| LMI-12c | Unitaria (giro puro, plan de 4 vistas, OCR inyectado) | Vitest | `npx vitest run packages/capture/test/mrz/localizar.test.ts packages/capture/test/mrz/lector.test.ts packages/capture/test/mrz/orientacion.test.ts` | 100 % verde |
| LMI-12c | Integración con OCR real (4 orientaciones) | Vitest + Tesseract.js | `npx vitest run packages/capture/test/mrz/lector-real.test.ts -t LMI-12c` | 4 de 4 correctas, <= 4 llamadas OCR cada una |
| LMI-12c | E2E con cámara simulada | Playwright | `npx playwright test e2e/lectura/lectura-girada.spec.ts e2e/lectura/lectura-girada-180.spec.ts --project=lectura-chromium --workers=1` | Resultado igual al de `digital-1080p` |
| LMI-14c | Unitaria (orden puro) | Vitest | `npx vitest run packages/capture/test/mrz/orientacion.test.ts` | 100 % verde |
| LMI-06b | Eval | corredor `evals/runners/mrz-imagen.mjs` | `npm run eval:mrz-imagen` | `rotacion180` >= 45/50, 0 falsas en todos los grupos |
| LMI-06b | Unitaria del corredor | Vitest | `npx vitest run evals/test/mrz-imagen.test.mjs` | 100 % verde |
| OFF-22b | Unitaria y coste | Vitest | `npx vitest run packages/capture/test/lectura/off-22-presencia.test.ts` | Presencia `mrz` en 180 y 270 vertical; < 250 ms |
| OFF-22b | Unitaria de escenas de vídeo | Vitest | `npx vitest run tools/test/videos-cedula.test.mjs` | 100 % verde |
