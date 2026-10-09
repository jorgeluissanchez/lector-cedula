# Hipótesis del formato de la cédula

Principio VI de la constitución: cada offset, marcador o variante es una hipótesis hasta que una prueba con un payload real o un espécimen público la confirme. Los parsers emiten un `warning` con el ID cuando aplican una hipótesis pendiente.

Estados: **pendiente**, **confirmada**, **refutada**. La evidencia de confirmación con cédulas reales se registra sin datos personales (solo "confirmada con N cédulas del set de campo, fecha").

## PDF417 (cédula amarilla)

| ID | Hipótesis | Fuente | Estado | Evidencia |
|---|---|---|---|---|
| H01 | El payload completo mide 531 bytes (Eitol usa 530 en su decoder) | Eitol | pendiente | |
| H02 | El marcador `PubDSK_1` aparece en el byte 24 de la trama completa y en el 13 si el lector trunca los NUL | Eitol | pendiente | |
| H03 | El NUIP son los 10 dígitos inmediatamente anteriores a la primera letra del primer apellido | Eitol, pmogollons, fgardila | pendiente | Coherente con los dos payloads públicos |
| H04 | Offsets absolutos de nombres: apellido1 58-80, apellido2 81-104, nombre1 104-127, nombre2 127-150 | Eitol | pendiente | DF-VeraP dice "hasta 26" por campo |
| H05 | Bloque demográfico: `0` + sexo + YYYYMMDD + depto(2) + municipio(3) + 1 dígito desconocido + RH | Eitol, FelipeGCx | pendiente | Yeison07 lee 3+3 |
| H06 | El campo de 2 dígitos es el departamento DIVIPOL y el de 3 el municipio | DIVIPOL oficial | pendiente | Eitol tiene las etiquetas invertidas |
| H07 | Existe una variante sin `PubDSK` con índices desplazados una posición | fgardila 2020, pmogollons, Yeison07 | pendiente | Sin payload real público |
| H08 | Existe una variante "fecha primero" (`02` + YYYYMMDD + sexo ... RH) | fgardila 2026 | pendiente | Solo fixtures sintéticos |
| H09 | Todo byte posterior al RH es biométrico | Registraduría, Eitol | pendiente | |
| H10 | La tarjeta de identidad usa el mismo layout | Yeison07, Eitol | pendiente | Nadie lo documenta con payloads. Como no hay forma fiable de distinguir una TI en el PDF417, el lector (solo cédulas de ciudadanía de mayores de edad, decisión del 2026-10-07) la rechaza por la regla de edad: menor de 18 años a la fecha de referencia = `menor-de-edad` (OFF-24 de `pwa-lectura-offline`) |
| H11 | La primera letra no indica original/duplicado/rectificación (P/A/R) | Todos los payloads reales muestran `0M`/`0F` | pendiente (probable refutación de Macorreag) | |

## MRZ TD1 (cédula digital)

| ID | Hipótesis | Fuente | Estado | Evidencia |
|---|---|---|---|---|
| M01 | Línea 1 [5-13] es el serial del documento de 9 dígitos y [14] su dígito de control (puede venir `<`) | Eitol, fgardila | pendiente | |
| M02 | El NUIP va en el opcional de la línea 2 [18-28], 10 dígitos (Eitol) u 11 (fgardila) | Eitol, fgardila | pendiente | |
| M03 | El opcional de la línea 1 [15-19] es el DIVIPOL de expedición (depto 2 + municipio 3) | Eitol | pendiente | fgardila lo ignora |
| M04 | El espécimen público `back-ccd.png` tiene el dígito compuesto inválido | fgardila | pendiente | Calcula 9, impreso 8 |
| M05 | La MRZ TD1 de la cédula digital ocupa la franja inferior del reverso (zona de unos 17,9 mm de alto, ICAO 9303 parte 5), en 3 líneas monoespaciadas de alto uniforme impresas en OCR-B; la OCR-B de Skala (`evals/sinteticos/fuentes/OCRB.otf`) es suficientemente parecida a la impresa para medir el lector con sintéticas | ICAO 9303 partes 3 y 5; cambio OpenSpec `leer-mrz-desde-imagen` (LMI-01, LMI-06) | pendiente | Sin medición sobre espécimen ni cédula real; la exactitud real se mide con el set de campo cifrado |

