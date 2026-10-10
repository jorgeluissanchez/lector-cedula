## ADDED Requirements

### Requirement: DOP-01 Panel de opciones en la demo
Con `VITE_DEMO=true`, la pantalla `inicio` MUST mostrar, después de la nota "Aviso de demostración" (MA-02, intacta y primera del panel), un botón "Opciones" con `aria-expanded` y `aria-controls="panel-opciones"` que muestra y oculta la región `#panel-opciones` "Opciones de la demostración", con los controles y textos literales del escenario "Abrir y cerrar". Sin `VITE_DEMO` (o con `false`), el botón y la región MUST NOT existir.

#### Scenario: Demo con panel
- **WHEN** se abre `/` en el build con `VITE_DEMO=true`
- **THEN** existe el botón "Opciones" con `aria-expanded="false"`, la nota "Aviso de demostración" lo precede en el documento y conserva el texto literal de MA-02, y la región "Opciones de la demostración" no está visible

#### Scenario: Abrir y cerrar
- **WHEN** se pulsa "Opciones" y después se pulsa otra vez
- **THEN** tras la primera pulsación `aria-expanded` vale `"true"` y la región es visible con: el grupo de radios "Forma de la cámara" con "Pantalla completa", "Recuadro horizontal" y "Recuadro vertical (cédula de pie)"; la casilla "Admitir tarjeta de identidad (menores de edad)" descrita por "Al leer el documento de un menor se pedirá la autorización de su representante legal antes de mostrar los datos."; la casilla "Señal de fraude" descrita por "Señal orientativa calculada en tu dispositivo; no confirma la autenticidad del documento."; y el texto "Estas preferencias se recuerdan en este navegador. Ningún dato del documento se guarda."; tras la segunda, `aria-expanded` vale `"false"` y la región no está visible

#### Scenario: Valores por omisión
- **WHEN** se abre el panel con el almacenamiento vacío, sin `?debug=1`, en un build sin `VITE_ADMITIR_TI` ni `VITE_FRAUDE`
- **THEN** está marcado "Pantalla completa", las dos casillas están sin marcar y habilitadas, y `localStorage.length` es 0

#### Scenario: Build normal sin panel
- **WHEN** se abre `/` en el build sin `VITE_DEMO`
- **THEN** no existe el botón "Opciones" ni la región "Opciones de la demostración"

#### Scenario: Accesibilidad
- **WHEN** axe (wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa) analiza `inicio` del build demo con el panel abierto, en Chromium escritorio y en Pixel 7
- **THEN** no hay violaciones `serious` ni `critical`

### Requirement: DOP-02 Formato de las preferencias
`apps/pwa/src/preferencias.ts` MUST exportar `PREFERENCIAS_POR_OMISION`, `CLAVE_PREFERENCIAS` (`"lector-cedula:demo-opciones"`), `leerPreferencias(almacen)` y `guardarPreferencias(almacen, preferencias)` (`almacen`: `{ getItem, setItem, removeItem }` o `null`), que nunca lanzan. Se guarda `JSON.stringify({ forma, tarjetaIdentidad, fraude })` y nada más; con los valores de omisión la clave se borra. Al leer, cada campo inválido toma su valor de omisión.

#### Scenario: Guardar
- **WHEN** se llama `guardarPreferencias(almacen, { forma: "recuadro-vertical", tarjetaIdentidad: true, fraude: false })`
- **THEN** `almacen.setItem` se llama una vez con `"lector-cedula:demo-opciones"` y `'{"forma":"recuadro-vertical","tarjetaIdentidad":true,"fraude":false}'`

#### Scenario: Valores por omisión borran la clave
- **WHEN** se llama `guardarPreferencias(almacen, { forma: "pantalla-completa", tarjetaIdentidad: false, fraude: false })`
- **THEN** `almacen.removeItem("lector-cedula:demo-opciones")` se llama una vez y `setItem` no se llama

#### Scenario: Valores inválidos
- **WHEN** `getItem` devuelve `'{"forma":"cuadrado","tarjetaIdentidad":"si","fraude":true,"nuip":"9999123456"}'`, y aparte `"no es json"`, `"null"`, `"[1]"` y `null`
- **THEN** el primero da `{ forma: "pantalla-completa", tarjetaIdentidad: false, fraude: true }` (sin la clave `nuip`) y los demás dan `PREFERENCIAS_POR_OMISION`

