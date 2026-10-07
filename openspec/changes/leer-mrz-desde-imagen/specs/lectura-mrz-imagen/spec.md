# Spec Delta

## Purpose

Leer la MRZ TD1 del reverso de la cédula digital desde una imagen (bytes PNG/JPEG o `ImageData`): localizar la franja, hacer OCR con Tesseract.js y `mrz.traineddata`, y entregar las 3 líneas a `parsearMrzCedulaDigital` sin inventar datos.

Convenciones (todas sintéticas, generadas dentro de la prueba; ninguna imagen entra al repositorio):
- `REF = { fechaReferencia: "2026-10-06" }`. `P = generarMrzTd1(PERSONA_BASE, { semilla: 1 })` de `@lector-cedula/fixtures`; `P.lineas` son sus 3 líneas de 30 caracteres.
- "Reverso sintético R(L)" para unas líneas `L`: lienzo de 1011x638 px (ID-1 a unos 300 ppp, hipótesis C01) con fondo `#F2EFE6`, el texto ficticio `"REPUBLICA DE COLOMBIA - DOCUMENTO SINTETICO"` en sans-serif 28 px con línea base en `y = 60`, un rectángulo gris `#BBBBBB` de 260x260 en `(700, 120)` (simula la zona del QR, sin contenido) y las 3 líneas `L` en la fuente OCR-B `evals/sinteticos/fuentes/OCRB.otf`, 36 px, color `#111111`, `x = 40`, líneas base en `y = 520`, `570` y `620`. El renderizador devuelve el PNG y `cajaMrz`, la caja mínima que contiene los píxeles de tinta de las 3 líneas. `R = R(P.lineas)`.
- "Foto sintética F": R escalada a 1500 px de ancho y centrada en un lienzo 1920x1080 gris `#7F7F7F`.
- El render y las distorsiones se hacen con canvas 2D y `FontFace` en el Chromium de Playwright 1.63 (ya instalado), lanzado desde Node; no hay Python ni dependencias nativas nuevas.
- "Lectura correcta" de una imagen con verdad `V` (un `FixtureMrz`): `ok: true`, `resultado.ok: true`, los 4 `resultado.digitosControl.*.estado` iguales a `"valido"` y `resultado.lineasCorregidas` igual a `V.lineasSinErrores`. "Lectura falsa": los 4 estados `"valido"` y `lineasCorregidas` distinto de `V.lineasSinErrores`.
- Modelo: `URL_MRZ` = `https://raw.githubusercontent.com/DoubangoTelecom/tesseractMRZ/1e7adfecda5f3c9ae1fb12cf6b4b8c3958c63e46/tessdata_best/mrz.traineddata`; `SHA_MRZ` = `e44f5b7a6bdd3f382ef3bfa84ee0057f5897946a84a094c26910e0a124f3a9bd`.
- Conjunto E del eval: `fc.sample(arbPersonaFicticia(), { seed: 20261006, numRuns: 200 })` con `generarMrzTd1(persona, { semilla: i + 1 })`, renderizados como R; distorsiones sobre las 50 primeras: rotación +2°, rotación -2°, blur gaussiano sigma 1, brillo +20 %, brillo -20 %, JPEG calidad 70, escala 0,8 y ruido gaussiano sigma 8 con PRNG de semilla fija.
- Posición, tamaño y tipografía de la franja son la hipótesis M05 (`docs/decisiones/hipotesis-formato.md`); el layout de los campos sigue siendo M01 a M03 y G05, que aplica el parser sin cambios.

## ADDED Requirements

### Requirement: LMI-01 Localización de la franja MRZ
`localizarFranjaMrz(pixeles)`, pura sobre `{ width, height, data }` RGBA, MUST devolver candidatos `{ metodo, caja: { x, y, ancho, alto } }`: primero, si existe, `"proyeccion"`; después siempre `"recorte-inferior"` (el 40 % inferior, `y = Math.round(0.6 * height)`). MUST devolver `[]` solo ante una entrada sin esa forma y MUST NOT lanzar.

#### Scenario: Franja por proyección en el reverso sintético
- **WHEN** se localiza la franja en los píxeles de R
- **THEN** el primer candidato tiene `metodo: "proyeccion"`, su caja contiene `cajaMrz` y su `alto` es menor o igual a `2 * cajaMrz.alto`

#### Scenario: Sin bandas, solo recorte inferior
- **WHEN** se localiza la franja en un lienzo uniforme `#FFFFFF` de 1000x600
- **THEN** el resultado es exactamente `[{ metodo: "recorte-inferior", caja: { x: 0, y: 360, ancho: 1000, alto: 240 } }]`

