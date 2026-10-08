# Para el abogado: paquete de revisión (BORRADOR)

> **BORRADOR.** Preparado por el equipo técnico, que no es abogado. Todo el contenido de `docs/legal/` es borrador hasta su aprobación escrita por un abogado colombiano de protección de datos. Fecha: 2026-10-07.

## 1. El producto en una página

Software autoalojado que lee la cédula colombiana con la cámara de un celular:
- **Cédula amarilla:** lee el código PDF417 del reverso. Extrae número, nombres, apellidos, sexo, fecha y lugar de nacimiento, grupo sanguíneo y RH. **Descarta sin interpretar** los códigos AFIS, la tarjeta decadactilar y el bloque de huella (spec PA-16).
- **Cédula digital:** lee la zona de lectura mecánica (MRZ). **El QR nunca se decodifica** (OFF-07, principio V de la constitución).
- **No** consulta a la Registraduría ni certifica autenticidad. **No** compara rostros en la versión actual (MS-13).

Componentes:
1. **PWA** (app web instalable): lee 100 % en el dispositivo, funciona sin internet tras la primera visita, no carga recursos de terceros (OFF-04), no guarda imágenes ni resultados en ningún almacenamiento del navegador y pone a cero los buffers tras leer (OFF-11). Muestra el resultado enmascarado (`********56`, `P***** E******`) (OFF-09).
2. **Servidor de respaldo (opcional)**: API para integradores. Recibe imágenes, las procesa en memoria, sin escribirlas en disco ni en registros (MS-04, AV-32); exige `autorizacion.datos = true` (y `sensibles = true` para comparación facial); conserva el resultado 24 h por defecto (AV-24); `DELETE` lo suprime y deja un registro mínimo de prueba de la autorización sin datos del documento.
3. **Datos de lugar de nacimiento**: tablas DANE y Registraduría con licencia CC BY-SA 4.0, con atribución.

## 2. Flujo de datos

```
Titular presenta cédula -> cámara del celular -> [PWA] lectura en el dispositivo -> resultado enmascarado en pantalla -> se borra al "Leer otra" o al salir
                                             \-> (opcional, integrador) imágenes por TLS -> [Servidor] memoria -> resultado JSON (24 h) -> integrador / webhook
                                                                                                      \-> registro de autorización (sin datos del documento)
Set de campo (solo desarrollo): fotos reales con consentimiento firmado, cifradas, fuera del repositorio, con fecha de eliminación.
```

## 3. Decisiones que debe tomar

| # | Decisión | Opciones / nota técnica |
|---|---|---|
| D1 | ¿Quién es **responsable** y quién **encargado**? | Propuesta: el integrador es responsable; el autor del software no trata datos (solo PWA) o es encargado si opera el servidor para un cliente. |
| D2 | ¿Hay tratamiento en la variante "solo PWA" sin transmisión? ¿Requiere autorización o basta aviso? | El dato nunca sale del teléfono ni se guarda. |
| D3 | **Base legal** y finalidad tipo | Autorización (art. 9 Ley 1581) o excepción del art. 10 (p. ej. entidades con obligación legal, SARLAFT). |
| D4 | ¿La **cédula y sus datos** son dato sensible? ¿Y el **grupo sanguíneo y RH** (¿dato de salud?)? | Hoy la autorización lo deja como pregunta. |
| D5 | **Comparación facial** como dato biométrico sensible: requisitos si se activa (autorización explícita, alternativa no biométrica, evaluación de impacto). | Desactivada hoy; la API ya separa la casilla `sensibles`. |
| D6 | **Menores / tarjeta de identidad**: ¿se admite? ¿cómo se acredita la representación legal en un flujo digital? | Hoy solo cédula de ciudadanía. |
| D7 | **Conservación del registro de autorización**: plazo y contenido mínimo para probarla (art. 7 Decreto 1377). | Hoy: id, casillas, versión del texto, fechas, motivo de supresión. |
| D8 | **Transferencias / transmisiones internacionales** si el servidor está en la nube fuera de Colombia: contrato de transmisión, país adecuado, declaración de conformidad. | Depende del integrador. |
| D9 | **Set de campo**: base, fotografía del anverso (dato sensible), plazo, almacenamiento. | Ver `consentimiento-set-campo.md`. |
| D10 | ¿Aplica **RNBD**, **Ley 1266 de 2008** o **Ley 2300 de 2023**? | Solo si el integrador usa los datos con fines crediticios o de cobranza/contacto comercial. |
| D11 | Licencia del propio software, cláusulas de exclusión de responsabilidad válidas y efecto de CC BY-SA 4.0. | Ver `terminos-de-uso.md`, `licencias-terceros-usuarios.md`. |
| D12 | ¿Es aceptable el **retención de 24 h** por defecto del resultado? | Configurable (`RETENCION_RESULTADOS_S`). |

