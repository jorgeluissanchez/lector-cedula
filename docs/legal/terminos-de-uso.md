# Términos de uso del software y SDK y descargo de responsabilidad (BORRADOR)

> **BORRADOR pendiente de revisión por un abogado colombiano.** Rige la relación entre **[TITULAR DEL SOFTWARE]** y quien lo integra (el integrador). No sustituye las licencias de código abierto de los componentes de terceros, que prevalecen sobre esos componentes (`licencias-terceros-usuarios.md`). **[DECISIÓN: licencia del propio proyecto, ver PARA-EL-ABOGADO.md, D11.]**

## 1. Objeto

El software lee, con técnicas automáticas, los datos impresos o codificados en documentos de identidad colombianos (código PDF417 de la cédula amarilla y zona de lectura mecánica de la cédula digital) y los devuelve estructurados.

## 2. Lo que el software NO es

1. **No es una verificación oficial.** No consulta ni certifica nada ante la Registraduría Nacional del Estado Civil ni ante ninguna base oficial. No acredita que el documento sea auténtico, vigente, ni que pertenezca a quien lo presenta.
2. No detecta con garantía documentos falsos o alterados. Los controles internos (dígitos de verificación, coherencia de fechas) son indicios, no prueba.
3. No es un servicio de biometría: no lee la huella del PDF417, no decodifica el QR de la cédula digital y, en la versión actual, no compara rostros.
4. La interpretación del formato del PDF417 se basa en hipótesis documentadas públicamente (`docs/decisiones/hipotesis-formato.md`) y no en una especificación oficial; puede fallar con versiones del documento no previstas.
5. Los nombres de lugar de nacimiento provienen de tablas públicas del DANE y la Registraduría (CC BY-SA 4.0) que pueden estar desactualizadas.

## 3. Obligaciones del integrador

1. Actuar como responsable del tratamiento de los datos que obtenga y cumplir la Ley 1581 de 2012 y sus decretos: política, aviso, autorización, atención de derechos, seguridad y, si aplica, RNBD y transferencias internacionales.
2. No modificar el software para conservar imágenes, leer biometría o decodificar el QR sin su propio análisis legal.
3. Revisar humanamente toda decisión con efectos jurídicos o significativos basada en la lectura **[DECISIÓN DEL ABOGADO: alcance]**.
4. Mostrar las atribuciones de licencia exigidas (CC BY-SA 4.0 y licencias de código).
5. Si opera el servidor de respaldo, alojarlo con medidas de seguridad adecuadas y, si es fuera de Colombia, cumplir el art. 26 de la Ley 1581.

## 4. Garantía y responsabilidad

El software se entrega **"tal cual"**, sin garantía de exactitud, disponibilidad ni idoneidad para un fin concreto, en la medida que lo permita la ley colombiana. **[DECISIÓN DEL ABOGADO: límites de exclusión de responsabilidad válidos en Colombia (Código Civil art. 1616; Estatuto del Consumidor, Ley 1480 de 2011, si el integrador o el usuario final es consumidor).]** Responsabilidad máxima: **[..]**.

## 5. Privacidad por diseño (información, no garantía contractual)

Lectura en el dispositivo y sin conexión; sin almacenamiento de imágenes ni resultados en la PWA; servidor opcional con procesamiento en memoria, registros sin datos personales y eliminación del resultado tras **[24 h]** por defecto.

## 6. Ley y jurisdicción

Ley colombiana; jueces de **[CIUDAD]**. **[..]**
