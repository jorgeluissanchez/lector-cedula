# Checklist de cumplimiento: Ley 1581 de 2012 y Decreto 1377 de 2013

Fecha: 2026-10-07. Preparado por el equipo técnico, que no es abogado. Estados: **CUMPLE** (verificable en el repositorio), **PENDIENTE** (trabajo técnico), **RESPONSABLE** (lo debe hacer o decidir [RAZÓN SOCIAL]). [V] = artículo cotejado con el texto oficial; [E] = estimado, por confirmar.

Textos oficiales cotejados: Ley 1581 https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981 · Decreto 1377 https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=53646

## Para quien autoaloja

Este repositorio es software libre (MIT). Si usted despliega una instancia, usted (persona o empresa) es el Responsable del tratamiento de esa instancia (Ley 1581, art. 3 lit. e) y este checklist es suyo: donde dice [RAZÓN SOCIAL] o RESPONSABLE, léase "usted". Los autores del software no tratan los datos de su instancia ni responden por ella. Empiece por `README.md` de esta carpeta.

**Instancia de demostración del autor.** Si el autor publica una demo (por ejemplo en Vercel), se recomienda dejar el servidor de respaldo desactivado para que toda lectura ocurra en el navegador y no se transmitan datos; aun así la demo necesita su propio aviso de privacidad, términos y autorización con los datos del autor como responsable, y no debe usarse con cédulas de terceros.

## A. Antes de publicar (bloqueantes)

| # | Requisito | Norma | Estado | Qué falta |
|---|---|---|---|---|
| A1 | Identificación completa del responsable en política, aviso y autorización | Decreto 1377 arts. 13.1 y 15.1 [V]; Ley 1581 art. 12 lit. d [V] | RESPONSABLE | Llenar [RAZÓN SOCIAL], [NIT], [DOMICILIO], [CORREO DE ATENCIÓN], [TELÉFONO] |
| A2 | Finalidad específica | Decreto 1377 art. 5 [V] | RESPONSABLE | Llenar [NOMBRE DEL TRÁMITE] y elegir opción A o B en la política, sección 6.3 |
| A3 | Política publicada en lenguaje claro | Decreto 1377 art. 13 [V] | PENDIENTE | Publicarla en una URL de la PWA (Vercel) |
| A4 | Aviso de privacidad antes de la cámara | Decreto 1377 arts. 14 y 15 [V] | PENDIENTE | Integrar `publicacion/aviso-privacidad.md` en la PWA |
| A5 | Autorización previa, expresa, con casilla desmarcada | Ley 1581 art. 9 [V]; Decreto 1377 art. 7 [V] | PENDIENTE | Integrar `publicacion/autorizacion.md`; la cámara no abre sin la casilla |
| A6 | Descargo "no es verificación oficial" | Ley 1581 art. 4 lit. d (veracidad) [V] | PENDIENTE | Integrar `publicacion/descargo-y-enlaces.md` |
| A7 | Atribución CC BY-SA 4.0 | Licencia CC BY-SA 4.0, sec. 3 | CUMPLE (sin commit) | La pantalla existe en `apps/pwa/src/licencias.ts`; falta hacer commit y desplegarla |
| A8 | Canal de consultas y reclamos activo | Decreto 1377 art. 23 [V]; Ley 1581 arts. 14 y 15 [V] | RESPONSABLE | Buzón real y persona asignada |
| A9 | Ubicación del servidor de respaldo | Ley 1581 art. 26 [V]; Decreto 1377 arts. 24 y 25 [V] | RESPONSABLE | Llenar [PAÍS DEL SERVIDOR]; si no hay contrato con Hostinger, **no activar el servidor** |

## B. Ley 1581 y Decreto 1377, punto por punto

