# Aviso de privacidad corto para la pantalla de la app (BORRADOR)

> **BORRADOR pendiente de revisión por un abogado colombiano de protección de datos.** Aviso según el art. 15 del Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015), que debe informar al menos: responsable, tratamiento y finalidad, derechos, y cómo consultar la política. https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=53646
>
> Diseñado para caber en una pantalla de celular (aprox. 90 palabras). Los `[..]` los completa el integrador. La pantalla debe mostrarse **antes** de abrir la cámara.

## Texto (variante PWA sola)

**Tu privacidad**

**[RAZÓN SOCIAL]** usa esta app para leer tu documento de identidad. La lectura ocurre **solo en este teléfono**, también sin internet. No guardamos fotos ni resultados: se borran al terminar. No leemos la huella del código de barras ni el código QR. El resultado se muestra parcialmente oculto. Puedes conocer, actualizar, rectificar y suprimir tus datos y revocar tu autorización en **[CORREO]**. Política completa: **[URL]**. Licencias de datos y software: *Acerca de / Licencias*.

[Continuar] [Cancelar]

## Texto (variante con servidor de respaldo)

Igual que la anterior, sustituyendo la tercera y cuarta frase por:

> La lectura ocurre en este teléfono. Si no es posible, las fotos se envían cifradas a nuestro servidor en **[PAÍS]**, se procesan en memoria y no se guardan. El resultado se conserva **[24 horas]**.

## Notas para implementación (no son texto legal)

- El enlace *Acerca de / Licencias* aún no existe en `apps/pwa` [V: búsqueda en `apps/pwa/src` el 2026-10-07]; ver `licencias-terceros-usuarios.md`.
- Si la autorización debe ser expresa (variante B), el botón "Continuar" no basta: se requieren las casillas de `autorizacion-tratamiento.md`.
