---
name: fixture-sintetico
description: Cómo crear datos de prueba sintéticos (payloads PDF417, líneas MRZ, fixtures de eval) sin usar datos de personas reales. Cárgala al escribir pruebas o fixtures de parsers.
---

# Fixtures sintéticos

## Reglas (principio III)

- Personas ficticias siempre. Usa nombres y números claramente inventados; los NUIP sintéticos empiezan por `9999` para que sean reconocibles.
- Ningún payload copiado de una cédula real. Los payloads publicados en repos (Eitol, fgardila) sirven como referencia de estructura, no como fixture.
- Todo fixture JSON en `evals/fixtures/` lleva `"sintetico": true`. Sin esa marca, `privacidad-check` y `eval-campo` fallan.
- Un archivo de prueba que contenga `PubDSK_1` debe incluir el comentario `// fixture-sintetico`.
- Imágenes generadas solo en carpetas `sinteticos/`.

## Formato de un fixture de eval

```json
{
  "sintetico": true,
  "tipo": "<nombre registrado en evals/runners/registro.mjs>",
  "descripcion": "qué variante cubre",
  "entrada": "...",
  "esperado": { "campo": "valor" }
}
```

Ubicación: `evals/fixtures/sinteticos/<tipo>/<caso>.json`. Los casos lentos (imágenes grandes) van en `evals/fixtures/lentos/` y no corren en `--quick`.

## Generadores (Fase 1)

- PDF417: persona ficticia -> bytes con cabecera de 2 dígitos + AFIS ficticio, run de NUL, `PubDSK_1`, bloque de nombres con relleno 0x00, bloque demográfico, cola binaria aleatoria. Variantes: trama completa, trama con NUL truncados (Windows), sin `PubDSK`, fecha primero.
- Imagen PDF417: writer de `zxing-wasm` (build completo) más distorsiones (rotación, blur, glare, perspectiva).
- MRZ TD1: calcula los dígitos de control ICAO 9303 (pesos 7, 3, 1; `<` = 0; A=10 ... Z=35). Variantes con errores OCR-B inyectados y con cada dígito de control alterado.

Pruebas de propiedad con `fast-check`: genera personas, codifica, decodifica y exige ida y vuelta idéntica.
