# Spec Delta

## MODIFIED Requirements

### Requirement: LPI-06 CLI leer-foto
`npm run leer-foto -- [--sin-mascara] [--fecha-referencia AAAA-MM-DD] <ruta>` MUST decodificar el archivo probando primero el PDF417 y, solo si no lo encuentra, la MRZ (escenario "Orden de decodificación"), e imprimir en stdout un único JSON (escenario "Forma del JSON") con los códigos de "Códigos de salida". stderr MUST NOT incluir la ruta ni el contenido. Sin `--sin-mascara` (`enmascarado: true`) la CLI MUST enmascarar según "Reglas de máscara"; con ella MUST imprimir todo completo.

#### Scenario: Orden de decodificación
- **WHEN** la CLI lee una imagen
- **THEN** llama primero a `decodificarPdf417Imagen` y, solo si devuelve `pdf417-no-encontrado`, a `crearLectorMrz` con `rutaModelo` igual a la variable de entorno `LECTOR_CEDULA_RUTA_MODELO_MRZ` si existe o, si no, a `models/tesseract/` del repositorio, y `fechaReferencia` igual a la opción o, sin ella, a la fecha actual en `America/Bogota`

#### Scenario: Forma del JSON
- **WHEN** la CLI imprime el resultado
- **THEN** es `{ ok: true, tipo: "pdf417", intento, enmascarado, resultado }` con el resultado de `parsearPdf417Amarilla(bytes, { divipol: buscarDivipol })`, `{ ok: true, tipo: "mrz", intento, enmascarado, resultado }` con el resultado de `parsearMrzCedulaDigital` cuando `resultado.valido` es `true`, o `{ ok: false, error }` (más `tipo` cuando el tipo se detectó)

#### Scenario: Códigos de salida
- **WHEN** la CLI termina
- **THEN** el código es 0 con lectura válida; 1 si no encuentra ningún código (`error: "documento-no-encontrado"`) o la imagen es ilegible (`error: "imagen-ilegible"`); 2 si el parser PDF417 devuelve `ok: false` o la MRZ leída tiene `resultado.valido` `false` (`{ ok: false, tipo: "mrz", error: "mrz-no-valida", digitosValidos }`); 3 si falta el modelo MRZ (`{ ok: false, tipo: "mrz", error: "modelo-no-disponible" }`, con la sugerencia `npm run modelos:mrz` en stderr); 64 por uso incorrecto (sin ruta, más de una ruta, opción desconocida, fecha de referencia con formato distinto de `AAAA-MM-DD` o archivo ilegible)

#### Scenario: Reglas de máscara
- **WHEN** la CLI imprime sin `--sin-mascara`
- **THEN** en PDF417, `resultado.campos.numeroDocumento` conserva SOLO los 2 últimos dígitos y sustituye todos los demás por `*`, sea cual sea su longitud, y `primerApellido`, `segundoApellido`, `primerNombre` y `segundoNombre` conservan la primera letra de cada palabra y sustituyen las demás por `*`, manteniendo los espacios (`null` queda `null`); en MRZ, `resultado.campos.nuip` y `resultado.campos.serial` conservan solo los 2 últimos dígitos, `apellidos` y `nombres` como los nombres, y `resultado.lineasCorregidas` y `resultado.correcciones` se sustituyen por `null`; el resto de campos no se modifica

#### Scenario: Lectura de imagen sintética
- **WHEN** se ejecuta la CLI con `--sin-mascara` sobre S escrita en `os.tmpdir()`
- **THEN** el código de salida es 0 y el JSON de stdout tiene `ok: true`, `tipo: "pdf417"`, `intento: "original"`, `enmascarado: false` y los campos de `resultado` coinciden con `F.esperado`

#### Scenario: Detección de MRZ
- **WHEN** se ejecuta la CLI con `--sin-mascara --fecha-referencia 2026-10-06` sobre R escrita en `os.tmpdir()`
- **THEN** el código de salida es 0, `tipo` es `"mrz"`, `resultado.valido` es `true` y `resultado.lineasCorregidas` es igual a `P.lineasSinErrores`

#### Scenario: MRZ con dígito de control inválido
- **WHEN** se ejecuta la CLI con `--fecha-referencia 2026-10-06` sobre R(`generarMrzTd1(PERSONA_BASE, { variante: "cd-compuesto-alterado" }).lineas`)
- **THEN** el código de salida es 2 y stdout es `{"ok":false,"tipo":"mrz","error":"mrz-no-valida","digitosValidos":3}` seguido de salto de línea

#### Scenario: Modelo MRZ ausente
- **WHEN** se ejecuta la CLI sobre R con la variable de prueba `LECTOR_CEDULA_RUTA_MODELO_MRZ` apuntando a un directorio temporal vacío
- **THEN** el código de salida es 3, stdout es `{"ok":false,"tipo":"mrz","error":"modelo-no-disponible"}` seguido de salto de línea y stderr contiene `npm run modelos:mrz`

#### Scenario: Opción desconocida
- **WHEN** se ejecuta con `--otra` y la ruta de S, y por separado con `--fecha-referencia 06/10/2026` y la ruta de R
- **THEN** el código de salida es 64 en ambos casos y stdout está vacío

#### Scenario: Uso incorrecto
- **WHEN** se ejecuta sin argumentos y, por separado, con la ruta inexistente `<tmpdir>/no-existe-<uuid>.png`
- **THEN** el código de salida es 64 en ambos casos, stdout está vacío y stderr no contiene `no-existe-`

#### Scenario: Sin PDF417
- **WHEN** se ejecuta sobre un PNG blanco de 800x600 en `os.tmpdir()`
- **THEN** el código de salida es 1 y stdout es `{"ok":false,"error":"documento-no-encontrado"}` seguido de salto de línea

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
