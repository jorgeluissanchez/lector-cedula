# Spec Delta

## Purpose

Obtener los bytes crudos del PDF417 de la cédula amarilla a partir de una imagen (bytes PNG/JPEG o `ImageData`) y ofrecer una CLI local para leer fotos sin persistir nada.

Convenciones: `F = generarPdf417(PERSONA_BASE, { semilla: 1 })` de `@lector-cedula/fixtures`. "Imagen sintética S" es el PNG que produce el writer de zxing-wasm 3.1.5 (`writeBarcode(F.bytes, { format: "PDF417" })`), escalado sin suavizado a 1200 px de ancho (al menos 2 px por módulo, skill `captura-movil`) y compuesto en el centro de un lienzo blanco de 1920x1080. Las distorsiones se aplican con canvas 2D en Chromium real. Todos los datos son sintéticos y se generan dentro de la prueba. El layout del payload es hipótesis del formato (ver `docs/decisiones/hipotesis-formato.md`); este cambio no lo interpreta, solo transporta bytes.

## ADDED Requirements

### Requirement: LPI-01 Bytes crudos, no texto
`decodificarPdf417Imagen(imagen)` MUST devolver `{ ok: true, bytes: Uint8Array, intento: "original" | "escala-0.75" | "escala-0.5" | "giro+2" | "giro-2" }` con los bytes exactos del símbolo (campo `bytes` del resultado de zxing-wasm), nunca la cadena `text`. Los bytes MUST ser idénticos al payload codificado, incluidos los bytes >= 0x80 (por ejemplo `Ñ` = 0xD1 en ISO-8859-1).

#### Scenario: Round-trip de la imagen sintética S
- **WHEN** se decodifica la imagen sintética S como `Uint8Array` PNG
- **THEN** el resultado es `{ ok: true, bytes: F.bytes, intento: "original" }` comparado con `toStrictEqual`

#### Scenario: Byte Ñ preservado
- **WHEN** se decodifica la imagen generada igual que S a partir de `generarPdf417` de una persona ficticia con primer apellido `"MUÑOZ"`
- **THEN** los bytes devueltos son iguales al payload codificado y contienen 0xD1 en la posición `rangos.primerApellido[0] + 2`

### Requirement: LPI-02 Opciones del lector y reintentos
Cada intento MUST llamar a `readBarcodes` con `formats: ["PDF417"]`, `tryHarder: true`, `tryRotate: true` y `maxNumberOfSymbols: 1`. Los intentos MUST ejecutarse en el orden original, escala 0,75, escala 0,5, giro +2° y giro -2°, y detenerse en el primero con un símbolo válido. Las escalas MUST redondear los lados con `Math.round`. Los giros MUST rotar la imagen original como define el escenario "Geometría de los giros".

