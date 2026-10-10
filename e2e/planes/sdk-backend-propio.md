# Plan E2E: front React + backend propio (motor-backend-embebido 1.5, sdk-integracion B.7)

Redactado a mano con el formato de `playwright-test-planner` (los agentes de Playwright no estaban disponibles en esta
sesión); el `playwright-test-healer` debe revisarlo en la próxima corrida con agentes.

- Aplicación: `examples/backend-express` compilado (`npm run build -w examples/backend-express`) y servido por su
  `servidor.mjs` en `http://localhost:4195` (mismo origen para el front y `POST /api/cedula`, motor real en proceso).
- Cámara: Chromium con `--use-file-for-fake-video-capture=e2e/videos/sinteticos/amarilla-1080p.y4m` (PERSONA_BASE).
- Proyectos: `backend-chromium` (Desktop Chrome) y `backend-pixel7` (Pixel 7).
- Esperas: siempre por condición (`expect(...).toHaveText` con tiempo límite), nunca `waitForTimeout`.

## Escenarios

1. `front-back` estricta (por omisión): `autoIniciar` abre la cámara, la fase llega a `resultado`, NUIP `9999123456`,
   `confiable` `true`, exactamente 1 petición `POST /api/cedula` con el campo `cliente`. axe: 0 serious/critical.
2. `back`: igual, 1 petición, sin campo `cliente` (el front no lee), `confiable` `true`.
3. `front`: `resultado` con `confiable` `false` y 0 peticiones a `/api/cedula`.
4. `front-back` auto con dispositivo débil (`navigator.deviceMemory = 1`): 1 petición sin `cliente`, `confiable` `true`.
5. `front-back` con `streaming=0`: la respuesta es `application/json` y el resultado es `confiable` `true`.
6. Consola sin `9999123456` en todos los escenarios.
