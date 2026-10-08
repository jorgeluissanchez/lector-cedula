# Spec Delta

## Purpose

Ajustar `calidad-captura` (cambio `captura-calidad-pwa`) a la lectura en el dispositivo: este cambio sí implementa e invoca la interfaz de lector de códigos (solo PDF417, OFF-07), al llegar a `listo` (OFF-19), y el service worker precachea `zxing_reader.wasm` en su `install` (OFF-01). El escenario "Ningún decodificador en este cambio" pasa a exigir que no se descargue ni ejecute ningún decodificador antes de la captura aceptada.

## MODIFIED Requirements

### Requirement: CAL-15 Interfaz de lector de códigos
El paquete MUST exponer una interfaz de lector de códigos (firma en design.md, decisión 7) que recibe una captura aceptada y devuelve los bytes crudos de cada código. Su formato MUST admitir solo `"pdf417"`, porque el QR de la cédula digital no se decodifica (principio V). La única implementación es el lector PDF417 del Worker lector (`pwa-lectura-offline`, OFF-07), que solo se invoca tras la captura aceptada.

#### Scenario: Contrato de tipos
- **WHEN** se ejecuta la comprobación de tipos de Vitest sobre `packages/capture`
- **THEN** un lector que declara el formato `"pdf417"` y devuelve `Uint8Array` satisface la interfaz, y uno que declara `"qr"` produce un error esperado (`@ts-expect-error`)

#### Scenario: Ningún decodificador antes de la captura
- **WHEN** se registran las peticiones de la página y de sus Workers (no las del service worker) desde la carga de `/` hasta que `data-pantalla` vale `activo` con `nitida-1080p`
- **THEN** ninguna ruta contiene `zxing`, `barcode`, `lector.worker` ni termina en `.wasm`
