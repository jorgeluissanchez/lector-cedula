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
| H10 | La tarjeta de identidad usa el mismo layout | Yeison07, Eitol | pendiente | Nadie lo documenta con payloads |
| H11 | La primera letra no indica original/duplicado/rectificación (P/A/R) | Todos los payloads reales muestran `0M`/`0F` | pendiente (probable refutación de Macorreag) | |

## MRZ TD1 (cédula digital)

| ID | Hipótesis | Fuente | Estado | Evidencia |
|---|---|---|---|---|
| M01 | Línea 1 [5-13] es el serial del documento de 9 dígitos y [14] su dígito de control (puede venir `<`) | Eitol, fgardila | pendiente | |
| M02 | El NUIP va en el opcional de la línea 2 [18-28], 10 dígitos (Eitol) u 11 (fgardila) | Eitol, fgardila | pendiente | |
| M03 | El opcional de la línea 1 [15-19] es el DIVIPOL de expedición (depto 2 + municipio 3) | Eitol | pendiente | fgardila lo ignora |
| M04 | El espécimen público `back-ccd.png` tiene el dígito compuesto inválido | fgardila | pendiente | Calcula 9, impreso 8 |
