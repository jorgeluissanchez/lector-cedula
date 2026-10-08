# Política de tratamiento de datos personales: plantilla para el integrador (BORRADOR)

> **BORRADOR pendiente de revisión por un abogado colombiano de protección de datos.** Plantilla para quien despliega el lector (el integrador), que es quien la adopta como responsable. Los `[..]` los completa el responsable. El proyecto de software no es responsable del tratamiento que hagan los integradores (ver `terminos-de-uso.md`).

## Fuentes normativas

- Ley 1581 de 2012 (en especial arts. 4, 5, 6, 7, 8, 9, 12, 14, 15, 17, 18, 25, 26): https://www.secretariasenado.gov.co/senado/basedoc/ley_1581_2012.html
- Decreto 1377 de 2013, art. 13 (contenido mínimo de la política) y arts. 14-16 (aviso de privacidad); compilado en el Decreto 1074 de 2015, arts. 2.2.2.25.3.1 y ss.: https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=53646 · https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=76608
- Decreto 886 de 2014 (Registro Nacional de Bases de Datos), compilado en el Decreto 1074 de 2015; Circular Única de la SIC, título V: https://www.sic.gov.co/
- Ley 2300 de 2023 (canales y horarios de contacto con consumidores): aplica solo si el integrador usa los datos para cobranza o gestión comercial. https://www.funcionpublica.gov.co/ [E: verificar URL exacta]
- Ley 1266 de 2008 (habeas data financiero): aplica solo si el resultado se usa o reporta con fines de riesgo crediticio. https://www.secretariasenado.gov.co/senado/basedoc/ley_1266_2008.html

## 1. Identificación del responsable

Razón social: **[..]** · NIT: **[..]** · Domicilio y dirección: **[..]** · Correo: **[..]** · Teléfono: **[..]** · Área encargada de peticiones, consultas y reclamos: **[..]**

## 2. Alcance

Aplica a los datos personales obtenidos al leer documentos de identidad con el lector de cédula **[nombre comercial]** en **[canales: app, web, oficina]**.

## 3. Tratamiento y finalidades

Datos tratados: los de `autorizacion-tratamiento.md` (número, nombres, apellidos, sexo, fecha y lugar de nacimiento, grupo sanguíneo y RH; en la cédula digital, vencimiento, nacionalidad y serie).

Finalidades: **[enumerar, p. ej.: verificar identidad para vinculación; prevenir suplantación; cumplir obligaciones SARLAFT]**. Ninguna finalidad distinta sin nueva autorización.

Lo que el software no hace y el integrador no debe activar sin revisar esta política: guardar imágenes; leer la huella o datos AFIS del PDF417; decodificar el QR de la cédula digital; comparar rostros.

## 4. Datos sensibles y de menores

- Datos sensibles **[grupo sanguíneo y RH, si así se califican; imagen facial, si se activa la comparación]**: autorización explícita y opcional, informando que no es obligatoria (art. 6 Ley 1581; art. 6 Decreto 1377).
- Menores: solo con autorización del representante legal y respetando el interés superior (art. 7 Ley 1581; art. 12 Decreto 1377). **[Indicar si se leen tarjetas de identidad.]**

## 5. Derechos de los titulares

Los del art. 8 de la Ley 1581: conocer, actualizar, rectificar, suprimir, revocar, solicitar prueba de la autorización, ser informado del uso, acceder gratis y acudir a la SIC.

## 6. Procedimiento de consultas y reclamos

- Consultas: respuesta en máximo 10 días hábiles, prorrogables 5 (art. 14 Ley 1581).
- Reclamos: 15 días hábiles, prorrogables 8 (art. 15 Ley 1581).
- Canal: **[..]**. Requisito de procedibilidad ante la SIC: agotar el trámite ante el responsable (art. 16).

## 7. Seguridad y conservación

- Imágenes: no se conservan; en el dispositivo se borran tras leer; en el servidor de respaldo se procesan solo en memoria.
- Resultado en servidor: **[24 h por defecto, o el plazo definido]**, luego se elimina.
- Registro de prueba de la autorización (sin datos del documento): **[PLAZO]**.
- Medidas: **[cifrado en tránsito TLS, control de acceso, registros sin datos personales, etc.]**

## 8. Encargados y transferencias o transmisiones internacionales

Encargados: **[proveedor de alojamiento del servidor, si lo hay]**, con contrato de transmisión (art. 25 Decreto 1377). Si el servidor está fuera de Colombia: **[país]**, con base en **[art. 26 Ley 1581 y la lista de países con nivel adecuado de la SIC, o declaración de conformidad / contrato de transmisión]**. Si se usa solo la PWA, no hay transmisión.

## 9. Registro Nacional de Bases de Datos

**[Indicar si la base debe inscribirse en el RNBD según los umbrales vigentes: verificar con el abogado.]**

## 10. Vigencia

Desde **[FECHA]**. Las bases se conservan mientras dure la finalidad. Cambios sustanciales se comunican antes de aplicarse (art. 5 Decreto 1377).
