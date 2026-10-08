## Why

Reporte del usuario del 2026-10-08 en la PWA desplegada: la cédula digital se lee girada hacia un lado (90 o 270), pero no al revés (180). El lector MRZ solo considera las vistas derecha, 90 y 270 (LMI-12) y Tesseract solo lee texto derecho; el detector de presencia (OFF-22) solo busca la MRZ derecha en una tarjeta horizontal, así que una digital al revés tampoco llega a `listo`.

## What Changes

- LMI-12c (ADDED): vista girada 180° con sufijo `@180`; el plan de LMI-12b recorre cuatro vistas (orden de entrada derecha, 90, 270, 180).
- LMI-14c (ADDED): las vistas opuestas (0 y 180, 90 y 270) ven las mismas líneas, así que `ordenVistasPorEvidencia` compara por eje el máximo de `ventanasMrz` de la vista y su opuesta; dentro del eje decide la evidencia (centro vertical de la MRZ: en la vista correcta está abajo). Una ventana de más en la vista opuesta ya no la adelanta.
- OFF-22b (ADDED): la presencia busca la MRZ en las 4 orientaciones (tarjeta horizontal: derecha y 180; vertical: 90 y 270).
- La pista de tipo (OFF-27) no cambia.

## Impact

- `packages/capture/src/mrz/localizar.ts` (`girar` 180, `GIROS`), `lector.ts` (`ordenVistasPorEvidencia`), `packages/capture/src/calidad/presencia.ts` (`hayMrz`) y sus pruebas. Escenarios de LMI-12b y LMI-14b que listaban 3 vistas cambian a 4 (ver la spec delta). Archivar después de `mrz-orientacion` y `pwa-lectura-offline`.
