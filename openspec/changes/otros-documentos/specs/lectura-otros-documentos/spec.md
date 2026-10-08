## ADDED Requirements

### Requirement: OD-20 Pista de formato desde la presencia
El detector de presencia (OFF-22, OFF-22b) MUST distinguir en las 4 orientaciones una MRZ de 3 líneas de unos 30 caracteres (`"mrz-td1"`) de una de 2 líneas de unos 44 (`"mrz-td3"`). El `contenido` del Worker de calidad pasa a ser `"pdf417" | "mrz-td1" | "mrz-td3" | null`; en `leerDocumento`, `"mrz"` es alias de `"mrz-td1"` (OFF-27). El coste de OFF-22b (< 250 ms) se mantiene.

#### Scenario: Contenido por documento
- **WHEN** el Worker de calidad con presencia analiza en la guía la amarilla, la digital y la CE sintéticas, la página de datos de un pasaporte sintético (proporción ID-3, 125x88 mm) y, aparte, el pasaporte girado 180°
- **THEN** los `contenido` son `"pdf417"`, `"mrz-td1"`, `"mrz-td1"`, `"mrz-td3"` y `"mrz-td3"`

#### Scenario: Alias mrz
- **WHEN** se llama `leerDocumento` con `pista: "mrz"` y dependencias inyectadas con una digital válida
- **THEN** el resultado es igual al de `pista: "mrz-td1"`

### Requirement: OD-21 Lector MRZ de 2 líneas de 44
El lector MRZ desde imagen (LMI) MUST aceptar un parámetro `formato: "td1" | "td3"`; con `"td3"` busca 2 líneas de 44 caracteres en la banda inferior de la página de datos, con el mismo plan de vistas y giros (LMI-12b, LMI-12c, LMI-14c) y el mismo límite de tiempo (LMI-13), y entrega las líneas a `parsearMrzTd3`. Sin `formato`, el comportamiento es el de `"td1"`. Con pista `"mrz-td3"`, `leerDocumento` MUST empezar por TD3 y usar TD1 y luego PDF417 solo como respaldo ante "no encontrado".

#### Scenario: Pasaporte en las cuatro orientaciones
- **WHEN** se lee con OCR real la imagen sintética del pasaporte colombiano de OD-01 (página de datos 1250x880 sobre fondo de madera) y esa imagen girada 90°, 180° y 270°
- **THEN** las cuatro lecturas devuelven `tipoDocumento: "pasaporte"` y `numeroDocumento: "AZ1234567"`, con `intento` sin sufijo, `"@270"`, `"@180"` y `"@90"`

#### Scenario: Orden con pista TD3
- **WHEN** se llama `leerDocumento` con `pista: "mrz-td3"` y lectores inyectados en los que TD3 devuelve `mrz-no-encontrada` y TD1 una CE válida
- **THEN** el resultado tiene `tipoDocumento: "cedula-extranjeria"`, TD3 tiene 1 llamada antes que TD1 y PDF417 0 llamadas

### Requirement: OD-22 Salida unificada con tipoDocumento
`leerDocumento`, el SDK y el servidor MUST devolver en el éxito `{ ok: true, tipoDocumento, fuente, campos, warnings }`, con `tipoDocumento` en `"cedula-ciudadania" | "cedula-extranjeria" | "pasaporte" | "tarjeta-identidad"` y `fuente` en `"pdf417" | "mrz-td1" | "mrz-td3"`. El campo `tipo` actual se conserva un ciclo, marcado obsoleto en el OpenAPI; los errores conservan `{ ok: false, tipo, error }`.

#### Scenario: Contrato del servidor
- **WHEN** Schemathesis ejecuta `--checks all` contra `/openapi.json` con los ejemplos de los cuatro `tipoDocumento`
- **THEN** hay 0 fallos y el esquema enumera exactamente los 4 valores de `tipoDocumento` y los 3 de `fuente`

### Requirement: OD-22a Campos comunes
`campos` MUST tener siempre `numeroDocumento`, `apellidos`, `nombres`, `fechaNacimiento`, `sexo`, `nacionalidad` (`"COL"` en la amarilla), `paisEmisor` y `fechaVencimiento` (`null` si el documento no la trae); `nuip`, `rh` y `lugarNacimiento` solo aparecen cuando la fuente los aporta.

#### Scenario: Amarilla unificada
- **WHEN** se lee la amarilla sintética `PERSONA_BASE`
- **THEN** `tipoDocumento` es `"cedula-ciudadania"`, `fuente` es `"pdf417"`, `campos.numeroDocumento` es igual a `campos.nuip`, `campos.nacionalidad` es `"COL"` y `campos.fechaVencimiento` es `null`

#### Scenario: Pasaporte unificado sin campos de cédula
- **WHEN** se lee el pasaporte colombiano sintético de OD-01
- **THEN** `tipoDocumento` es `"pasaporte"`, `fuente` es `"mrz-td3"`, `campos.paisEmisor` es `"COL"` y `campos` no tiene las claves `rh` ni `nuip`

### Requirement: OD-23 Mensajes de la PWA por documento
La PWA MUST mostrar el tipo de documento leído con las etiquetas `Cédula de ciudadanía`, `Cédula de extranjería`, `Pasaporte` y `Tarjeta de identidad`, y clasificar los errores nuevos: `documento-no-admitido` → "Este tipo de documento no está admitido en este servicio."; `no-es-pasaporte` y `formato-td3` → `no-valido`. La guía de captura MUST admitir la proporción de la página de datos del pasaporte (ID-3) además de ID-1.

#### Scenario: Etiqueta y accesibilidad
- **WHEN** el E2E con cámara simulada lee el vídeo sintético `pasaporte-col-1080p`
- **THEN** la pantalla de resultado muestra `Pasaporte` y `AZ1234567`, y axe reporta 0 violaciones serious o critical

#### Scenario: Documento no admitido
- **WHEN** se clasifica el error `documento-no-admitido`
- **THEN** el mensaje es "Este tipo de documento no está admitido en este servicio." y no hay reintento automático

### Requirement: OD-40 Prohibiciones de datos y fuentes
El lector MUST NOT decodificar QR, leer chips NFC (ni BAC/PACE) ni extraer foto, firma o huella de ningún documento; los fixtures MUST ser sintéticos o especímenes públicos (`UTO` de ICAO, `MUSTERMANN`). `npm run check:privacidad` MUST fallar ante una dependencia de QR o NFC en los paquetes de producto o un fixture MRZ con un número fuera de la lista de sintéticos declarada.

#### Scenario: Dependencia prohibida
- **WHEN** `privacidad-check` analiza un `package.json` de prueba en `apps/pwa` que añade `jsqr` o `@capacitor-community/nfc`
- **THEN** el comando termina con código distinto de 0 y nombra la dependencia

#### Scenario: Fixture no declarado
- **WHEN** `privacidad-check` analiza un directorio temporal con un fixture TD3 cuyo número `XY9999999` no figura en la lista de sintéticos
- **THEN** el comando falla y nombra el archivo
