# Proposal

## Why

El servidor de respaldo (Fase 4 de `PLAN.md`) ya expone el contrato `api-validaciones`, pero en modo live no tiene motor: toda subida con `sk_live_` responde `503 engine-unavailable` (AV-22). La PWA no puede usarlo como respaldo cuando su lectura en el dispositivo falla. Este cambio añade el motor real: interpreta lo que lee un lector de imagen con los mismos parsers TypeScript del cliente, ejecutados con Node dentro del contenedor, y traduce el resultado a estados, checks y documento del contrato sin cambiarlo.

## What Changes

- Intérprete `server/interprete/interpretar.mjs`: un proceso Node de corta vida por subida que recibe por la entrada estándar el payload PDF417 o las 3 líneas MRZ y devuelve por la salida estándar el resultado de `@lector-cedula/parsers`. Sin archivos, sin red, sin datos en los argumentos.
- La imagen Docker del servidor compila `packages/parsers` desde el código fuente y copia Node 24 (MIT) y el resultado compilado. TypeScript (Apache-2.0) solo se usa en la etapa de compilación.
- `MotorReal` en `server/app/motor_real.py`: puerto `Lector` (imagen a payload o líneas), puerto `Interprete` y la tabla que traduce el resultado de los parsers a `status`, `declined_reason`, `checks` y `document` del contrato.
- El modo live usa `MotorReal` solo cuando hay un `Lector` configurado; sin lector, AV-22 no cambia (503).
- Los lectores concretos con zxing-cpp 3.1.1 (re-decodificación PDF417) y RapidOCR 3.9 (OCR de la MRZ) quedan como tareas **bloqueadas** hasta la aprobación del agente `revisor-licencias`: no se instala nada sin ella.

Fuera de alcance: document liveness, calidad de imagen y comparación facial reales (Fase 5), persistencia, cambios del contrato OpenAPI y del cliente (`apps/pwa`, `packages/capture`).

## Capabilities

### New Capabilities
- `motor-servidor`: motor real del servidor de respaldo que interpreta PDF417 y MRZ con los parsers TypeScript y produce el resultado del contrato `api-validaciones`.

### Modified Capabilities
(ninguna; el contrato `api-validaciones` no cambia)

## Impact

- Código: `server/app/motor_real.py`, `server/app/puertos.py`, `server/interprete/`, `server/Dockerfile`, `server/compose.yaml`, `server/tests/`.
- Imagen: Node 24 y los parsers compilados; contexto adicional `parsers` (`../packages/parsers`) en Compose.
- Privacidad: el `revisor-privacidad` debe revisar el cambio (el intérprete recibe datos personales del documento por tubería).
- Licencias: el `revisor-licencias` debe aprobar zxing-cpp y RapidOCR (con sus modelos) antes de las tareas del grupo 4.
