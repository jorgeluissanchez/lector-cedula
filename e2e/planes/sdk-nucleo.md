# Plan E2E: núcleo headless (sdk-integracion, tareas 3.4 y 3.7)

Aplicación: `examples/vanilla` (`http://localhost:4190`, assets del paquete en `/lector-cedula/`). Proyectos `sdk-chromium` y `sdk-pixel7`. Cámara simulada con `amarilla-1080p.y4m` y `digital-1080p.y4m` (PERSONA_BASE). Selectores `data-prueba`. Esperas por condición.

| Spec | Escenarios |
|---|---|
| `e2e/sdk/nucleo.spec.ts` | SDK-04 sin peticiones al montar; SDK-30 cancelar y destruir dejan las pistas `ended` |
| `e2e/sdk/sin-servidor.spec.ts` | SDK-37 lectura con la red cortada tras precargar; cero peticiones a otros orígenes, ningún POST; SDK-07 ninguna petición del motor tras precargar |
| `e2e/sdk/sin-servidor-digital.spec.ts` | SDK-37 digital sin servidor (`mrz-td1`, NUIP) |
| `e2e/sdk/offline.spec.ts` | SDK-06 segunda lectura sin red y contenido de la caché; recarga sin red con `precacheLector`; SDK-39 WASM alterado da `motor-no-disponible` y no se cachea |
| `e2e/sdk/privacidad.spec.ts` | SDK-11 almacenamiento vacío, sin POST ni multipart, consola sin datos |
| `e2e/sdk/rendimiento.spec.ts` | SDK-09 amarilla en caliente, 20 lecturas, CPU 4x, p95 de `lector-cedula:tiempo` <= 1500 ms (solo `sdk-pixel7`) |

Nota: plan y specs escritos por el implementador siguiendo las recetas del proyecto; los agentes `playwright-test-*` no estaban registrados en esta sesión.