## 4. Riesgos identificados

1. **Suplantación de identidad:** el integrador puede tratar la lectura como verificación oficial. Mitigación: descargo en términos y autorización.
2. **Biometría incidental:** la foto del documento y el PDF417 contienen biometría aunque el software no la lea; con servidor, las imágenes viajan.
3. **Modificación por el integrador** (código abierto) para guardar imágenes o leer la huella: la responsabilidad recae en él, pero conviene cláusula expresa.
4. **Datos de menores** si alguien presenta una tarjeta de identidad.
5. **Transferencia internacional** no declarada si el servidor corre en una nube extranjera.
6. **Exactitud:** el formato del PDF417 no es público; errores de lectura afectan el principio de veracidad (art. 4 lit. d).
7. **Atribución CC BY-SA** omitida en la PWA (la pantalla "Acerca de / Licencias" aún no existe).
8. **Prueba de la autorización** en la variante solo PWA: hoy no se registra nada.

## 5. Preguntas concretas

1. ¿Quién es responsable en cada variante (PWA sola, PWA más servidor del integrador, servidor operado por nosotros)?
2. En la PWA sin transmisión ni almacenamiento, ¿basta el aviso corto o se requiere autorización expresa con casilla y registro?
3. ¿El grupo sanguíneo y RH es dato sensible? ¿Debería el producto ocultarlo o no leerlo por defecto?
4. ¿El número de cédula, por sí solo, tiene algún tratamiento especial?
5. Si se activa comparación facial: ¿qué exige la SIC además de la autorización explícita (evaluación de impacto, alternativa no biométrica)?
6. ¿Cuánto tiempo y con qué contenido debemos conservar el registro de prueba de la autorización tras la supresión?
7. ¿Qué instrumento exigir al integrador que aloje el servidor fuera de Colombia?
8. ¿Se pueden fotografiar cédulas reales para el set de campo cubriendo la foto? ¿Qué plazo máximo recomienda?
9. ¿Qué exclusiones de responsabilidad son válidas en los términos frente a integradores y frente a consumidores?
10. ¿La obligación CompartirIgual de CC BY-SA 4.0 se limita al módulo de datos adaptado?

## 6. Archivos del paquete

- `autorizacion-tratamiento.md`: texto de autorización (variantes A y B) y requisitos técnicos ya especificados.
- `aviso-privacidad-app.md`: aviso corto para la pantalla.
- `politica-tratamiento-datos.md`: plantilla de política para el integrador.
- `terminos-de-uso.md`: términos y descargo (no es verificación oficial).
- `licencias-terceros-usuarios.md`: texto de "Acerca de / Licencias".
- `consentimiento-set-campo.md`: consentimiento para fotos reales de desarrollo.

## 7. Fuentes normativas

- Ley 1581 de 2012: https://www.secretariasenado.gov.co/senado/basedoc/ley_1581_2012.html
- Decreto 1377 de 2013: https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=53646
- Decreto 1074 de 2015 (compilación, cap. 25 y 26): https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=76608
- Ley 1266 de 2008: https://www.secretariasenado.gov.co/senado/basedoc/ley_1266_2008.html
- Circular Única SIC, título V, y guías SIC (datos biométricos, transferencias internacionales, responsabilidad demostrada): https://www.sic.gov.co/ [E: ubicar la versión vigente y la URL exacta de cada guía]
- Pronunciamiento SIC reciente: datos biométricos (reconocimiento facial, huella) son sensibles y no pueden exigirse como condición de acceso; debe ofrecerse alternativa (agosto de 2026, reportado en prensa): https://www.eltiempo.com/justicia/servicios/la-sic-prohibe-a-las-administraciones-exigir-datos-biometricos-para-ingresar-a-conjuntos-residenciales-3575752 [E: ubicar la resolución original en sic.gov.co]
- Ley 2300 de 2023 [E: confirmar URL en funcionpublica.gov.co].

Las URL de normas se citan por su ubicación habitual en los portales oficiales; no se descargó su texto en esta revisión [E]. El abogado debe confirmar vigencia y artículos.
