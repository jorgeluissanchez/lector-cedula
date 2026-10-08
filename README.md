# Lector de cédula colombiana

Lector autoalojable y de código abierto de la cédula de ciudadanía colombiana.

## Qué hace

- Lee el código de barras **PDF417** de la cédula amarilla y la zona de lectura mecánica (**MRZ**) de la cédula digital, con la cámara del teléfono.
- Funciona **sin conexión** en el navegador (PWA); el servidor de respaldo es opcional.
- **No guarda datos**: las imágenes no se persisten y el resultado se borra al terminar.
- **Nunca decodifica el código QR** de la cédula digital ni lee biometría.

## Aviso importante

Esto **no es una verificación oficial**. No consulta a la Registraduría Nacional del Estado Civil ni certifica que un documento sea auténtico, vigente o de quien lo presenta. El formato del PDF417 no es público y se interpreta con pruebas propias.

## Licencia

Código bajo licencia **MIT** (ver [`LICENSE`](LICENSE)), entregado "tal cual" y sin garantía. Excepción: algunos datos geográficos derivados (por ejemplo, los consulados DIVIPOL de 2018) se distribuyen bajo **CC BY-SA**; ver los avisos de terceros de cada paquete y `tools/divipol/fuentes/LICENSES.md`.

## Cómo autoalojar

- Guía técnica de despliegue: `docs/despliegue/README.md` (en preparación).
- Obligaciones legales: [`docs/legal/README.md`](docs/legal/README.md). Quien despliega una instancia es el Responsable del tratamiento de datos (Ley 1581 de 2012) y debe completar las plantillas; los autores no tratan datos de instancias ajenas.

## Cómo contribuir

El proyecto sigue desarrollo guiado por especificaciones: nada se implementa sin spec.

1. Capacidades nuevas: especificación en `specs/` (Spec Kit).
2. Cambios a capacidades existentes: propuesta en `openspec/` (OpenSpec).
3. Toda tarea trae pruebas automáticas; `npm run check` debe pasar.
4. Nunca suba datos ni imágenes reales de cédulas; use solo fixtures sintéticos.