#### Scenario: Dos bandas no bastan
- **WHEN** se localiza la franja en R(`[P.lineas[0], P.lineas[1], ""]`)
- **THEN** ningún candidato tiene `metodo: "proyeccion"`

#### Scenario: Nunca lanza
- **WHEN** se llama con 500 valores de `fc.anything()` y 500 objetos `{ width, height, data }` con `width` y `height` enteros de 0 a 64 y `data` de `fc.uint8Array({ maxLength: 16384 })`
- **THEN** ninguna llamada lanza, toda salida es un array y es vacío exactamente cuando la entrada no cumple la forma válida

### Requirement: LMI-01b Criterio de la proyección
El candidato `"proyeccion"` MUST obtenerse binarizando con Otsu y proyectando la tinta por filas en la mitad inferior, y MUST existir solo si hay exactamente 3 bandas consecutivas con alturas que difieren menos del 35 % de su media y separaciones entre centros que difieren menos del 25 %. Su caja une las 3 bandas con un margen de 0,5 veces la altura media por lado, recortada a la imagen.

#### Scenario: Margen de la caja
- **WHEN** se localiza la franja en un lienzo blanco de 1000x600 con 3 rectángulos negros de 900x20 en `x = 50` e `y = 400`, `440` y `480`
- **THEN** el primer candidato es `{ metodo: "proyeccion", caja: { x: 40, y: 390, ancho: 920, alto: 120 } }`

#### Scenario: Bandas irregulares
- **WHEN** el lienzo anterior tiene el tercer rectángulo con alto 40 en lugar de 20
- **THEN** ningún candidato tiene `metodo: "proyeccion"`

### Requirement: LMI-02 Configuración del OCR sin red ni caché
`crearLectorMrz({ rutaModelo, crearWorker? })` MUST crear un único worker de Tesseract.js con idioma `"mrz"`, `OEM.LSTM_ONLY`, `langPath = rutaModelo`, `gzip: false`, `cacheMethod: "none"`, sin `logger`, con lista blanca `A-Z0-9<` y PSM 6. MUST NOT usar la red ni escribir caché en disco o IndexedDB. `terminar()` MUST cerrar el worker una sola vez. Sin modelo en `rutaModelo`, `leer` MUST devolver `{ ok: false, error: "modelo-no-disponible" }`.

#### Scenario: Opciones del worker
- **WHEN** se crea el lector con `rutaModelo: "/modelos"` y un `crearWorker` inyectado que registra sus argumentos y los de `setParameters`, y se lee R con `REF`
- **THEN** hay 1 creación con `"mrz"`, `1` y opciones que incluyen `langPath: "/modelos"`, `gzip: false` y `cacheMethod: "none"`, y `setParameters` recibió exactamente `{ tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<", tessedit_pageseg_mode: "6" }`

#### Scenario: Modelo ausente sin red
- **WHEN** con `globalThis.fetch` espiado se lee R con el Tesseract.js real y `rutaModelo` igual a un directorio temporal vacío
- **THEN** el resultado es `{ ok: false, error: "modelo-no-disponible" }` y `fetch` no recibió ninguna URL `http:` ni `https:`

#### Scenario: Terminar
- **WHEN** se llama a `terminar()` dos veces sobre un lector con `crearWorker` inyectado y después se lee R
- **THEN** `terminate` del worker se llamó exactamente 1 vez y la lectura devuelve `{ ok: false, error: "lector-terminado" }`

### Requirement: LMI-03 Extracción de las 3 líneas del texto OCR
`extraerLineasMrz(texto)` (pura) MUST quitar espacios y tabuladores, pasar a mayúsculas, conservar solo las líneas de 28 a 32 caracteres de `[A-Z0-9<]`, llevarlas a 30 (rellenar con `<`, o quitar `<` finales; si no se puede, descartarla) y devolver las 3 primeras consecutivas, o `null`. MUST NOT cambiar caracteres internos (las correcciones OCR-B son del parser, MZ-07).

#### Scenario: Espacios y minúsculas
- **WHEN** se extrae `"  " + P.lineas[0].toLowerCase().split("").join(" ") + "\n\n" + P.lineas[1] + "\n" + P.lineas[2] + "  "`
- **THEN** el resultado es `P.lineas` con `toStrictEqual`

#### Scenario: Relleno y recorte
- **WHEN** se extrae el texto de P con la línea 3 sin su último carácter (29 caracteres, `P.lineas[2]` termina en `<`) y la línea 1 con `"<<"` añadido (32 caracteres)
- **THEN** el resultado es `P.lineas`

#### Scenario: Ruido alrededor
- **WHEN** se extrae `"REPUBLICA DE COLOMBIA\n" + P.texto + "\nX1"`
- **THEN** el resultado es `P.lineas`

