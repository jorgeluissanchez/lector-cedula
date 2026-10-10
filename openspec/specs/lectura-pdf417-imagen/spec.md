# lectura-pdf417-imagen Specification

## Purpose
Obtener los bytes crudos del PDF417 de la cédula amarilla a partir de una imagen (bytes PNG/JPEG o `ImageData`) y ofrecer una CLI local para leer fotos sin persistir nada.

Convenciones: `F = generarPdf417(PERSONA_BASE, { semilla: 1 })` de `@lector-cedula/fixtures`. "Imagen sintética S" es el PNG que produce el writer de zxing-wasm 3.1.5 (`writeBarcode(F.bytes, { format: "PDF417" })`), escalado sin suavizado a 1200 px de ancho (al menos 2 px por módulo, skill `captura-movil`) y compuesto en el centro de un lienzo blanco de 1920x1080. Las distorsiones se aplican con canvas 2D en Chromium real. Todos los datos son sintéticos y se generan dentro de la prueba. El layout del payload es hipótesis del formato (ver `docs/decisiones/hipotesis-formato.md`); este cambio no lo interpreta, solo transporta bytes.

## Requirements

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

### Requirement: LPI-08 Licencia y carga diferida
`zxing-wasm` MUST declararse con la versión exacta `3.1.5` en `packages/capture/package.json` y pasar `licencia-check`. El módulo WASM MUST cargarse solo en la primera llamada a `decodificarPdf417Imagen`, no al importar `@lector-cedula/capture`.

#### Scenario: Licencia
- **WHEN** se ejecuta `npm run check:licencias`
- **THEN** termina con código 0 y `packages/capture/package.json` declara `"zxing-wasm": "3.1.5"`

#### Scenario: Import sin WASM
- **WHEN** se importa `@lector-cedula/capture` con `zxing-wasm/reader` sustituido por un `vi.mock` cuya fábrica cuenta sus invocaciones, sin llamar al decodificador
- **THEN** el contador vale 0

### Requirement: LPI-09 Conversión a gris
Antes del primer intento el decodificador MUST convertir la imagen a luminancia (`(299 R + 587 G + 114 B) / 1000` redondeado, R = G = B, A = 255) y todos los intentos MUST recibir píxeles derivados de esa imagen gris.

#### Scenario: El lector recibe gris
- **WHEN** se decodifica S teñida (canal azul a 0) con un `readBarcodes` inyectado que devuelve siempre `[]` y `limiteMs` infinito
- **THEN** en cada llamada todos los píxeles tienen R = G = B y A = 255

### Requirement: LPI-10 Orientación EXIF
Al decodificar un JPEG en Node, `decodificarPixeles` MUST aplicar la etiqueta EXIF Orientation (valores 1 a 8; ausente o inválida equivale a 1), de modo que los píxeles queden como se ven en pantalla. En navegador MUST usarse `createImageBitmap` con `imageOrientation: "from-image"`.

#### Scenario: Ocho orientaciones
- **WHEN** se decodifica un JPEG de 40x20 con el cuadrante superior izquierdo de 10x10 negro y el resto blanco, con Orientation de 1 a 8
- **THEN** las dimensiones son 40x20 para 1 a 4 y 20x40 para 5 a 8, y el bloque negro queda en la esquina: superior izquierda (1, 5), superior derecha (2, 6), inferior derecha (3, 7), inferior izquierda (4, 8)

#### Scenario: Foto rotada con EXIF
- **WHEN** se decodifica D-EXIF6 como `Uint8Array`
- **THEN** el resultado tiene `ok: true` y `bytes` igual a `F.bytes`

### Requirement: LPI-11 Localización del código
Si los intentos de LPI-02 no dan un símbolo, el decodificador MUST seguir con intentos de banda y después de rejilla (LPI-14) hasta el primer símbolo cuyos bytes acepte `aceptar` (por defecto `parsearPdf417Amarilla(bytes).ok`). Si la imagen tiene más de 4 000 000 de píxeles, la banda MUST ir antes de los intentos de LPI-02. Los recortes MUST vivir solo en memoria. La opción `localizar: false` MUST desactivarlos.

#### Scenario: Modo sin localización
- **WHEN** se decodifica S con `localizar: false` y un `readBarcodes` inyectado que devuelve siempre `[]`
- **THEN** hay 5 llamadas como en LPI-02; el escenario "Sin símbolo en ningún intento" de LPI-02 se evalúa en este modo

#### Scenario: Orden en imagen pequeña
- **WHEN** se decodifica S con un `readBarcodes` inyectado que devuelve siempre `[]`
- **THEN** hay 5 + 6 + 38 = 49 llamadas: las 5 de LPI-02, 6 de banda con los binarizadores en el orden indicado y 38 ventanas, y el resultado es `{ ok: false, error: "pdf417-no-encontrado" }`

