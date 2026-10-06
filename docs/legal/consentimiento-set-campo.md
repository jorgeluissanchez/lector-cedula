# Consentimiento para el set de pruebas de campo (BORRADOR)

> **Borrador pendiente de revisión legal.** Este documento cubre la recolección de imágenes de cédulas reales para medir la exactitud del lector. Es distinto de la autorización del producto.

## Por qué existe

No hay datos públicos de cédulas colombianas para evaluar el lector. La única forma de medir el éxito real es probar con documentos reales de personas que lo autoricen expresamente.

## Texto para el participante

Yo, **[NOMBRE]**, autorizo a **[RESPONSABLE]** a fotografiar el anverso y el reverso de mi **[cédula / tarjeta de identidad / cédula de extranjería]** con el único fin de **medir la exactitud de un software de lectura de documentos durante su desarrollo**.

Entiendo que:

1. Las imágenes se guardan cifradas, fuera de cualquier repositorio de código, con acceso limitado a **[NÚMERO]** personas nombradas en el registro de accesos.
2. No se comparten con terceros ni se usan para entrenar modelos de inteligencia artificial distribuidos públicamente. **[Ajustar si se decide entrenar con ellas.]**
3. El código de barras de mi cédula contiene información biométrica (huella). Ese bloque se descarta y nunca se decodifica.
4. Las imágenes se eliminan a más tardar el **[FECHA]** o antes si lo solicito.
5. Puedo revocar este consentimiento en cualquier momento escribiendo a **[CORREO]**, y mis imágenes se eliminan en un plazo máximo de **[N]** días hábiles.
6. Participar es voluntario y no recibo ni pierdo nada por negarme.

Firma: ____________________ Fecha: __________

## Procedimiento operativo

- Registro del set: identificador anónimo por documento, versión (amarilla, digital, TI, CE, blanca, café), modelo de celular, condiciones de luz. Sin nombres ni números en el registro.
- Etiquetas (ground truth) verificadas por dos personas y guardadas cifradas junto a las imágenes.
- Las evals con este set se ejecutan fuera del repositorio y solo publican métricas agregadas.
- Meta mínima de la Fase 1: 30 amarillas, 30 digitales, 10 tarjetas de identidad, 10 cédulas de extranjería y 5 blancas o cafés, en 5 modelos de celular.
