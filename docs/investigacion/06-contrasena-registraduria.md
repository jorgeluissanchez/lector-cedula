# 06. Contraseña (comprobante de documento en trámite) de la Registraduría

Fecha: 2026-10-09. Alcance: comprobante que entrega la Registraduría Nacional del Estado Civil (RNEC) mientras se produce la cédula de ciudadanía o la tarjeta de identidad. No se descargaron ni copiaron datos de personas reales. Convención: [V] verificado en fuente primaria o en copia oficial de la norma; [E] estimado, de prensa o inferido.

## Respuesta corta

- No es un documento de identificación. La RNEC lo define como constancia de trámite (Ley 39 de 1961, modificada por el Decreto 2241 de 1986) y no lo certifica (art. 25 del Decreto 019 de 2012). Solo *sugiere* a las entidades aceptarlo "cuando lo consideren pertinente". [V]
- Hay cuatro tipos vigentes, todos de papel o PDF. Ninguno lleva PDF417, código 1D ni Datamatrix según la norma. Dos llevan código QR. [V]
- El QR del comprobante verde se describe como "código de seguridad QR" verificable porque "carga el estado del trámite en la página Web de la entidad". Es decir, es un enlace a una consulta en línea, no un contenedor de datos firmado. No hay publicación de su contenido, firma ni cifrado. [V] (función) / [E] (que sea solo una URL)
- Vigencia: 6 meses desde el trámite; en consulados, 1 año (EIS) o 2 años (SITAC). [V]
- Verificación en línea: consulta pública de estado del trámite en `https://wsp.registraduria.gov.co/estadodocs/` (redirige a `resultadobusqueda.php`), por número de documento y captcha. [V] (existe y redirige) / [E] (campos de la consulta, según prensa)
- No existe repositorio ni librería open source que lea la contraseña. [V] (búsqueda negativa, 2026-10-09)

## Fuente principal

Circular Única de Registro Civil e Identificación de la RNEC, versión 8 (Circular 0001 de 2023), numerales 15.5 a 15.7, copia oficial en el normograma de la Cancillería:
https://cancilleria.gov.co/sites/default/files/Normograma/docs/circular_registraduria_0001_2023.htm [V]

El original en `registraduria.gov.co` (incluida la versión 9, `https://www.registraduria.gov.co/IMG/pdf/circular_unica_v_9.pdf`) está tras un desafío de Cloudflare y no se pudo leer; la versión 9 podría cambiar algo de lo descrito. [E]

## Tipos de comprobante (Circular Única v8, 15.5)

La circular habla de "cuatro (4) tipos" pero en la v8 describe tres; el cuarto es el verde *sin* QR de talonario, que la tabla de modificaciones elimina de 15.5 pero sigue usándose en 15.7 como reposición donde no hay EIS. [V]

| Tipo | Soporte | Tamaño | Datos | Código | Estado |
|---|---|---|---|---|---|
| 15.5.1 Contraseña preimpresa en blanco | Papel bond blanco | 8,7 x 7,8 cm | Anverso: datos del titular impresos. Reverso: huella del índice derecho (o huella principal) y fotografía | Ninguno mencionado | Vigente para enrolamiento en papel [V] |
| 15.5.2 Contraseña EIS (Estación Integrada de Servicios) | PDF digital o impreso | 8 x 16 cm | Datos del titular, fotografía y firma capturadas en la preparación | QR | Válida en el celular; también para consulados [V] |
| 15.5.3 Verde con código de verificación QR | PDF imprimible con trama verde | No indicado | Datos del titular preimpresos; la definitiva lleva el número de preparación | QR arriba a la derecha que carga el estado del trámite en la web | Duplicado solicitado por la web; existe una contraseña temporal previa sin número de preparación [V] |
| Verde sin QR (talonario) | Papel | No indicado | No detallado | Ninguno | Reposición por pérdida o vencimiento donde no hay EIS (15.7) [V] |