| # | Requisito | Norma | Estado | Nota |
|---|---|---|---|---|
| B1 | Prueba de la autorización | Decreto 1377 art. 8 [V]; Ley 1581 art. 12 parágrafo [V] | PENDIENTE (variante B) / CUMPLE (servidor, especificado) | Solo PWA: la lectura ocurre íntegramente en el dispositivo; el responsable no recibe ni conserva datos y nada persiste (OFF-11); la casilla documenta la autorización frente al titular en cada sesión; guardar capturas fechadas de cada versión del texto. Variante B: el sistema del trámite del responsable/integrador registra versión del texto, fecha y hora e identificador de sesión del trámite, SIN datos de la cédula. Los textos ya no prometen prueba en la variante solo PWA. [DECISIÓN DEL ABOGADO, pregunta prioritaria 0] |
| B2 | Datos sensibles: autorización aparte y facultativa | Ley 1581 arts. 5 y 6 [V]; Decreto 1377 art. 6 [V] | CUMPLE (hoy no hay biometría) | Grupo sanguíneo y RH: posible dato de salud. Recomendación técnica: ocultarlo si el trámite no lo necesita |
| B3 | Menores | Ley 1581 art. 7 [V]; Decreto 1377 art. 12 [V] | CUMPLE (textos) / PENDIENTE (prueba automática del rechazo) | Solo cédulas de ciudadanía de mayores de edad; la tarjeta de identidad y edad < 18 años se rechazan. Declarado en aviso, autorización, términos y política. Admitir TI exige autorización del representante e interés superior (art. 12) |
| B3b | Tarjeta de identidad activable | Ley 1581 art. 7 [V]; Decreto 1377 art. 12 [V] (cotejados 2026-10-09) | PENDIENTE (revisión del abogado) | Antes de activar `LECTOR_ADMITIR_TI` o `VITE_ADMITIR_TI`, el abogado revisa `autorizacion-representante-ti.md`, la sección de TI del aviso y la política y responde la pregunta 11 de `PARA-EL-ABOGADO.md`. Sin esa revisión, ambos parámetros quedan apagados |
| B4 | Consultas: 10 días hábiles + 5 | Ley 1581 art. 14 [V] | RESPONSABLE | Procedimiento interno y registro de solicitudes |
| B5 | Reclamos: 15 días hábiles + 8; subsanar en 5 días; traslado en 2; leyenda "reclamo en trámite" en 2 | Ley 1581 art. 15 [V] | RESPONSABLE | Igual |
| B6 | Persona o área de protección de datos ("oficial") | Decreto 1377 art. 23 [V] | RESPONSABLE | Designarla por escrito; puede ser el propio representante legal en una empresa pequeña [E] |
| B7 | Manual interno de políticas y procedimientos | Ley 1581 art. 17 lit. k [V] | RESPONSABLE | Puede partir de la política y este checklist |
| B8 | Seguridad | Ley 1581 art. 4 lit. g [V], art. 17 lit. d [V] | CUMPLE en diseño | Lectura en el dispositivo, sin almacenamiento, TLS, registros sin datos (OFF-11, MS-04, AV-32) |
| B9 | Reportar incidentes a la SIC | Ley 1581 art. 17 lit. n [V] | RESPONSABLE | Procedimiento de incidentes; reporte en el RNBD dentro de 15 días hábiles según la Circular Única [E] |
| B10 | Conservación limitada y supresión | Decreto 1377 art. 11 [V] | CUMPLE | Resultado del servidor: 24 h (AV-24). Fijar [PLAZO DE CONSERVACIÓN DE LA PRUEBA] |
| B11 | Contratos de transmisión con encargados | Decreto 1377 art. 25 [V]; Ley 1581 art. 17 lit. i [V] | RESPONSABLE | **Vercel:** aceptar su DPA (Data Processing Addendum) en la cuenta y archivarlo; Vercel solo ve IP y datos técnicos. **Hostinger:** aceptar y archivar su acuerdo de tratamiento de datos; verificar que incluya las tres obligaciones del art. 25 (tratar según principios, seguridad, confidencialidad) y, si no, firmar un anexo. Dokploy es software autoalojado: no es encargado |
| B12 | Transmisión internacional | Decreto 1377 art. 24 [V] | RESPONSABLE | Con contrato del art. 25 no hay que informar ni pedir consentimiento; la política lo informa por transparencia |
| B13 | Transferencia internacional (si un tercero usa los datos para sí) | Ley 1581 art. 26 [V] | CUMPLE (no hay) | Si hubiera: país con nivel adecuado (Circular Externa 005 de 2017 de la SIC incluye Estados Unidos y los países de la Unión Europea [E]) o declaración de conformidad de la SIC (parágrafo 1) |
| B14 | Registro Nacional de Bases de Datos | Ley 1581 art. 25 [V]; Decreto 090 de 2018 [E] | RESPONSABLE | Obligatorio solo para sociedades y entidades sin ánimo de lucro con activos totales superiores a 100.000 UVT, y para personas jurídicas de naturaleza pública. Si no aplica, conservar la constancia contable de los activos |
| B15 | Responsabilidad demostrada | Decreto 1377 arts. 26 y 27 [V] | PENDIENTE | Programa integral según la guía de la SIC; este repositorio (specs, pruebas, revisiones de privacidad) sirve como evidencia técnica |
| B16 | IA y datos personales | SIC, Circular Externa 002 de 2024 [E] | CUMPLE en diseño | El OCR no decide números con modelos generativos (principio V); minimización de datos |

