# Política de tratamiento de datos personales

**Versión 1.0, vigente desde [FECHA DE PUBLICACIÓN]. Sujeta a revisión jurídica.**

> Nota interna (no publicar este recuadro): el equipo técnico preparó este texto, pero no es abogado. Lo revisará un abogado colombiano especializado en protección de datos (ver `PARA-EL-ABOGADO.md`). Los marcadores entre corchetes se dejan visibles hasta que el responsable los complete. Las citas de la Ley 1581 de 2012 y del Decreto 1377 de 2013 se cotejaron con el texto oficial el 2026-10-07 (ver la sección 14).

## 1. Responsable del tratamiento

| Dato | Valor |
|---|---|
| Razón social | [RAZÓN SOCIAL] |
| NIT | [NIT] |
| Domicilio y dirección | [DOMICILIO] |
| Correo de atención | [CORREO DE ATENCIÓN] |
| Teléfono | [TELÉFONO] |
| Área o persona que atiende consultas y reclamos | [ÁREA O PERSONA RESPONSABLE] |

En esta política, "nosotros" significa [RAZÓN SOCIAL], y "usted" o "el titular" significa la persona cuyos datos se tratan.

**Software y operador.** (a) La aplicación se construye con software libre publicado bajo licencia MIT, que se entrega "tal cual" y sin garantía (archivo `LICENSE` de [URL DEL REPOSITORIO]); esa licencia no regula el tratamiento de datos. (b) Esta política rige el tratamiento en la instancia que opera [RAZÓN SOCIAL], que es el Responsable del tratamiento en el sentido del artículo 3, literal e), de la Ley 1581 de 2012. Los autores y contribuyentes del software no operan esta instancia, no reciben sus datos y no son responsables ni encargados del tratamiento en ella.

> Nota para quien despliega (no publicar este recuadro): esta es una PLANTILLA; ver `docs/legal/README.md`.

## 2. Alcance

Esta política se aplica a los datos personales que se obtienen cuando usted lee su cédula de ciudadanía con la aplicación web [NOMBRE DE LA APLICACIÓN] (en adelante, "la aplicación") y, si se usa, con su servidor de respaldo. Se aplica a nosotros y a los encargados que traten datos por cuenta nuestra.

## 3. Finalidad

Tratamos sus datos con una sola finalidad: **verificar su identidad dentro del trámite de [NOMBRE DEL TRÁMITE] que usted adelanta con nosotros.**

No usamos sus datos para publicidad, perfiles comerciales, cobranza, reportes a centrales de riesgo ni ninguna otra finalidad. Si quisiéramos usarlos para otra finalidad, le pediremos una nueva autorización (art. 5 del Decreto 1377 de 2013).

## 4. Datos que se tratan

**Cédula amarilla con hologramas (código de barras PDF417 del reverso):** número de cédula, apellidos, nombres, sexo, fecha de nacimiento, lugar de nacimiento (código de departamento y municipio, que la aplicación traduce a nombre) y grupo sanguíneo y factor RH.

**Cédula digital (zona de lectura mecánica del reverso):** número de cédula, apellidos, nombres, sexo, fecha de nacimiento, fecha de vencimiento, nacionalidad y número de serie del documento.

**Datos que no se leen ni se conservan:**
- La información de huella dactilar y los códigos de control (AFIS) del código de barras de la cédula amarilla: la aplicación los descarta sin interpretarlos.
- El código QR de la cédula digital: nunca se decodifica.
- Su rostro: la aplicación no compara rostros ni hace pruebas de vida.
- Las imágenes de la cámara: no se guardan (ver la sección 6).

**Datos técnicos de la conexión:** al descargar la aplicación, el proveedor de alojamiento web registra, como cualquier sitio web, la dirección IP y datos técnicos del navegador (ver la sección 9).

## 5. Datos sensibles

La Ley 1581 de 2012 califica como sensibles, entre otros, los datos relativos a la salud y los datos biométricos (art. 5).

- **Grupo sanguíneo y RH.** Viene impreso y codificado en la cédula amarilla. Lo tratamos con la misma protección que un dato sensible: se muestra en pantalla y no se usa para ninguna decisión. [DECISIÓN PENDIENTE DEL ABOGADO: si el trámite no lo necesita, conviene no mostrarlo ni entregarlo.]
- **Datos biométricos.** La versión actual de la aplicación no trata datos biométricos: no lee la huella del código de barras ni compara rostros. Si algún día se activara esa función, le pediríamos una autorización aparte, explícita y opcional. Le informaríamos que no está obligado a darla y le ofreceríamos una alternativa (arts. 5 y 6 de la Ley 1581 de 2012 y art. 6 del Decreto 1377 de 2013).