#### Scenario: Geometría de los giros
- **WHEN** se ejecutan los intentos `giro+2` y `giro-2` sobre S
- **THEN** cada uno recibe la imagen original girada sobre su centro, del mismo tamaño y con fondo blanco, con ángulo positivo en sentido horario y el eje y hacia abajo (como `CanvasRenderingContext2D.rotate`). Los giros compensan la tolerancia de unos 2° de zxing-cpp a la rotación (medida en la tarea 3.1; skill `captura-movil`, issue #145) y son necesarios para LPI-04

#### Scenario: Opciones enviadas
- **WHEN** se decodifica S con un `readBarcodes` inyectado que registra sus argumentos
- **THEN** hay 1 llamada y sus opciones incluyen exactamente `formats: ["PDF417"]`, `tryHarder: true`, `tryRotate: true` y `maxNumberOfSymbols: 1`

#### Scenario: Orden de reintentos
- **WHEN** el `readBarcodes` inyectado devuelve `[]` en las dos primeras llamadas y el resultado real de S en la tercera
- **THEN** hay 3 llamadas, la segunda recibe una imagen de 1440x810, la tercera una de 960x540 y `intento` es `"escala-0.5"`

#### Scenario: Giros tras las escalas
- **WHEN** el `readBarcodes` inyectado devuelve `[]` en las tres primeras llamadas y el resultado real de S en la cuarta
- **THEN** hay 4 llamadas, la cuarta recibe una imagen de 1920x1080 con píxeles distintos de S e `intento` es `"giro+2"`

#### Scenario: Sin símbolo en ningún intento
- **WHEN** el `readBarcodes` inyectado devuelve siempre `[]`
- **THEN** hay 5 llamadas, la cuarta y la quinta reciben imágenes de 1920x1080 y el resultado es `{ ok: false, error: "pdf417-no-encontrado" }`

### Requirement: LPI-03 Entradas aceptadas y errores
La función MUST aceptar `Uint8Array` con PNG o JPEG (Node y navegador) e `ImageData` (navegador), MUST NOT lanzar ante ninguna entrada y MUST devolver `{ ok: false, error }` con `error` en `"entrada-invalida" | "imagen-ilegible" | "pdf417-no-encontrado"`.

#### Scenario: Errores literales
- **WHEN** se decodifican `null`, `"hola"`, `new Uint8Array([1, 2, 3])` y un PNG blanco de 800x600
- **THEN** los resultados son, en ese orden, `{ ok: false, error: "entrada-invalida" }`, `{ ok: false, error: "entrada-invalida" }`, `{ ok: false, error: "imagen-ilegible" }` y `{ ok: false, error: "pdf417-no-encontrado" }`

#### Scenario: Nunca lanza
- **WHEN** se decodifican 200 valores de `fc.anything()` y 200 de `fc.uint8Array({ maxLength: 4096 })`
- **THEN** ninguna llamada lanza y todo resultado tiene `ok` booleano

#### Scenario: ImageData en navegador
- **WHEN** en Chromium se decodifica el `ImageData` de S dibujada en un canvas
- **THEN** el resultado es `{ ok: true, bytes: F.bytes, intento: "original" }`

### Requirement: LPI-04 Invariancia metamórfica
Ante distorsiones leves la salida decodificada MUST NOT cambiar. Ante cualquier distorsión, el resultado MUST ser `F.bytes` o un error; nunca otros bytes.

#### Scenario: Distorsiones leves decodifican igual
- **WHEN** se aplica a S cada una de: rotación +3°, rotación -3°, blur gaussiano sigma 1, escala 0,8, brillo +20 %, brillo -20 % y JPEG calidad 70
- **THEN** las 7 decodificaciones devuelven `ok: true` y `bytes` igual a `F.bytes`

#### Scenario: Distorsión fuerte no inventa datos
- **WHEN** se aplica a S blur gaussiano sigma 4 combinado con escala 0,3
- **THEN** el resultado es `{ ok: false, error: "pdf417-no-encontrado" }` o `ok: true` con `bytes` igual a `F.bytes`

### Requirement: LPI-05 Encadenado con el parser
La salida `bytes` MUST poder pasarse sin transformación a `parsearPdf417Amarilla(bytes, { divipol: buscarDivipol })`.

#### Scenario: Campos esperados desde imagen
- **WHEN** se decodifica S y se parsean sus bytes con `{ divipol: buscarDivipol }`
- **THEN** el resultado tiene `ok: true` y su NUIP, apellidos, nombres, sexo, fecha de nacimiento y RH coinciden con `F.esperado`

### Requirement: LPI-06 CLI leer-foto
`npm run leer-foto -- [--sin-mascara] <ruta>` MUST decodificar el archivo, parsearlo con `buscarDivipol` e imprimir en stdout un único JSON `{ ok, intento, enmascarado, resultado }` o `{ ok: false, error }`, con los códigos del escenario "Códigos de salida". stderr MUST NOT incluir la ruta ni el contenido. Sin `--sin-mascara` (`enmascarado: true`) la CLI MUST enmascarar según "Reglas de máscara"; con ella (`enmascarado: false`) MUST imprimir todo completo.

#### Scenario: Códigos de salida
- **WHEN** la CLI termina
- **THEN** el código es 0 si la lectura es válida, 1 sin PDF417 o ilegible, 2 si el parser devuelve `ok: false` y 64 por uso incorrecto (sin ruta, más de una ruta, opción desconocida o archivo ilegible)

#### Scenario: Reglas de máscara
- **WHEN** la CLI imprime sin `--sin-mascara`
- **THEN** `numeroDocumento` conserva los 4 primeros y los 2 últimos dígitos y sustituye el resto por `*` (si tiene menos de 8 dígitos, solo conserva los 2 últimos); `primerApellido`, `segundoApellido`, `primerNombre` y `segundoNombre` conservan la primera letra de cada palabra y sustituyen las demás letras por `*`, manteniendo los espacios; `null` queda `null`; el resto de campos no se modifica

#### Scenario: Lectura de imagen sintética
- **WHEN** se ejecuta la CLI con `--sin-mascara` sobre S escrita en `os.tmpdir()`
- **THEN** el código de salida es 0 y el JSON de stdout tiene `ok: true`, `intento: "original"`, `enmascarado: false` y los campos de `resultado` coinciden con `F.esperado`

#### Scenario: Máscara por defecto
- **WHEN** se ejecuta la CLI sin opciones sobre S escrita en `os.tmpdir()`
- **THEN** el código de salida es 0, `enmascarado` es `true`, `resultado.campos.numeroDocumento` es `"9999****56"`, `primerApellido` es `"P*****"`, `segundoApellido` es `"E******"`, `primerNombre` es `"F*******"`, `segundoNombre` es `"L**"`, `fechaNacimiento` es `"1985-03-14"` y stdout no contiene `9999123456` ni `PRUEBA`

#### Scenario: Opción desconocida
- **WHEN** se ejecuta con `--otra` y la ruta de S
- **THEN** el código de salida es 64 y stdout está vacío

#### Scenario: Uso incorrecto
- **WHEN** se ejecuta sin argumentos y, por separado, con la ruta inexistente `<tmpdir>/no-existe-<uuid>.png`
- **THEN** el código de salida es 64 en ambos casos, stdout está vacío y stderr no contiene `no-existe-`

#### Scenario: Sin PDF417
- **WHEN** se ejecuta sobre un PNG blanco de 800x600 en `os.tmpdir()`
- **THEN** el código de salida es 1 y stdout es `{"ok":false,"error":"pdf417-no-encontrado"}` seguido de salto de línea

### Requirement: LPI-07 Privacidad de la CLI y del decodificador
La CLI MUST NOT escribir archivos, MUST NOT emitir nada en stdout salvo el JSON final, MUST NOT enviar telemetría y MUST rechazar con código 64 y el mensaje `ruta-dentro-del-repo` toda ruta que resuelva (tras `realpath`) dentro del repositorio salvo bajo `evals/real/`. La imagen MUST vivir solo en memoria. El decodificador MUST NOT escribir en consola.

#### Scenario: Ruta dentro del repo
- **WHEN** se ejecuta con S copiada a `packages/capture/.tmp-prueba-<uuid>.png` (borrada al final)
- **THEN** el código es 64, stderr contiene `ruta-dentro-del-repo` y stdout está vacío

#### Scenario: Ruta bajo evals/real
- **WHEN** se ejecuta con S copiada a `evals/real/tmp-prueba-<uuid>.png` (borrada al final)
- **THEN** el código es 0

#### Scenario: No escribe a disco
- **WHEN** se ejecuta la CLI sobre S en un directorio temporal y se comparan los listados recursivos, con tamaño y fecha de modificación, del repositorio (excepto `node_modules`) y del directorio temporal antes y después
- **THEN** los listados son idénticos

#### Scenario: Sin consola en el decodificador
- **WHEN** se decodifica S con `console.log`, `console.info`, `console.warn`, `console.error` y `console.debug` espiados
- **THEN** ningún espía fue llamado

### Requirement: LPI-08 Licencia y carga diferida
`zxing-wasm` MUST declararse con la versión exacta `3.1.5` en `packages/capture/package.json` y pasar `licencia-check`. El módulo WASM MUST cargarse solo en la primera llamada a `decodificarPdf417Imagen`, no al importar `@lector-cedula/capture`.

#### Scenario: Licencia
- **WHEN** se ejecuta `npm run check:licencias`
- **THEN** termina con código 0 y `packages/capture/package.json` declara `"zxing-wasm": "3.1.5"`

#### Scenario: Import sin WASM
- **WHEN** se importa `@lector-cedula/capture` con `zxing-wasm/reader` sustituido por un `vi.mock` cuya fábrica cuenta sus invocaciones, sin llamar al decodificador
- **THEN** el contador vale 0
