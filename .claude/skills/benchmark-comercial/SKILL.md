---
name: benchmark-comercial
description: Listón del mercado (Truora, Didit, Veriff, Microblink, Regula, Incode y otros) para comparar cada entrega. Cárgala al especificar metas o al revisar una fase contra la competencia.
---

# Benchmark comercial

Fuente completa: `docs/investigacion/02-benchmark-comercial.md`. Tabla de metas: `PLAN.md` sección 0.

## Referencias clave

| Aspecto | Mejor referencia | Qué copiar |
|---|---|---|
| Cobertura de documentos CO | Truora | 12 tipos: amarilla 2000, digital 2020, CE y CE 2025, TI 2008 y antigua, pasaporte, PPT, PEP, RUT, licencia, contraseña |
| Calidad de captura | Didit, Scanbot | Score 0-100 configurable, rechazo de esquinas fuera y sobreexposición |
| Salida de OCR | Verifik Scan Studio v3, Incode | Confianza por campo 0-1, bounding boxes normalizados, fechas ISO |
| Consistencia | Truora, Entrust | `data_consistency` VIZ contra código, con razón de rechazo |
| Antifraude de documento | Entrust, Microblink, Regula | `original_document_present`, pantalla, fotocopia, plantilla, manipulación |
| API | Truora, Veriff, Didit | Estados pending/success/failure, webhooks HMAC-SHA256, sandbox, idempotencia |
| Velocidad | Didit, Microblink, Veriff | Veredicto en menos de 2-3 s; flujo completo en 6 s |
| Precio de referencia | Didit | 0,15 USD por ID, 500 gratis al mes |

## Lo que no se iguala sin convenio con la Registraduría

Consulta ANI, cotejo AFIS, comparación facial contra la base de la RNEC. Se declara al usuario y se ofrece un conector opcional a agregadores y el certificado de vigencia público.

## Cómo usarla en una revisión

Para cada capacidad tocada: métrica real, meta propia, referencia comercial, veredicto (igual o mejor, brecha menor, brecha crítica).
