## ADDED Requirements

### Requirement: OD-30 Parámetro admitirTarjetaIdentidad
Cada instancia MUST poder activar la TI con un parámetro apagado por defecto: en la PWA, la variable de build `VITE_ADMITIR_TI` (`"true"` o `"false"`; ausente es `"false"`; otro valor hace fallar `npm run build -w apps/pwa` nombrando la variable); en el servidor, `LECTOR_ADMITIR_TI` (`"1"` o `"0"`; ausente es `"0"`; otro valor hace que `Config.desde_entorno` lance `ValueError`, como `LECTOR_LIVE`).

#### Scenario: Valores por defecto
- **WHEN** se construye la PWA sin `VITE_ADMITIR_TI` y se arranca el servidor sin `LECTOR_ADMITIR_TI`
- **THEN** la configuración de la PWA tiene `admitirTarjetaIdentidad: false` y `GET /v1/capacidades` responde `tarjetaIdentidad: false`

#### Scenario: Valores inválidos
- **WHEN** se construye la PWA con `VITE_ADMITIR_TI=si` y, aparte, se llama `Config.desde_entorno({"LECTOR_ADMITIR_TI": "true"})`
- **THEN** la construcción termina con código distinto de 0 y un mensaje que contiene `VITE_ADMITIR_TI`, y el servidor lanza `ValueError` con `LECTOR_ADMITIR_TI` en el mensaje

### Requirement: OD-30a Exposición del parámetro
El servidor MUST exponer el valor efectivo en `GET /v1/capacidades` como `{ "tarjetaIdentidad": true | false }`, y la PWA MUST pasarlo a `leerDocumento` como `opciones.admitirTarjetaIdentidad`; sin la opción, `leerDocumento` usa `false`. Si la PWA usa el servidor de respaldo, la TI se admite solo si ambos valores están encendidos.

#### Scenario: Encendido
- **WHEN** se arranca el servidor con `LECTOR_ADMITIR_TI=1`
- **THEN** `GET /v1/capacidades` responde `tarjetaIdentidad: true`

#### Scenario: PWA encendida y servidor apagado
- **WHEN** la PWA con `admitirTarjetaIdentidad: true` envía al respaldo de servidor (inyectado, `tarjetaIdentidad: false`) una TI sintética de 12 años
- **THEN** el resultado es `{ ok: false, error: "menor-de-edad" }`

### Requirement: OD-31 Parámetro apagado conserva OFF-24
Con `admitirTarjetaIdentidad` en `false`, el comportamiento MUST ser exactamente el de OFF-24 de `pwa-lectura-offline`: menor de 18 años a la `fechaReferencia` da `{ ok: false, tipo, error: "menor-de-edad" }` sin campos, en PDF417 y MRZ, y una TI identificada como tal (OD-33) también da `menor-de-edad`.

#### Scenario: Escenarios de OFF-24 sin cambios
- **WHEN** se ejecutan con la opción ausente y con `false` los escenarios de OFF-24 (18 años exactos, un día menos, TI en PDF417 de 12 años, 29 de febrero)
- **THEN** los resultados son los de OFF-24 en ambos casos

### Requirement: OD-32 OFF-24b Regla de edad invertida con el parámetro encendido
Con `admitirTarjetaIdentidad` en `true`, `leerDocumento` MUST: (a) dar `"tarjeta-identidad"` para una TI (OD-33) o un PDF417 de layout amarillo de un menor de 18 años a la `fechaReferencia`; (b) dar `{ ok: false, tipo, error: "ti-mayor-de-edad" }` para una TI de 18 o más años; (c) dar `"cedula-ciudadania"` al PDF417 sin marca de TI de un mayor; (d) dar `menor-de-edad` a una digital `IC`+`COL` de un menor. El 29 de febrero sigue OFF-24.

