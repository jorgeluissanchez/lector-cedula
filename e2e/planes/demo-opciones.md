# Plan E2E: panel de opciones de la demo (demo-opciones, DOP-01 a DOP-05)

Proyectos `demo-chromium` (Desktop Chrome) y `demo-pixel7` (Pixel 7) sobre la PWA compilada con `VITE_DEMO=true` en el
puerto 4175 (y la normal en 4173 para "Build normal sin panel"). Cámara simulada con vídeos sintéticos de
`npm run e2e:videos` (PERSONA_BASE y PERSONA_TI, NUIP 9999123456); cada archivo elige su vídeo con `test.use`. Fecha
fija 2026-10-06 en Bogotá. Esperas solo por condición. Comando: `E2E_SERVIDORES=pwa npx playwright test e2e/demo
--project=demo-chromium --project=demo-pixel7 --workers=1` (job `e2e-demo` de CI).

| Escenario | Archivo | Vídeo | Pasos | Resultado esperado |
|---|---|---|---|---|
| DOP-01 Demo con panel | `opciones-panel.spec.ts` | por defecto | abrir `/` | botón "Opciones" `aria-expanded="false"` tras la nota MA-02 intacta; región oculta |
| DOP-01 Abrir y cerrar | idem | por defecto | pulsar "Opciones" dos veces | 3 radios, 2 casillas con descripción, texto de preferencias; se oculta al cerrar |
| DOP-01 Valores por omisión | idem | por defecto | abrir el panel | "Pantalla completa" marcado, casillas sin marcar y habilitadas, `localStorage` vacío |
| DOP-01 Build normal sin panel | idem | por defecto | abrir 4173 | sin botón ni región |
| DOP-01 Accesibilidad | idem | por defecto | panel abierto, axe | 0 serious o critical |
| DOP-02a Persistencia | idem | por defecto | elegir recuadro vertical, recargar | radio marcado, 1 clave con el JSON literal; volver a omisión borra la clave |
| DOP-05 Forzado por la URL | idem | por defecto | `/?debug=1`, abrir panel | "Señal de fraude" marcada y deshabilitada |
| DOP-04a TI apagada por omisión | idem | por defecto | abrir `/` | sin enlace "Autorización del representante legal" |
| DOP-04 Página de la autorización | idem | — | GET de las dos páginas | 200 con "Ley 1581 de 2012"; la política enlaza la página |
| DOP-03 Pantalla completa | `opciones-amarilla.spec.ts` | `amarilla-1080p` | leer sin tocar el panel | `data-forma="pantalla-completa"`, `contain`, vídeo del tamaño de la ventana, guía horizontal, NUIP |
| DOP-03 Recuadro horizontal + DOP-02a sin datos | idem | `amarilla-1080p` | elegir recuadro horizontal y leer | recuadro 320x200, `cover`, guía horizontal dentro del vídeo, NUIP; `localStorage` solo con la clave y sin el NUIP |
| DOP-05 Fraude apagado | idem | `amarilla-1080p` | leer | sin `fraude.worker`, sin `data-riesgo-nivel` ni `section.riesgo` |
| DOP-05 Fraude encendido | idem | `amarilla-1080p` | marcar "Señal de fraude" y leer | `data-riesgo-nivel` bajo/medio/alto, texto de la Registraduría, NUIP, axe 0 |
| DOP-03 Recuadro vertical (amarilla) | `opciones-de-pie-amarilla.spec.ts` | `amarilla-de-pie-vertical` | teléfono de pie, elegir recuadro vertical y leer | pista 1080x1920, recuadro 260x400, `cover`, texto "de pie", guía vertical dentro del vídeo, NUIP |
| DOP-03 Recuadro vertical (digital) | `opciones-de-pie-digital.spec.ts` | `digital-de-pie-vertical` | igual | igual |
| DOP-04a TI sin autorizar | `opciones-ti.spec.ts` | `ti-amarilla-1080p` | marcar TI (aparece el enlace), leer, Cancelar | `autorizacion-representante`, casilla sin marcar, "Continuar" deshabilitado, sin campos ni NUIP, axe 0; vuelve a `inicio`; `localStorage` solo con la clave |
| DOP-04a TI con autorización | idem | `ti-amarilla-1080p` | marcar la casilla y Continuar | `resultado` con `data-tipo-documento="tarjeta-identidad"` |
| DOP-04a sin la TI del panel | idem | `ti-amarilla-1080p` | leer sin tocar el panel | `error-lectura` `menor-de-edad`, sin campos ni NUIP (como hoy) |

La escena de `activo` se registra en cada frame (`vigilarEscena`), porque la lectura puede terminar antes de poder
medirla con una espera: forma, cajas de la guía, del vídeo y del recuadro, `object-fit`, tamaño de la pista y el texto
"de pie". Teléfono de pie: mismo recurso que `e2e/login/ayudas.ts` (`telefonoDePie`, intercambia `width` y `height`).

Regresión del build normal en el mismo job: `e2e/lectura/lectura.spec.ts`, `lectura-digital.spec.ts`, `riesgo.spec.ts`,
`tarjeta-identidad.spec.ts` y `e2e/captura/guia.spec.ts` (la sesión de captura cambió).
