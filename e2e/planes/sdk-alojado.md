# Plan E2E: página alojada `/v/{token}` (sdk-integracion, SDK-14, tareas 4.1 y 4.3)

Comando `E(alojado)`:

```
node e2e/alojada/imagen.mjs            # api-pruebas con el árbol de trabajo, puerto 8010 (proyecto lector-alojado)
E2E_SIN_SERVIDORES=1 npx playwright test e2e/sdk/alojado.spec.ts --project=sdk-chromium --project=sdk-pixel7 --workers=1
node e2e/alojada/imagen.mjs --bajar
```

Entorno: la sesión se crea con `@lector-cedula/servidor` y `KT`. `hosted_url` lleva el dominio de la spec y Playwright
lo enruta al contenedor sin cambiar el origen (CSP, mismo origen de `upload.url` y contexto seguro reales).
`https://app-a.example` responde con una página mínima. Cámara: `amarilla-1080p.y4m`. Receptor de webhooks en el host,
puerto 8096 (incluido en `WEBHOOK_DESTINOS_PRUEBA` de `api-pruebas`).

| Escenario | Pasos | Comprobación |
|---|---|---|
| Flujo completo con retorno | crear sesión con `return_url` y `webhook_url`, abrir `hosted_url`, aceptar el aviso | URL final `https://app-a.example/volver?validation_id=<id>&estado=completada`, sin fragmento, sin token ni `9999123456`; una sola subida con la parte `front` (4.3); `status` `success`; webhook recibido y aceptado por `verificarWebhook` |
| Aviso de autorización | abrir `hosted_url` | `[data-aviso="autorizacion"]` con `2026-10-01` antes de `getUserMedia` (0 llamadas); axe sin serious ni critical |
| Cancelación | aceptar, cancelar en captura | `estado=cancelada`; la validación sigue `pending` |
| Token alterado y cabeceras | último carácter cambiado | `data-pantalla="sesion-invalida"`, 0 llamadas a `getUserMedia`; `no-store`, `no-referrer` y CSP sin `unsafe-eval` en el token válido y en el alterado; axe |
| Retorno a deeplink | sesión con `com.ejemplo.appa://lector/retorno` | CDP `Page.frameRequestedNavigation` registra `...?validation_id=<id>&estado=completada` |

Fuera del E2E (cubiertos por pytest, `S`): "Token vencido" (el reloj del contenedor no se puede adelantar) y el aviso
reforzado de la tarjeta de identidad (el contrato aún no tiene un `document_type` de tarjeta de identidad).