#### Scenario: Insuficiente
- **WHEN** se extraen `""`, `P.lineas[0]` y `P.lineas[0] + "\n" + P.lineas[1]`
- **THEN** los 3 resultados son `null`

### Requirement: LMI-04 Lectura encadenada e intentos
`leer(imagen, { fechaReferencia })` MUST, por cada candidato de LMI-01 en orden, recortar la caja, ampliarla a 900 px de ancho o más, hacer OCR, extraer (LMI-03) y parsear con `parsearMrzCedulaDigital`. MUST parar en el primer intento con los 4 dígitos `"valido"`; si no, devolver el de más dígitos válidos (empate: el primero) o `{ ok: false, error: "mrz-no-encontrada" }`. Salida: `{ ok: true, intento, digitosValidos, resultado }`, con `resultado` del parser sin modificar.

#### Scenario: Primer intento correcto
- **WHEN** se lee R con `REF` y un OCR inyectado que devuelve `P.texto`
- **THEN** hay 1 llamada al OCR, `intento` es `"proyeccion"`, `digitosValidos` es 4 y `resultado` es profundamente igual a `parsearMrzCedulaDigital([...P.lineas], REF)`

#### Scenario: Respaldo de recorte inferior
- **WHEN** se lee R con un OCR inyectado que devuelve `"ILEGIBLE"` en la primera llamada y `P.texto` en la segunda
- **THEN** hay 2 llamadas, la segunda recibe una imagen de al menos 900 px de ancho e `intento` es `"recorte-inferior"`

#### Scenario: Mejor intento parcial
- **WHEN** el OCR inyectado devuelve en ambas llamadas el texto de `generarMrzTd1(PERSONA_BASE, { variante: "cd-compuesto-alterado" })`
- **THEN** hay 2 llamadas, `intento` es `"proyeccion"` y `digitosValidos` es 3

#### Scenario: Nada legible
- **WHEN** el OCR inyectado devuelve siempre `""`
- **THEN** el resultado es `{ ok: false, error: "mrz-no-encontrada" }`

### Requirement: LMI-05 Entradas aceptadas y errores
`leer` MUST aceptar `Uint8Array` PNG o JPEG (Node y navegador) e `ImageData` (navegador), MUST NOT lanzar y MUST devolver `{ ok: false, error }` con `error` en `"entrada-invalida" | "imagen-ilegible" | "mrz-no-encontrada" | "modelo-no-disponible" | "lector-terminado" | "fecha-referencia-invalida"`.

#### Scenario: Errores literales
- **WHEN** con el modelo real se leen `null`, `new Uint8Array([1, 2, 3])` y un PNG blanco de 800x600 con `REF`, y R con `{ fechaReferencia: "06/10/2026" }`
- **THEN** los resultados son, en ese orden, `{ ok: false, error: "entrada-invalida" }`, `{ ok: false, error: "imagen-ilegible" }`, `{ ok: false, error: "mrz-no-encontrada" }` y `{ ok: false, error: "fecha-referencia-invalida" }`

#### Scenario: Nunca lanza
- **WHEN** con un OCR inyectado que devuelve valores de `fc.string()` se leen 300 valores de `fc.anything()` y 300 de `fc.uint8Array({ maxLength: 4096 })`
- **THEN** ninguna llamada lanza y todo resultado tiene `ok` booleano

#### Scenario: ImageData en navegador
- **WHEN** en Chromium (Vitest browser) se lee el `ImageData` de R con `REF` y el modelo servido por el servidor de pruebas
- **THEN** es una lectura correcta con verdad P

### Requirement: LMI-06 Exactitud sobre imágenes sintéticas
El lector real MUST lograr lectura correcta en al menos el 98 % de los 200 reversos R limpios del eval (conjunto E), al menos el 90 % (provisional) en cada una de sus 8 distorsiones leves y 0 lecturas falsas en todo E. El reporte `evals/reports/mrz-imagen.json` solo lleva contadores.

#### Scenario: Limpias
- **WHEN** se ejecuta `npm run eval:mrz-imagen`
- **THEN** el reporte tiene `limpias.n = 200` y `limpias.correctas >= 196`, y el proceso termina con código 0

#### Scenario: Ninguna lectura falsa
- **WHEN** se ejecuta `npm run eval:mrz-imagen`
- **THEN** `falsas` es 0 en `limpias` y en cada una de las 8 distorsiones

#### Scenario: Distorsiones leves
- **WHEN** se ejecuta `npm run eval:mrz-imagen`
- **THEN** cada una de las 8 distorsiones tiene `n = 50` y `correctas >= 45`

#### Scenario: Foto sintética completa
- **WHEN** se lee F con `REF` y el modelo real
- **THEN** es una lectura correcta con verdad P