## Número de identificación (formato)

| ID | Hipótesis | Fuente | Estado | Evidencia |
|---|---|---|---|---|
| N01 | El número de la tarjeta de identidad puede tener 11 dígitos además de los 10 del NUIP; el validador los clasifica como `ti-antigua` (relacionada con H10 y M02) | fgardila (lee 11 en la MRZ), conocimiento general | pendiente | Sin payloads ni especímenes públicos; lo aplica el cambio OpenSpec `validador-formato-nuip` (NF-09) |

## DIVIPOL (códigos de lugar de la Registraduría)

Las aplica el cambio OpenSpec `divipol-registraduria` (`buscarDivipol`, DV-04 a DV-07). Fuente de la tabla y licencias: `docs/decisiones/2026-10-06-fuente-divipol.md`.

| ID | Hipótesis | Fuente | Estado | Evidencia |
|---|---|---|---|---|
| D01 | La tabla de Eitol (transcrita del PDF de pre-DIVIPOL de agosto de 2011) no contiene municipios ni consulados creados después; un código con departamento conocido y municipio ausente puede ser posterior a la fuente | Comparación con `DIVIPOL.TXT` 2026 (copia sin licencia, solo contraste) | pendiente | `17082` NUEVO BELEN DE BAJIRA y 10 consulados están en el TXT 2026 y no en Eitol |
| D02 | `15001` (CUNDINAMARCA / BOGOTA, D.C.) es un código histórico de Bogotá, equivalente a `16001`, que puede aparecer en cédulas antiguas | Eitol (ambas filas) | pendiente | `15001` no está en `DIVIPOL.TXT` 2026 |
| D03 | La numeración de consulados (departamento 88) cambió entre versiones de DIVIPOL; el país de un código 88 puede no corresponder al de una cédula reciente | Comparación Eitol frente a `DIVIPOL.TXT` 2026 | pendiente | IRLANDA `88480` frente a `88470`; HUNGRIA `88450` frente a `88445` |
| D04 | El código `00000` (departamento 00, municipio 000) en el bloque demográfico significa lugar no registrado | Bloque público `<valor real omitido por privacidad>` (fgardila) | pendiente | Un solo ejemplo público |
| D05 | El opcional de la línea 1 de la MRZ (M03), si es un lugar, usa códigos DIVIPOL y no DIVIPOLA | Ninguna fuente lo afirma | pendiente | El ejemplo sintético de Eitol `05001` es CARTAGENA en DIVIPOL y MEDELLÍN en DIVIPOLA; la emite el parser MRZ, no la búsqueda |

## Generador sintético (refinamientos que asume `@lector-cedula/fixtures`)

Concreciones que el generador del cambio OpenSpec `generador-fixtures-sinteticos` necesita para producir bytes exactos y que H01 a H11 y M01 a M04 no fijan. Cada fixture las declara en `hipotesis[]` (requisito FX-14). Si una se refuta, se corrige el generador y se sube el MAJOR de `VERSION_CONTRATO`.