#### Scenario: Digital de un menor
- **WHEN** con el parámetro encendido se lee la digital sintética `IC`+`COL` con `fechaNacimiento` `2010-01-01` y `fechaReferencia` `2026-10-08`
- **THEN** el resultado es `{ ok: false, tipo: "mrz", error: "menor-de-edad" }`

#### Scenario: TI de 12 años admitida
- **WHEN** con el parámetro encendido y autorización del representante (OD-34) se lee un PDF417 sintético con layout de la amarilla y prefijo `I3` de una persona nacida el `2014-05-10`, con `fechaReferencia` `2026-10-08`
- **THEN** el resultado es `ok: true`, `tipoDocumento: "tarjeta-identidad"` y `warnings` contiene `"H10"` y `"H12"`

#### Scenario: Frontera de 18 años
- **WHEN** con el parámetro encendido se lee una TI sintética (PDF417 prefijo `I3`) con `fechaNacimiento` `2008-10-09` y otra con `2008-10-08`, ambas con `fechaReferencia` `2026-10-08`
- **THEN** la primera es `tarjeta-identidad` y la segunda `{ ok: false, error: "ti-mayor-de-edad" }`

#### Scenario: Mensaje de la PWA para una TI de un mayor
- **WHEN** la PWA clasifica el error `ti-mayor-de-edad`
- **THEN** el código es `ti-mayor-de-edad`, el mensaje es "Esta tarjeta de identidad es de una persona mayor de edad. Usa la cédula de ciudadanía." y no hay reintento automático

### Requirement: OD-32b Menores de 7 años
Con `admitirTarjetaIdentidad` en `true`, una persona menor de 7 años a la `fechaReferencia` MUST dar `{ ok: false, tipo, error: "documento-no-admitido" }`: su documento es el registro civil (decisión del orquestador 2).

#### Scenario: Frontera de 7 años
- **WHEN** con el parámetro encendido y autorización se lee una TI sintética (PDF417 prefijo `I3`) con `fechaNacimiento` `2019-10-09` y otra con `2019-10-08`, ambas con `fechaReferencia` `2026-10-08`
- **THEN** la primera es `{ ok: false, error: "documento-no-admitido" }` y la segunda `tarjeta-identidad`

### Requirement: OD-32a CE y pasaporte de menores
Una CE o un pasaporte de una persona menor de 18 años MUST dar `menor-de-edad` con el parámetro apagado y, con el parámetro encendido, `ok: true` con `menorDeEdad: true` sujeto a la misma autorización de OD-34.

#### Scenario: Pasaporte de un menor
- **WHEN** se lee un pasaporte sintético de una persona de 10 años con el parámetro apagado y, aparte, encendido con autorización
- **THEN** el primero es `menor-de-edad` y el segundo `ok: true` con `tipoDocumento: "pasaporte"` y `menorDeEdad: true`

### Requirement: OD-33 Identificación de la TI (hipótesis)
Un documento MUST identificarse como TI si: en PDF417, los bytes `[0,2)` son `I3` (hipótesis H12, pendiente); en MRZ TD1, `IC`+`COL` no (es CC), un código `IT` o `TI` con emisor `COL` es TI (T01, pendiente) y se rechaza (OD-11b). Cada identificación añade el warning de su hipótesis. Un PDF417 de menor sin prefijo `I3` se trata como TI solo por edad (warning `"H10"`).

#### Scenario: Prefijo 03 de un menor
- **WHEN** con el parámetro encendido y autorización se lee un PDF417 sintético con prefijo `03` de una persona de 15 años
- **THEN** `tipoDocumento` es `"tarjeta-identidad"` y `warnings` contiene `"H10"` y no `"H12"`

#### Scenario: TD1 IT sintético
- **WHEN** con el parámetro encendido y autorización se lee un TD1 sintético `IT`+`COL` válido de 15 años
- **THEN** el resultado es `{ ok: false, error: "documento-no-admitido" }` y `warnings` contiene `"T01"`

