# Plan E2E: deteccion-fraude (FRA-02, FRA-17, FRA-20)

Proyectos `lectura-chromium` y `lectura-pixel7`, vídeo sintético `amarilla-1080p` (cámara simulada de Chromium).
Esperas por condición (`toHaveAttribute`, `expect.poll`), nunca por tiempo fijo. Archivo: `e2e/lectura/riesgo.spec.ts`.

| Escenario | Pasos | Esperado |
|---|---|---|
| FRA-17 Auténtico en E2E | Iniciar cámara y leer la amarilla | Datos visibles; `section.resultado` con `data-riesgo-nivel="bajo"` y `data-riesgo-motivos=""`; título "Riesgo bajo"; 0 violaciones axe serious o critical |
| FRA-02 Sin red durante la evaluación | Esperar service worker y precaché; `context.setOffline(true)`; leer | `data-riesgo-nivel` presente; ninguna petición fuera del origen |
| FRA-20 Worker de fraude que no responde | Sin service worker; retener `assets/fraude.worker-*.js`; leer | Datos visibles; `data-riesgo-nivel="no-disponible"` |

Pendiente: FRA-17 "Pantalla simulada en E2E" necesita los vídeos `amarilla-pantalla-1080p` y `amarilla-fotocopia-1080p`
generados desde `@lector-cedula/fraud/sintetico` (tarea 5.1, segunda parte).