#### Scenario: Banda primero en foto grande
- **WHEN** se decodifica una imagen de 4096x1842 con un `readBarcodes` inyectado que devuelve siempre `[]`
- **THEN** las 6 primeras llamadas llevan `binarizer` y reciben recortes más pequeños que la imagen, y la séptima recibe 4096x1842 sin `binarizer`

#### Scenario: Símbolo rechazado por el parser
- **WHEN** el `readBarcodes` inyectado devuelve `[]` en los 5 intentos de LPI-02 y después siempre un símbolo válido con bytes `[1, 2, 3]`
- **THEN** el resultado es `{ ok: false, error: "pdf417-no-encontrado" }`

#### Scenario: Foto sintética difícil
- **WHEN** se decodifica D con un decodificador sin localización (solo LPI-02) y con el decodificador por defecto
- **THEN** el primero devuelve `{ ok: false, error: "pdf417-no-encontrado" }` y el segundo `ok: true`, `bytes` igual a `F.bytes` e `intento` que empieza por `banda` o `ventana`

### Requirement: LPI-14 Intentos de banda y rejilla
Banda: recorte de la región con mayor densidad de bordes verticales, probado con `banda`, `banda-global`, `banda-giro+2`, `banda-global-giro+2`, `banda-giro-2` y `banda-global-giro-2` (con `global`, `binarizer: "GlobalHistogram"`; sin él, `"LocalAverage"`). Rejilla: ventanas de 0,7, 0,5 y 0,35 del ancho y alto, paso de media ventana y la última alineada al borde, `binarizer: "LocalAverage"`, `intento` `ventana-<tamaño>`. Todos MUST enviar `tryDownscale: true`.

#### Scenario: Nombres y opciones
- **WHEN** se decodifica S con un `readBarcodes` inyectado que devuelve `[]` salvo en la llamada 7, donde devuelve el resultado real de S
- **THEN** el resultado tiene `intento: "banda-global"` y la llamada 7 lleva `binarizer: "GlobalHistogram"` y `tryDownscale: true`

### Requirement: LPI-12 Límite de tiempo
El decodificador MUST aceptar `limiteMs` (por defecto 15 000) y un reloj `ahora` inyectable. Antes de cada intento salvo el primero MUST comprobar el tiempo transcurrido desde el inicio y, si alcanza `limiteMs`, devolver `{ ok: false, error: "pdf417-no-encontrado" }` sin más llamadas.

#### Scenario: Corte por tiempo
- **WHEN** el reloj inyectado avanza 1 000 ms por llamada a `ahora`, `limiteMs` es 2 500 y `readBarcodes` devuelve siempre `[]`
- **THEN** hay exactamente 3 llamadas a `readBarcodes` y el resultado es `{ ok: false, error: "pdf417-no-encontrado" }`

### Requirement: LPI-13 CLI con foto grande
`npm run leer-foto` MUST leer D-EXIF6 escrita fuera del repositorio sin cambios en la CLI.

#### Scenario: CLI sobre D-EXIF6
- **WHEN** se ejecuta la CLI con `--sin-mascara` sobre D-EXIF6 en `os.tmpdir()`
- **THEN** el código de salida es 0 y los campos de `resultado` coinciden con `F.esperado`

### Requirement: LPI-08 Lugar de nacimiento resuelto
En la salida PDF417 con `ok: true`, la CLI MUST añadir `resultado.campos.lugarNacimiento` = `{ codigo, departamento, municipio }` de `buscarDivipol(codigoDepartamentoNacimiento + codigoMunicipioNacimiento)`, o `null` más el warning `"lugar-nacimiento-no-resuelto"` en `resultado.warnings` si no se resuelve. Nunca se enmascara.

#### Scenario: Lugar conocido
- **WHEN** se ejecuta la CLI sin opciones sobre la imagen sintética del PDF417 de `PERSONA_BASE` (departamento `16`, municipio `001`)
- **THEN** `resultado.campos.lugarNacimiento` es `{ "codigo": "16001", "departamento": "BOGOTA D.C", "municipio": "BOGOTA, D.C." }` y `resultado.warnings` no contiene `lugar-nacimiento-no-resuelto`

#### Scenario: Lugar desconocido
- **WHEN** se ejecuta la CLI con `--sin-mascara` sobre la imagen sintética del PDF417 de `PERSONA_BASE` con `departamento: "99"` y `municipio: "999"`
- **THEN** el código de salida es 0, `resultado.campos.lugarNacimiento` es `null` y `resultado.warnings` contiene `"lugar-nacimiento-no-resuelto"`