#### Scenario: Almacén no disponible
- **WHEN** `almacen` es `null`, o `getItem`, `setItem` y `removeItem` lanzan `DOMException` (`SecurityError`, `QuotaExceededError`)
- **THEN** `leerPreferencias` devuelve `PREFERENCIAS_POR_OMISION` y `guardarPreferencias` termina sin lanzar

#### Scenario: Ida y vuelta
- **WHEN** para cualquier combinación de forma (3 valores) y booleanos (fast-check, numRuns >= 1000) se guarda en un almacén en memoria y se vuelve a leer
- **THEN** se obtiene la misma combinación, y el valor guardado, si existe, es un objeto JSON con exactamente las claves `forma`, `tarjetaIdentidad` y `fraude`

### Requirement: DOP-02a Preferencias recordadas en la demo
La demo MUST leer las preferencias al cargar y guardarlas solo cuando el usuario cambia una opción del panel. Ningún dato de lectura, imagen ni resultado MUST escribirse. Fuera de la demo la PWA MUST NOT leer ni escribir preferencias.

#### Scenario: Persistencia en la demo
- **WHEN** en el build demo se elige "Recuadro vertical (cédula de pie)" y se recarga la página
- **THEN** tras recargar el radio "Recuadro vertical (cédula de pie)" está marcado, `localStorage` tiene exactamente 1 clave, `lector-cedula:demo-opciones`, con valor `'{"forma":"recuadro-vertical","tarjetaIdentidad":false,"fraude":false}'`; `sessionStorage.length` es 0 e `indexedDB.databases()` devuelve `[]`

#### Scenario: Ningún dato de lectura en el almacenamiento
- **WHEN** en el build demo, con una opción cambiada, se completa una lectura de `amarilla-1080p`
- **THEN** `localStorage` sigue teniendo solo `lector-cedula:demo-opciones` y su valor no contiene `9999123456`

### Requirement: DOP-03 Forma de la cámara
La pantalla `activo` MUST mostrar la cámara según la forma elegida (por omisión y fuera de la demo, `pantalla-completa`) con `data-forma` en `.escena`. `pantalla-completa` MUST NOT cambiar respecto a hoy (vídeo `object-fit: contain`, guía de CAM-08, ninguna guía enviada al Worker). `recuadro-horizontal` es `.recuadro` de 320x200 px y `recuadro-vertical` de 260x400 px con el texto "Sostén la cédula de pie, sin girar el teléfono.", ambos con `object-fit: cover`.

#### Scenario: Pantalla completa como hoy
- **WHEN** en el build demo con la forma por omisión se lee `amarilla-1080p`
- **THEN** `.escena` tiene `data-forma="pantalla-completa"`, el vídeo tiene `object-fit: contain`, la guía es más ancha que alta, y el resultado muestra el número de documento `9999123456`

#### Scenario: Recuadro horizontal
- **WHEN** en el build demo se elige "Recuadro horizontal" y se lee `amarilla-1080p`
- **THEN** en `activo` `.escena` tiene `data-forma="recuadro-horizontal"`, `.recuadro` mide 320x200, el vídeo tiene `object-fit: cover`, la guía es más ancha que alta y está dentro del vídeo, y el resultado muestra `9999123456`

#### Scenario: Recuadro vertical con la cédula de pie
- **WHEN** en el build demo se elige "Recuadro vertical (cédula de pie)" con el teléfono de pie (pista 1080x1920) y se lee `amarilla-de-pie-vertical`, y aparte `digital-de-pie-vertical`
- **THEN** en `activo` `.escena` tiene `data-forma="recuadro-vertical"`, `.recuadro` mide 260x400, es visible "Sostén la cédula de pie, sin girar el teléfono.", la guía es más alta que ancha y está dentro del vídeo, y los dos resultados muestran `9999123456`

### Requirement: DOP-03a Guía de los recuadros
En los recuadros, `guiaDeForma(forma, medidas)` de `apps/pwa/src/forma.ts` MUST calcular la guía con `guiaEnVideo` de `@lector-cedula/web` (región visible con `cover`, orientación del recuadro); la sesión MUST enviarla al Worker de calidad en cada análisis y en la revalidación (SDK-61) y usarla como cuadrilátero de la captura. En pantalla se pinta con `guiaEnElemento`. Con `pantalla-completa` devuelve `undefined`. La lectura sigue siendo la de OFF-28.

