# Spec Delta

## Purpose

Ajustar `captura-camara` (cambio `captura-calidad-pwa`) a la lectura automática (OFF-19, decisión del usuario del 2026-10-07): `listo` deja de ser una pantalla estable y pasa a ser transitoria hacia `leyendo`. "Historial de pantallas" y "llegar a `listo`" se definen en las convenciones de `lectura-pwa-offline`: `listo` aparece en el historial de valores de `data-pantalla` registrado por la instrumentación. Los escenarios de CAM-04, CAM-07, CAL-11 y CAL-13 que dicen "llega a `listo`" siguen valiendo con esa convención y no cambian. CAM-12 "Worker diferido" sigue valiendo: cuenta las peticiones de la página, y la precarga del service worker no cuenta. Por OFF-22 (sin cédula no hay `listo`), los vídeos `nitida-1080p` y `nitida-720p` pasan a contener la cédula amarilla sintética de `PERSONA_BASE` (generada en `e2e/videos/cedulas.mjs`), así que su lectura termina en `resultado`.

## MODIFIED Requirements

### Requirement: CAM-01 Aplicación instalable con shell sin conexión
La PWA SHALL servir un manifiesto web válido y registrar un service worker que guarde en caché solo los recursos estáticos de la compilación, de modo que la pantalla `inicio` cargue sin conexión después de la primera visita. El service worker MUST NOT guardar ninguna otra respuesta.

#### Scenario: Manifiesto
- **WHEN** se pide `GET /manifest.webmanifest`
- **THEN** la respuesta es 200, se interpreta como JSON y contiene `"name": "Lector de cédula"`, `"short_name": "Cédula"`, `"lang": "es"`, `"start_url": "/"`, `"display": "standalone"` y en `icons` al menos una entrada con `"sizes": "192x192"` y otra con `"sizes": "512x512"`, ambas con `"type": "image/png"`

#### Scenario: Shell sin conexión
- **WHEN** se visita `/`, se espera a que `navigator.serviceWorker.controller` deje de ser `null`, se activa `context.setOffline(true)` y se recarga la página
- **THEN** el botón con nombre accesible "Iniciar cámara" es visible y `data-pantalla` vale `inicio`

#### Scenario: Caché limitada a recursos estáticos
- **WHEN** se completa el flujo desde "Iniciar cámara" hasta que `listo` aparece en el historial de pantallas con el vídeo `nitida-1080p` y se listan las claves de todas las cachés de `CacheStorage`
- **THEN** cada URL es del mismo origen y su ruta cumple `^/(index\.html|manifest\.webmanifest|sw\.js|iconos/[^/]+\.png|assets/[^/]+)?$`

#### Scenario: Worker de calidad precacheado
- **WHEN** se calcula la lista de precarga del service worker a partir de los nombres emitidos por la compilación
- **THEN** contiene `/`, `/index.html`, `/manifest.webmanifest`, los iconos y todos los archivos de `assets/`, incluido el chunk `assets/calidad.worker-*.js` (requisito offline, OFF-01 del cambio `pwa-lectura-offline`), y nada más

#### Scenario: Análisis sin conexión
- **WHEN** se visita `/`, se espera a que `navigator.serviceWorker.controller` deje de ser `null`, se activa `context.setOffline(true)`, se recarga y se pulsa "Iniciar cámara" con el vídeo `nitida-1080p`
- **THEN** `listo` aparece en el historial de pantallas y a continuación `data-pantalla` vale `leyendo` o una pantalla posterior de la lectura (OFF-19)

### Requirement: CAM-09 Accesibilidad de la captura
Cada pantalla MUST pasar axe con las etiquetas WCAG 2.0, 2.1 y 2.2 A y AA sin violaciones de impacto serious ni critical. El feedback MUST anunciarse en una única región `role="status"`, cada botón MUST medir al menos 44x44 px CSS y la guía MUST ser decorativa. `listo` es transitorio (OFF-19): su accesibilidad se comprueba en `leyendo`, que es lo que el usuario ve tras aceptar la captura.

#### Scenario: axe en cada pantalla
- **WHEN** se analiza con `@axe-core/playwright` y `withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])` cada una de las pantallas `inicio`, `activo`, `pausado`, `leyendo` y `error` (código `permiso-denegado`) en los dos dispositivos
- **THEN** el número de violaciones con `impact` igual a `serious` o `critical` es 0 en cada análisis

#### Scenario: Región de estado única
- **WHEN** `data-pantalla` vale `activo`
- **THEN** existe exactamente un elemento con `role="status"`, tiene `aria-live="polite"` y su texto es el feedback vigente de CAL-12