| ID | Hipótesis | Fuente | Estado | Evidencia |
|---|---|---|---|---|
| G01 | Disposición exacta de la trama completa: `[0,2)` 2 dígitos, `[2,10)` AFIS, `[10,24)` NUL, `[24,32)` `PubDSK_1`, `[32,40)` 8 NUL, `[40,48)` campo numérico de 8 dígitos (corregido el 2026-10-06: no hay 6 dígitos en `[33,39)`; ver `2026-10-06-evidencia-hipotesis-formato.md`), `[48,58)` NUIP rellenado con `0` a la izquierda, nombres en `[58,81)`, `[81,104)`, `[104,127)`, `[127,150)` (23 bytes, relleno NUL a la derecha; concreta H04 como intervalos semiabiertos), bloque demográfico desde 150 | Eitol (offsets), fgardila (token numérico antes del apellido) | refutada en parte (corregida en el generador el 2026-10-06) | Coherente con H02, H03 y H04; los 8 dígitos de `[40,48)` podrían ser NUL en cédulas reales |
| G02 | La trama "Windows truncada" solo pierde los 11 NUL de `[13,24)` de la cabecera; los NUL de relleno de los nombres y separadores se conservan | H02 (Eitol: marcador en el byte 13) | pendiente | Se desconoce si el lector trunca también otros runs de NUL |
| G03 | En la variante sin `PubDSK` el marcador se sustituye por NUL y aparece un NUL más en el byte 32, de modo que los campos desde el byte 32 empiezan una posición después (desplazamiento +1; la trama conserva 531 bytes) | H07 (fgardila 2020, pmogollons, Yeison07; app Verifíquese decompilada) | pendiente | Dirección en duda: hasta el 2026-10-06 se asumía −1; la app Verifíquese sugiere +1 [E] (`2026-10-06-evidencia-hipotesis-formato.md`). Sin payloads |
| G04 | En la variante fecha-primero, tras `02` + fecha + sexo siguen departamento (2), municipio (3), 1 dígito y RH, como en H05 | H08 (fgardila 2026 lee `\d*` entre sexo y RH) | pendiente | Solo fixtures sintéticos de fgardila |
| G05 | Línea 3 de la MRZ: `APELLIDO1<APELLIDO2<<NOMBRE1<NOMBRE2`, espacios internos como `<`, Ñ transliterada a `N` (ICAO 9303 parte 3), relleno con `<`; el generador no trunca nombres largos | `docs/investigacion/01-formato-cedula-y-repos.md` sección 2, ICAO 9303 | pendiente | Ejemplo sintético de Eitol; sin espécimen con Ñ ni con apellido compuesto |

## Dimensiones físicas (captura)

Las aplica el cambio OpenSpec `captura-calidad-pwa`: C01 fija la proporción de la guía de encuadre (CAM-08) y C02 justifica la resolución mínima pedida a la cámara (CAM-04). No hay `warnings[]` porque no son salida de un parser; si se refutan, se abre un cambio OpenSpec sobre `captura-camara`.

| ID | Hipótesis | Fuente | Estado | Evidencia |
|---|---|---|---|---|
| C01 | La cédula amarilla y la digital tienen formato ID-1 de ISO/IEC 7810 (85,60 x 53,98 mm, proporción 1,5858) | ICAO 9303 (TD1 implica ID-1) para la digital; conocimiento general para la amarilla | pendiente | La digital usa MRZ TD1 (doc 01, sección 2); ninguna medición publicada de la amarilla |
| C02 | El PDF417 del reverso de la amarilla ocupa al menos el 75 % del ancho de la tarjeta, de modo que con la guía de 1541 px de CAM-08 sobre un frame de 1920x1080 el código mide unos 1156 px o más (2 px por módulo) | Skill `captura-movil` (1156 px), estimación sin medir | pendiente | Sin medición sobre espécimen ni cédula real; si el código es más estrecho, 1920x1080 no basta y habrá que pedir 4K o acercar más |

## Actualización de estados (2026-10-06, evidencia pública)

Fuente: `docs/decisiones/2026-10-06-evidencia-hipotesis-formato.md`. Esta tabla prevalece sobre la columna Estado de las tablas anteriores.

