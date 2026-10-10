# Proposal: demo-opciones

## Why

El usuario quiere controlar desde la propia interfaz de la demo pública (`apps/pwa` compilada con `VITE_DEMO=true`) cómo se usa el lector, sin recompilar ni tocar la URL: (1) la forma de la cámara (pantalla completa como hoy, recuadro horizontal o recuadro vertical con la cédula de pie sin girar el teléfono, como en `examples/login`); (2) activar o desactivar la tarjeta de identidad; (3) activar o desactivar la señal de fraude. Hoy la TI es solo opción de compilación (`VITE_ADMITIR_TI`), el fraude solo `VITE_FRAUDE` o `?debug=1`, y la cámara solo existe a pantalla completa.

Decisiones del orquestador por delegación del usuario (2026-10-10), fijadas aquí como contrato:

1. Panel "Opciones" accesible en `inicio`, solo en la compilación demo: forma de cámara (3 valores, por omisión pantalla completa), tarjeta de identidad (apagada por omisión) y señal de fraude (apagada por omisión, con aviso "señal orientativa").
2. Las preferencias se recuerdan en `localStorage` como preferencia de interfaz (una clave, tres valores enumerados, nunca datos de lectura, con `try/catch`). Es una excepción acotada y explícita a CAM-11 y OFF-11, que prohíben el almacenamiento del navegador en la PWA.
3. TI en tiempo de ejecución solo en la demo y solo con el aviso de menores, la pantalla `autorizacion-representante` y la retención solo en memoria intactos (OD-34b, OFF-24). Por omisión sigue apagada y la PWA se comporta como hoy.
4. Fraude: el interruptor del panel se suma a `VITE_FRAUDE` y `?debug=1` con el mismo comportamiento (FRA-21).
5. La forma de cámara se apoya en la geometría pública del núcleo `@lector-cedula/web` (`guiaEnVideo`, `guiaEnElemento`): primer paso de la tarea 3.6 de `sdk-integracion` (la PWA consume el núcleo). La migración completa de la sesión a `crearLector` queda pendiente (ver `design.md`).

## What Changes

- `apps/pwa/src/preferencias.ts` (nuevo): lectura y escritura validadas de las preferencias de la demo.
- `apps/pwa/src/forma.ts` (nuevo): formas de cámara, guía en píxeles del vídeo y en pantalla sobre `@lector-cedula/web`.
- `apps/pwa/src/opciones.ts` (nuevo): valores efectivos de TI y fraude (compilación, demo, preferencia, URL).
- `apps/pwa/src/App.tsx`: botón y panel "Opciones", escena con recuadro, enlace a la autorización según la TI efectiva.
- `apps/pwa/src/sesion.ts`: opciones leídas en cada uso (función) y guía de la forma enviada al Worker de calidad y usada como cuadrilátero.
- `apps/pwa/vite.config.ts`, `config.ts`: en la demo se compilan el texto y la página de la autorización del representante (la TI puede activarse en el panel); alias de `@lector-cedula/web`.
- `tools/privacidad-check.mjs` y la prueba CAM-11: excepción `localStorage` solo en `apps/pwa/src/preferencias.ts`.
- `docs/legal/CHECKLIST-CUMPLIMIENTO.md` y `politica-tratamiento-datos.md`: el panel de la demo activa la TI igual que `VITE_ADMITIR_TI`.
- E2E en `e2e/demo/` (proyectos `demo-chromium` y `demo-pixel7`) y job `e2e-demo` en CI.

## Capabilities

### New Capabilities

- `demo-opciones`: panel de opciones de la demo, preferencias, forma de cámara, TI y fraude en tiempo de ejecución, excepción de almacenamiento.

### Modified Capabilities

Ninguna por delta MODIFIED: CAM-11 (`captura-camara`) ya tiene una modificación pendiente en `pwa-lectura-offline` y OFF-11, FRA-21, OD-30 y OD-35 viven en cambios sin archivar. Las ampliaciones se declaran como requisitos ADDED de `demo-opciones` que nombran el requisito que amplían (DOP-04, DOP-05, DOP-06).

## Impact

- Código: `apps/pwa` (src, config, vite.config, estilos), `tools/privacidad-check.mjs`, `playwright.config.ts`, `.github/workflows/ci.yml`.
- Privacidad: una clave de preferencias en `localStorage` en la demo; revisión de `revisor-privacidad`.
- Legal: la TI puede activarse en la demo pública; la fila B3b del checklist lo nombra (revisión del abogado pendiente, igual que `VITE_ADMITIR_TI`).
- Archivar después de `pwa-lectura-offline`, `otros-documentos` y `deteccion-fraude`.