#### Scenario: El corredor detecta incumplimiento
- **WHEN** el corredor se ejecuta con un lector inyectado que acierta 195 de 200 limpias y, por separado, con uno que devuelve una lectura falsa en una sola imagen
- **THEN** ambas ejecuciones terminan con código 1

#### Scenario: Reporte sin datos
- **WHEN** se lee `evals/reports/mrz-imagen.json` tras una ejecución
- **THEN** no contiene `<<` ni ninguno de los NUIP del conjunto

### Requirement: LMI-07 Privacidad del lector MRZ
El lector MUST procesar la imagen solo en memoria, MUST NOT escribir archivos (incluida la caché de Tesseract.js), MUST NOT usar `localStorage`, `sessionStorage` ni `indexedDB`, MUST NOT hacer peticiones de red y MUST NOT escribir en consola.

#### Scenario: No escribe a disco
- **WHEN** se lee R con el modelo real y se comparan los listados recursivos, con tamaño y fecha de modificación, del repositorio (excepto `node_modules`), de un directorio temporal de trabajo y del directorio del modelo antes y después
- **THEN** los listados son idénticos

#### Scenario: Sin consola ni red
- **WHEN** se lee R con el modelo real con `console.log`, `console.info`, `console.warn`, `console.error`, `console.debug` y `globalThis.fetch` espiados
- **THEN** ningún espía de consola fue llamado y `fetch` no recibió URLs `http:` ni `https:`

#### Scenario: Privacidad estática
- **WHEN** se ejecuta `npm run check:privacidad`
- **THEN** termina con código 0 sin excepciones `privacidad-ok` nuevas en `packages/capture/src/mrz`

### Requirement: LMI-08 Modelo reproducible
`npm run modelos:mrz` MUST descargar `URL_MRZ` (abajo) a un temporal, verificar `SHA_MRZ` y 11396382 bytes y solo entonces moverlo a `models/tesseract/mrz.traineddata` (ignorado por git); si no coincide, borrar el temporal, no tocar el destino y salir con 1. `--verificar` MUST comprobar sin red. `models/manifest.json` MUST declarar `tesseract-mrz`, BSD-3-Clause, `URL_MRZ`, `SHA_MRZ`, uso `produccion`.

#### Scenario: Hash correcto
- **WHEN** se ejecuta el script con un `fetch` inyectado que devuelve un cuerpo cuyo SHA-256 y tamaño se pasan como esperados, con destino en un directorio temporal
- **THEN** sale con 0 y el destino tiene exactamente esos bytes

#### Scenario: Hash incorrecto
- **WHEN** el `fetch` inyectado devuelve `new Uint8Array([1, 2, 3])` con el hash y tamaño reales como esperados
- **THEN** sale con 1, el destino no existe y el directorio temporal del script queda vacío

#### Scenario: Verificar sin red
- **WHEN** se ejecuta `--verificar` con `fetch` espiado sobre un destino ausente
- **THEN** sale con 1 y `fetch` no se llamó

#### Scenario: Manifiesto
- **WHEN** se lee `models/manifest.json`
- **THEN** contiene exactamente una entrada `{ "nombre": "tesseract-mrz", "licencia": "BSD-3-Clause", "fuente": URL_MRZ, "sha256": SHA_MRZ, "uso": "produccion" }`

### Requirement: LMI-09 Licencias, fuente de prueba y carga diferida
`packages/capture/package.json` MUST declarar `"tesseract.js": "7.0.0"` y `npm run check:licencias` MUST pasar. `evals/sinteticos/fuentes/OCRB.otf` MUST ser `ocr-0.3.1/OCRB.otf` de `https://tsukurimashou.org/files/ocr-0.3.1.zip`, con `LICENCIA-OCRB.md` al lado, y solo usarse en pruebas y evals. Tesseract.js MUST cargarse con `import()` dinámico en la primera lectura, no al importar `@lector-cedula/capture`.

#### Scenario: Licencia y versión
- **WHEN** se ejecuta `npm run check:licencias`
- **THEN** termina con código 0 y `packages/capture/package.json` declara `"tesseract.js": "7.0.0"`

#### Scenario: Fuente íntegra y aislada
- **WHEN** se calcula el SHA-256 de `evals/sinteticos/fuentes/OCRB.otf` y se buscan referencias a `OCRB.otf` en `packages/*/src` y `apps/*/src`
- **THEN** el hash es `87c8d5bfd541d28023d2ba3383169c49f565e10d487ebb027ea0d735ef558707` y hay 0 referencias

#### Scenario: Import sin Tesseract
- **WHEN** se importa `@lector-cedula/capture` con `tesseract.js` sustituido por un `vi.mock` cuya fábrica cuenta sus invocaciones, sin llamar al lector
- **THEN** el contador vale 0
