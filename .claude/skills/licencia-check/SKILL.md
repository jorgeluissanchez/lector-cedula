---
name: licencia-check
description: Política de licencias del proyecto (principio IV) y cómo comprobarla. Cárgala antes de añadir una dependencia, un modelo ONNX o un dataset.
---

# Licencias

## Comandos

```
npm run check:licencias                         # dependencias de producción + models/manifest.json
node tools/licencia-check.mjs --package <npm>   # antes de instalar
node tools/licencia-check.mjs --pip <paquete>   # paquetes Python (lista negra)
```

El hook `pre-bash` ejecuta la comprobación automáticamente ante `npm install` o `pip install`.

## Permitidas

MIT, MIT-0, ISC, 0BSD, BSD-2/3-Clause, Apache-2.0, MPL-2.0, CC0, CC BY, Unlicense, Zlib, BlueOak, Python/PSF. CC BY-SA solo para datos, revisando el share-alike sobre pesos derivados.

## Prohibidas en producción (decididas)

| Componente | Motivo |
|---|---|
| Ultralytics YOLO, fastmrz, alsenet mrz-scanner | AGPL-3.0 |
| Packs InsightFace (buffalo_l, antelopev2, buffalo_sc) | No comercial sin licencia |
| Pesos de Surya | RAIL-M |
| Qwen2.5-VL | No comercial (Qwen3-VL sí es Apache-2.0) |
| pyiqa | PolyForm Noncommercial |
| TruFor, DocScanner, DocTr | No comercial |
| DocXPand-25k como dato de entrenamiento | CC BY-NC-SA (el generador MIT sí se usa) |
| face-api.js, EasyOCR | Abandonados o sin mantenimiento |

## Pendientes

- Pesos de DocAligner: issue #13 del repo abierto el 2026-10-05.
- SIDTD: publicado con tres variantes CC.

## Modelos

Todo modelo descargado se declara en `models/manifest.json`:

```json
[{ "nombre": "minifasnet-v2", "licencia": "Apache-2.0", "fuente": "https://...", "uso": "produccion" }]
```

ML Kit (propietario y gratuito) solo se permite en la app nativa y declarado en el aviso de privacidad.
