# Consentimiento para el set de pruebas de campo (BORRADOR)

> **BORRADOR pendiente de revisión y aprobación por un abogado colombiano de protección de datos.** Cubre la recolección de imágenes de documentos reales para medir la exactitud del lector durante el desarrollo. Es distinto de la autorización del producto (`autorizacion-tratamiento.md`). Ver `PARA-EL-ABOGADO.md`, D9.
>
> Normas: Ley 1581 de 2012 (arts. 4, 6, 7, 9), Decreto 1377 de 2013 (arts. 5-7, 12), compilado en el Decreto 1074 de 2015. https://www.secretariasenado.gov.co/senado/basedoc/ley_1581_2012.html · https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=53646

## Por qué existe

No hay datos públicos de cédulas colombianas para evaluar el lector. El repositorio solo contiene datos sintéticos (regla 3 de `CLAUDE.md`). Medir la exactitud real exige probar con documentos de personas que lo autoricen expresamente.

## Diferencia con el producto

A diferencia del producto (que no guarda imágenes), este set **sí conserva imágenes** de forma temporal. Por eso exige una autorización separada, más estricta y con fecha de eliminación.

## Texto para el participante

Yo, **[NOMBRE]**, autorizo de manera previa, expresa e informada a **[RESPONSABLE, NIT]** a fotografiar el anverso y el reverso de mi **[cédula amarilla / cédula digital / tarjeta de identidad / cédula de extranjería]** con el único fin de **medir la exactitud de un software de lectura de documentos durante su desarrollo**.

Entiendo que:

1. El anverso contiene mi fotografía, que es un dato biométrico **sensible**. No estoy obligado a autorizar su tratamiento. **[DECISIÓN DEL ABOGADO: si se puede cubrir u ocultar la foto del anverso al fotografiar, eliminando el dato sensible.]**
2. Las imágenes se guardan cifradas, fuera de cualquier repositorio de código y de cualquier servicio en la nube **[o: en el proveedor X, país Y]**, con acceso limitado a **[NÚMERO]** personas nombradas en el registro de accesos.
3. No se comparten con terceros ni se usan para entrenar modelos de inteligencia artificial. **[Ajustar si se decide entrenar con ellas.]**
4. El código de barras de la cédula amarilla contiene información de huella dactilar. El software descarta ese bloque sin interpretarlo. El código QR de la cédula digital nunca se decodifica. Aun así, la imagen fotografiada contiene esos códigos.
5. Las imágenes se eliminan a más tardar el **[FECHA]** o antes si lo solicito.
6. Puedo revocar esta autorización en cualquier momento escribiendo a **[CORREO]**, y mis imágenes se eliminan en un plazo máximo de **[N]** días hábiles.
7. Participar es voluntario y no recibo ni pierdo nada por negarme. **[Si hay compensación, indicarla.]**
8. Tengo los derechos del art. 8 de la Ley 1581 de 2012 y puedo acudir a la SIC.

**Menores (tarjeta de identidad):** firma el representante legal; se escucha la opinión del menor (art. 12 Decreto 1377).

Firma: ____________________ Documento: ______ Fecha: __________

## Procedimiento operativo

- Registro del set: identificador anónimo por documento, versión (amarilla, digital, TI, CE, blanca, café), modelo de celular y condiciones de luz. Sin nombres ni números en el registro.
- Etiquetas (ground truth) verificadas por dos personas y guardadas cifradas junto a las imágenes.
- Las evals con este set se ejecutan fuera del repositorio y solo publican métricas agregadas.
- Los formularios firmados se guardan aparte de las imágenes, por **[PLAZO]** (prueba de la autorización, art. 8 Decreto 1377).
- Acta de eliminación al vencer la fecha.
- Meta mínima de la Fase 1: 30 amarillas, 30 digitales, 10 tarjetas de identidad, 10 cédulas de extranjería y 5 blancas o cafés, en 5 modelos de celular.
