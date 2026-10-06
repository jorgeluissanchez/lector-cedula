# Evidencia pública adicional para las hipótesis del formato

**Fecha:** 2026-10-06. **Estado:** propuesta. Los cambios de estado de `hipotesis-formato.md` van en la tabla final y **no se han aplicado** (hay redactores de specs leyendo ese archivo). Los aplica el orquestador o un humano.

Marcas: [V] verificado por mí en fuente primaria (byte a byte, cálculo propio o texto oficial). [E] estimado o inferido.

## Pregunta

¿Qué evidencia pública confirma o refuta las hipótesis H01-H11 (PDF417 de la cédula amarilla), M01-M04 (MRZ TD1 de la cédula digital) y N01 (número de la tarjeta de identidad), sin usar datos de personas reales?

## Respuesta corta

- **Cuatro payloads reales públicos e independientes** (el de Eitol y tres volcados en un repo Java), más la reconstrucción de fgardila y el código de una app comercial de 2014, coinciden en el layout de la trama con `PubDSK_1`. Con eso se pueden confirmar H01, H03, H04 (corregida a campos de 23 bytes), H05, H06 y H09 (precisada). H02 se confirma para la trama completa (byte 24), pero la posición en tramas truncadas no es fija.
- **G01 está mal**: no hay "6 dígitos en [33,39)". Los bytes [32,40) son NUL y el campo numérico es [40,48), con 6 u 8 dígitos y relleno NUL.
- **La tarjeta de identidad** tiene evidencia nueva: un volcado público empieza por `I3` en lugar de `03` y, por lo demás, tiene la misma estructura. Una app comercial acepta `02`, `03` e `I3` como prefijos válidos. H10 sube a "probable", pero sigue pendiente.
- **M04 está invertida en nuestro registro**: según dos transcripciones del espécimen actual, el dígito impreso es 9 y el calculado 8 (calculé 8 a partir de esas líneas). El espécimen anterior, que leí directamente de la imagen, también tiene dígitos de control inválidos.
- **M03/D05**: según el espécimen anterior, el opcional de la línea 1 es un código DIVIPOL de la Registraduría (`05001` = Cartagena, que coincide con el anverso), no DIVIPOLA. En el espécimen actual viene vacío.
- **N01** queda confirmada por norma oficial: el NIP de 11 dígitos (AAMMDD + 5) fue número de TI hasta la mayoría de edad. Es histórico: el último NIP se asignó a nacidos hasta enero de 2000.
- **H11**: la afirmación P/A/R de Macorreag se refiere a la **línea impresa** bajo el código de barras, no al payload. En el PDF417, 5 de 5 tramas empiezan por `03` o `I3` y el bloque demográfico por `0`.

## Aviso de privacidad (leer antes de usar estas fuentes)

Estas fuentes públicas contienen lo que parecen ser **datos de personas reales**. Este documento solo registra estructura (longitudes, posiciones, clases de carácter). Recomiendo no copiarlas a fixtures ni a documentos:

| Fuente | Contenido sensible |
|---|---|
| `Eitol/colombian-cedula-reader` `php/tests/testdata/best_quality_1.txt` y `.json` | Payload completo: nombre, NUIP, nacimiento, lugar, RH y plantillas dactilares |
| `Eitol/colombian-cedula-reader` `README.md` (tabla de campos y ejemplo de Windows) | Nombre, número de documento y AFIS de ejemplo, probablemente reales |
| `guiovannycaro-coder/Java` `Gmarket/.../Pdf417Util.java` (y su copia en `tncity/`) | Tres volcados completos, uno de una persona nacida después de 2002 |
| `fgardila/colombian-id-reader` `Pdf417Fixtures.kt`, fixture "owner-verified card" | Nombre, NUIP y fecha de nacimiento del autor del repo (autopublicados) |

**Acción recomendada (no la ejecuté):** `docs/investigacion/01-formato-cedula-y-repos.md` copia hoy dos datos de este tipo: el bloque demográfico (prefijo real omitido) de la sección 1, que es idéntico byte a byte al del fixture de Eitol (fecha de nacimiento, lugar y RH de una persona), y la cadena completa de fgardila de la sección "Payloads reales públicos". La hipótesis D04 también cita ese bloque. Conviene sustituirlos por su forma (`0` + `M/F` + 8 dígitos + 6 dígitos + RH).

## Fuentes nuevas o releídas

