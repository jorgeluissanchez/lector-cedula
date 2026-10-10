# mitigacion-autor Specification

## Purpose
Reducir el riesgo legal del autor de la librería MIT (que no vende servicios ni aloja datos de terceros): la demo pública advierte que no se usen documentos reales y no envía nada; el repositorio declara el descargo, la responsabilidad de quien despliega y el uso aceptable; los reportes de seguridad e issues no piden datos personales.

## Requirements

### Requirement: MA-01 Opción de compilación VITE_DEMO
`apps/pwa/config.ts` MUST exportar `leerDemo(valor)`: ausente o vacío es `false`; `"true"` y `"false"` literales; cualquier otro valor lanza un error que nombra `VITE_DEMO`, y `vite build` falla.

#### Scenario: Valores válidos
- **WHEN** se llama `leerDemo(undefined)`, `leerDemo("")`, `leerDemo("false")` y `leerDemo("true")`
- **THEN** devuelven `false`, `false`, `false` y `true`

#### Scenario: Valor inválido
- **WHEN** se llama `leerDemo("si")`
- **THEN** lanza un error cuyo mensaje contiene `VITE_DEMO`

### Requirement: MA-02 Aviso de demostración visible y no ocultable
Con `VITE_DEMO=true`, la pantalla `inicio` MUST mostrar, antes del botón que abre la cámara y como primer contenido del panel, una región `role="note"` con nombre accesible "Aviso de demostración" y el texto literal del escenario. La región MUST NOT tener control para cerrarla ni ocultarse. Con `VITE_DEMO` ausente o `false`, el aviso MUST NOT existir.

#### Scenario: Demo con aviso
- **WHEN** se abre `/` en el build con `VITE_DEMO=true`
- **THEN** la nota "Aviso de demostración" es visible con exactamente el texto "Demostración del software libre lector-cedula. No uses tu cédula real ni datos de terceros; usa un documento de prueba. Nada se guarda ni se envía: la lectura ocurre en tu dispositivo.", no contiene botones y precede en el documento al botón de iniciar cámara

#### Scenario: Build normal sin aviso
- **WHEN** se abre `/` en el build sin `VITE_DEMO`
- **THEN** no existe la nota "Aviso de demostración"

#### Scenario: Accesibilidad
- **WHEN** axe (wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa) analiza `inicio` del build demo
- **THEN** no hay violaciones `serious` ni `critical`

### Requirement: MA-03 Sin envíos en modo demo
Con `VITE_DEMO=true`, `index.html` compilado MUST incluir `<meta http-equiv="Content-Security-Policy" content="connect-src 'self'">` y la PWA MUST NOT emitir peticiones a otros orígenes ni peticiones distintas de GET.

#### Scenario: Meta CSP en el build demo
- **WHEN** se transforma `index.html` con la opción demo activa
- **THEN** contiene la meta CSP `connect-src 'self'`; sin la opción no la contiene

#### Scenario: Ninguna petición saliente
- **WHEN** se carga `/` del build demo y se espera a que la red quede inactiva
- **THEN** todas las peticiones observadas son GET del mismo origen

### Requirement: MA-04 Imagen Docker de demo
`apps/pwa/Dockerfile` MUST declarar `ARG VITE_DEMO=true` y exportarlo al entorno del build de la PWA; `docs/despliegue/README.md` MUST documentar la variable y cómo construir sin demo (`--build-arg VITE_DEMO=false`).

#### Scenario: Dockerfile y guía
- **WHEN** se leen `apps/pwa/Dockerfile` y `docs/despliegue/README.md`
- **THEN** el Dockerfile contiene `ARG VITE_DEMO=true` y `ENV VITE_DEMO=${VITE_DEMO}` antes del build, y la guía menciona `VITE_DEMO=false`

### Requirement: MA-05 README raíz con descargo, responsabilidad y uso aceptable
`README.md` MUST contener las secciones `## Descargo de responsabilidad`, `## Responsabilidad de quien despliega` y `## Uso aceptable` con el contenido de los escenarios, un enlace a `docs/legal/README.md` y el enlace a la demo con su aviso.

#### Scenario: Contenido de cada sección
- **WHEN** se lee cada sección de `README.md`
- **THEN** el descargo dice MIT tal cual y sin garantía, que no es verificación oficial de la Registraduría, que la señal de fraude no es garantía y que el resultado leído en el dispositivo no es confiable por sí solo; la responsabilidad nombra al Responsable del tratamiento (Ley 1581 de 2012 art. 3 lit. e), llenar las plantillas de `docs/legal` y obtener la autorización; el uso aceptable prohíbe vigilancia masiva, perfilamiento y tratamiento sin autorización, y admite menores solo con la opción y la autorización del representante

#### Scenario: Secciones presentes
- **WHEN** la prueba lee `README.md`
- **THEN** encuentra los tres encabezados, `art. 3`, `docs/legal/README.md`, `Registraduría`, `vigilancia masiva` y `sslip.io`

### Requirement: MA-06 SECURITY.md, DISCLAIMER.md y README por paquete publicable
La raíz MUST tener `SECURITY.md` (reporte privado vía GitHub Security Advisories; no pedir ni adjuntar datos personales ni imágenes de documentos reales) y `DISCLAIMER.md`. Todo paquete en `packages/*` cuyo `package.json` no sea `private: true` MUST tener `README.md` con instalación, enlace al README raíz y enlace a `DISCLAIMER.md`.

#### Scenario: Paquetes publicables
- **WHEN** la prueba recorre `packages/*/package.json` sin `private: true`
- **THEN** cada uno tiene `README.md` que contiene `npm install`, `DISCLAIMER.md` y `README.md` del repositorio raíz

#### Scenario: Política de seguridad
- **WHEN** la prueba lee `SECURITY.md`
- **THEN** contiene `Security Advisories` y advierte no adjuntar datos personales

### Requirement: MA-07 Plantillas de issues
`.github/ISSUE_TEMPLATE/` MUST contener al menos una plantilla y `config.yml` con `blank_issues_enabled: false`; cada plantilla MUST advertir que no se adjunten fotos ni datos de documentos reales.

#### Scenario: Advertencia en plantillas
- **WHEN** la prueba lee cada plantilla de `.github/ISSUE_TEMPLATE/`
- **THEN** cada una contiene "No adjuntes fotos ni datos de documentos reales"
