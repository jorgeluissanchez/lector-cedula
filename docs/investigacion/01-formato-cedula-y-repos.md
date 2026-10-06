# Formato de la cédula colombiana y repositorios de referencia

Verificado el 2026-10-06 contra GitHub, npm, PyPI y datos.gov.co. Este documento es la fuente de verdad del formato para los agentes que implementen los parsers. Cuando un dato esté marcado como hipótesis, el agente debe escribir una prueba que lo confirme o lo refute con payloads reales antes de depender de él.

## 1. PDF417 de la cédula amarilla (2000 a hoy)

- Símbolo: 531 bytes crudos, 25 filas x 21 columnas, corrección de errores nivel 5. Debe leerse en binario (ISO-8859-1). Hay bytes 0x00 y una cola binaria (biometría, aprox. 70 % del payload tras el RH) que hace que los accesores de texto de ML Kit y Vision devuelvan null. Usar siempre `rawBytes`.
- Cabecera: 2 dígitos + AFIS de 8 dígitos (bytes 2 a 10) -> run de NUL -> marcador `PubDSK_1` (byte 24 en trama completa; byte 13 en Windows, que trunca los NUL) -> NUL -> 6 dígitos -> NUL -> token numérico + primer apellido.
- NUIP: regla robusta en la que convergen todos los repos: los 10 dígitos inmediatamente anteriores a la primera letra del primer apellido, sin ceros a la izquierda.
- Campos de texto (offsets absolutos de Eitol): apellido1 58-80, apellido2 81-104, nombre1 104-127, nombre2 127-150, rellenos con 0x00 a la derecha. Otro repo (DF-VeraP) dice "hasta 26" por campo. Hipótesis a verificar.
- Bloque demográfico de 18 caracteres: `0` + `M/F` + `YYYYMMDD` + DIVIPOL departamento (2) + DIVIPOL municipio (3) + 1 dígito desconocido + RH. Ejemplos reales: `<valor real omitido por privacidad>` (31 = Valle, 019), `<valor real omitido por privacidad>`.
- Discrepancia conocida: Eitol y FelipeGCx saltan el dígito desconocido; Yeison07 lo absorbe en el municipio (lee 3+3). La convención correcta es DIVIPOL: departamento 2 dígitos, municipio 3 dígitos. Eitol tiene las etiquetas invertidas en su tabla de documentación, no en su código.
- Variante sin `PubDSK` ("formato viejo"): los repos la detectan por ausencia del marcador y desplazan índices una posición. fgardila/colombian-id-reader además soporta bloque demográfico "fecha primero" (`02` + YYYYMMDD + `M` + ... + RH) con fixtures sintéticas. No hay payload real público de ese formato. Posible origen: tarjeta de identidad o primeras tiradas.
- No hay dígito de control en el PDF417. El "dígito de verificación" que aparece en otros repos es el mod-11 de la DIAN para NIT, no aplica.
- Fecha y lugar de expedición y estatura NO están en el PDF417. Se obtienen por OCR del reverso.
- Tarjeta de identidad: se asume el mismo layout, nadie lo documenta con payloads reales. El NUIP de 11 dígitos de la TI no está documentado en el PDF417.
- Errores recurrentes en repos antiguos que el parser nuevo debe evitar: RH `AB` cortado a `B+` por `substring(-2)`; sexo por `contains("M")`; `-` del RH negativo eliminado por el normalizador; Ñ (0xD1 en Latin-1) y acentos que crashean; apellidos en orden invertido; fecha de nacimiento etiquetada como expedición.
- Afirmación no verificada (Macorreag/colombiaData): primera letra P/A/R indica original/duplicado/rectificación. Todos los payloads reales muestran `0M`/`0F`. Tratar como falsa salvo prueba.

### Payloads reales públicos para fixtures
- Eitol/colombian-cedula-reader: `best_quality_1.txt` y `fake_1.png`.
- fgardila/colombian-id-reader: `0123456789 PubDSK_1 123456 <valor real omitido por privacidad>` (sintético con estructura real).