| # | Fuente | Tipo | Fijado en | Licencia | Fiabilidad |
|---|---|---|---|---|---|
| S1 | [Eitol best_quality_1.txt](https://github.com/Eitol/colombian-cedula-reader/blob/master/php/tests/testdata/best_quality_1.txt) + [.json](https://github.com/Eitol/colombian-cedula-reader/blob/master/php/tests/testdata/best_quality_1.json) | Payload real completo | commit `d96fa3164524`, SHA-256 `6618d1b9…6ca0` | MIT (pero con datos personales) | Alta para estructura |
| S2 | [Eitol README](https://github.com/Eitol/colombian-cedula-reader/blob/master/README.md) y [decoder](https://github.com/Eitol/colombian-cedula-reader/blob/master/src/barcode/colombian_pdf417_decoder.py) | Documentación y código | `d96fa3164524` | MIT | Media |
| S3 | [guiovannycaro-coder/Java Pdf417Util.java](https://github.com/guiovannycaro-coder/Java/blob/main/Gmarket/src/java/com/gmarket/util/Pdf417Util.java) | Tres volcados reales en texto, sin NUL y con mojibake | `a81116045d71` | Sin licencia | Alta para estructura de tokens, nula para offsets |
| S4 | [fgardila Pdf417Fixtures.kt](https://github.com/fgardila/colombian-id-reader/blob/main/sharedLogic/src/commonTest/kotlin/dev/code93/colombian_id_reader/fixtures/Pdf417Fixtures.kt), [ARCHITECTURE.md](https://github.com/fgardila/colombian-id-reader/blob/main/doc/ARCHITECTURE.md), [Td1MrzParser.kt](https://github.com/fgardila/colombian-id-reader/blob/main/sharedLogic/src/commonMain/kotlin/dev/code93/colombian_id_reader/parser/mrz/Td1MrzParser.kt), [Pdf417FieldLocator.kt](https://github.com/fgardila/colombian-id-reader/blob/main/sharedLogic/src/commonMain/kotlin/dev/code93/colombian_id_reader/parser/pdf417/Pdf417FieldLocator.kt), [IngresoActivityVision.java](https://github.com/fgardila/colombian-id-reader/blob/main/doc/IngresoActivityVision.java) | Reconstrucción de una tarjeta real, fixtures sintéticos, código de 2020 | `735013bfa786` | Sin licencia | Media |
| S5 | App Verifíquese (`se.verifique.app.cedula`) decompilada: [c.java](https://github.com/IRMobydick/AndroidDissambleApps/blob/master/se.verifique.app.cedula/Source/src/se/verifique/app/cedula/a/c.java), [strings.xml](https://github.com/IRMobydick/AndroidDissambleApps/blob/master/se.verifique.app.cedula/Source/resources/res/values/strings.xml) | App comercial (PhotoPay/Microblink), anterior a 2015 | `c43af7e95925` (2015-01-12) | Ninguna (APK de terceros): solo como evidencia, no copiar código | Media (decompilado con JD-Core 0.6, flujo de control alterado) |
| S6 | Espécimen anterior de la cédula digital (firma de Alexander Vega Rocha): [reverso](https://github.com/Eitol/colombian_cedula_mrz_reader/blob/master/test/data/fake_1.png), [anverso](https://github.com/Eitol/colombian_cedula_mrz_reader/blob/master/test/data/fake_1_front.png) | Espécimen ficticio (WALTEROS LAURA), leído por mí de la imagen | `f55b6e8a7748`, SHA-256 `0a517b90…48a3` / `700fd387…0f1436` | Repo sin licencia; artes de la Registraduría [E] | Alta para lo legible |
| S7 | Espécimen actual `back-ccd.png` (VELEZ RUIZ GERONIMO): transcripción en [fgardila ARCHITECTURE.md §6.1](https://github.com/fgardila/colombian-id-reader/blob/main/doc/ARCHITECTURE.md) y en el SVG de maqueta [chewto reverso_cedula_digital.svg](https://github.com/chewto/pki-valiadacion-identidad/blob/main/public/svg/reverso_cedula_digital.svg) | Dos transcripciones secundarias concordantes | `2113df70f747` | Sin licencia | Media: la imagen oficial está detrás de Cloudflare (HTTP 403) y la Wayback Machine estaba fuera de servicio |
| S8 | [Resolución 3571 de 2003, Registraduría](https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/resolucion_registraduria_3571_2003.htm) | Norma oficial | Consultada el 2026-10-06 | Pública | Alta |
| S9 | [Circular Única de Registro Civil e Identificación, v8, 2023-03-23](https://wapp.registraduria.gov.co/identificacion/cedula-digital/files/pdf/20230327_circular-unica-de-rc-e-identificacion_version-8_23-de-marzo-de-2023.pdf), §2.2 y §"cargue de documentos" | Documento oficial | Consultado el 2026-10-06 | Pública | Alta |
| S10 | [DF-VeraP barcode.service.ts](https://github.com/DF-VeraP/ocr/blob/main/backend/src/services/barcode.service.ts) y [02_codigo_barras.md](https://github.com/DF-VeraP/ocr/blob/main/Docs/modulos/02_codigo_barras.md) | Código y documentación | rama `main` | Sin licencia | Media |
| S11 | [Macorreag/colombiaData README](https://github.com/Macorreag/colombiaData/blob/main/README.md) | Afirmación P/A/R | rama `main` | MIT | Baja |
| S12 | Microblink: [release notes de BlinkID Android](https://github.com/microblink/blinkid-android/blob/master/Release%20notes.md) (5.9.0: "COLOMBIA - MINORS ID (front, back)") y [serialización de `ColombiaIdBackRecognizer`](https://github.com/zhang2118/BlinkID/blob/master/src/android/java/com/phonegap/plugins/microblink/recognizers/serialization/ColombiaIdBackRecognizerSerialization.java) (campo `fingerprint` como `byte[]`) | SDK comercial | rama por defecto | Propietaria | Media |
| S13 | [Yeison07 formatterScannerInput.go](https://github.com/Yeison07/cedula-colombiana-pdf417-decoder/blob/master/utils/formatterScannerInput.go), [gist de pmogollons](https://gist.github.com/pmogollons/52d76cc219ae74baacc19b3f7c46e882) y sus comentarios, [jeanp117/use-usb-scanner](https://github.com/jeanp117/use-usb-scanner/blob/main/readme.md), [AndyRuix1/colombia-id-parser](https://github.com/AndyRuix1/colombia-id-parser) (npm `colombia-id-parser` 1.0.0, MIT, 2025-05-14) | Código derivado | ramas por defecto | Varias | Baja: derivan de Eitol |
| S14 | [Wikipedia ES, Cédula de ciudadanía (Colombia)](https://es.wikipedia.org/wiki/C%C3%A9dula_de_ciudadan%C3%ADa_(Colombia)), [LobbyPMS](https://soporte.lobbypms.com/hc/es/articles/38418438912147), [Capital Colombia](https://www.capitalcolombia.com/articulo/capitalxenon) | Divulgación y documentación comercial | Consultadas el 2026-10-06 | — | Baja: no describen el layout |

Sin resultado útil: la ficha PRADO del Consejo de la UE (HTTP 403), las páginas de la Registraduría (Cloudflare) y la documentación de Zebra, Honeywell y Dynamsoft (no describen el layout colombiano).

## Método

1. Bajé cada payload y especimen al scratchpad de la sesión, no al repo. Analicé las tramas con scripts que imprimen solo clases de carácter (`D` dígito, `L` letra, `N` NUL) y longitudes de corrida, nunca valores. Comparé las posiciones con el JSON de Eitol mediante igualdades booleanas.
2. Validé los códigos de lugar contra la tabla DIVIPOL de Eitol (`src/barcode/localities.py`, 1.190 filas parseadas) y contra la de Yeison07, imprimiendo solo `True`/`False`.
3. Calculé los dígitos de control ICAO 9303 (pesos 7-3-1, `<` = 0, A = 10) con un script propio.

Hallazgo práctico para quien cargue S1 como fixture: el `.txt` no son los bytes crudos. Es la trama decodificada como Latin-1 y guardada en UTF-8, más 4 `\n` al final (688 bytes en disco). Los bytes originales se recuperan con `decode('utf-8').encode('latin-1')` y quitando los `\n` finales: salen 531 bytes.

## Layout observado en S1 [V]

Corridas de la trama completa (531 bytes):

```
[0,2)     2 dígitos (prefijo; "03" en S1)
[2,10)    8 dígitos (AFIS según Eitol; coincide con afisCode del JSON)
[10,24)   14 NUL
[24,32)   "PubDSK_1"
[32,40)   8 NUL
[40,48)   campo numérico de 8 bytes: 6 dígitos + 2 NUL (coincide con fingerCard del JSON)
[48,58)   NUIP, 10 dígitos (coincide con documentNumber del JSON)
[58,81)   apellido 1, 23 bytes, relleno NUL
[81,104)  apellido 2, 23 bytes
[104,127) nombre 1, 23 bytes
[127,150) nombre 2, 23 bytes (vacío en S1: 23 NUL)
[150,168) bloque demográfico, 18 caracteres: "0" + M/F + 8 dígitos + 2 + 3 + 1 dígitos + RH (2)
[168]     NUL
[169]     dígito "2"
[170,330) bloque de plantilla 1: empieza por 02 31 00 ?? ?? FF 80 80, con relleno NUL al final
[330]     dígito "7"
[331,531) bloque de plantilla 2: empieza por 02 21 00 ?? ?? FF 80 80
```

La reconstrucción de fgardila (S4) tiene exactamente las mismas corridas hasta el byte 169, con espacios en lugar de NUL.

## Evidencia por hipótesis

### H01. Payload completo de 531 bytes
- **A favor:** S1 mide exactamente 531 bytes [V]. S5 rechaza tramas de menos de 531 bytes (`if (this.i.length < 531) throw …`) [V]. El README de Eitol dice "531 bytes en crudo" [V]. El 530 de Eitol es `barcode_min_len` para Dynamsoft, un mínimo, así que no contradice [V].
- **En contra:** ninguna. Los volcados de S3 miden 392-436 caracteres porque el lector eliminó los NUL. Eso refleja al lector, no a la trama.
- **Confianza:** alta (un payload real y una app comercial).

### H02. `PubDSK_1` en el byte 24, o en el 13 si se truncan los NUL
- **A favor (byte 24):** S1 [V], reconstrucción de S4 [V], S5 comprueba `"PubDSK_1".equals(a(24, 8))` [V], y los offsets relativos de S10 solo cuadran con el marcador en 24 [V].
- **En contra (13 como regla):** el 13 solo aparece en el ejemplo de Eitol (lector Netum en Windows, que deja 3 NUL). En los tres volcados de S3, el lector eliminó todos los NUL y el marcador queda en la posición 10 (dos casos) o 9 (un caso con 9 dígitos de cabecera) [V]. La posición truncada depende del lector.
- **Confianza:** alta para el 24; la parte "13" queda refutada como regla general.

### H03. NUIP = 10 dígitos inmediatamente antes de la primera letra
- **A favor:** en S1, `[48,58)` es igual a `documentNumber` del JSON [V]. En los tres volcados de S3, la corrida de dígitos tras el marcador mide 16 o 18 (campo `[40,48)` de 6 u 8 dígitos más 10 de NUIP) y sus últimos 10 son el NUIP [V]. Uno trae 2 ceros a la izquierda (cédula de 8 dígitos) y dos son NUIP de la serie de mil millones [V]. S5 lee `a(48, 10)` [V].
- **En contra:** ninguna.
- **Confianza:** alta. Hay que quitar los ceros a la izquierda.

### H04. Offsets de nombres
- **A favor:** S1 tiene cuatro campos de 23 bytes en `[58,81)`, `[81,104)`, `[104,127)` y `[127,150)` [V]. S5 lee ventanas de 23 en 58, 81, 104 y 127 [V]. El código de S10 usa 23 por campo (relativo al marcador) [V].
- **En contra:** el "hasta 26 caracteres" del documento de DF-VeraP lo contradice su propio código, que usa 23. Los extremos "58-80" del README de Eitol son un error de uno: el byte 80 es relleno del apellido 1.
- **Confianza:** alta. Reformular como intervalos semiabiertos de 23 bytes (lo que ya concreta G01).

### H05. Bloque demográfico
- **A favor:** en los 4 payloads reales (S1 y los tres de S3), el bloque tiene la forma `0` + `M/F` + 8 dígitos + 6 dígitos + RH de 2 caracteres, y mide 18 [V]. El sexto dígito tras la fecha es `0` en los cuatro [V]. S5 lee la fecha en 152 y el RH en 166 [V]. pmogollons pone el RH en sexo+15 [V].
- **En contra:** ningún payload trae RH `AB±`, así que no se sabe si ocupa 3 bytes y desplaza el separador (S5 leería solo `AB`).
- **Confianza:** alta para la forma; el caso AB queda abierto (ver H05b).

### H06. Departamento de 2 dígitos y municipio de 3 (DIVIPOL)
- **A favor:** en los 4 payloads reales, el par (2 dígitos, 3 dígitos) existe en la tabla DIVIPOL. Ninguna lectura alternativa existe: ni 3+3 al estilo Yeison07 con su tabla, ni dígito+2+3 [V]. En S1, el departamento resuelto coincide con el del JSON [V]. Por azar, un código de 5 dígitos acierta en la tabla con una probabilidad de alrededor del 1,1 % (unos 1.120 pares sobre 100.000), así que 4 de 4 no es casualidad [E].
- **En contra:** ninguna. Las etiquetas invertidas de Eitol (y pmogollons) son un error de nombre, no de posición.
- **Confianza:** alta.

### H07. Variante sin `PubDSK`
- **A favor:** S5 (código comercial de antes de 2015, independiente de fgardila) acepta tramas sin `PubDSK_1` si los bytes 22-33, sin NUL ni espacios, son numéricos, y aplica un desplazamiento de un byte `k` a todos los campos (NUIP 48+k, nombres 58+k…, fecha 152+k, RH 166+k) [V]. El código de fgardila de 2020 (S4, `IngresoActivityVision.java`) también tiene una rama sin `PubDSK`: un token menos antes del NUIP [V].
- **En contra:** no hay ningún payload público de esa variante.
- **Dirección del desplazamiento:** ambigua. La lectura literal del decompilado de S5 da `k = 1` con marcador y `k = 0` sin él, pero eso rompería S1 (perdería la primera letra del apellido). La lectura coherente con S1 es `k = 0` con marcador y `k = 1` sin él: los campos irían **una posición después** (+1). Eso contradice el −1 que asume G03 [E].
- **Confianza:** media en que existe; baja en la dirección.

### H08. Variante "fecha primero"
- **A favor:** solo los fixtures sintéticos de fgardila.
- **En contra:** ninguno de los 4 payloads reales ni la reconstrucción la muestran [V]. El código de 2020 lee la fecha con `substring(2, 10)` y el sexo con `contains("M")`, que funcionan con ambas formas. La forma "fecha primero" parece inferida de ese código, no observada [E]. S5 usa offsets fijos de sexo primero [V].
- **Confianza:** baja en que exista. Sigue pendiente, sin evidencia.

### H09. Todo lo posterior al RH es biométrico
- **A favor:** en S1, después del RH vienen un NUL, el dígito `2` y dos bloques con la misma cabecera binaria `02 xx 00 xx xx FF 80 80`, en 170 y en 331. Entre ambos está el dígito `7` y el primer bloque termina con relleno NUL [V]. Los tres volcados de S3 repiten el patrón: dos marcadores `0x80 0x80` (mojibake `ÇÇ`), el primero precedido por `2` y el segundo por `7` en los casos legibles [V]. Microblink expone `fingerprint` como `byte[]` en su reconocedor del reverso [V]. `2` y `7` son los códigos de posición de dedo ANSI/NIST para índice derecho e izquierdo [E].
- **En contra:** ninguna. Ningún campo de texto aparece después del RH.
- **Confianza:** alta en que no hay datos de texto tras el byte 168. Media en que sean dos plantillas de minucias de los índices (ver H13).

### H10. La tarjeta de identidad usa el mismo layout
- **A favor:** el tercer volcado de S3 empieza por `I3` en vez de `03`. Su titular nació después de 2002 según el bloque (no reproduzco la fecha). Por lo demás es idéntico: `PubDSK_1`, campo numérico de 8 + NUIP de 10 de la serie de mil millones, nombres, bloque de sexo primero con DIVIPOL válido y sexto dígito `0`, y dos plantillas [V]. S5 acepta como prefijos válidos exactamente `02`, `03` e `I3` [V]. La Circular Única v8 indica que la Morphotablet carga por "lectura del código de barras" tanto las cédulas amarillas como las tarjetas de identidad [V]. BlinkID añadió "COLOMBIA - MINORS ID (front, back)" en la versión 5.9.0 [V].
- **En contra:** no consta que ese volcado sea de una TI. Si se capturó después de que el titular cumpliera 18, sería una cédula [E]. No hay especímenes de TI.
- **Confianza:** media. Sube de "nadie lo documenta" a "probable, con prefijo `I3`".

### H11. Primera letra P/A/R
- **A favor de la hipótesis (no hay P/A/R en el PDF417):** Macorreag habla de "una serie de números en la parte inferior del código de barras", es decir, de la **línea impresa**, no del payload [V]. En las 5 tramas observadas, el payload empieza por `03` (4) o `I3` (1) y el bloque demográfico por `0` (4 de 4) [V].
- **En contra:** nada en el PDF417. La afirmación sobre la línea impresa no se puede verificar con fuentes públicas.
- **Confianza:** alta para el PDF417.

### M01. Serial de 9 dígitos en L1[5-13] y dígito de control en L1[14], que puede ser `<`
- **A favor:** espécimen anterior S6, leído por mí: `ICCOL000000012305001<<<<<<<<<<`, serial `000000012` y L1[14] = `3` [V]. Espécimen actual S7: `ICCOL000000012<<<<<<<<<<<<<<<<`, con L1[14] = `<` [V en las dos transcripciones].
- **En contra:** el `3` de S6 no es el CD ICAO de `000000012`, que es 5 [V]. Es el CD de `12` sin ceros, que es exactamente lo que calcula el parser de Eitol, en contra de ICAO [V]. fgardila afirma que las tarjetas reales validan con la segmentación estándar, pero no publica datos [E].
- **Confianza:** alta en las posiciones. El valor del CD en los especímenes no es fiable.

### M02. NUIP en el opcional de la línea 2
- **A favor:** en ambos especímenes, L2[18-28] = `1234567890<`: un campo de 11 caracteres con 10 dígitos y relleno [V]. El anverso de S6 muestra `NUIP 1.234.567.890` [V]. Eitol lee `[18:28]` (10) y fgardila lee `[18,29)` (11) y quita los `<` [V].
- **En contra de "11 dígitos":** la lectura de 11 de fgardila es el ancho del campo ICAO, no un NUIP de 11 dígitos. Ninguna fuente muestra un número de 11 dígitos en una MRZ. No encontré ninguna TI en policarbonato con MRZ: la Circular v8 asocia la MRZ solo a cédulas en policarbonato [V a 2023, E a 2026].
- **Confianza:** alta. Leer 11 caracteres y quitar los `<`.

### M03. El opcional de la línea 1 [15-19] es el DIVIPOL de expedición
- **A favor:** S6 trae `05001` en L1[15-19]. En la tabla DIVIPOL de la Registraduría es BOLÍVAR/CARTAGENA, y el anverso del mismo espécimen dice "Lugar de nacimiento CARTAGENA (BOLÍVAR)" y "Fecha y lugar de expedición … CARTAGENA" [V]. En DIVIPOLA (DANE), `05001` sería Medellín, que no cuadra [V].
- **En contra o abierto:** en el espécimen actual (S7), L1[15-29] es todo `<` [V en las transcripciones], así que el campo puede venir vacío. Como en S6 nacimiento y expedición coinciden, no se sabe cuál de los dos codifica. El parser de Eitol lanza una excepción si no encuentra el código, lo que fallaría con el espécimen actual [V].
- **Confianza:** media. Que es DIVIPOL y no DIVIPOLA, alta (resuelve D05). Expedición o nacimiento: abierto. Presencia: opcional.

### M04. El espécimen `back-ccd.png` tiene el dígito compuesto inválido
- **Corrección:** nuestro registro dice "calcula 9, impreso 8"; las fuentes dicen lo contrario. fgardila escribe "prints composite check digit `9` where the computation … gives `8`", y el SVG de chewto transcribe L2 como `8808213F3101300COL1234567890<9` [V]. Con L1 = `ICCOL000000012<<<<<<<<<<<<<<<<` calculé un compuesto ICAO de **8** [V]. Si L1[14] fuera `3`, el compuesto daría 9, el valor impreso. Probablemente el arte se generó con un CD de serial que luego no se imprimió [E].
- **Además:** el espécimen anterior (S6) también es inválido. Su CD de serial impreso es 3 (calculado 5) y su compuesto impreso es 0 (calculado 5). Los CD de nacimiento y vencimiento sí validan [V]. Su MRZ tampoco coincide con el anverso: 15 de marzo de 2004 frente a "15 ABR 2004", y vencimiento en marzo frente a "19 ABR 2032" [V].
- **Confianza:** alta en el cálculo. La lectura del impreso en `back-ccd.png` depende de dos transcripciones secundarias concordantes, porque la imagen oficial no fue accesible.

### N01. Número de TI de 11 dígitos (`ti-antigua`)
- **A favor:** la Resolución 3571 del 30 de septiembre de 2003, art. 3, establece que los menores con "número de identificación personal NIP, de once (11) dígitos" lo conservan como número de su tarjeta de identidad hasta la mayoría de edad [V]. La Circular Única v8 (§2.2.1) dice que el NIP consta de 6 dígitos de fecha de nacimiento (año-mes-día) y 5 complementarios, que "la penúltima cifra indica el sexo del inscrito: par para los hombres e impar para las mujeres", que "la última cifra es un dígito de control" (fórmula no publicada) y que se asignó desde el 12 de octubre de 1971 [V]. El NUIP alfanumérico (Res. 146 del 18 de enero de 2000) sustituyó al NIP en los registros desde el 1 de febrero de 2000 [V]. El NUIP numérico tiene 10 dígitos desde 1.000.000.000, y el cupo 1.000.000.000-1.009.999.999 se reservó para las equivalencias del alfanumérico [V].
- **Implicación:** los NIP corresponden a nacidos como mucho a inicios de 2000, que cumplieron 18 hacia 2018. Hoy un número de TI de 11 dígitos solo puede venir de un documento vencido o de registros históricos [E].
- **En contra o abierto:** el campo NUIP del PDF417 mide 10 bytes `[48,58)`, así que un NIP de 11 no cabe. No se sabe cómo se codificaba en las TI con código de barras [E]. No hay payloads.
- **Confianza:** alta en que los números de 11 dígitos existen; nula sobre su presencia en el PDF417 o en la MRZ.

### Hipótesis relacionadas del mismo archivo
- **G01** (disposición exacta): **refutada en parte**. S1 y S4 tienen `[32,40)` = 8 NUL y `[40,48)` = 6 dígitos + 2 NUL. No existen "[32] NUL, [33,39) 6 dígitos, [39] NUL" [V]. En S3, el campo `[40,48)` trae 8 dígitos en 2 de 3 casos [V]: es un campo numérico de 8 bytes alineado a la izquierda con relleno NUL ("tarjeta dactilar" según Eitol). El resto de G01 se confirma.
- **G02** (Windows solo pierde los NUL de la cabecera): no generalizable. Los lectores de S3 eliminaron **todos** los NUL [V], y entonces las fronteras entre apellidos y nombres se pierden: los nombres quedan concatenados sin separador. Del caso Netum/Windows sigue sin haber evidencia.
- **G03** (desplazamiento −1 sin `PubDSK`): la única fuente con dirección (S5) apunta a +1 bajo la interpretación coherente con S1 [E]. Sigue pendiente.
- **G05** (línea 3): S6 (`WALTEROS<<LAURA`) y S7 (`VELEZ<RUIZ<<GERONIMO`) confirman `APELLIDO1<APELLIDO2<<NOMBRE` con relleno `<` [V]. Siguen sin espécimen con Ñ ni con apellido compuesto.
- **D04** (`00000` = lugar no registrado): el único ejemplo es la reconstrucción de fgardila, cuya cabecera (`0123456789`) y tarjeta (`123456`) son marcadores de posición evidentes. Probablemente `000000` también lo es [E]. Los 4 payloads reales traen códigos DIVIPOL válidos. La evidencia de D04 es más débil de lo registrado.
- **D05** (MRZ en DIVIPOL y no DIVIPOLA): **confirmada por espécimen** (ver M03). El `05001` de Eitol no es un ejemplo sintético suyo: es la MRZ del espécimen anterior, cuyo anverso dice Cartagena.

## Hipótesis nuevas propuestas

| ID | Hipótesis | Evidencia | Estado propuesto |
|---|---|---|---|
| H05b | El RH `AB±` ocupa 3 bytes `[166,169)` y desplaza el separador y la cola | Ningún payload AB; S5 leería solo `AB` | pendiente |
| H12 | Los bytes `[0,2)` son un código de tipo o versión del documento: `03` cédula (4 de 4 legibles), `I3` probablemente TI (1), `02` aceptado por S5 sin ejemplo. `[2,10)` son los 8 dígitos AFIS | S1, S3, S5 y el README de Eitol | pendiente (probable) |
| H13 | Desde el byte 168: NUL, dígito de posición de dedo (`2`), plantilla 1 con cabecera `02 xx 00 xx xx FF 80 80`, dígito (`7`), plantilla 2. `2` y `7` son índice derecho e izquierdo (ANSI/NIST) | S1 [V], S3 [V], semántica [E] | pendiente (probable) |
| H14 | Algunos lectores eliminan todos los NUL. En esas tramas, la frontera entre los cuatro campos de nombre es irrecuperable y solo son fiables el NUIP, el bloque demográfico y el nombre completo concatenado | S3 [V] | confirmada (1 fuente, 3 tramas) |
| M05 | Los especímenes públicos de la cédula digital (anterior y actual) no son autoconsistentes: dígitos de control ICAO inválidos y, en el anterior, fechas MRZ distintas del anverso. Solo sirven como fixtures negativos | S6 [V], S7 [V cálculo] | confirmada |
| N02 | NIP de 11 dígitos = AAMMDD + 5. La penúltima cifra par indica hombre y la impar mujer. La última es un dígito de control con fórmula no publicada | Circular Única v8 §2.2.1 [V] | confirmada (estructura); fórmula del CD desconocida |

## Impacto en la spec

1. **Parser PDF417, trama completa:** offsets fijos de S1 como camino principal. Campos de nombre de 23 bytes; `[40,48)` es un campo numérico de 8 bytes, no "6 dígitos en [33,39)". El generador sintético (G01) debe corregirse: es un cambio de contrato (MAJOR de `VERSION_CONTRATO`, requisito FX-14).
2. **Parser PDF417, tramas truncadas:** localizar `PubDSK_1` por búsqueda, sin posición fija. Si la trama no trae NUL, devolver el nombre completo concatenado con un `warning` (H14) en lugar de partir en cuatro.
3. **Prefijo `[0,2)`:** exponerlo como dato crudo (`prefijo`) y no rechazar valores distintos de `03`. Si es `I3`, emitir un `warning` H10/H12 y no afirmar que es una cédula.
4. **Todo lo posterior al RH (byte 168 en adelante)** se descarta sin registrarlo en logs ni en `warnings` (H09/H13; Ley 1581). Las fixtures no deben contener plantillas reales.
5. **MRZ:** NUIP = L2[18,29) sin `<` (M02). Validar los 4 CD ICAO. Con CD de serial `<`, validar solo el compuesto (M01). El opcional de L1 es opcional: si trae 5 dígitos, buscarlo en DIVIPOL (no DIVIPOLA) y etiquetarlo como "lugar" con `warning` M03, sin afirmar si es expedición o nacimiento. Los dos especímenes son fixtures **negativos** (M04, M05).
6. **Validador `formato-nuip` (NF-09):** `ti-antigua` de 11 dígitos queda respaldado por norma. Puede añadir dos comprobaciones blandas: que `AAMMDD` sea una fecha válida, y la paridad de la penúltima cifra frente al sexo, si se conoce (N02). El dígito de control no se puede verificar.
7. **Fixtures:** no versionar S1 ni S3. Si se necesita un payload "real", usar el generador sintético con el layout de S1 y documentar que deriva de la estructura, no de los valores.

## Decisión recomendada

Aplicar la tabla de cambios de abajo a `hipotesis-formato.md` cuando terminen los redactores. Corregir G01 en el generador. Limpiar los datos personales copiados en `docs/investigacion/01-formato-cedula-y-repos.md` (bloque de S1 y cadena de fgardila) y en la evidencia de D04. Corregir también allí "npm: ningún paquete": existe `colombia-id-parser` 1.0.0 (MIT, 2025-05-14), derivado de Eitol. Las hipótesis que siguen pendientes (H07, H08, H10, H05b, M03 expedición o nacimiento) solo se resuelven con el set de campo: pedir en el protocolo de captura al menos una TI celeste, una cédula con RH AB y, si aparece, una amarilla antigua sin `PubDSK`.

## Cambios de estado propuestos para `hipotesis-formato.md` (no aplicados)

| ID | Estado actual | Estado propuesto | Texto de evidencia propuesto |
|---|---|---|---|
| H01 | pendiente | **confirmada** | 531 bytes en el payload público de Eitol (`best_quality_1.txt`, decodificado UTF-8 → Latin-1, sin los 4 `\n` finales); la app Verifíquese exige ≥ 531. El 530 de Eitol es un mínimo. Ver `2026-10-06-evidencia-hipotesis-formato.md` |
| H02 | pendiente | **confirmada (byte 24); refutada como regla la posición 13** | Byte 24 en Eitol, en la reconstrucción de fgardila, en Verifíquese y en DF-VeraP. En tramas sin NUL el marcador cae en 9-10 (tres volcados públicos): la posición truncada depende del lector y se busca, no se fija |
| H03 | pendiente | **confirmada** | Eitol (`[48,58)` igual a `documentNumber`), tres volcados públicos y Verifíquese `a(48,10)`. Quitar los ceros a la izquierda |
| H04 | pendiente | **confirmada con corrección** | Cuatro campos de 23 bytes: `[58,81)`, `[81,104)`, `[104,127)`, `[127,150)`. El "hasta 26" de DF-VeraP lo contradice su propio código (23) |
| H05 | pendiente | **confirmada** (salvo RH AB, nueva H05b) | 4 de 4 payloads reales: 18 caracteres, sexo primero, sexto dígito `0` en los cuatro |
| H06 | pendiente | **confirmada** | 4 de 4 payloads reales resuelven con depto(2)+municipio(3) en DIVIPOL; ninguna lectura alternativa resuelve |
| H07 | pendiente | pendiente (existencia probable) | Verifíquese (antes de 2015) y fgardila 2020 tienen rama sin `PubDSK`; Verifíquese desplaza todos los campos 1 byte. Dirección probable +1 (contradice G03). Sin payload |
| H08 | pendiente | pendiente (sin evidencia; probable artefacto) | Ningún payload real ni la app comercial la muestran; parece inferida del `substring(2,10)` de 2020 |
| H09 | pendiente | **confirmada** (precisada por H13) | Tras el byte 168 solo hay cabecera y dos bloques binarios con cabecera `02 xx 00 xx xx FF 80 80` (Eitol y tres volcados); Microblink expone `fingerprint` como bytes |
| H10 | pendiente | pendiente (probable, prefijo `I3`) | Volcado público con prefijo `I3` y layout idéntico; Verifíquese acepta `02`/`03`/`I3`; la Circular Única v8 trata igual el código de barras de la TI y de la amarilla; BlinkID lee el reverso de la TI. Falta un especimen o una TI del set de campo |
| H11 | pendiente (probable refutación de Macorreag) | **confirmada** (para el PDF417) | Macorreag habla de la línea impresa bajo el código, no del payload. Payloads: prefijo `03`/`I3` y bloque `0M`/`0F` en 5 de 5 |
| M01 | pendiente | **confirmada** (posiciones) | Especímenes: L1[14] = `3` en el anterior y `<` en el actual. Los valores de CD de los especímenes no son ICAO-válidos (M05) |
| M02 | pendiente | **confirmada con corrección** | Campo de 11 caracteres L2[18,29); en ambos especímenes, NUIP de 10 + `<`. "11" es el ancho del campo, no un NUIP de 11 dígitos |
| M03 | pendiente | pendiente (codificación confirmada: DIVIPOL) | Espécimen anterior: `05001` = Cartagena en DIVIPOL, coherente con el anverso. Espécimen actual: vacío. Sin resolver si es expedición o nacimiento |
| M04 | pendiente | **confirmada con corrección** | Impreso **9**, calculado **8** (al revés de lo registrado). Dos transcripciones (fgardila y chewto) y cálculo propio. El espécimen anterior también es inválido (M05) |
| N01 | pendiente | **confirmada** (existencia y estructura) | Res. 3571/2003 art. 3 y Circular Única v8 §2.2.1: NIP de 11 = AAMMDD + 5, número de la TI hasta los 18. Histórico (nacidos hasta ~2000). No cabe en el campo NUIP de 10 bytes del PDF417 |
| G01 | pendiente | **refutada en parte** | `[32,40)` = 8 NUL; `[40,48)` = campo numérico de 8 bytes (6 dígitos + 2 NUL en Eitol, 8 dígitos en 2 de 3 volcados). No hay 6 dígitos en `[33,39)` |
| G02 | pendiente | pendiente (no generalizable) | Hay lectores que eliminan todos los NUL (ver H14) |
| G03 | pendiente | pendiente (evidencia débil en contra) | Verifíquese sugiere +1, no −1 |
| G05 | pendiente | pendiente (parcialmente confirmada) | Especímenes `WALTEROS<<LAURA` y `VELEZ<RUIZ<<GERONIMO`. Sin Ñ ni apellido compuesto |
| D04 | pendiente | pendiente (evidencia debilitada) | El único ejemplo es una reconstrucción con marcadores de posición; los 4 payloads reales traen DIVIPOL válido. Retirar el bloque citado (dato personal) |
| D05 | pendiente | **confirmada** | Espécimen anterior: `05001` = Cartagena (DIVIPOL), coherente con el anverso; en DIVIPOLA sería Medellín |
| H05b, H12, H13, H14, M05, N02 | — | nuevas (ver la sección "Hipótesis nuevas propuestas") | |
