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