### Requirement: OD-34 Autorización del representante legal
Con el parámetro encendido, antes de devolver campos de un menor (`tipoDocumento: "tarjeta-identidad"` o `menorDeEdad: true`), la lectura MUST exigir la autorización expresa del representante legal (Ley 1581 de 2012 art. 7; Decreto 1377 de 2013 art. 12, compilado en el Decreto 1074 de 2015). En la API es `autorizacionRepresentante: true`; sin él, 422 `autorizacion-representante-requerida` sin campos. En la PWA es la pantalla `autorizacion-representante` (OD-34b).

#### Scenario: API sin autorización
- **WHEN** con `LECTOR_ADMITIR_TI=1` se envía al servidor la TI sintética de 12 años sin `autorizacionRepresentante`
- **THEN** la respuesta es 422, `type` termina en `autorizacion-representante-requerida` y el cuerpo no contiene la fecha de nacimiento ni el número del fixture

### Requirement: OD-34a Sin retención de menores
Los resultados con `tipoDocumento: "tarjeta-identidad"` o `menorDeEdad: true` MUST NOT guardarse en el almacén de resultados (retención 0) y el webhook MUST llevar solo `{ id, estado, tipoDocumento }`.

#### Scenario: API con autorización
- **WHEN** se envía lo mismo con `autorizacionRepresentante: true`
- **THEN** la respuesta es 200 con `tipoDocumento: "tarjeta-identidad"`, `GET` del resultado por id da 404 y el webhook enviado no tiene la clave `campos`

### Requirement: OD-34b Pantalla de autorización en la PWA
La PWA MUST mostrar `autorizacion-representante` con el texto de `docs/legal/autorizacion-representante-ti.md` y una casilla sin marcar por defecto "Soy el representante legal del menor y autorizo el tratamiento"; sin marcarla, el resultado no se muestra y los datos se descartan. MUST NOT pedirse datos del representante (nombre, documento) en este cambio.

#### Scenario: PWA sin marcar la casilla
- **WHEN** el E2E con `VITE_ADMITIR_TI=true` lee el vídeo sintético `ti-amarilla-1080p` y en `autorizacion-representante` pulsa `Cancelar`
- **THEN** no aparece ningún campo del documento, el estado vuelve a `inicio` y axe reporta 0 violaciones serious o critical en la pantalla de autorización

#### Scenario: PWA con autorización
- **WHEN** el mismo E2E marca la casilla y pulsa `Continuar`
- **THEN** la pantalla de resultado muestra `Tarjeta de identidad`

### Requirement: OD-35 Textos legales de la TI
Con el parámetro encendido la PWA MUST enlazar la plantilla `docs/legal/autorizacion-representante-ti.md` (MIT, no es asesoría legal), que debe existir junto con una sección de niños, niñas y adolescentes en `politica-tratamiento-datos.md` y una entrada en `CHECKLIST-CUMPLIMIENTO.md` que exija revisión del abogado al activar `LECTOR_ADMITIR_TI` o `VITE_ADMITIR_TI`.
#### Scenario: Archivos y enlaces
- **WHEN** una prueba de Vitest lee `docs/legal/`
- **THEN** existen `autorizacion-representante-ti.md` con las cadenas `Ley 1581 de 2012`, `artículo 7` y `Decreto 1377 de 2013`, y `CHECKLIST-CUMPLIMIENTO.md` contiene `LECTOR_ADMITIR_TI`

#### Scenario: Plantilla ausente con el parámetro encendido
- **WHEN** se construye la PWA con `VITE_ADMITIR_TI=true` y no existe `docs/legal/autorizacion-representante-ti.md` (ni en `docs/legal/publicacion/`)
- **THEN** la construcción falla con un mensaje que nombra `autorizacion-representante-ti.md`

#### Scenario: Enlaces solo con el parámetro
- **WHEN** el E2E carga la PWA construida con `VITE_ADMITIR_TI=false` y con `true`
- **THEN** el enlace a la autorización del representante no existe en la primera y existe en la segunda