Usted no está obligado a autorizar el tratamiento de datos sensibles (art. 6 del Decreto 1377 de 2013).

## 6. Cómo se tratan los datos

1. **Lectura en su teléfono.** La aplicación lee el documento dentro de su navegador, también sin conexión a internet. Las imágenes de la cámara permanecen solo en la memoria del teléfono y se borran al terminar la lectura. La aplicación no usa cookies, `localStorage` ni otra base de datos del navegador para guardar imágenes o resultados.
2. **Resultado en pantalla.** El resultado se muestra parcialmente oculto y se borra cuando usted pulsa "Leer otra" o sale de la aplicación.
3. **Uso en el trámite.** [ELEGIR UNA OPCIÓN Y BORRAR LA OTRA]
   - *Opción A (la aplicación no nos envía nada):* el resultado no sale de su teléfono. Usted lo usa en el trámite de [NOMBRE DEL TRÁMITE] mostrándolo o copiándolo cuando se lo pidamos.
   - *Opción B (el trámite recibe el resultado):* con su autorización, el resultado se envía cifrado (TLS) a [SISTEMA DEL TRÁMITE] y se conserva [PLAZO DE CONSERVACIÓN DEL RESULTADO EN EL TRÁMITE].
4. **Servidor de respaldo (opcional).** Si su teléfono no logra leer el documento y usted lo acepta, las imágenes se envían cifradas a nuestro servidor de respaldo. Allí se procesan solo en memoria, sin escribirse en disco ni en registros, y se descartan al terminar. El resultado se conserva un máximo de 24 horas para entregarlo al trámite y luego se elimina [AJUSTAR SI SE CAMBIA EL PLAZO].
5. **Prueba de su autorización.** En la opción A la lectura ocurre íntegramente en su teléfono: no recibimos ni conservamos datos suyos, nada persiste en el dispositivo y la casilla documenta su autorización en cada sesión. En la opción B, el sistema de [NOMBRE DEL TRÁMITE] conserva un registro de su autorización: versión del texto aceptado, fecha y hora e identificador de la sesión del trámite. Ese registro no contiene los datos de su documento ni imágenes. Lo conservamos durante [PLAZO DE CONSERVACIÓN DE LA PRUEBA] (art. 8 del Decreto 1377 de 2013).

## 7. Carácter de la lectura

La lectura **no es una verificación oficial**. No consulta a la Registraduría Nacional del Estado Civil, no certifica que el documento sea auténtico ni que esté vigente, y puede tener errores. Si un dato leído es incorrecto, usted puede pedir que se corrija (sección 10).

## 8. Derechos del titular

De acuerdo con el art. 8 de la Ley 1581 de 2012, usted tiene derecho a:

a) Conocer, actualizar y rectificar sus datos.
b) Solicitar prueba de la autorización que nos dio, cuando el resultado se haya usado en el trámite (opción B); en la opción A no conservamos datos ni registros suyos.
c) Ser informado, previa solicitud, del uso que hemos dado a sus datos.
d) Presentar quejas ante la Superintendencia de Industria y Comercio (SIC) por infracciones, después de agotar el trámite de consulta o reclamo ante nosotros (art. 16).
e) Revocar la autorización o pedir la supresión de sus datos cuando no se respeten los principios, derechos y garantías constitucionales y legales.
f) Acceder gratuitamente a sus datos.

**Menores de edad.** Solo se leen cédulas de ciudadanía de personas mayores de edad. La tarjeta de identidad no se admite y se rechaza, igual que cualquier documento con fecha de nacimiento de menos de 18 años (Ley 1581 de 2012, art. 7; Decreto 1377 de 2013, art. 12). [SI UNA INSTANCIA QUISIERA ADMITIR TARJETA DE IDENTIDAD: se requeriría autorización del representante legal, escuchar la opinión del menor según su madurez y asegurar el respeto de su interés superior y sus derechos fundamentales (Decreto 1377 art. 12), con un cambio previo en el software y revisión jurídica.]

## 9. Encargados y transmisión internacional de datos

Para operar la aplicación usamos estos proveedores, que actúan como encargados del tratamiento:

| Proveedor | Qué hace | Qué datos ve | Ubicación |
|---|---|---|---|
| Vercel Inc. | Aloja y distribuye por su red global (CDN) los archivos de la aplicación. | No recibe datos del documento: la aplicación no le envía imágenes ni resultados. Registra la dirección IP y datos técnicos de quien descarga la aplicación. | Estados Unidos y nodos de su red en otros países. |
| Hostinger (con el panel Dokploy, software que nosotros operamos) | Aloja el servidor de respaldo opcional. | Las imágenes y el resultado, solo cuando usted usa el servidor de respaldo (sección 6, numeral 4). | [PAÍS DEL SERVIDOR] |