## C. Ubicación del servidor (Hostinger)

Según la página de soporte de Hostinger (2026-10-07), sus VPS están en Francia, Alemania, Lituania, Reino Unido, India, Indonesia, Malasia y Estados Unidos; **ninguno en Colombia** [E: confirmar en el panel]. Por tanto, usar el servidor de respaldo implica siempre una **transmisión internacional**:
1. Elegir de preferencia un datacenter en Estados Unidos o en la Unión Europea (países incluidos en la lista de nivel adecuado de la SIC [E]).
2. Tener el contrato de transmisión del art. 25 del Decreto 1377 (B11).
3. Si se elige India, Indonesia o Malasia, confirmar con el abogado si están en la lista de la SIC [E].
4. Llenar [PAÍS DEL SERVIDOR] en la política y en el texto de la autorización.

## D. Qué hacer los dos meses hasta que llegue el abogado

1. **Semana 1:** llenar los marcadores de la sección A; activar el buzón; designar a la persona responsable (B6); aceptar y archivar los DPA de Vercel y Hostinger.
2. **Semana 1:** dejar el servidor de respaldo **desactivado** hasta tener B11 y [PAÍS DEL SERVIDOR].
3. **Semanas 1 y 2:** integrar aviso, casilla y descargo en la PWA mediante un cambio OpenSpec, con pruebas E2E de que la cámara no abre sin la casilla.
4. **Continuo:** llevar un registro de solicitudes de titulares (fecha de recibido, tipo, fecha de respuesta) para cumplir los plazos de B4 y B5.
5. **Continuo:** guardar cada versión publicada de los textos con su fecha (Git sirve como prueba).
6. **Antes de la visita:** revisar `PARA-EL-ABOGADO.md` y sumar las preguntas nuevas: prueba de la autorización en la PWA sola (B1), RH como dato sensible (B2), suficiencia de los DPA estándar (B11) y datacenter elegido (C).

## E. Guías de referencia

- SIC, Guía para la implementación del principio de responsabilidad demostrada (copia publicada por la Global Privacy Assembly): https://globalprivacyassembly.org/wp-content/uploads/2021/07/C3.-SIC-Colombia-Accountability-Guias-para-implementacion-del-principio-de-responsabilidad-demostrada.pdf
- SIC, Circular Externa 002 del 21 de agosto de 2024 (IA): https://sedeelectronica.sic.gov.co/sites/default/files/normativa/Circular%20Externa%20No.%20002%20del%2021%20de%20agosto%20de%202024.pdf
- Circular Externa 005 de 2017, países adecuados (resumen): https://www.hklaw.com/en/insights/publications/2017/08/changes-in-transfer-of-personal-data-to-other-coun
- Decreto 090 de 2018 (RNBD): https://www.funcionpublica.gov.co/eva/gestornormativo/norma_pdf.php?i=85039
- Ubicación de servidores de Hostinger: https://support.hostinger.com/en/articles/1583267-where-are-your-servers-located
- No se encontró ninguna skill pública de Claude específica para la Ley 1581 (búsqueda del 2026-10-07); las que existen cubren GDPR y CCPA: https://claudemarketplaces.com/skills/davila7/claude-code-templates/data-privacy-compliance