#### Scenario: Guía de cada forma
- **WHEN** se llama `guiaDeForma(forma, medidas)` con un vídeo de 1080x1920 en un elemento de 260x400, y con un vídeo de 1920x1080 en un elemento de 320x200
- **THEN** `recuadro-vertical` con el primero da `{ x: 69, y: 213, ancho: 942, alto: 1494 }`; `recuadro-horizontal` con el segundo da una guía más ancha que alta dentro de la región visible; `pantalla-completa` da `undefined` con ambos

### Requirement: DOP-04 Tarjeta de identidad desde el panel
Amplía OD-30 y OD-35 solo para la demo. `apps/pwa/src/opciones.ts` MUST exportar `tiDisponible(admitirTi, demo)` (`admitirTi || demo`: decide si se compilan el texto y la página de la autorización del representante y el enlace de la política) y `tiEfectiva({ compilacion, demo, preferencia })` (`compilacion || (demo && preferencia)`), que la sesión pasa a la lectura en cada captura. Con `VITE_ADMITIR_TI=true` la casilla aparece marcada y deshabilitada.

#### Scenario: Tabla de la TI efectiva
- **WHEN** se evalúa `tiEfectiva` con las 8 combinaciones de `compilacion`, `demo` y `preferencia`
- **THEN** es `true` exactamente en `(true, *, *)` y en `(false, true, true)`; y `tiDisponible` es `false` solo con `(false, false)`

#### Scenario: Página de la autorización en la demo
- **WHEN** se pide `/assets/autorizacion-representante-ti.html` y `/assets/politica-tratamiento.html` al build demo
- **THEN** la primera responde 200 con `Ley 1581 de 2012` y la segunda contiene `<a href="/assets/autorizacion-representante-ti.html">`

### Requirement: DOP-04a Menores con la TI del panel
Con la TI efectiva, una lectura de menor MUST ir a `autorizacion-representante` (OD-34b sin cambios: casilla sin marcar, "Continuar" deshabilitado, "Cancelar" descarta, datos solo en memoria, OFF-24) e `inicio` MUST mostrar el enlace "Autorización del representante legal". Sin ella, la PWA MUST comportarse como hoy con `VITE_ADMITIR_TI` apagado.

#### Scenario: TI apagada por omisión
- **WHEN** en el build demo, sin cambiar el panel, se abre `inicio`
- **THEN** no existe el enlace "Autorización del representante legal" en `inicio`

#### Scenario: TI encendida desde el panel, sin autorizar
- **WHEN** en el build demo se marca "Admitir tarjeta de identidad (menores de edad)" y se lee `ti-amarilla-1080p`
- **THEN** `inicio` muestra el enlace "Autorización del representante legal" antes de leer; la lectura llega a `autorizacion-representante` con la casilla "Soy el representante legal del menor y autorizo el tratamiento" sin marcar y "Continuar" deshabilitado; no hay ningún `dd[data-campo]` ni el texto `9999123456`; axe no reporta violaciones serious ni critical; "Cancelar" vuelve a `inicio` sin campos, y `localStorage` solo tiene `lector-cedula:demo-opciones`

#### Scenario: TI encendida desde el panel, con autorización
- **WHEN** en el mismo flujo se marca la casilla del representante y se pulsa "Continuar"
- **THEN** `data-pantalla` vale `resultado` y `data-tipo-documento` vale `tarjeta-identidad`

### Requirement: DOP-05 Señal de fraude desde el panel
Amplía FRA-21: además de `VITE_FRAUDE=true` y `?debug=1`, en la demo la señal MUST activarse con la casilla "Señal de fraude". `apps/pwa/src/opciones.ts` MUST exportar `fraudeEfectivo({ forzado, demo, preferencia })` (`forzado || (demo && preferencia)`, con `forzado = fraudeActivo(VITE_FRAUDE, location.search)`). Encendida rige FRA-17 y FRA-20; apagada, "Señal apagada por defecto". Con `forzado`, la casilla aparece marcada y deshabilitada.

