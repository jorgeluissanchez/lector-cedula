# Benchmark comercial (resumen operativo, oct-2026)

## Referencias de cobertura de documentos CO
- Truora: co_national-id-2000 (amarilla), co_national-id-2020 (digital), co_foreign-id, co_foreign-id-2025, co_identity-card-2008, co_identity-card-old, passport, ppt, pep, rut, driver-license-2013, co_contrasena. https://dev.truora.com/guides/config_document/
- Veridas: CO_IDCard_2000, CO_IDCard_2020 (TD1), CO_ResidencePermit_2016.
- Microblink: TI, CE (v7.8), pasaporte papel/policarbonato, tipo de documento desde barcode (PDF417).
- Didit: CC amarilla y digital, CE, PPT, pasaporte con chip.

## Funciones de calidad de captura (estándar)
- Didit: auto-captura con score 0-100 (foco, brillo, resolución), rechazo de esquinas fuera, sobreexposición, umbrales configurables.
- Scanbot: detección de bordes, perspectiva, recorte, glare/blur, Document Quality Analyzer, PDF417 en 0,04 s, on-device.
- Microblink: feedback en vivo de reflejo/desenfoque/luz, auto-captura, 100 % on-device.
- Veriff: Assisted Image Capture con feedback en tiempo real.

## Antifraude (estándar)
- Truora: data-consistency (VIZ vs barcode), photo-of-photo, photocopy-analysis, image-analysis.
- Entrust/Onfido: image_integrity, visual_authenticity (digital_tampering, fonts, original_document_present, security_features, template), data_validation (MRZ, barcode, fechas), data_consistency, age_validation.
- Didit: template matching, hologramas/microimpresión, document liveness (pantalla, foto de teléfono, impresión, sustitución de retrato), cruce VIZ-MRZ-barcode con warnings, 200+ señales.
- Microblink Verify: document liveness por micro-textura, GenAI/manipulación 10 niveles, screen replay/inyección, <3 s, 98 % pass.
- Regula AAC: hologramas/OVI, screenshot, fotocopia B/N, checksums MRZ, cruce VIZ/MRZ/barcode, ~5 s; on-prem Docker/Helm.
- Jumio: fotocopia (B/N), hole-punch, hologramas, iBeta L2.

## Salida JSON / API (estándar)
- Verifik Scan Studio v3: confianza por campo 0-1 + bounding boxes normalizados, fechas ISO.
- Incode: ocrValidation[] por campo, ocrValidationOverall 0-100, PDF417 "restauración y decodificación", MRZ con checksum, nombre 92 % vs 77 % OCR genérico, MRZ 97 %.
- Truora: validation_status pending/success/failure, document_validations agrupadas, declined_reason, webhooks, user_authorized=true (Habeas Data).
- Veriff: webhooks HMAC-SHA256; 6 s promedio; 98 % automatización; 95 % éxito primer intento.
- Didit: status Approved/Declined, outcome MATCH/NO_MATCH, sandbox inmediato, veredicto <2 s, flujo <30 s.

## Precios de referencia
Didit 0,15 USD (ID) / 0,33 (KYC) / 500 gratis-mes; Veriff 0,80-1,89; Sumsub 1,35-1,85; Verifik 0,50-0,60/enroll; ZapSign 1,80; Signio COP 650 (solo cruce RNEC); Dynamsoft 1.499 USD/año; Scanbot ~2.500 USD/año; Truora/MetaMap ~259 USD/mes (terceros).

## Cumplimiento que todos publican
ISO 27001, SOC 2 Type II, iBeta PAD Level 1-2 (ISO 30107-3), NIST FRTE; alineación Ley 1581, SARLAFT.

## Lo que NO es factible sin convenio RNEC (Resolución 27145/2023)
Consulta ANI en línea (nombre, vigencia, fallecido, fecha de expedición), cotejo AFIS, facial contra base biométrica, foto ANI. Alternativas: agregadores (Didit 0,20, Verifik, ZapSign 1,80) o certificado de vigencia público certvigenciacedula.registraduria.gov.co (estado, no identidad).

## Lista priorizada de funciones para competir (factibles autoalojadas)
1. PDF417 amarilla parseo 531 bytes. 2. MRZ TD1 con checksums + detección automática de versión. 3. OCR VIZ con confianza por campo y bboxes, fechas ISO. 4. Cruce VIZ↔PDF417/MRZ con warnings. 5. Calidad de captura on-device (bordes, perspectiva, recorte, auto-captura, score 0-100, glare por campo). 6. Document liveness (pantalla/fotocopia/impresión, moiré, micro-textura, B/N). 7. Template matching por versión + manipulación digital. 8. Multi-documento CO (TI, CE, PPT, PEP, pasaporte, contraseña). 9. Face match 1:1 + liveness pasivo. 10. API JSON estándar (estados, checks agrupados, declined_reason, webhooks HMAC, sandbox, idempotencia), <3 s por documento. 11. SDK web WASM + Android/iOS + RN/Flutter, híbrido on-device/servidor. 12. Cumplimiento operativo (autorización explícita, minimización, retención, cifrado, auditoría; preparar ISO 27001/SOC 2). 13. NFC chip cédula digital (opcional). 14. Certificado de vigencia público RNEC como señal.
