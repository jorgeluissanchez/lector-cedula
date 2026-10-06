---
name: privacidad-check
description: Reglas de privacidad del proyecto (principio III, Ley 1581 de 2012) y cómo comprobarlas. Cárgala al tocar captura, servidor, logs, telemetría, almacenamiento o datos de prueba.
---

# Privacidad

## Comandos

```
npm run check:privacidad                     # todo el repositorio
node tools/privacidad-check.mjs --staged     # lo que se va a commitear (lo corre el hook pre-bash)
```

El hook `post-edit` también revisa cada archivo justo después de editarlo.

## Qué detecta la herramienta

- Archivos en `evals/real/` o carpetas `campo/`.
- Imágenes o vídeos fuera de carpetas `sinteticos/` o `especimenes/`.
- Fixtures JSON sin `"sintetico": true`.
- Persistencia de imágenes en `server/` (`cv2.imwrite`, `open(..., "wb")`, `Image.save`).
- `localStorage`, `sessionStorage` o `indexedDB` en código de producto.
- Escritura a disco en `packages/*/src` o `apps/*/src`.
- Logs del servidor con campos personales.
- `PubDSK_1` en código de producto.

Excepción justificada: `privacidad-ok: <razón>` en la misma línea. El revisor la audita.

## Qué no detecta (lo revisa el agente `revisor-privacidad`)

- Datos personales en mensajes de error o excepciones devueltas al cliente.
- Payload PDF417 completo retenido en memoria más tiempo del necesario o enviado al servidor.
- Telemetría con identificadores que permitan reidentificar.
- Falta de autorización expresa del titular en un endpoint.
- Tratamiento de menores (tarjeta de identidad) sin aviso reforzado.

## Diseño por defecto

Procesar en el dispositivo; el servidor solo en memoria; descartar AFIS, tarjeta decadactilar y biometría en el parser; respuesta con los campos mínimos necesarios.
