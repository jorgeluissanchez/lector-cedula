## Why

Prueba con una foto real (2026-10-07): el usuario envió un recorte que contiene solo las 3 líneas de la MRZ de su cédula digital. `localizarFranjaMrz` solo propone candidatos en la parte inferior (proyección en la mitad inferior y el 40 % inferior), así que en un recorte pierde la primera línea y la CLI responde `documento-no-encontrado`.

## What Changes

- LMI-10 (ADDED): `localizarFranjaMrz` añade siempre, al final, el candidato `"imagen-completa"` (toda la imagen), para fotos que ya son el recorte de la MRZ.

## Impact

- `packages/capture/src/mrz/localizar.ts` y sus pruebas. Archivar después de `leer-mrz-desde-imagen`.
