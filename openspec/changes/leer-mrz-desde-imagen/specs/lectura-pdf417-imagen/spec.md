# Spec Delta

## Purpose

La CLI `leer-foto` detecta automáticamente si la foto trae el PDF417 de la cédula amarilla o la MRZ de la digital. Convenciones de `S`, `F` (PDF417) en el cambio `leer-pdf417-desde-imagen`; `R`, `P` y `REF` (MRZ) en la spec `lectura-mrz-imagen` de este cambio. El modelo MRZ se busca en `models/tesseract/` (LMI-08).

## MODIFIED Requirements

### Requirement: LPI-06 CLI leer-foto
`npm run leer-foto -- [--sin-mascara] [--fecha-referencia AAAA-MM-DD] <ruta>` MUST decodificar el archivo probando primero el PDF417 (`decodificarPdf417Imagen`) y, solo si devuelve `pdf417-no-encontrado`, la MRZ (`crearLectorMrz` con `rutaModelo` igual a la variable de entorno `LECTOR_CEDULA_RUTA_MODELO_MRZ` si existe o, si no, a `models/tesseract/` del repositorio y `fechaReferencia` igual a la opción o, sin ella, a la fecha actual en `America/Bogota`). MUST imprimir en stdout un único JSON: `{ ok: true, tipo: "pdf417", intento, enmascarado, resultado }` con el resultado de `parsearPdf417Amarilla(bytes, { divipol: buscarDivipol })`, `{ ok: true, tipo: "mrz", intento, enmascarado, resultado }` con el resultado de `parsearMrzCedulaDigital` cuando `resultado.valido` es `true`, o `{ ok: false, error }` (más `tipo` cuando el tipo se detectó). Salida: 0 lectura válida; 1 ningún código encontrado (`error: "documento-no-encontrado"`) o imagen ilegible (`error: "imagen-ilegible"`); 2 parser PDF417 con `ok: false`, o MRZ leída con `resultado.valido` `false` (`{ ok: false, tipo: "mrz", error: "mrz-no-valida", digitosValidos }`); 3 modelo MRZ ausente (`{ ok: false, tipo: "mrz", error: "modelo-no-disponible" }`, con la sugerencia `npm run modelos:mrz` en stderr); 64 uso incorrecto (sin ruta, más de una ruta, opción desconocida, fecha de referencia con formato distinto de `AAAA-MM-DD` o archivo ilegible). stderr MUST NOT incluir la ruta ni el contenido.

Por defecto (`enmascarado: true`) la CLI MUST enmascarar: en PDF417, `resultado.campos.numeroDocumento` conserva los 4 primeros y los 2 últimos dígitos y sustituye el resto por `*` (si tiene menos de 8 dígitos, solo conserva los 2 últimos) y `primerApellido`, `segundoApellido`, `primerNombre` y `segundoNombre` conservan la primera letra de cada palabra y sustituyen las demás letras por `*`, manteniendo los espacios (`null` queda `null`); en MRZ, `resultado.campos.nuip` igual que `numeroDocumento`, `resultado.campos.serial` conserva solo los 2 últimos dígitos, `apellidos` y `nombres` como los nombres anteriores, y `resultado.lineasCorregidas` y `resultado.correcciones` se sustituyen por `null`. Con `--sin-mascara` (`enmascarado: false`) se imprime todo completo. El resto de campos no se modifica.

#### Scenario: Lectura de imagen sintética
- **WHEN** se ejecuta la CLI con `--sin-mascara` sobre S escrita en `os.tmpdir()`
- **THEN** el código de salida es 0 y el JSON de stdout tiene `ok: true`, `tipo: "pdf417"`, `intento: "original"`, `enmascarado: false` y los campos de `resultado` coinciden con `F.esperado`

#### Scenario: Máscara por defecto
- **WHEN** se ejecuta la CLI sin opciones sobre S escrita en `os.tmpdir()`
- **THEN** el código de salida es 0, `tipo` es `"pdf417"`, `enmascarado` es `true`, `resultado.campos.numeroDocumento` es `"9999****56"`, `primerApellido` es `"P*****"`, `segundoApellido` es `"E******"`, `primerNombre` es `"F*******"`, `segundoNombre` es `"L**"`, `fechaNacimiento` es `"1985-03-14"` y stdout no contiene `9999123456` ni `PRUEBA`

#### Scenario: Detección de MRZ
- **WHEN** se ejecuta la CLI con `--sin-mascara --fecha-referencia 2026-10-06` sobre R escrita en `os.tmpdir()`
- **THEN** el código de salida es 0, `tipo` es `"mrz"`, `resultado.valido` es `true` y `resultado.lineasCorregidas` es igual a `P.lineasSinErrores`

#### Scenario: Máscara MRZ por defecto
- **WHEN** se ejecuta la CLI con `--fecha-referencia 2026-10-06` sobre R escrita en `os.tmpdir()`
- **THEN** el código de salida es 0, `enmascarado` es `true`, `resultado.campos.nuip` es `"9999****56"`, `resultado.campos.serial` es `"*******45"`, `resultado.lineasCorregidas` y `resultado.correcciones` son `null` y stdout no contiene `9999123456`, `999912345` ni `PRUEBA`

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

#### Scenario: Sin documento
- **WHEN** se ejecuta sobre un PNG blanco de 800x600 en `os.tmpdir()`
- **THEN** el código de salida es 1 y stdout es `{"ok":false,"error":"documento-no-encontrado"}` seguido de salto de línea
