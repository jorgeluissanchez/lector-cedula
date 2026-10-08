# 05. Cédula de extranjería, tarjeta de identidad y dato opcional del pasaporte

Fecha: 2026-10-08. Solo normas oficiales y documentación pública; no se usaron datos de personas reales.
[V] verificado en fuente primaria; [E] estimado o fuente secundaria.

## 1. Cédula de extranjería (CE)

Normas de Migración Colombia (normograma de Cancillería):

- Res. UAEMC 0086 de 2017: formato ID-1 según "Documento 9303 de la OACI, ISO 7810"; el diseño prevé "el respectivo espacio para la impresión del código OCR o zona de lectura mecánica" y el reverso "llevará impreso código de barras bidimensional", con textos en español e inglés. [V] https://cancilleria.gov.co/normograma/compilacion/docs/resolucion_uaemc_0086_2017.htm
- Res. UAEMC 2570 de 2019 (29-08-2019): clases residente, migrante y visitante, con versión "MENOR DE EDAD"; reverso con "código OCR (zona de lectura mecánica)" y "código bidimensional" para verificación electrónica. [V] https://cancilleria.gov.co/normograma/compilacion/docs/resolucion_uaemc_2570_2019.htm
- Res. UAEMC 1395 de 2025 (16-05-2025, D.O. 53.133): nuevo diseño en polímero/policarbonato, 8 clases (residente, migrante, visitante y preferencial, cada una con versión de menor), mantiene "código OCR (zona de lectura mecánica)" y "código de barras bidimensional" en el reverso; las CE de la Res. 2570/2019 siguen válidas hasta su vencimiento. [V] https://cancilleria.gov.co/normograma/compilacion/docs/resolucion_uaemc_1395_2025.htm
- PRADO COL-HO-01001: ficha de la CE (86 x 54 mm, vigencia 2 años, tinta OVI "COL"). El sitio devuelve 403 a la descarga automática; no se pudo leer la MRZ del espécimen. [E] https://www.consilium.europa.eu/prado/en/COL-HO-01001/index.html

Lo que ninguna norma publica: el código de documento de la MRZ, la longitud y posición del número, el contenido de los campos opcionales, la transliteración ni el contenido o formato del código 2D. No se encontró documentación pública de Truora `co_foreign-id-2025`, Regula ni Microblink con esos detalles. Verifik documenta la CE solo como consulta a base de datos (https://docs.verifik.co/identity/colombia-ce/). [E]

## 2. Tarjeta de identidad (TI)

- Se expide por primera vez a los 7 años y se renueva a los 14 (formato azul biométrico con PDF417). [E] https://colombiatramita.co/identificacion-registraduria/tarjeta-identidad-colombia/
- La Registraduría lanzó la cédula digital (MRZ y QR); notas de prensa mencionan una TI digital con QR y MRZ, pero a 2026 no está disponible de forma generalizada y no hay norma ni espécimen público que fije su código de documento. [E] https://www.asuntoslegales.com.co/actualidad/esta-noche-la-registraduria-hara-el-lanzamiento-y-presentacion-de-la-nueva-cedula-digital-3095283

## 3. Pasaporte (dato opcional TD3)

- No hay fuente pública (Cancillería, PRADO legible, ICAO) que describa el contenido del campo opcional de la línea 2. El NUIP tiene 10 dígitos (Registraduría), pero eso no prueba que vaya en la MRZ. [E] https://cancilleria.gov.co/normograma/compilacion/docs/resolucion_registraduria_0146_2000.htm

## Impacto

- CE01 a CE03, CE05, CE06: siguen pendientes; la existencia de la MRZ en el reverso queda confirmada por norma (2017, 2019, 2025).
- CE04: confirmado que existe un código 2D en el reverso y que su contenido no está publicado; se mantiene no decodificarlo.
- CE07: confirmado que la CE de 2025 existe (Res. 1395/2025) y conserva la MRZ en el reverso; el layout exacto sigue sin espécimen.
- T01 y P01: siguen pendientes. Las specs de `otros-documentos` no cambian: ya tratan esos valores como parametrizables o no interpretados.
