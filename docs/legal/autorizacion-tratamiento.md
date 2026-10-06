# Autorización para el tratamiento de datos personales (BORRADOR)

> **Borrador técnico pendiente de revisión por un abogado especializado en protección de datos en Colombia.** No usar en producción hasta su aprobación. Los campos entre corchetes los completa el responsable del tratamiento.

## Texto que ve el titular antes de escanear su documento

Al continuar, autorizo de manera previa, expresa e informada a **[RAZÓN SOCIAL DEL RESPONSABLE]**, identificado con NIT **[NIT]**, para que trate los datos personales contenidos en mi documento de identidad con la finalidad de **[FINALIDAD CONCRETA, por ejemplo: verificar mi identidad para abrir una cuenta]**, conforme a la Ley 1581 de 2012 y al Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015).

**Datos que se leen del documento:** número de identificación, apellidos, nombres, sexo, fecha y lugar de nacimiento, grupo sanguíneo y RH, fecha de vencimiento (cédula digital) y fecha y lugar de expedición.

**Datos que NO se conservan:** las imágenes de mi documento y la información biométrica (huella) que contiene el código de barras. La lectura se hace en mi dispositivo; si se requiere el servidor de respaldo, la imagen se procesa en memoria y se elimina de inmediato.

**Datos sensibles.** [Solo si se activa la comparación facial o la prueba de vida] Para comparar mi rostro con la foto del documento se tratará mi imagen facial, que es un dato sensible. **No estoy obligado a autorizar el tratamiento de datos sensibles.** Si no lo autorizo, se ofrecerá **[ALTERNATIVA, por ejemplo: verificación presencial]**.

**Mis derechos:** conocer, actualizar, rectificar y suprimir mis datos, revocar esta autorización, solicitar prueba de ella, ser informado del uso que se da a mis datos y presentar quejas ante la Superintendencia de Industria y Comercio. Canal de atención: **[CORREO Y TELÉFONO]**. Política de tratamiento: **[URL]**.

**Menores de edad.** [Si se lee la tarjeta de identidad] El tratamiento de datos de menores requiere la autorización de su representante legal y respeta su interés superior.

- [ ] Autorizo el tratamiento de mis datos personales para la finalidad indicada.
- [ ] Autorizo el tratamiento de mis datos sensibles (imagen facial). *Casilla independiente y opcional.*

## Requisitos técnicos derivados (para la spec de la API)

- Cada validación registra: versión del texto aceptado, fecha y hora, y las casillas marcadas, sin almacenar la imagen.
- La API rechaza toda validación sin `autorizacion.datos = true`; la comparación facial exige además `autorizacion.sensibles = true`.
- La revocación elimina el resultado JSON asociado.
