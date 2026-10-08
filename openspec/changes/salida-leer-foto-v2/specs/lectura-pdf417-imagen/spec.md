# Spec Delta

## MODIFIED Requirements

### Requirement: LPI-06 CLI leer-foto
`npm run leer-foto -- [--sin-mascara] [--fecha-referencia AAAA-MM-DD] <ruta>` MUST comportarse como en el cambio `leer-mrz-desde-imagen` (orden PDF417 -> MRZ, forma del JSON, códigos de salida 0, 1, 2, 3 y 64, stderr sin ruta ni contenido), salvo la máscara. Por defecto (`enmascarado: true`) la CLI MUST enmascarar: en PDF417, `resultado.campos.numeroDocumento` conserva SOLO los 2 últimos dígitos y sustituye todos los demás por `*`, sea cual sea su longitud; `primerApellido`, `segundoApellido`, `primerNombre` y `segundoNombre` conservan la primera letra de cada palabra y sustituyen las demás por `*`, manteniendo los espacios (`null` queda `null`); en MRZ, `resultado.campos.nuip` y `resultado.campos.serial` conservan solo los 2 últimos dígitos, `apellidos` y `nombres` como los nombres, y `resultado.lineasCorregidas` y `resultado.correcciones` se sustituyen por `null`. Con `--sin-mascara` (`enmascarado: false`) se imprime todo completo.

#### Scenario: Máscara por defecto
- **WHEN** se ejecuta la CLI sin opciones sobre la imagen sintética del PDF417 de `PERSONA_BASE` (NUIP `9999123456`) en `os.tmpdir()`
- **THEN** el código de salida es 0, `resultado.campos.numeroDocumento` es `"********56"`, `primerApellido` es `"P*****"`, `primerNombre` es `"F*******"` y stdout no contiene `9999123456`, `9999` seguido de `*` ni `PRUEBA`

#### Scenario: Máscara de cédula antigua de 8 dígitos
- **WHEN** se ejecuta la CLI sin opciones sobre la imagen sintética del PDF417 de `PERSONA_BASE` con `nuip: "99991234"`
- **THEN** el código de salida es 0, `resultado.campos.numeroDocumento` es `"******34"` y stdout no contiene `99991234` ni `9999`

#### Scenario: Máscara MRZ por defecto
- **WHEN** se ejecuta la CLI con `--fecha-referencia 2026-10-06` sobre la imagen sintética del reverso MRZ de `PERSONA_BASE`
- **THEN** el código de salida es 0, `resultado.campos.nuip` es `"********56"`, `resultado.campos.serial` es `"*******45"`, `lineasCorregidas` y `correcciones` son `null` y stdout no contiene `9999123456`, `999912345` ni `PRUEBA`

### Requirement: LPI-07 Privacidad de la CLI y del decodificador
La CLI MUST NOT escribir archivos, MUST NOT emitir nada en stdout salvo el JSON final, MUST NOT enviar telemetría y MUST rechazar con código 64 y el mensaje `ruta-dentro-del-repo` toda ruta que resuelva (tras `realpath`) dentro del repositorio salvo bajo `evals/real/`. La imagen MUST vivir solo en memoria. El decodificador MUST NOT escribir en consola.

#### Scenario: Ruta dentro del repo
- **WHEN** se ejecuta con S copiada a `packages/capture/.tmp-prueba-<uuid>.png` (borrada al final)
- **THEN** el código es 64, stderr contiene `ruta-dentro-del-repo` y stdout está vacío

#### Scenario: Ruta bajo evals/real
- **WHEN** se ejecuta con S copiada a `evals/real/tmp-prueba-<uuid>.png` (borrada al final)
- **THEN** el código es 0

#### Scenario: No escribe a disco
- **WHEN** se ejecuta la CLI sobre S con el hook `tools/test/ayudas/bloquear-escrituras.mjs` precargado (`node --import`), que hace fallar toda API de `node:fs` que crea, modifica o borra archivos (`writeFile*`, `appendFile*`, `mkdir*`, `rename`, `copyFile`, `rm`, `unlink`, `createWriteStream`, `open` con banderas de escritura, también en `node:fs/promises`) y escribe `ESCRITURA-PROHIBIDA` en stderr, con cwd, HOME y TMP en un directorio temporal vacío propio; y se comparan los listados recursivos, con tamaño y fecha de modificación, de ese directorio y del directorio temporal de las imágenes antes y después
- **THEN** el código es 0, stdout es el JSON con `ok: true`, stderr no contiene `ESCRITURA-PROHIBIDA` y los listados son idénticos. No se compara el repositorio entero, porque otros procesos de la misma corrida (Playwright, Lighthouse, otras suites) lo modifican

#### Scenario: El detector detecta escrituras
- **WHEN** con el mismo hook y aislamiento se ejecuta un script que escribe con `writeFileSync`, `fs/promises.writeFile`, `createWriteStream`, `openSync(…, "w")` y `mkdirSync`, y otro que solo lee con `readFileSync`
- **THEN** en cada escritura stderr contiene `ESCRITURA-PROHIBIDA: <api>` y el directorio aislado sigue vacío; la lectura funciona y no deja marca

#### Scenario: Sin consola en el decodificador
- **WHEN** se decodifica S con `console.log`, `console.info`, `console.warn`, `console.error` y `console.debug` espiados
- **THEN** ningún espía fue llamado

## ADDED Requirements

### Requirement: LPI-08 Lugar de nacimiento resuelto
En la salida PDF417 con `ok: true`, la CLI MUST añadir `resultado.campos.lugarNacimiento` = `{ codigo, departamento, municipio }` de `buscarDivipol(codigoDepartamentoNacimiento + codigoMunicipioNacimiento)`, o `null` más el warning `"lugar-nacimiento-no-resuelto"` en `resultado.warnings` si no se resuelve. Nunca se enmascara.

#### Scenario: Lugar conocido
- **WHEN** se ejecuta la CLI sin opciones sobre la imagen sintética del PDF417 de `PERSONA_BASE` (departamento `16`, municipio `001`)
- **THEN** `resultado.campos.lugarNacimiento` es `{ "codigo": "16001", "departamento": "BOGOTA D.C", "municipio": "BOGOTA, D.C." }` y `resultado.warnings` no contiene `lugar-nacimiento-no-resuelto`

#### Scenario: Lugar desconocido
- **WHEN** se ejecuta la CLI con `--sin-mascara` sobre la imagen sintética del PDF417 de `PERSONA_BASE` con `departamento: "99"` y `municipio: "999"`
- **THEN** el código de salida es 0, `resultado.campos.lugarNacimiento` es `null` y `resultado.warnings` contiene `"lugar-nacimiento-no-resuelto"`