Como estos proveedores están fuera de Colombia, el envío de datos a ellos es una **transmisión internacional** de datos personales: un encargado trata los datos por cuenta nuestra y no puede usarlos para fines propios. Según el art. 24 del Decreto 1377 de 2013, la transmisión internacional a un encargado no requiere informarle a usted ni pedir su consentimiento si existe un contrato de transmisión con el contenido del art. 25. Aun así se lo informamos por transparencia. Con cada encargado tenemos [CONTRATO DE TRANSMISIÓN O ACUERDO DE TRATAMIENTO DE DATOS, CON FECHA], que lo obliga a tratar los datos según esta política y solo para la finalidad autorizada, a proteger su seguridad y a guardar confidencialidad.

No transferimos sus datos a terceros que los usen como responsables propios. Una transferencia internacional así solo se haría a un país con nivel adecuado de protección o en los casos del art. 26 de la Ley 1581 de 2012.

## 10. Procedimiento de consultas y reclamos

**Canal:** [CORREO DE ATENCIÓN], [TELÉFONO] o por escrito en [DOMICILIO]. Atiende [ÁREA O PERSONA RESPONSABLE] (art. 23 del Decreto 1377 de 2013).

**Consultas** (art. 14 de la Ley 1581 de 2012): se responden en un máximo de diez (10) días hábiles desde que las recibimos. Si no es posible en ese plazo, le informaremos el motivo y la nueva fecha, que no superará cinco (5) días hábiles adicionales.

**Reclamos** de corrección, actualización o supresión, o por presunto incumplimiento (art. 15 de la Ley 1581 de 2012):
1. Indique su identificación, la descripción de los hechos, su dirección y los documentos que quiera aportar.
2. Si el reclamo está incompleto, le pediremos completarlo dentro de los cinco (5) días siguientes a recibirlo. Si pasan dos (2) meses sin respuesta suya, se entenderá que desistió.
3. Si no somos competentes para resolverlo, lo trasladaremos en un máximo de dos (2) días hábiles a quien corresponda y le informaremos.
4. En un máximo de dos (2) días hábiles después de recibir el reclamo completo, marcaremos el dato con la leyenda "reclamo en trámite" hasta decidirlo.
5. Responderemos en un máximo de quince (15) días hábiles desde el día siguiente a recibirlo, prorrogables hasta ocho (8) días hábiles más si le informamos el motivo.

**Queja ante la SIC:** solo después de agotar este trámite (art. 16 de la Ley 1581 de 2012).

Como no guardamos imágenes ni resultados en la aplicación, es posible que no tengamos ningún dato suyo que consultar o suprimir. En ese caso se lo informaremos por escrito.

## 11. Seguridad

Aplicamos, entre otras, estas medidas: lectura en el dispositivo; ningún almacenamiento de imágenes; borrado de la memoria al terminar; cifrado TLS en toda comunicación; registros técnicos sin datos personales; eliminación automática del resultado en el servidor de respaldo; código abierto y revisable; acceso restringido al servidor. [COMPLETAR: controles de acceso, copias de seguridad y gestión de incidentes del responsable.] Si ocurre un incidente de seguridad que afecte datos personales, lo reportaremos a la SIC según sus instrucciones (art. 17, lit. n, de la Ley 1581 de 2012).

## 12. Vigencia y cambios

Esta política rige desde [FECHA DE PUBLICACIÓN]. Las bases de datos estarán vigentes mientras dure la finalidad descrita. Si cambiamos la identificación del responsable o la finalidad, se lo comunicaremos antes de aplicar el cambio o, a más tardar, al aplicarlo. Si cambia la finalidad, le pediremos una nueva autorización (art. 5 y art. 13 del Decreto 1377 de 2013).

## 13. Registro Nacional de Bases de Datos

[ELEGIR] Esta base de datos está inscrita en el Registro Nacional de Bases de Datos de la SIC con el número [NÚMERO] / [RAZÓN SOCIAL] no está obligada a inscribirla porque sus activos totales no superan 100.000 UVT (Decreto 090 de 2018).

## 14. Normas aplicables

- Ley 1581 de 2012 (texto cotejado el 2026-10-07): https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981 (copia oficial también en https://www.secretariasenado.gov.co/senado/basedoc/ley_1581_2012.html)
- Decreto 1377 de 2013 (texto cotejado el 2026-10-07), compilado en el Decreto 1074 de 2015, capítulo 25: https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=53646 · https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=76608
- Decreto 090 de 2018 (Registro Nacional de Bases de Datos): https://www.funcionpublica.gov.co/eva/gestornormativo/norma_pdf.php?i=85039