#### Scenario: Botones, guía, idioma y título
- **WHEN** se miden los botones visibles de cada pantalla y se inspeccionan la guía y el documento
- **THEN** cada botón tiene ancho y alto de 44 px CSS o más, la guía tiene `aria-hidden="true"`, el elemento `html` tiene `lang="es"` y el título es "Lector de cédula"

#### Scenario: Apariencia de las pantallas
- **WHEN** dentro del contenedor `mcr.microsoft.com/playwright:v1.63.0-noble` se toman capturas de pantalla de `inicio`, `leyendo` (con el Worker lector retenido por la prueba) y `error` (código `permiso-denegado`) con el `<video>` enmascarado, en los dos dispositivos
- **THEN** la diferencia con cada imagen de referencia es como máximo el 1 % de los píxeles

### Requirement: CAM-10 Ciclo de vida de la cámara
La PWA MUST detener todas las pistas y el análisis al llegar a `listo`, al pulsar "Cancelar" y cuando la página pasa a oculta. Tras ocultarse MUST mostrar la pantalla `pausado` y MUST reanudar solo cuando el usuario pulsa "Continuar".

#### Scenario: Pistas detenidas en listo
- **WHEN** la instrumentación guarda cada stream devuelto por `getUserMedia` y `listo` aparece en el historial de pantallas con `nitida-1080p`
- **THEN** cada pista guardada tiene `readyState` igual a `"ended"` y no existe ningún `<video>` con `srcObject` distinto de `null`, durante la lectura que sigue (OFF-19)

#### Scenario: Cancelar
- **WHEN** en `activo` se pulsa "Cancelar"
- **THEN** cada pista guardada tiene `readyState` igual a `"ended"` y `data-pantalla` vale `inicio`

#### Scenario: Página oculta y reanudación
- **WHEN** en `activo` la instrumentación redefine `document.visibilityState` como `"hidden"` y despacha `visibilitychange`, después lo redefine como `"visible"` y lo despacha, y por último se pulsa "Continuar"
- **THEN** tras ocultarse cada pista guardada tiene `readyState` `"ended"`, `data-pantalla` vale `pausado` y es visible el texto "Cámara en pausa"; volver a `"visible"` no añade llamadas a `getUserMedia`; tras "Continuar", el espía registra exactamente una llamada más y `data-pantalla` vale `activo`

### Requirement: CAM-11 Ningún frame persiste ni sale del dispositivo
Durante todo el flujo, la PWA MUST NOT enviar por red, guardar en el navegador ni codificar como archivo ningún frame ni captura (principio III). Las únicas peticiones permitidas son GET del mismo origen a los recursos estáticos de CAM-01. Los bytes de la captura MUST ponerse a cero al terminar la lectura, al pulsar "Leer otra", "Intentar de nuevo" o "Cancelar" y al ocultarse la página.

#### Scenario: Red durante el flujo completo
- **WHEN** con `nitida-1080p` se registran todas las peticiones del contexto, incluidas las del service worker, y todos los WebSockets, mientras se pulsa "Iniciar cámara", `listo` aparece en el historial, la lectura termina en `resultado`, se pulsa "Leer otra" y `listo` vuelve a aparecer en el historial
- **THEN** cada petición tiene método `GET`, el mismo origen que la PWA, `postData()` igual a `null` y una ruta que cumple la expresión de CAM-01, y el número de WebSockets es 0

#### Scenario: Almacenamiento tras el flujo
- **WHEN** termina el flujo del escenario anterior
- **THEN** `localStorage.length` es 0, `sessionStorage.length` es 0, `indexedDB.databases()` devuelve `[]`, el directorio raíz de `navigator.storage.getDirectory()` no tiene entradas, `context.cookies()` devuelve `[]` y las cachés cumplen el escenario "Caché limitada a recursos estáticos" de CAM-01

#### Scenario: Código fuente sin salidas de datos
- **WHEN** se analizan los archivos de `packages/capture/src/` y `apps/pwa/src/`
- **THEN** no aparece ninguno de `fetch(`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, `localStorage`, `sessionStorage`, `indexedDB`, `caches`, `getDirectory`, `createObjectURL`, `toBlob`, `toDataURL` ni `convertToBlob`, salvo `fetch(` y `caches` en el archivo del service worker y `convertToBlob` en `packages/capture/src/mrz/entorno.ts` (codificación PNG en memoria que el lector MRZ del cambio `leer-mrz-desde-imagen` entrega a Tesseract.js dentro del dispositivo; el resultado no se guarda ni se envía), y `npm run check:privacidad` termina con 0 hallazgos

#### Scenario: Borrado de la captura
- **WHEN** en Chromium real (Vitest browser) se libera una captura aceptada de 1920x1080
- **THEN** los 8294400 bytes de su buffer valen 0 y la captura informa `liberada: true`
