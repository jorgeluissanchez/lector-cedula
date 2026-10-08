## Why

El listón comercial (skill `benchmark-comercial`, punto 8 de `docs/investigacion/02-benchmark-comercial.md`: Microblink, Didit y Truora leen TI, CE y pasaporte) exige multi-documento. Hoy el lector solo admite la cédula de ciudadanía (amarilla PDF417 y digital MRZ TD1 `IC`+`COL`) de mayores de edad (OFF-24). El usuario pidió el 2026-10-08:

1. Cédula de extranjería (CE) de Migración Colombia.
2. Pasaporte colombiano y extranjero (MRZ TD3).
3. Tarjeta de identidad (TI) **parametrizable por instancia, desactivada por defecto** (decisión del usuario del 2026-10-08), con flujo legal reforzado cuando se activa.
4. Detección automática del tipo y salida unificada con `tipoDocumento`.

## What Changes

- OD-01 a OD-05 (ADDED, capacidad `mrz-td3`): parser puro `parsearMrzTd3` (ICAO 9303 parte 4, 2 líneas de 44) que reutiliza `digitoControlIcao`, las correcciones OCR-B de zonas numéricas y una tabla de países ISO 3166-1 alfa-3 más los códigos especiales ICAO.
- OD-10 a OD-13 (ADDED, capacidad `cedula-extranjeria`): parser `parsearMrzTd1` genérico y clasificador de la CE por MRZ TD1. Todo el formato de la CE es hipótesis (CE01 a CE07 en `docs/decisiones/hipotesis-formato.md`, pendientes). El código 2D del reverso de la CE NO se decodifica en este cambio.
- OD-20 a OD-23 (ADDED, capacidad `lectura-otros-documentos`): pista de tipo desde la presencia ampliada a `"mrz-td1"`, `"mrz-td3"` y `"pdf417"`; lector MRZ de 2x44 con el mismo plan de giros (LMI-12c, LMI-14c); salida unificada `tipoDocumento`.
- OD-30 a OD-36 (ADDED, capacidad `tarjeta-identidad-parametrizable`): parámetro `admitirTarjetaIdentidad` (build de la PWA `VITE_ADMITIR_TI`, servidor `LECTOR_ADMITIR_TI`), apagado por defecto. Apagado: OFF-24 sin cambios. Encendido: OFF-24b sustituye la regla de edad (TI solo menores, CC solo mayores) y exige autorización del representante legal (Ley 1581 art. 7, Decreto 1377 de 2013 art. 12, hoy compilado en el Decreto 1074 de 2015).
- OD-40 (ADDED): prohibiciones explícitas (QR, chip NFC, biometría, datos reales) con prueba automática.
- Textos legales para la TI en `docs/legal/` (tarea del agente legal; plantillas para quien despliega).

Fuera de alcance: PPT y PEP, contraseña, lectura del chip, decodificación del 2D de la CE, OCR de la zona visual de los documentos nuevos (fase de OCR).

## Impact

- `packages/parsers` (nuevos `mrz-td3.ts`, `mrz-td1.ts`, `paises-icao.ts`, `clasificar-documento.ts`), `packages/capture` (presencia y lector MRZ con 2x44), `apps/pwa` (configuración de build, pantalla de autorización del representante, mensajes), `server/app` (`config.py`, contrato, rutas), `evals/` (golden de TD3, CE y TI), `docs/legal/`, `docs/decisiones/hipotesis-formato.md`.
- Toca captura, servidor y datos de menores: `revisor-privacidad` obligatorio. Tabla de países y posible uso de `cheminfo/mrz` (MIT): `revisor-licencias`.
- Depende de `pwa-lectura-offline` (OFF-24, OFF-27), `mrz-giro-180` y `parser-mrz-cedula-digital` (MZ-08). Archivar después de ellos.
