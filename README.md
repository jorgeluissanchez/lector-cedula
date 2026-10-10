# Lector de cédula colombiana

Lector autoalojable y de código abierto de la cédula de ciudadanía colombiana.

**Pruébalo:** https://lector-frontend-nrumhc-c7438f-76-13-96-196.sslip.io (ábrelo en el celular; funciona sin conexión después de la primera visita).

> **Aviso de la demo:** demostración del software libre lector-cedula. No uses tu cédula real ni datos de terceros; usa un documento de prueba. Nada se guarda ni se envía: la lectura ocurre en tu dispositivo. La instancia puede cambiar o reiniciarse sin aviso.

## Qué hace

- Lee el código de barras **PDF417** de la cédula amarilla y la zona de lectura mecánica (**MRZ**) de la cédula digital, con la cámara del teléfono.
- Funciona **sin conexión** en el navegador (PWA); el servidor de respaldo es opcional.
- **No guarda datos**: las imágenes no se persisten y el resultado se borra al terminar.
- **Nunca decodifica el código QR** de la cédula digital ni lee biometría.

## Descargo de responsabilidad

- El software se entrega **"tal cual", sin garantía de ningún tipo** (licencia MIT, ver [`LICENSE`](LICENSE) y [`DISCLAIMER.md`](DISCLAIMER.md)). Los autores no responden por daños derivados de su uso.
- **No es una verificación oficial.** No consulta a la Registraduría Nacional del Estado Civil ni certifica que un documento sea auténtico, vigente o de quien lo presenta. El formato del PDF417 no es público y se interpreta con pruebas propias.
- La **señal de fraude** es orientativa: un riesgo bajo **no garantiza** que el documento sea auténtico, ni uno alto que sea falso.
- El resultado calculado en el dispositivo del usuario **no es confiable por sí solo**: un cliente puede alterarlo. Toda decisión con efectos debe validarse en el servidor de quien despliega y, cuando importe la identidad, con fuentes oficiales.

## Responsabilidad de quien despliega

Quien instala, despliega u ofrece este software a terceros decide los fines y medios del tratamiento y es, por tanto, el **Responsable del tratamiento** (Ley 1581 de 2012, art. 3 lit. e). Los autores de la librería no tratan datos de instancias ajenas. Quien despliega debe:

1. Llenar las plantillas de [`docs/legal/README.md`](docs/legal/README.md) (política de tratamiento, aviso de privacidad, términos de uso) con sus datos y revisarlas con su abogado.
2. Obtener la **autorización previa, expresa e informada** del titular antes de leer su documento, y conservar la prueba.
3. Atender consultas y reclamos de los titulares y cumplir las demás obligaciones del Responsable.

## Uso aceptable

- No se permite usar este software para **vigilancia masiva**, **perfilamiento** de personas ni para tratar datos **sin la autorización** del titular.
- **Menores de edad** (tarjeta de identidad): solo con la opción de compilación correspondiente activada y con la **autorización del representante legal**.
- No uses documentos reales en la demo pública, en issues ni en pruebas: usa documentos de prueba o fixtures sintéticos.
- Vulnerabilidades: repórtalas en privado según [`SECURITY.md`](SECURITY.md).

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