### Enfoque recomendado para el parser
Adoptar el enfoque de fgardila/colombian-id-reader (Kotlin Multiplatform, 2026-07, 54 commits): bytes ISO-8859-1; normalizar todo lo que no sea `[A-Za-z0-9+_-]` a espacio 1:1; runs de 2 o más espacios como frontera de campo; espacio simple conservado para apellidos compuestos ("DE LA OSSA"); NUIP con `^\d*?(\d{10})([A-Z][A-Za-z ]*)$`; bloque demográfico con dos formas, sexo primero `^\d([MF])(\d{8})\d*(AB|A|B|O)([+-])` y fecha primero `^\d{2}(\d{8})([MF])\d*(AB|A|B|O)([+-])`. Combinarlo con el parser por offsets fijos de Eitol cuando el payload llega completo (más de 4 NUL seguidos tras la cabecera), y usar el de patrones como respaldo. Archivos de referencia: `sharedLogic/src/commonMain/kotlin/dev/code93/colombian_id_reader/parser/pdf417/{Pdf417Normalizer,Pdf417FieldLocator,Pdf417FieldMapper}.kt` y `doc/ARCHITECTURE.md`.

## 2. MRZ TD1 de la cédula digital (diciembre 2020 a hoy)

Fuentes con código: Eitol/colombian_cedula_mrz_reader (`parser/colombian_mrz_parser.py`) y fgardila/colombian-id-reader (`parser/mrz/Td1MrzParser.kt`). Tres líneas de 30 caracteres:

- Línea 1: `IC` [0-1]; `COL` [2-4]; serial del documento 9 dígitos [5-13]; dígito de control [14] (puede venir como `<`); opcional [15-29]. Eitol interpreta [15-17] + [17-20] como DIVIPOL de expedición (ejemplo `05001`). fgardila lo ignora. Hipótesis a verificar con cédulas reales.
- Línea 2: nacimiento YYMMDD [0-5] + CD [6]; sexo [7]; vencimiento YYMMDD [8-13] + CD [14]; nacionalidad `COL` [15-17]; NUIP en el opcional [18-28] (Eitol lee 10 caracteres, fgardila 11); CD compuesto [29].
- Línea 3: `APELLIDO<APELLIDO<<NOMBRE<NOMBRE` relleno con `<`. Apellidos compuestos usan un solo `<` como espacio.
- La MRZ no trae RH. Sí trae vencimiento.
- Correcciones OCR-B solo en zonas numéricas: O->0, Q->0, I->1, Z->2, S->5, G->6, B->8. Validar los 4 dígitos de control. El espécimen público de la Registraduría `back-ccd.png` tiene CD compuesto inválido (calcula 9, impreso 8): no usarlo como fixture positiva.
- Ejemplo sintético de Eitol:
  ```
  ICCOL000000012305001<<<<<<<<<<
  0403151F3203190C0L1234567890<0
  WALTEROS<<LAURA<<<<<<<<<<<<<<<
  ```

## 3. QR y chip de la cédula digital
- QR cifrado con información biométrica y de seguridad. Ningún repo lo decodifica. Eitol tiene la clase `colombian_qr_decoder.py` vacía.
- Chip NFC con foto, huella y firma cifradas, MRZ ICAO 9303. Ningún repo lee el chip de la cédula colombiana. Lectores genéricos ICAO existen (NFCPassportReader, emrtd-dotnet) y usarían BAC con los datos de la MRZ. Trabajo futuro opcional.

## 4. Cédula de extranjería
- Resolución 86/2017 UAEMC: tarjeta ID-1 ISO 7810/ICAO 9303, reverso con "código de barras bidimensional" y zona MRZ, sin chip. Ningún repo decodifica ese 2D. Se trata por MRZ y OCR. Truora distingue `co_foreign-id` y `co_foreign-id-2025`.

## 5. Tablas DIVIPOL y DIVIPOLA
DIVIPOL (Registraduría) es lo que va en el PDF417. NO coincide con DIVIPOLA (DANE): Antioquia 01 vs 05, Valle 31 vs 76, Bogotá 16 vs 11, consulados 88.
- Tabla DIVIPOL embebida (1.122 filas, incluye consulados y Bogotá duplicada como 15/001 y 16/001): https://raw.githubusercontent.com/Eitol/colombian-cedula-reader/master/src/barcode/localities.py y https://raw.githubusercontent.com/Yeison07/cedula-colombiana-pdf417-decoder/master/model/locations.go
- PDF oficial 2011: https://github.com/Eitol/colombian-cedula-reader/blob/master/doc/pre_divipol_02_agosto_2011.pdf
- `DIVIPOL.TXT` oficial de ancho fijo y script de conversión: https://github.com/miltonrojasb/visualizador-electoral-2026
- datos.gov.co Divipole 2023 georreferenciada: https://www.datos.gov.co/d/mv2e-prx5 (CSV: https://www.datos.gov.co/api/views/mv2e-prx5/rows.csv?accessType=DOWNLOAD)
- DIVIPOLA DANE (CC BY-SA 4.0): https://www.datos.gov.co/Mapas-Nacionales/DIVIPOLA-C-digos-municipios/gdxc-w37w
- No existe equivalencia DIVIPOL-DIVIPOLA publicada. Se construye por join de nombres.

