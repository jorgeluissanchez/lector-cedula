# Plan E2E: ejemplos headless por framework (sdk-integracion, tarea 3b.4)

Receta de `playwright-test-planner`. Proyecto `sdk-ejemplos` (Chromium escritorio, cámara falsa con `amarilla-1080p`).
Cada ejemplo se sirve compilado: `vanilla` 4190, `react` 4191, `next` 4192 (`next build` + `next start`), `angular`
4193 (`ng build`, zoneless), `vue` 4194. Ninguno usa `servidor`.

| Escenario (spec) | Pasos | Esperado |
|---|---|---|
| SDK-12 Lectura en cada framework | Abrir, pulsar `[data-prueba="iniciar"]`, esperar `resultado` | `[data-prueba="nuip"]` = `9999123456` |
| SDK-12 UI distinta | Tras iniciar (fase `activo` o posterior), leer `border-color`, `border-radius` de `[data-prueba="guia"]` y el texto de `iniciar` | Igual a `examples/<x>/estilo-esperado.json`; tuplas distintas dos a dos; sin `<lector-cedula>` ni hojas de `@lector-cedula/*` |
| SDK-12 Next sin errores de hidratación | Cargar `/` de Next y leer | Consola sin `Hydration`, `window is not defined`, `navigator is not defined`, `document is not defined` |
| SDK-37 Lectura con la red cortada | `precargar`, `context.setOffline(true)`, leer | `resultado` y NUIP |
| SDK-37 Cero peticiones a otros orígenes | Registrar `page.on("request")` en carga y lectura | Todas del origen del ejemplo, ningún `POST` |

Esperas por condición (`toHaveText` con `timeout`), nunca `waitForTimeout`. `examples/html` llega con la tarea 3c.2.
