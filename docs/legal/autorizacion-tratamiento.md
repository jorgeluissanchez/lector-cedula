# Autorización para el tratamiento de datos personales

**Versión 1.0, vigente desde [FECHA DE PUBLICACIÓN]. Sujeta a revisión jurídica.**

> Nota interna (no publicar este recuadro): este documento contiene el texto completo y la justificación. El texto corto que se muestra en la aplicación está en `publicacion/autorizacion.md`. Las citas se cotejaron con el texto oficial el 2026-10-07.

## Fundamento

- Ley 1581 de 2012, art. 9: la autorización debe ser **previa e informada** y obtenerse por un medio que permita consultarla después.
- Ley 1581 de 2012, art. 12: al pedir la autorización se informa el tratamiento y la finalidad, el carácter facultativo de las respuestas sobre datos sensibles, los derechos del titular y la identificación, dirección y teléfono del responsable. El parágrafo exige conservar prueba de haber informado.
- Decreto 1377 de 2013, art. 5: se pide a más tardar al recolectar los datos e informa los datos recolectados y todas las finalidades específicas.
- Decreto 1377 de 2013, art. 6: los datos sensibles requieren autorización explícita, informando que no es obligatoria y cuáles datos son sensibles.
- Decreto 1377 de 2013, art. 7: vale la autorización escrita, oral o por conducta inequívoca; **el silencio nunca es conducta inequívoca**. Por eso la casilla viene desmarcada.
- Decreto 1377 de 2013, art. 8: el responsable conserva prueba de la autorización.

Fuentes: https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981 · https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=53646

## Texto de la autorización (se muestra antes de abrir la cámara)

Yo, titular de la cédula que voy a leer, autorizo de manera **previa, expresa e informada** a **[RAZÓN SOCIAL]**, NIT **[NIT]**, con domicilio en **[DOMICILIO]**, para tratar los datos personales de mi cédula con una única finalidad: **verificar mi identidad en el trámite de [NOMBRE DEL TRÁMITE]**.

**Datos que se leen.** Cédula amarilla: número, apellidos, nombres, sexo, fecha y lugar de nacimiento, grupo sanguíneo y RH. Cédula digital: número, apellidos, nombres, sexo, fecha de nacimiento, fecha de vencimiento, nacionalidad y número de serie.

**Datos que no se leen.** No se lee la huella del código de barras ni se decodifica el código QR. No se compara mi rostro. No se guardan imágenes.

**Cómo se tratan.** La lectura ocurre en mi teléfono. [SOLO SI SE USA EL SERVIDOR DE RESPALDO: Si mi teléfono no logra leer el documento y yo lo acepto, las imágenes se envían cifradas a un servidor de [RAZÓN SOCIAL] alojado por Hostinger en [PAÍS DEL SERVIDOR], se procesan solo en memoria y se descartan; el resultado se elimina a más tardar en 24 horas.]

**Prueba.** Se conserva prueba de esta autorización (versión del texto, fecha y casillas marcadas), sin los datos de mi cédula.

**Carácter de la lectura.** No es una verificación oficial de la Registraduría Nacional del Estado Civil.

**Mis derechos** (art. 8 de la Ley 1581 de 2012): conocer, actualizar, rectificar y suprimir mis datos; pedir prueba de esta autorización; ser informado del uso de mis datos; revocar la autorización; acceder gratis a mis datos y quejarme ante la Superintendencia de Industria y Comercio después de acudir al responsable. Contacto: **[CORREO DE ATENCIÓN]**, **[TELÉFONO]**. Política: **[URL DE LA POLÍTICA]**.

- [ ] **Autorizo el tratamiento de mis datos personales para la finalidad indicada.** (Obligatoria para continuar. Desmarcada por defecto.)

### Casilla de datos sensibles (NO se muestra en la versión actual)

Solo se mostrará si se activa la comparación facial u otra función biométrica. Debe ir **separada** de la anterior, ser **opcional**, venir **desmarcada** y ofrecer una alternativa:

- [ ] Autorizo de forma explícita el tratamiento de mi imagen facial, que es un dato biométrico sensible, para compararla con la foto de mi cédula. Sé que **no estoy obligado** a autorizarlo. Si no lo autorizo, puedo [ALTERNATIVA NO BIOMÉTRICA].

## Requisitos de implementación

| Requisito | Fundamento | Estado técnico |
|---|---|---|
| La casilla de datos personales se muestra antes de abrir la cámara y viene desmarcada | Ley 1581 art. 9; Decreto 1377 art. 7 | Pendiente en la PWA |
| Sin casilla marcada no se abre la cámara | Ley 1581 art. 9 | Pendiente en la PWA. En el servidor, la API rechaza con 422 si `autorizacion.datos` no es `true` (especificado) |
| La casilla de sensibles es independiente | Decreto 1377 art. 6 | La API separa `autorizacion.sensibles`; la comparación facial está desactivada (MS-13) |
| Se conserva prueba: versión del texto, fecha y hora, casillas | Decreto 1377 art. 8; Ley 1581 art. 12 parágrafo | Servidor: especificado (`version_texto`, `otorgada_en`). PWA sola: hoy no se registra nada (ver el checklist) |
| Cambio de finalidad: nueva autorización | Decreto 1377 art. 5 | Cambiar la versión del texto obliga a aceptarlo de nuevo |
