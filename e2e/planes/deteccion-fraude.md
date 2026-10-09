# Plan E2E: deteccion-fraude (FRA-02, FRA-17, FRA-20)

Proyectos `lectura-chromium` y `lectura-pixel7`, vídeo sintético `amarilla-1080p` (cámara simulada de Chromium).
Esperas por condición (`toHaveAttribute`, `expect.poll`), nunca por tiempo fijo. Archivo: `e2e/lectura/riesgo.spec.ts`.

| Escenario | Pasos | Esperado |
|---|---|---|
| FRA-17 Auténtico en E2E | Iniciar cámara y leer la amarilla | Datos visibles; `section.resultado` con `data-riesgo-nivel="bajo"` y `data-riesgo-motivos=""`; título "Riesgo bajo"; 0 violaciones axe serious o critical |
| FRA-02 Sin red durante la evaluación | Esperar service worker y precaché; `context.setOffline(true)`; leer | `data-riesgo-nivel` presente; ninguna petición fuera del origen |
| FRA-20 Worker de fraude que no responde | Sin service worker; retener `assets/fraude.worker-*.js`; leer | Datos visibles; `data-riesgo-nivel="no-disponible"` |

Tarea 5.1b: `riesgo-color.spec.ts` (FRA-17 Auténtico, `amarilla-color-1080p`, nivel `bajo` y axe), `riesgo-pantalla.spec.ts` (FRA-17 Pantalla simulada, nivel `alto` y motivo `pantalla`) y `riesgo-fotocopia.spec.ts` (FRA-08, motivo `fotocopia`), un vídeo por archivo, con `?debug=1`.
