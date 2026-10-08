# Autorización para el tratamiento de datos personales (BORRADOR)

> **BORRADOR técnico pendiente de revisión y aprobación por un abogado colombiano especializado en protección de datos.** No usar en producción hasta su aprobación. Los campos entre corchetes `[..]` los completa el responsable del tratamiento (el integrador que despliega el lector). Ver `docs/legal/PARA-EL-ABOGADO.md`.
>
> Actualizado al producto del 2026-10-07: PWA con lectura 100 % en el dispositivo y sin conexión (`openspec/changes/pwa-lectura-offline`), servidor de respaldo opcional (`openspec/changes/motor-real-servidor`, `api-validaciones-contrato`).

## Normas de referencia

- Ley 1581 de 2012, arts. 4 (principios), 5-7 (datos sensibles y de menores), 9 (autorización), 12 (deber de informar), 8 (derechos): https://www.secretariasenado.gov.co/senado/basedoc/ley_1581_2012.html
- Decreto 1377 de 2013, arts. 5-7 (modo de obtener la autorización y prueba de ella), 6 (datos sensibles), 12 (menores); compilado en el Decreto 1074 de 2015, libro 2, parte 2, título 2, capítulo 25: https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=53646 y https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=76608
- Sentencia C-748 de 2011 (control previo de la Ley 1581).

## Variante A: solo la PWA (lectura en el dispositivo)

Úsese cuando el integrador despliega únicamente la PWA y el resultado no sale del dispositivo. **[DECISIÓN DEL ABOGADO: si en esta variante, sin recolección ni transmisión por parte del integrador, existe "tratamiento" por un responsable distinto del propio titular o del operador que sostiene el teléfono, y si se necesita autorización o basta un aviso. Ver PARA-EL-ABOGADO.md, D1.]**

> Esta aplicación lee tu documento de identidad **solo en este dispositivo**. Las imágenes de la cámara no se envían a ningún servidor, no se guardan y se borran de la memoria al terminar la lectura. El resultado se muestra parcialmente oculto y desaparece al pulsar "Leer otra" o al salir de la aplicación. **[RAZÓN SOCIAL]** **[no recibe / recibe, para la finalidad X,]** los datos leídos. Más información: **[URL de la política]**.

## Variante B: con integración o servidor de respaldo

### Texto que ve el titular antes de escanear su documento

Al continuar, autorizo de manera previa, expresa e informada a **[RAZÓN SOCIAL DEL RESPONSABLE]**, identificado con NIT **[NIT]**, domiciliado en **[DIRECCIÓN]**, para que trate los datos personales contenidos en mi documento de identidad con la finalidad de **[FINALIDAD CONCRETA, p. ej.: verificar mi identidad para abrir una cuenta]**, conforme a la Ley 1581 de 2012 y al Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015).

**Datos que se leen del documento:**
- Cédula amarilla (código PDF417 del reverso): número de identificación, apellidos, nombres, sexo, fecha de nacimiento, lugar de nacimiento (código de departamento y municipio), grupo sanguíneo y RH.
- Cédula digital (zona de lectura mecánica del reverso): número de identificación, apellidos, nombres, sexo, fecha de nacimiento, fecha de vencimiento, nacionalidad y número de serie del documento.

**Datos que NO se leen ni se conservan:**
- El código de barras de la cédula amarilla contiene información de huella dactilar y códigos de control (AFIS, tarjeta decadactilar). El software los descarta sin interpretarlos.
- El código QR de la cédula digital nunca se decodifica.
- Las imágenes del documento no se guardan. La lectura se hace en mi dispositivo. **[Solo si se usa el servidor de respaldo:]** si mi dispositivo no puede leer el documento, las imágenes se envían cifradas a un servidor de **[RESPONSABLE / ENCARGADO]** ubicado en **[PAÍS / PROVEEDOR]**, se procesan solo en memoria, no se escriben en disco ni en registros, y se descartan al terminar.

**Conservación del resultado.** **[Solo con servidor:]** El resultado de la lectura se conserva por **[24 horas, valor por defecto del software, o el plazo que fije el responsable]** y luego se elimina. Se conserva un registro de que otorgué esta autorización (versión del texto, fecha y casillas marcadas), sin los datos de mi documento, por **[PLAZO]**.

**Datos sensibles.** **[Solo si se activa la comparación facial o la prueba de vida; la versión actual del servidor NO compara rostros.]** El grupo sanguíneo y RH **[DECISIÓN DEL ABOGADO: ¿dato de salud y, por tanto, sensible?]**. Para comparar mi rostro con la foto del documento se trataría mi imagen facial, que es un dato biométrico sensible. **No estoy obligado a autorizar el tratamiento de datos sensibles.** Si no lo autorizo, se ofrecerá **[ALTERNATIVA, p. ej.: verificación presencial]**.

**Menores de edad.** **[Si se admite la tarjeta de identidad; la versión actual lee cédulas de ciudadanía.]** El tratamiento de datos de niños, niñas y adolescentes requiere la autorización de su representante legal, respeta su interés superior y sus derechos fundamentales, y considera la opinión del menor según su madurez (art. 7 Ley 1581; art. 12 Decreto 1377).

**Carácter de la lectura.** La lectura no es una consulta ni una certificación ante la Registraduría Nacional del Estado Civil y no acredita que el documento sea auténtico o esté vigente.

**Mis derechos (art. 8 Ley 1581):** conocer, actualizar, rectificar y suprimir mis datos; revocar esta autorización; solicitar prueba de ella; ser informado del uso que se da a mis datos; presentar quejas ante la Superintendencia de Industria y Comercio tras agotar el trámite de consulta o reclamo ante el responsable. Canal de atención: **[CORREO Y TELÉFONO]**. Política de tratamiento: **[URL]**.

- [ ] Autorizo el tratamiento de mis datos personales para la finalidad indicada.
- [ ] Autorizo el tratamiento de mis datos sensibles (**[imagen facial / grupo sanguíneo]**). *Casilla independiente, opcional y desmarcada por defecto.*

## Requisitos técnicos ya implementados en las specs (para que el abogado los valide)

| Requisito | Dónde | Estado |
|---|---|---|
| La API rechaza (422) toda validación sin `autorizacion.datos = true` | `api-validaciones-contrato`, AV de autorización | Especificado [V] |
| `face_match = true` exige `autorizacion.sensibles = true` | mismo | Especificado [V]; el motor real rechaza la comparación facial (MS-13) |
| Se guarda `version_texto`, `otorgada_en`, `registrada_en` y casillas | mismo | Especificado [V] |
| `DELETE` elimina el resultado y deja solo un registro mínimo de prueba de la autorización, sin datos del documento | AV de supresión | Especificado; plazo del registro pendiente del abogado |
| El resultado se elimina 86 400 s después de completarse (configurable) | AV-24 | Especificado [V] |
| Imágenes solo en memoria; logs sin datos personales | MS-04, AV-32 | Especificado [V] |
| PWA sin `localStorage`, cookies, IndexedDB; buffers a cero | OFF-11 | Especificado [V] |
| No se decodifica el QR | OFF-07 | Especificado [V] |
| No se leen AFIS, tarjeta decadactilar ni la cola biométrica del PDF417 | PA-16 | Especificado [V] |