Prensa: la Registraduría anunció el QR en la contraseña del duplicado en línea (`https://www.registraduria.gov.co/Desde-ahora-la-contrasena-del-duplicado-de-cedula-en-linea-cuenta-con-codigo-QR.html`, bloqueada por Cloudflare; resumen del buscador: el QR "permite validar el estado de su documento" y que entidades vean "nombre del ciudadano y estado del trámite"). [E]
Fundagov resume la Circular 222 de 2016 (blanca, verde, web con QR): https://fundagov.co/interesante/213-clases-contrasena1 [E]
Superfinanciera cita la Circular 124 de 1996 como origen de la contraseña: https://www.superfinanciera.gov.co/publicaciones/19003 [E]

## Datos impresos: qué se sabe y qué no

- Foto: en blanca (reverso) y EIS. [V] En la verde web, no se menciona. [E]
- Huella: solo en la blanca. [V]
- Firma: en la EIS. [V]
- Número de preparación: en la verde web definitiva. [V] En las demás, no consta. [E]
- NUIP, nombres, fecha y lugar del trámite, tipo de trámite, fecha de expedición: la norma dice solo "datos del titular". La distribución y las etiquetas no son públicas. [E]
- Vigencia impresa: Semana indica que el comprobante muestra vigencia y plazo para reclamar: https://www.semana.com/nacion/articulo/como-sacar-un-duplicado-de-la-cedula-de-ciudadania/202142/ [E]
- La circular remite a "Ilustración 6, 7 y 9" (especímenes), que no se pudieron extraer como imagen de la copia HTML. [E]

## Validez legal

- Circular Única v8, 15.5: "Las contraseñas o comprobantes de documento en trámite no constituyen documento de identificación"; "la contraseña no tiene el mismo valor probatorio que la cédula de ciudadanía". Cita las sentencias T-1000 de 2012 y T-162 de 2013 de la Corte Constitucional: cada entidad decide qué acepta y debe aplicar proporcionalidad. [V]
- Circular 222 de 2016: pide a entidades públicas y privadas aceptar la contraseña. [E] (vía Fundagov y prensa)
- Sin certificación: RNEC no certifica contraseñas (Decreto 019 de 2012, art. 25). [V]

## Verificación en línea

- `https://wsp.registraduria.gov.co/estadodocs/` responde con `meta refresh` a `resultadobusqueda.php` (comprobado con curl el 2026-10-09, sin enviar datos). [V]
- Según prensa, se consulta con el número de documento y un captcha, e indica si el documento fue producido y en qué sede está. Portafolio: https://www.portafolio.co/economia/tramito-su-documento-y-no-sabe-como-reclamarlo-le-explicamos-626302 [E]
- El captcha impide automatizar la consulta desde el producto; tampoco hay API pública documentada. [E]

## Open source

- Ninguno lee la contraseña. Los lectores existentes (p. ej. https://github.com/Eitol/colombian-cedula-reader) solo cubren el PDF417 de la cédula. [V] (búsqueda negativa)

## Impacto en la spec

- Si se admite, sería un tipo de documento aparte (`contrasena-rnec`), con nivel de confianza bajo y advertencia fija "no es documento de identificación".
- Lectura: OCR de los datos impresos y, si hay QR, solo decodificar y validar que apunte a un dominio `registraduria.gov.co`. No aceptar el QR como prueba de autenticidad: no se conoce firma.
- La regla 5 ("nunca decodificar el QR de la digital") se refiere a la cédula digital. El QR de la contraseña es otro artefacto; decodificarlo exige una decisión explícita y una hipótesis probada (CT-02).
- Privacidad: el comprobante tiene foto, firma y a veces huella; aplica la regla de no persistir imágenes ni biometría.

## Decisión recomendada

No implementar todavía. Registrar las hipótesis CT-01 a CT-06 y esperar un espécimen. Hace falta:

1. Las ilustraciones 6, 7 y 9 de la Circular Única (PDF oficial v9, descargado manualmente desde un navegador) o un espécimen publicado por la RNEC.
2. Una contraseña EIS y una verde de prueba, con datos de un voluntario que consienta, solo para medir layout y QR en local, sin entrar al repositorio. Basta registrar la estructura del QR (esquema y dominio, sin el identificador).
3. Confirmar si el QR lleva una URL con token o datos en claro, y si hay firma (CT-02, CT-03).
4. Con eso, fixtures sintéticos y una spec con `/speckit-specify`.
