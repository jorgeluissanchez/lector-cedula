# Design: demo-opciones

## Contexto

La demo pública es `apps/pwa` compilada con `VITE_DEMO=true` (MA-01 a MA-03). La sesión de captura de la PWA (`apps/pwa/src/sesion.ts`) es propia: cámara, calidad en Worker, autocaptura, foto y frames de OFF-27/OFF-28, reintentos de OFF-26, señal de fraude (FRA-17) y diagnóstico (OFF-29). El núcleo `@lector-cedula/web` (`crearLector`) cubre cámara, calidad, guía embebida (SDK-61 a SDK-64) y lectura, pero no la señal de fraude, el diagnóstico ni la pantalla de autorización del representante de la PWA.

## Decisiones

1. **Migración parcial (tarea 3.6 de `sdk-integracion`).** Migrar la sesión completa a `crearLector` sin cambio de comportamiento exige llevar al núcleo el fraude, el diagnóstico y el flujo de menores de la PWA; es un cambio grande con riesgo de regresión en todas las E2E de `apps/pwa`. Por decisión del orquestador ("si es demasiado grande, haz primero la parte que alimenta el panel"), la PWA consume del núcleo la geometría pública de la guía embebida (`guiaEnVideo`, `guiaEnElemento`; DOP-07), que es lo que alimenta la forma de cámara. Falta para cerrar SDK-35: sustituir `sesion.ts` por `crearLector` (fraude y diagnóstico como extensiones del núcleo o de la PWA sobre su estado), y dejar de importar `crearAutocaptura`, `iniciarCamara` y el cliente de calidad desde `@lector-cedula/capture`. La tarea 3.6 sigue abierta con esta nota.
2. **Pantalla completa no cambia.** Con `pantalla-completa` la sesión no envía guía al Worker (usa la de CAM-08 por omisión, como hoy) y la guía en pantalla sigue siendo `guiaEnPantalla(calcularGuia(...))`. Así ninguna E2E existente cambia de comportamiento.
3. **Recuadros como `examples/login`.** 320x200 (horizontal) y 260x400 (vertical), `object-fit: cover`, guía dentro de la región visible (SDK-61). La guía en píxeles del vídeo va al Worker en el análisis y en la revalidación (con las medidas del frame de captura, que es la resolución de la pista) y es el cuadrilátero de la captura (fraude). La lectura usa los frames completos (OFF-28), como el núcleo.
4. **Opciones leídas en cada uso.** `crearSesion(observador, opciones)` acepta un objeto o una función; la App pasa una función sobre una referencia al estado, así el panel cambia TI, fraude y forma sin recrear la sesión. El panel solo existe en `inicio`, de modo que una captura en curso no cambia de opciones.
5. **TI en la demo.** `tiDisponible = VITE_ADMITIR_TI || VITE_DEMO` decide qué se compila (texto de la autorización, página y enlace de la política); `tiEfectiva` decide qué se pasa a la lectura. El reductor (`requiereAutorizacion`), la pantalla `autorizacion-representante` y la retención en memoria no cambian.
6. **Preferencias en `localStorage`.** Una clave, `lector-cedula:demo-opciones`, con tres valores enumerados; se escribe solo al cambiar una opción y se borra si vuelven a los de omisión (así los flujos por omisión siguen con el almacenamiento vacío de CAM-11 y OFF-11). Excepción acotada a un archivo en `tools/privacidad-check.mjs` y en la prueba CAM-11 (DOP-06). El panel lo dice al usuario ("Estas preferencias se recuerdan en este navegador. Ningún dato del documento se guarda.").
7. **Forzados visibles.** Si la TI viene de la compilación o el fraude de `VITE_FRAUDE`/`?debug=1`, la casilla aparece marcada y deshabilitada: el panel muestra el valor efectivo sin poder contradecirlo.
8. **E2E en CI.** `ci.yml` no corre Playwright; se añade el job `e2e-demo` acotado a `e2e/demo/` (proyectos `demo-chromium` y `demo-pixel7`, 1 worker) con los vídeos de `npm run e2e:videos` y los servidores de vista previa de la PWA normal (4173) y demo (4175) arrancados por Playwright solo para ese job (`E2E_SERVIDORES=pwa`).

## Pruebas

Comandos: `U` = `npx vitest run apps/pwa/test/dop-*.test.ts tools/test/privacidad-check.test.mjs tools/test/legal-ti.test.mjs apps/pwa/test/cam-11-estatico.test.ts --maxWorkers=1`; `E` = `E2E_SERVIDORES=pwa npx playwright test e2e/demo --project=demo-chromium --project=demo-pixel7 --workers=1` (job `e2e-demo` de CI).

| Requisito | Tipo de prueba | Herramienta | Comando | Umbral |
|---|---|---|---|---|
| DOP-01 | E2E (panel, valores por omisión, build normal sin panel) | Playwright | `E` | Verde en Chromium escritorio y Pixel 7 |
| DOP-01 | Accesibilidad | @axe-core/playwright | `E` | 0 violaciones serious o critical |
| DOP-01 | Regresión del aviso (MA-02, MA-03) | Playwright | `E` (`e2e/demo/aviso.spec.ts`) | Verde |
| DOP-02 | Unitaria (literales de los escenarios) | Vitest | `U` | 100 % verde |
| DOP-02 | Propiedad (ida y vuelta, claves exactas) | fast-check | `U` | numRuns >= 1000, 0 fallos |
| DOP-02 | E2E (recarga, almacenamiento tras leer) | Playwright | `E` | Verde |
| DOP-03 | Unitaria (guía por forma, literal 69/213/942x1494) | Vitest | `U` | 100 % verde |
| DOP-03 | E2E con vídeo sintético (3 formas, 4 escenas) | Playwright | `E` | Verde en Chromium y Pixel 7; NUIP `9999123456` |
| DOP-04 | Unitaria (tabla de 8 casos) | Vitest | `U` | 100 % verde |
| DOP-04 | E2E (TI apagada, encendida sin y con autorización, página) | Playwright | `E` | Verde; axe 0 serious o critical |
| DOP-05 | Unitaria (tabla de 8 casos) | Vitest | `U` | 100 % verde |
| DOP-05 | E2E (fraude apagado, encendido, forzado por URL) | Playwright | `E` | Verde; axe 0 serious o critical |
| DOP-06 | Análisis estático (privacidad-check y CAM-11) | Vitest | `U` y `npm run check:privacidad` | 0 hallazgos; fixtures que fallan donde deben |
| DOP-07 | Análisis estático de imports | Vitest | `U` | 100 % verde |
| DOP-08 | Análisis estático de textos legales | Vitest | `U` | 100 % verde |
| Todos | Puerta completa | `npm run check` | `npm run check` (CI, job `typescript`) | Verde |