## 6. Repositorios (todos verificados)

### Conocidos de la investigación previa
Eitol/colombian-cedula-reader (MIT, 53 estrellas, referencia de offsets), Eitol/colombian_cedula_mrz_reader (MRZ con AWS Textract), Yeison07/cedula-colombiana-pdf417-decoder (Go, parser por punteros), baenat/pdf417-cedula-reader (TS), gist pmogollons (RN), fgardila/LectorCedulaColombia_*_Android, ginei11/lectorCedulas, FelipeGCx/ScanBar-Colombia-CC-To-Json, cizaquita/ConsultaCiudadano.

### Nuevos, PDF417
- https://github.com/fgardila/colombian-id-reader (KMP, 2026-07, sin licencia declarada): PDF417 + MRZ TD1 + TD3, parser por patrones, documenta 5 bugs del código 2020. El más valioso. Pedir licencia al autor o reimplementar la lógica con pruebas propias.
- https://github.com/jeanp117/decodificador-cedula-colombia (JS, 2020): lector HID, apellidos invertidos, fecha mal etiquetada.
- https://github.com/Becomedigital/become_ANDROID_SDK_CEDULA_SCAN (Java, 2021): SDK comercial; expedición y estado vienen de backend, no del código.
- https://github.com/DannaSofia17/LectorCedulasColombianas-amarillas (MIT, 2025-12): copia de Eitol + Flask.
- https://github.com/camilo1184/id-scanner-api (Spring Boot + ZXing 3.5.2, 2025-12): API REST genérica, menciona CE.
- https://github.com/ismaeldts/lector_cedula_colombia (Apache-2.0, 2024): derivado de fgardila 2020.
- https://github.com/Macorreag/colombiaData (MIT): afirmación P/A/R no verificada; regex de formato de cédula.
- Flutter: GaleanoJorge/flutter_cedula_scanner, xenogenesis45/Scan_Cedula_Flutter, adandaa/ColombianIdReader. Android: SebastianG10/QRCodeScanner, cafsoft/CAFSoftColombianIDInfo, peludo90/leercedulacolombia. Web: macrosystemm/Lector_cedulas_colombianas. RN: Nexpeque/IdReader.

### Nuevos, OCR y digital
- https://github.com/carvajal7lsch-commits/ocr_cruce (MIT): RapidOCR + PyMuPDF para CC, TI, CE y contraseña; MRZ + plantillas + heurística; campos incluyen estatura y expedición.
- https://github.com/DF-VeraP/ocr (React + Node): fast-track PDF417 con @zxing/library + PaddleOCR ONNX + Tesseract de respaldo. Documenta la trama en `Docs/modulos/02_codigo_barras.md`.
- https://github.com/ddturizo-eng/identity-document-ocr (Apache-2.0, 2026-05): PaddleOCR con confianza por campo para CC digital, amarilla, TI.
- https://github.com/DETNAW11/extractor-texto-en-doc-identidad-Col (FastAPI + EasyOCR): CC, CE, digital, pasaporte.
- https://github.com/miguelfsosa/ocr_cedulas_colombianas_ds (2026-03): EasyOCR + ResNet-18 de calidad + plantilla.
- https://github.com/iLukas28/kyc-defense (tesis USFQ 2026): KYC on-premise con OpenCV + MobileNetV3 + Qwen2.5-VL local.
- Dataset: https://huggingface.co/datasets/currentfear/cedula_anverso_v2 (804 anversos con ground truth: número, apellidos, nombre, tipo; sin licencia declarada: usar solo para evaluación interna hasta aclarar).

### Registros
- Packagist: eitol/colombian-cedula-reader. Go: github.com/yeison07/cedula-colombiana-pdf417-decoder. npm, PyPI y pub.dev: ningún paquete de lectura de cédula colombiana. Es un hueco de mercado para publicar el nuestro.

## 7. Otras referencias
- Wikipedia ES, generaciones de la cédula: https://es.wikipedia.org/wiki/C%C3%A9dula_de_ciudadan%C3%ADa_(Colombia)
- LobbyPMS (PDF417 en amarillas, MRZ en digitales, lectores Zebra DS4608/DS9308): https://soporte.lobbypms.com/hc/es/articles/38418438912147
- Resolución UAEMC 86/2017 (cédula de extranjería): https://www.cancilleria.gov.co/normograma/compilacion/docs/resolucion_uaemc_0086_2017.htm