#### Scenario: Tabla del fraude efectivo
- **WHEN** se evalúa `fraudeEfectivo` con las 8 combinaciones de `forzado`, `demo` y `preferencia`
- **THEN** es `true` exactamente en `(true, *, *)` y en `(false, true, true)`

#### Scenario: Fraude apagado por omisión
- **WHEN** en el build demo, sin cambiar el panel, se lee `amarilla-1080p`
- **THEN** no se solicita `fraude.worker`, `section.resultado` no tiene `data-riesgo-nivel` y no existe `section.riesgo`

#### Scenario: Fraude encendido desde el panel
- **WHEN** en el build demo se marca "Señal de fraude" y se lee `amarilla-1080p`
- **THEN** `section.resultado` tiene `data-riesgo-nivel` con `bajo`, `medio` o `alto`, el bloque de riesgo contiene "la autenticidad solo la confirma la Registraduría", el número de documento `9999123456` sigue visible y axe no reporta violaciones serious ni critical

#### Scenario: Forzado por la URL
- **WHEN** en el build demo se abre `/?debug=1` y se abre el panel
- **THEN** la casilla "Señal de fraude" está marcada y deshabilitada

### Requirement: DOP-06 Excepción acotada de almacenamiento
Amplía el escenario "Código fuente sin salidas de datos" de CAM-11 y "Análisis estático" de OFF-11: el único almacenamiento del navegador permitido en `apps/pwa/src` y `packages/capture/src` MUST ser `localStorage` en `apps/pwa/src/preferencias.ts`. `sessionStorage`, `indexedDB` y `document.cookie` siguen prohibidos también allí, y `localStorage` en otro archivo sigue siendo un hallazgo. OFF-11 se mantiene: ningún dato leído ni imagen se escribe.

#### Scenario: Excepción solo en preferencias.ts
- **WHEN** `revisarArchivo` de `tools/privacidad-check.mjs` revisa `apps/pwa/src/preferencias.ts` con `localStorage.getItem(k)`, el mismo archivo con `sessionStorage.getItem(k)`, y `apps/pwa/src/App.tsx` con `localStorage.getItem(k)`
- **THEN** el primero no tiene hallazgos y los otros dos tienen 1 hallazgo OFF-11 cada uno

#### Scenario: CAM-11 con la excepción
- **WHEN** se ejecuta la prueba CAM-11 "Código fuente sin salidas de datos"
- **THEN** no hay hallazgos y su tabla de excepciones contiene `apps/pwa/src/preferencias.ts` solo con `localStorage`

### Requirement: DOP-07 La forma de cámara consume el núcleo
Primer paso de SDK-35 (tarea 3.6 de `sdk-integracion`): `apps/pwa/src/forma.ts` MUST importar `guiaEnVideo` y `guiaEnElemento` de `@lector-cedula/web` (API pública) y `apps/pwa/package.json` MUST declarar `@lector-cedula/web` como dependencia. Ningún archivo de `apps/pwa/src` MUST importar rutas internas del paquete.

#### Scenario: Imports del núcleo
- **WHEN** se analizan los imports de `apps/pwa/src/**/*.{ts,tsx}` y `apps/pwa/package.json`
- **THEN** `forma.ts` importa `guiaEnVideo` y `guiaEnElemento` desde `"@lector-cedula/web"`, ningún import contiene `packages/web/src` ni `@lector-cedula/web/src`, y `dependencies` tiene `"@lector-cedula/web": "0.1.0"`

### Requirement: DOP-08 Textos legales del panel
`docs/legal/CHECKLIST-CUMPLIMIENTO.md` (fila de la tarjeta de identidad) y la sección de la tarjeta de identidad de `docs/legal/politica-tratamiento-datos.md` MUST nombrar la casilla del panel de la demo (`VITE_DEMO=true`) como otra forma de activar la TI, sujeta a la misma revisión del abogado que `VITE_ADMITIR_TI`.

#### Scenario: Checklist y política
- **WHEN** una prueba de Vitest lee los dos archivos
- **THEN** la fila del checklist que contiene `LECTOR_ADMITIR_TI` contiene también `VITE_DEMO` y `abogado`, y la sección "Tarjeta de identidad (opcional, desactivada por defecto)" de la política contiene `VITE_DEMO`
