# Plan E2E: ejemplo de login con recuadro embebido (sdk-integracion, SDK-62 y SDK-64)

Proyectos `login-chromium` (Desktop Chrome) y `login-pixel7` (Pixel 7) sobre `examples/login` compilado en el puerto 4196.
Cámara simulada con vídeos sintéticos de `npm run e2e:videos` (PERSONA_BASE, NUIP 9999123456). Cada describe elige su
vídeo con `test.use({ launchOptions })`. Esperas solo por condición (`expect` con `toHaveText`/`poll`), nunca por tiempo.

| Escenario | Vídeo | Pasos | Resultado esperado |
|---|---|---|---|
| Amarilla de pie, recuadro 260x400 | `amarilla-de-pie-vertical` (1080x1920) | `?recuadro=vertical`, "Escanear cédula" | recuadro 260x400, guía más alta que ancha dentro del vídeo, `resultado`, NUIP, `pdf417` |
| Digital de pie, recuadro 260x400 | `digital-de-pie-vertical` | igual | `resultado`, NUIP, `mrz-td1` |
| Redimensionar en `activo` | `sin-documento-1080p` | iniciar, cambiar el recuadro a 320x200 | la guía cambia y queda dentro del vídeo; la fase sigue `activo`/`listo` |
| Amarilla, recuadro 320x200 | `amarilla-1080p` | `?recuadro=horizontal` | recuadro 320x200, guía más ancha que alta, `resultado`, NUIP |
| Accesibilidad | `amarilla-1080p` | axe en las dos variantes | 0 violaciones `serious`/`critical` (WCAG 2.1 A y AA) |
| Autorización del titular | `amarilla-1080p` | en las dos variantes: cargar, marcar y desmarcar la casilla | sin marcar al cargar y "Escanear cédula" deshabilitado; se habilita al marcar y se deshabilita al desmarcar; fase `inicio` |

En las lecturas, "Escanear cédula" se pulsa tras marcar la casilla de autorización (`autorizarYEscanear`), todas las peticiones de la página van al origen del preview y al final `localStorage`, `sessionStorage` e `indexedDB.databases()` están vacíos (`vigilarPrivacidad`, patrón de `e2e/captura/privacidad.spec.ts`). En todos: el vídeo conserva `object-fit: cover` sin estilos en línea añadidos y la consola no contiene el NUIP.

Teléfono de pie (`telefonoDePie` en `e2e/login/ayudas.ts`): la cámara falsa de Chromium de escritorio no rota y, con las
restricciones de CAM-03 (`ideal` 1920x1080) sobre un archivo de 1080x1920, recorta a 1080x1080 y deja la cédula de pie
fuera del frame. En los dos escenarios de pie se intercambian `width` y `height` de las restricciones que pide el núcleo,
como hace Chrome en Android al sostener el teléfono de pie, y se comprueba que la pista es de 1080x1920 (SDK-63).