| ID | Nuevo estado | Nota |
|---|---|---|
| H01 | confirmada | 531 bytes; un lector comercial rechaza tramas menores |
| H02 | confirmada en parte | Byte 24 confirmado; la posición 13 no es regla (hay lectores que quitan todos los NUL) |
| H03 | confirmada | NUIP en [48,58), 4 payloads |
| H04 | confirmada con corrección | 4 campos de 23 bytes: [58,81), [81,104), [104,127), [127,150) |
| H05 | confirmada | El dígito desconocido es siempre 0 en la evidencia |
| H06 | confirmada | Departamento 2 + municipio 3 (DIVIPOL) |
| H07 | pendiente | Existencia probable; desplazamiento probablemente +1 (evidencia [E]) |
| H08 | pendiente | Sin evidencia; probable artefacto |
| H09 | confirmada | Tras el byte 168, dos bloques binarios con cabecera `02 xx 00 xx xx FF 80 80` |
| H10 | pendiente (probable) | Prefijo `I3` con el mismo layout |
| H11 | confirmada | P/A/R está en la línea impresa, no en el payload |
| M01 | confirmada | |
| M02 | confirmada con corrección | Campo de 11 caracteres = NUIP de 10 + `<` |
| M03 | pendiente | Codificación DIVIPOL; lugar (expedición o nacimiento) incierto; puede venir vacío |
| M04 | confirmada con corrección | Impreso 9, calculado 8; el espécimen anterior también es inválido |
| N01 | confirmada | Norma oficial: NIP histórico de 11 = AAMMDD + 5 |
| D05 | confirmada | `05001` es Cartagena en DIVIPOL |
| G01 | refutada en parte | [32,40) son NUL y [40,48) numérico de 8 bytes |

Propuestas nuevas del investigador (pendientes): H13 (dos plantillas dactilares), H14 (tramas sin NUL pierden fronteras entre nombres), H16 (prefijo de 2 bytes = tipo de documento; renumerada para no chocar con la H15 del parser PDF417), M05 (especímenes no autoconsistentes), N02 (estructura del NIP).

| ID | Hipótesis | Fuente | Estado | Evidencia |
|---|---|---|---|---|
| H05b | El RH `AB+` o `AB-` ocupa 3 bytes `[166,169)` y desplaza el separador y la cola una posición | `2026-10-06-evidencia-hipotesis-formato.md` (propuesta) | pendiente | Ningún payload público trae RH AB; una app comercial leería solo `AB`. La declaran los fixtures con RH AB± (FX-14) |

## Evidencia con cédula real (2026-10-06, sin datos personales)

Una cédula amarilla real (expedición 1989, código impreso en 2020) leída localmente, sin guardar la imagen ni los datos:
- H01: payload de 531 bytes. Confirmada.
- Trama completa, leída por offsets; ambos modos de lectura coinciden (consistencia-modos OK). Refuerza H02 (byte 24), H03, H04, H05 y H06.
- Formato del NUIP válido y código DIVIPOL existente en la tabla.
- Los 10 campos extraídos con confianza 1 y sin warnings.
- Hallazgo de captura: la foto de celular completa (4096x1842, EXIF rotado) no se decodifica sin recortar la zona del código y pasarla a gris (cambio `localizar-pdf417-en-foto`).

## Otros documentos (cambio `otros-documentos`, 2026-10-08)

Todas pendientes. Fuente base: Resolución UAEMC 0086 de 2017 (tarjeta ID-1 conforme a ICAO 9303, MRZ y código 2D en el reverso, sin chip) y la distinción `co_foreign-id` / `co_foreign-id-2025` de Truora. Sin especímenes públicos verificados en esta sesión.

