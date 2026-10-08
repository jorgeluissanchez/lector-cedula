# Proposal: deteccion-fraude

## Why

El lector ya extrae los datos de la cédula amarilla (PDF417) y de la digital (MRZ) en el dispositivo, pero acepta igual una cédula auténtica que una foto de una pantalla, una fotocopia o una tarjeta recortada o editada. Los servicios comerciales (Truora, Didit, Veriff, Microblink, Regula) entregan junto a los datos una señal de presentación fraudulenta (`original_document_present`, pantalla, fotocopia, manipulación). Sin ella, el lector no está al listón de la Fase 5 de `PLAN.md`.

## What Changes

- Nuevo paquete `packages/fraud` (TypeScript, en el dispositivo, offline) que produce una **señal de riesgo** con `puntaje` 0-100, `nivel` y `motivos[]` de un vocabulario cerrado: `pantalla`, `fotocopia`, `recorte`, `edicion`, `inconsistencia`.
- Fase A (sin ML): heurísticas clásicas sobre los frames que ya produce la captura:
  1. Recaptura de pantalla: picos de moiré en el espectro, patrón de subpíxeles, reflejo especular plano, borde de pantalla fuera de la tarjeta, banding de refresco entre frames.
  2. Fotocopia o impresión: saturación cromática baja, ausencia de variación del holograma entre frames (amarilla), tramado de semitono, textura de papel.
  3. Recorte o edición: geometría ID-1 (relación 85,60 x 53,98 mm, esquinas redondeadas), bordes rectos sin esquinas, bloques con doble compresión JPEG, discrepancia entre código legible por máquina y texto visible cuando el OCR del anverso exista.
  4. Consistencia de datos reutilizando `validarFormatoNuip`, `digitoControlIcao`, `buscarDivipol`, `parsearPdf417Amarilla` y `parsearMrzCedulaDigital`: fechas imposibles, NUIP fuera de rangos, municipio inexistente, documento vencido.
- Fase B (opcional, desactivada por defecto): clasificador ligero ONNX (onnxruntime-web) cuyas probabilidades se suman como una señal más; solo con licencia de pesos y de datos de entrenamiento compatible y aprobada por `revisor-licencias`.
- Política de decisión configurable por instancia (umbrales, pesos, `bloquearSi`); por defecto la señal nunca bloquea.
- Generador de datasets sintéticos de ataques (pantalla simulada, fotocopia simulada, recorte, edición) y corredor de evals con APCER/BPCER según ISO/IEC 30107-3.
- Plan para un set de campo real con consentimiento (`docs/legal/consentimiento-set-campo.md`), fuera del repositorio.
- La PWA muestra la señal en `resultado` sin bloquear la lectura.

## Capabilities

### New Capabilities

- `deteccion-fraude`: señal de riesgo de presentación fraudulenta de la cédula, en el dispositivo.

### Modified Capabilities

- Ninguna en este cambio. La integración visual en la PWA (FRA-17) se añade como requisito nuevo de esta capacidad; si el verificador exige tocar `lectura-pwa-offline`, se abre un delta MODIFIED (pregunta abierta P6).

## Impact

- Código nuevo: `packages/fraud/`, `evals/runners/fraude/`, `evals/sinteticos/fraude/` (generados, no versionados salvo semillas), integración en `packages/capture` (Worker) y `apps/pwa`.
- Sin dependencias nuevas en la Fase A (implementación propia de FFT, DCT e histogramas). Fase B: `onnxruntime-web` (MIT), ya prevista en el stack.
- Privacidad: los frames se procesan en memoria y se liberan; la señal no contiene imágenes ni datos personales.
- Fuera de alcance: face match, liveness de selfie, conectores a la Registraduría o agregadores, CAT-Net en servidor. Quedan para cambios posteriores de la Fase 5.
