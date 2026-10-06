# Spec Delta

## Purpose

Obtener los bytes crudos del PDF417 de la cédula amarilla a partir de una imagen (bytes PNG/JPEG o `ImageData`) y ofrecer una CLI local para leer fotos sin persistir nada.

Convenciones: `F = generarPdf417(PERSONA_BASE, { semilla: 1 })` de `@lector-cedula/fixtures`. "Imagen sintética S" es el PNG que produce el writer de zxing-wasm 3.1.5 (`writeBarcode(F.bytes, { format: "PDF417" })`), escalado sin suavizado a 1200 px de ancho (al menos 2 px por módulo, skill `captura-movil`) y compuesto en el centro de un lienzo blanco de 1920x1080. Las distorsiones se aplican con canvas 2D en Chromium real. Todos los datos son sintéticos y se generan dentro de la prueba. El layout del payload es hipótesis del formato (ver `docs/decisiones/hipotesis-formato.md`); este cambio no lo interpreta, solo transporta bytes.

## ADDED Requirements

### Requirement: LPI-01 Bytes crudos, no texto
`decodificarPdf417Imagen(imagen)` MUST devolver `{ ok: true, bytes: Uint8Array, intento: "original" | "escala-0.75" | "escala-0.5" }` con los bytes exactos del símbolo (campo `bytes` del resultado de zxing-wasm), nunca la cadena `text`. Los bytes MUST ser idénticos al payload codificado, incluidos los bytes >= 0x80 (por ejemplo `Ñ` = 0xD1 en ISO-8859-1).

#### Scenario: Round-trip de la imagen sintética S
- **WHEN** se decodifica la imagen sintética S como `Uint8Array` PNG
- **THEN** el resultado es `{ ok: true, bytes: F.bytes, intento: "original" }` comparado con `toStrictEqual`

#### Scenario: Byte Ñ preservado
- **WHEN** se decodifica la imagen generada igual que S a partir de `generarPdf417` de una persona ficticia con primer apellido `"MUÑOZ"`
- **THEN** los bytes devueltos son iguales al payload codificado y contienen 0xD1 en la posición `rangos.primerApellido[0] + 2`

### Requirement: LPI-02 Opciones del lector y reintentos
Cada intento MUST llamar a `readBarcodes` con `formats: ["PDF417"]`, `tryHarder: true`, `tryRotate: true` y `maxNumberOfSymbols: 1`. Los intentos MUST ejecutarse en el orden original, escala 0,75, escala 0,5 (lados redondeados con `Math.round`) y detenerse en el primero con un símbolo válido.

#### Scenario: Opciones enviadas
- **WHEN** se decodifica S con un `readBarcodes` inyectado que registra sus argumentos
- **THEN** hay 1 llamada y sus opciones incluyen exactamente `formats: ["PDF417"]`, `tryHarder: true`, `tryRotate: true` y `maxNumberOfSymbols: 1`

#### Scenario: Orden de reintentos
- **WHEN** el `readBarcodes` inyectado devuelve `[]` en las dos primeras llamadas y el resultado real de S en la tercera
- **THEN** hay 3 llamadas, la segunda recibe una imagen de 1440x810, la tercera una de 960x540 y `intento` es `"escala-0.5"`

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
`npm run leer-foto -- <ruta>` MUST decodificar el archivo, parsearlo con `buscarDivipol` e imprimir en stdout un único JSON `{ ok, intento, resultado }` o `{ ok: false, error }`. Salida: 0 válida, 1 sin PDF417 o ilegible, 2 parser con `ok: false`, 64 uso incorrecto. stderr MUST NOT incluir la ruta ni el contenido.

#### Scenario: Lectura de imagen sintética
- **WHEN** se ejecuta la CLI sobre S escrita en `os.tmpdir()`
- **THEN** el código de salida es 0 y el JSON de stdout tiene `ok: true`, `intento: "original"` y los campos de `resultado` coinciden con `F.esperado`

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