| ID | Hipótesis | Fuente | Estado | Evidencia |
|---|---|---|---|---|
| CE01 | La MRZ de la CE es TD1 con código de documento `I<` (se aceptan también `ID` e `IE`) y estado emisor `COL` | Res. UAEMC 86/2017 (ICAO 9303, ID-1) | pendiente | Res. 86/2017, 2570/2019 y 1395/2025 confirman MRZ (zona OCR) en el reverso; el código no se publica (docs/investigacion/05) |
| CE02 | El campo nacionalidad de la CE es el del titular (distinto de `COL`) | ICAO 9303 parte 5 | pendiente | Ninguna norma ni espécimen público lo detalla (búsqueda 2026-10-08, docs/investigacion/05) |
| CE03 | El número de la CE (hasta 7 dígitos impresos; los nuevos podrían ser más largos) está en [5,14) de la línea 1, relleno con `<` | Conocimiento general | pendiente | Ninguna norma ni espécimen público lo detalla (búsqueda 2026-10-08, docs/investigacion/05) |
| CE04 | El código 2D del reverso no tiene formato publicado y puede contener datos cifrados o biométricos; no se decodifica | Res. 86/2017, ausencia de repos | confirmada parcialmente | Las tres resoluciones exigen código 2D en el reverso sin publicar simbología ni contenido; se mantiene no decodificar (docs/investigacion/05) |
| CE05 | Los campos opcionales de la CE en TD1 están vacíos o llevan un dato interno de Migración | ICAO 9303 parte 5 | pendiente | Ninguna norma ni espécimen público lo detalla (búsqueda 2026-10-08, docs/investigacion/05) |
| CE06 | La línea 3 de la CE lleva apellidos y nombres con la transliteración ICAO (Ñ como N) | ICAO 9303 parte 3 | pendiente | Ninguna norma ni espécimen público lo detalla (búsqueda 2026-10-08, docs/investigacion/05) |
| CE07 | La CE rediseñada de 2025 mantiene TD1 con el mismo layout | Truora `co_foreign-id-2025` | confirmada parcialmente | Res. UAEMC 1395/2025 existe y conserva MRZ y 2D en el reverso; layout exacto sin espécimen (docs/investigacion/05) |
| T01 | Una TI con MRZ (si existe) usa código `IT` o `TI` y emisor `COL` | Ninguna confirmada | pendiente | TI digital con QR y MRZ anunciada por prensa, sin norma ni espécimen; TI azul vigente solo con PDF417 (docs/investigacion/05) |
| P01 | El dato opcional del pasaporte colombiano lleva el NUIP del titular | Conocimiento general | pendiente | Sin fuente pública del campo opcional; buscado en 2026-10-08 (docs/investigacion/05) |

## Detección de fraude (cambio `deteccion-fraude`, 2026-10-08)

Pendientes. Se exponen en `warnings` de la `SenalRiesgo` mientras sigan pendientes. H-FRA-2 (rangos de NUIP por época) se descartó por decisión P7: no se comprueban rangos de NUIP.

| ID | Hipótesis | Fuente | Estado | Evidencia |
|---|---|---|---|---|
| H-FRA-1 | El holograma de la cédula amarilla ocupa una región fija del anverso y su tono o brillo varía entre frames al mover la tarjeta; una fotocopia no varía | Conocimiento general de elementos ópticamente variables | pendiente | Sin medición sobre espécimen ni cédula real |
| H-FRA-3 | La cédula digital en policarbonato conserva el radio de esquina ISO/IEC 7810 ID-1 (3,18 mm) | ISO/IEC 7810 | pendiente | Sin medición sobre cédula real |

## Contraseña de la Registraduría (investigación 2026-10-09)

Pendientes. Evidencia en docs/investigacion/06-contrasena-registraduria.md.

| ID | Hipótesis | Fuente | Estado | Evidencia |
|---|---|---|---|---|
| CT-01 | Ningún tipo de contraseña lleva PDF417, código 1D ni Datamatrix; solo la EIS y la verde web llevan QR | Circular Única v8, 15.5 | confirmada parcialmente | La norma solo menciona QR; sin espécimen que lo confirme visualmente |
| CT-02 | El QR de la contraseña contiene solo una URL de `registraduria.gov.co` que abre la consulta de estado, sin datos personales en claro | Circular Única v8, 15.5.3; prensa | pendiente | La norma dice que "carga el estado del trámite en la página Web"; contenido real no publicado |
| CT-03 | El QR no lleva firma digital verificable fuera de línea | Ausencia de especificación publicada | pendiente | Ninguna fuente describe firma ni cifrado |
| CT-04 | La contraseña verde web definitiva imprime el número de preparación; la temporal no | Circular Única v8, 15.5.3 | confirmada parcialmente | Afirmado por la norma; posición y formato del número desconocidos |
| CT-05 | La contraseña EIS mide 8 x 16 cm y la blanca 8,7 x 7,8 cm | Circular Única v8, 15.5.1 y 15.5.2 | confirmada parcialmente | Medidas en la norma; sin medición sobre espécimen |
| CT-06 | Los "datos del titular" incluyen NUIP, nombres y apellidos, tipo de trámite y fecha del trámite | Inferencia | pendiente | La norma no enumera los campos |
