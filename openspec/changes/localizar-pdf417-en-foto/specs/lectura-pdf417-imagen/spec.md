# Spec Delta

Convenciones: `F` y la imagen sintética S como en el cambio `leer-pdf417-desde-imagen`. "Imagen sintética difícil D": lienzo de 4096x1842 con textura de madera sintética (vetas senoidales marrones con ruido pseudoaleatorio de semilla fija), una tarjeta amarilla lisa y encima el PDF417 de `F.bytes` (writer de zxing-wasm 3.1.5) escalado sin suavizado a 1650 px de ancho, girado 4° sobre su centro, ocupando entre el 13 % y el 17 % del área. "D-EXIF6" es D girada 90° en sentido antihorario y codificada como JPEG con la etiqueta EXIF Orientation = 6. Todo se genera en memoria dentro de la prueba; ninguna imagen se guarda en el repositorio.

## ADDED Requirements

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
