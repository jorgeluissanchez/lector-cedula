# Nota sobre licencias de terceros para usuarios finales (BORRADOR)

> **BORRADOR pendiente de revisión.** Texto para la pantalla **Acerca de / Licencias** de la app. Esa pantalla **aún no existe** en `apps/pwa` [V: búsqueda en `apps/pwa/src`, 2026-10-07]; la CLI ya lo resuelve con `node tools/leer-foto.mjs --licencias` (spec `divipol-consulados-2018`). Se recomienda abrir un cambio OpenSpec para la pantalla.

## Texto para la pantalla

**Acerca de / Licencias**

Esta aplicación usa software de código abierto y datos públicos. Agradecemos a sus autores.

**Datos de lugar de nacimiento.** Los nombres de departamentos, municipios y consulados provienen de:
- DANE, Divipola (codificación de la División Político-Administrativa de Colombia).
- Registraduría Nacional del Estado Civil, Divipole, incluida la Divipole Exterior Presidente 2018 (datos.gov.co, conjunto `vh8b-jfhg`).

Publicados con licencia **Creative Commons Atribución-CompartirIgual 4.0 Internacional (CC BY-SA 4.0)**: https://creativecommons.org/licenses/by-sa/4.0/deed.es. Los datos fueron adaptados (extracción de columnas y correcciones documentadas). Las tablas adaptadas se distribuyen con la misma licencia. Ni el DANE ni la Registraduría respaldan esta aplicación.

**Software.** La lista completa de componentes, versiones, licencias y avisos de copyright está en **[enlace al archivo THIRD_PARTY_NOTICES generado en la compilación]**.

**Lo que esta app no es.** No es un servicio de la Registraduría ni una verificación oficial del documento.

## Fuente técnica del texto

- `packages/parsers/THIRD_PARTY_NOTICES.md` (contenido que imprime `--licencias`).
- Literal de atribución usado en la CLI: `"Datos: DANE y Registraduría, CC BY-SA 4.0; ver --licencias"`.
- Decisiones de licencias: `docs/decisiones/2026-10-06-fuente-divipol.md`, `docs/decisiones/2026-10-06-licencias-mrz-ocr.md`.

## Preguntas para el abogado

- ¿El efecto "CompartirIgual" de CC BY-SA 4.0 alcanza solo a las tablas adaptadas o a la app completa? (Interpretación técnica actual: solo a la base de datos adaptada, que se mantiene como módulo aparte.)
- ¿Es suficiente una pantalla accesible desde el menú, o la atribución debe mostrarse junto al lugar de nacimiento?
