# lectura-mrz-imagen Specification

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

## Requirements

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

### Requirement: LMI-10 Candidato de imagen completa
`localizarFranjaMrz` MUST añadir, después de los candidatos de LMI-01, el candidato `{ metodo: "imagen-completa", caja: { x: 0, y: 0, ancho: width, alto: height } }`, de modo que una foto que ya es el recorte de las 3 líneas de la MRZ se lea completa.

#### Scenario: Recorte que contiene solo la MRZ
- **WHEN** se localiza la franja en una imagen sintética que contiene solo las 3 líneas MRZ de la persona base, sin márgenes de tarjeta
- **THEN** el candidato que sigue a los de LMI-01 es `{ metodo: "imagen-completa", caja: { x: 0, y: 0, ancho: width, alto: height } }` y el lector devuelve las líneas con los 4 dígitos de control válidos

#### Scenario: Orden de candidatos en el reverso completo
- **WHEN** se localiza la franja en los píxeles del reverso sintético R
- **THEN** los tres primeros métodos, en orden, son `["proyeccion", "recorte-inferior", "imagen-completa"]` y todos los siguientes son `"franja"` (LMI-11)

### Requirement: LMI-11 Franjas horizontales en fotos con la tarjeta completa
Después de `"imagen-completa"`, `localizarFranjaMrz` MUST añadir candidatos `"franja"`: para cada alto `round(f * height)` con `f` en `[0.15, 0.3, 0.45]` (en ese orden), ventanas horizontales de todo el ancho con paso `round(0.05 * height)`, de abajo arriba (la primera pegada al borde inferior, la última en `y = 0`) y sin repetir cajas dentro de cada alto. Cada ventana se ajusta según LMI-11b. El lector se detiene en el primero con los 4 dígitos de control válidos.

#### Scenario: Tarjeta completa en el centro de una foto vertical con textura
- **WHEN** se lee una imagen sintética de 900x1600 con textura de madera y el reverso sintético R escalado a 820 px de ancho, centrado verticalmente
- **THEN** el lector devuelve las líneas de R con los 4 dígitos de control válidos e `intento` igual a `"franja"`

#### Scenario: Primera franja de cada altura pegada al borde inferior
- **WHEN** se localiza la franja en un lienzo blanco de 1000x1000
- **THEN** los candidatos `"franja"` son, en orden, las cajas `{ x: 0, y, ancho: 1000, alto: a }` con `a` en 150, 300 y 450 e `y` de `1000 - a` a 0 de 50 en 50; el primero es `{ x: 0, y: 850, ancho: 1000, alto: 150 }`, el siguiente `{ x: 0, y: 800, ancho: 1000, alto: 150 }` y el primero de alto 300 `{ x: 0, y: 700, ancho: 1000, alto: 300 }`

### Requirement: LMI-11b Ajuste de la franja por bordes horizontales
Cada ventana de LMI-11 MUST ajustarse al trío de líneas más bajo que cumpla LMI-01b, contando por fila los bordes (salto de luminancia >= 40 con el vecino derecho) en columnas útiles (con borde en menos del 80 % de las filas de la ventana) y exigiendo max(2, ceil(0.03 * útiles)) por fila de texto. La caja lleva un margen de medio alto de línea, recortada a la ventana; sin trío, la ventana queda literal.

#### Scenario: Ajuste al trío de líneas ignorando columnas de fondo
- **WHEN** un lienzo blanco de 1000x1000 tiene 3 líneas de 40 rectángulos negros de 10x15 px (separados 10 px, desde x = 100) en y = 900, 930 y 960, con o sin 20 vetas verticales negras de 1 px en x = 0, 2, ..., 38
- **THEN** el primer candidato `"franja"` es `{ x: 91, y: 892, ancho: 807, alto: 91 }`

### Requirement: LMI-12 Imagen girada 90° y 270°
Si ningún candidato de la imagen da los 4 dígitos de control válidos, el lector MUST repetir la localización y la lectura sobre la imagen girada 90° y, después, 270° en sentido horario (tarjeta fotografiada en vertical), calculando cada giro solo si hace falta, con el orden de LMI-12b y el presupuesto de LMI-13. `intento` lleva el sufijo del giro: `"<metodo>@90"` o `"<metodo>@270"`. Se devuelve el mejor intento de todas las vistas con el criterio de LMI-04; con 4 dígitos válidos se detiene.

#### Scenario: Reverso girado (líneas MRZ verticales)
- **WHEN** se lee el reverso sintético R girado 90° en sentido antihorario
- **THEN** el lector devuelve las líneas de R con los 4 dígitos de control válidos e `intento` terminado en `"@90"`

#### Scenario: Giro solo cuando la imagen derecha falla
- **WHEN** con OCR inyectado ningún candidato de la imagen derecha da texto legible y el primero de la vista a 90° da la MRZ de R
- **THEN** `intento` es `"proyeccion@90"` y el OCR se llamó exactamente (intentos de la pasada 1 de la imagen derecha según LMI-12b + 1) veces

#### Scenario: Nada legible en ninguna vista
- **WHEN** con OCR inyectado ningún intento da texto legible
- **THEN** el resultado es `{ ok: false, error: "mrz-no-encontrada" }` y el OCR se llamó una vez por intento de `planIntentosMrz` (LMI-12b), hasta el presupuesto de LMI-13

#### Scenario: Giro puro
- **WHEN** se gira 90° y 270° una imagen de 3x2
- **THEN** el resultado es de 2x3 con los píxeles en la posición girada, alfa intacto y la entrada sin modificar

### Requirement: LMI-12b Orden de intentos en dos pasadas y sin cajas repetidas
El lector MUST probar los candidatos en dos pasadas sobre las vistas (derecha, `@90`, `@270`): la pasada 1 con los candidatos que no son ventanas literales de LMI-11 (incluidas las franjas que LMI-11b ajustó), en el orden de `localizarFranjaMrz`; la pasada 2 con las ventanas literales. Dentro de una vista no se repite una caja. `planIntentosMrz(pixeles)` MUST devolver ese orden como `{ giro: 0 | 90 | 270, candidato }[]`, sin presupuesto (`[]` si la entrada no tiene forma de píxeles).

#### Scenario: Plan de un lienzo blanco
- **WHEN** se calcula el plan de un lienzo blanco de 1000x1000
- **THEN** los 4 primeros intentos son, en orden, `recorte-inferior` y `imagen-completa` de la vista 0, `recorte-inferior` e `imagen-completa` de la vista 90, y ninguna caja se repite dentro de una misma vista

#### Scenario: Tarjeta pequeña girada sobre textura
- **WHEN** se lee una foto sintética de 900x1600 con textura de madera y el reverso sintético R girado 90° en sentido horario (MRZ a la izquierda, líneas verticales), escalado a 360 px de ancho y pegado en (40, 260)
- **THEN** el lector devuelve las líneas de R con los 4 dígitos de control válidos, `intento` terminado en `"@270"`, y el OCR se llamó como mucho 40 veces

### Requirement: LMI-13 Presupuesto de intentos y de tiempo
Antes de cada llamada al OCR, el lector MUST detenerse si ya hizo `maxLlamadasOcr` llamadas (por defecto 40) o si desde el inicio de `leer` pasaron `tiempoLimiteMs` ms (por defecto 60000) según el reloj inyectable `ahora` (por defecto `Date.now`); son opciones de `crearLectorMrz` y un valor que no sea entero positivo toma el defecto. Al cortar devuelve el mejor intento parcial (LMI-04) o `{ ok: false, error: "mrz-no-encontrada" }`.

#### Scenario: Corte por número de llamadas
- **WHEN** con OCR inyectado ningún intento da texto legible y `maxLlamadasOcr` es 5
- **THEN** el resultado es `{ ok: false, error: "mrz-no-encontrada" }` y el OCR se llamó exactamente 5 veces

#### Scenario: Corte por tiempo con mejor intento parcial
- **WHEN** con OCR inyectado cada llamada avanza 30000 ms el reloj inyectado, `tiempoLimiteMs` es 60000 y la primera llamada da la MRZ de R con el dígito compuesto alterado
- **THEN** el OCR se llamó exactamente 2 veces y el resultado es el intento `"proyeccion"` con 3 dígitos válidos

#### Scenario: Presupuesto por defecto
- **WHEN** con OCR inyectado ningún intento da texto legible sobre el reverso R, sin opciones de presupuesto
- **THEN** el OCR se llamó `min(40, longitud de planIntentosMrz(R))` veces

### Requirement: LMI-14 Trío de MRZ horizontal
Un trío de LMI-11b MUST considerarse MRZ horizontal si cada una de sus 3 líneas tiene al menos 20 tramos (rachas maximales de columnas útiles con algún borde en las filas de la línea) y `t * a / w` está en [0,5; 2,5], con t el mínimo de tramos, a el alto medio de línea y w el ancho de los bordes del trío. No usa OCR ni modelos.

#### Scenario: Líneas de rectángulos
- **WHEN** un lienzo blanco de 1000x1000 tiene 3 líneas de 40 rectángulos negros de 10x15 px (separados 10 px, desde x = 100) en y = 900, 930 y 960
- **THEN** su primer candidato `"franja"` es un trío MRZ horizontal (80 tramos por línea, t * a / w = 80 * 15 / 791)

### Requirement: LMI-14a Evidencia de orientación por vista
`localizarConEvidencia(pixeles)` MUST devolver `{ candidatos, evidencia, ventanasMrz }` (`ventanasMrz`: ventanas cuyo trío es MRZ horizontal): `candidatos` igual a `localizarFranjaMrz(pixeles)`; `evidencia`, el mayor centro vertical relativo (`(y + alto / 2) / height`) de las cajas ajustadas cuyo trío es MRZ horizontal (LMI-14), o `null` si no hay ninguno o la entrada no tiene forma de píxeles.

#### Scenario: Evidencia en tres líneas de rectángulos
- **WHEN** un lienzo blanco de 1000x1000 tiene 3 líneas de 40 rectángulos negros de 10x15 px (separados 10 px, desde x = 100) en y = 900, 930 y 960
- **THEN** `localizarConEvidencia` devuelve una evidencia mayor que 0,8 y los mismos candidatos que `localizarFranjaMrz`

#### Scenario: Sin evidencia
- **WHEN** se analiza un lienzo blanco de 1000x1000, o ese lienzo de rectángulos girado 90°
- **THEN** la evidencia es `null`

### Requirement: LMI-14b Orden de vistas por evidencia
El lector MUST calcular las tres vistas y probarlas en el orden de `ordenVistasPorEvidencia(vistas)` (pura; entrada `{ giro, ventanasMrz, evidencia }[]` en el orden derecha, 90, 270), en ambas pasadas de LMI-12b: de más a menos `ventanasMrz`; empate, mayor `evidencia` (null al final); empate, el orden de entrada. Una ventana espuria en la vista derecha no la adelanta a otra con varias (foto real: 1 frente a 6). `planIntentosMrz` refleja ese orden.

#### Scenario: Vista derecha primero sin evidencia en ninguna vista
- **WHEN** se calcula el plan de un lienzo blanco de 1000x1000
- **THEN** el plan es el de LMI-12b (vista 0, luego 90, luego 270)

#### Scenario: Vista derecha primero cuando tiene evidencia
- **WHEN** se calcula el plan del reverso sintético R o de la foto sintética 900x1600 con madera y R centrado
- **THEN** el primer intento es de la vista 0 y el primero de otra vista es de la vista 90

#### Scenario: MRZ a la izquierda
- **WHEN** se calcula el plan del lienzo de rectángulos girado 90° en sentido horario (líneas verticales a la izquierda)
- **THEN** el primer intento es de la vista 270 y, con OCR inyectado que da la MRZ de R en la primera llamada, el resultado tiene `intento` terminado en `"@270"` tras 1 llamada

#### Scenario: MRZ a la derecha
- **WHEN** se calcula el plan del lienzo de rectángulos girado 270° en sentido horario (líneas verticales a la derecha)
- **THEN** el primer intento es de la vista 90

#### Scenario: Tarjeta pequeña girada horaria sobre madera
- **WHEN** se lee la foto sintética de LMI-12b (900x1600, madera, R girado 90° horario a 360 px de ancho en (40, 260))
- **THEN** el lector devuelve las líneas de R con los 4 dígitos de control válidos, `intento` terminado en `"@270"` y el OCR se llamó como mucho 12 veces

#### Scenario: Tarjeta pequeña girada antihoraria sobre madera
- **WHEN** se lee una foto sintética 900x1600 con madera y R girado 90° antihorario (MRZ a la derecha), a 360 px de ancho en (500, 260)
- **THEN** el lector devuelve las líneas de R con los 4 dígitos de control válidos, `intento` terminado en `"@90"` y el OCR se llamó como mucho 12 veces

#### Scenario: Tarjeta grande girada sobre madera
- **WHEN** se lee una foto sintética 900x1600 con madera y R girado 90° horario a 700 px de ancho en (20, 200) (MRZ a la izquierda), o girado 90° antihorario a 700 px en (180, 200) (MRZ a la derecha)
- **THEN** el lector devuelve las líneas de R con los 4 dígitos de control válidos, `intento` terminado en `"@270"` o `"@90"` respectivamente, y el OCR se llamó como mucho 12 veces (con el orden fijo de LMI-12b el primer intento `@270` era el 21.º)

#### Scenario: Evidencia espuria en la vista derecha (foto real)
- **WHEN** se ordenan `[{ giro: 0, ventanasMrz: 1, evidencia: 0.41 }, { giro: 90, ventanasMrz: 6, evidencia: 0.19 }, { giro: 270, ventanasMrz: 6, evidencia: 0.81 }]`
- **THEN** el resultado es `[270, 90, 0]`

#### Scenario: Sin evidencia en ninguna vista
- **WHEN** se ordenan las tres vistas con `ventanasMrz: 0` y `evidencia: null`
- **THEN** el resultado es `[0, 90, 270]`

#### Scenario: Vista derecha con más ventanas
- **WHEN** se ordenan `[{ giro: 0, ventanasMrz: 2, evidencia: 0.87 }, { giro: 90, ventanasMrz: 0, evidencia: null }, { giro: 270, ventanasMrz: 1, evidencia: 0.9 }]`
- **THEN** el resultado es `[0, 270, 90]`

### Requirement: LMI-11c Trío cortado por el borde de la ventana
El ajuste de LMI-11b MUST descartar un trío cuya primera línea empieza en la primera fila de la ventana (si la ventana no empieza en y = 0) o cuya última línea termina en la última fila de la ventana (si la ventana no termina en el borde inferior de la imagen): esa línea puede estar cortada y el OCR leería mal la línea de nombres, que no tiene dígito de control. Medido: R girado 90° antihorario a 700 px sobre madera se leía con la línea 3 cortada (4 dígitos válidos y nombre ilegible).

#### Scenario: Ventana que corta la tercera línea
- **WHEN** un lienzo blanco de 1000x1000 tiene 3 líneas de 40 rectángulos negros de 10x20 px (separados 10 px, desde x = 100) en y = 875, 905 y 935
- **THEN** el primer candidato `"franja"` es `{ x: 89, y: 865, ancho: 811, alto: 100 }` y el segundo, la ventana literal `{ x: 0, y: 800, ancho: 1000, alto: 150 }`

### Requirement: LMI-11d Recorte horizontal de la franja al bloque de texto
Al ajustar un trío (LMI-11b), los límites en x MUST tomarse del grupo de columnas con borde (útiles, en las filas del trío) con más columnas, separando grupos por huecos de más de un alto medio de línea, en lugar de todas las columnas con borde. El borde de la tarjeta o la madera junto a la MRZ quedan fuera del recorte (medido: con JPEG de calidad 40, Tesseract leía el borde de la tarjeta como una `E` pegada a cada línea y ningún intento pasaba de LMI-03).

#### Scenario: Barra vertical junto a las líneas
- **WHEN** el lienzo de LMI-11b (3 líneas de 40 rectángulos de 10x15 en y = 900, 930 y 960, desde x = 100) tiene además una barra negra en x = 40 a 45, y = 900 a 975
- **THEN** el primer candidato `"franja"` es `{ x: 91, y: 892, ancho: 807, alto: 91 }`

#### Scenario: Tarjeta grande girada con JPEG fuerte y una mano
- **WHEN** se lee una foto sintética 899x1599 con madera, R girado 90° horario a 829 px de ancho en (50, 220) (MRZ en x de 8 % a 29 % e y de 17 % a 80 %, como la foto real), una elipse color piel centrada en (820, 1100) de semiejes 160 y 420, codificada en JPEG de calidad 40; o su espejo: R girado 90° antihorario a 829 px en (20, 65) y la elipse centrada en (80, 1100)
- **THEN** el lector devuelve las líneas de R con los 4 dígitos de control válidos, `intento` terminado en `"@270"` (en el espejo, `"@90"`), y el OCR se llamó como mucho 12 veces

### Requirement: LMI-11e Umbral de borde relativo a la ventana
El umbral de borde de LMI-11b MUST ser, en cada ventana, `min(40, max(12, round(0,5 * p99)))`, con p99 el percentil 99 de los saltos horizontales de luminancia de la ventana (en lugar de 40 fijo). Con texto nítido el umbral sigue en 40; con texto borroso y de poco contraste (foto real de WhatsApp: 45 de 45 ventanas sin 3 bandas en las 3 vistas) baja hasta separar las líneas.

#### Scenario: Líneas de poco contraste
- **WHEN** el lienzo de LMI-11b tiene rectángulos de luminancia 225 sobre fondo 255 (saltos de 30, por debajo de 40)
- **THEN** el primer candidato `"franja"` es `{ x: 91, y: 892, ancho: 807, alto: 91 }`

#### Scenario: Réplica borrosa de la foto real
- **WHEN** se lee la réplica de LMI-11d (horaria) suavizada con 2 pasadas de media 3x3, con el contraste reducido a 0,6 alrededor de 128 y codificada en JPEG de calidad 50
- **THEN** el lector devuelve las líneas de R con los 4 dígitos de control válidos, `intento` terminado en `"@270"`, y el OCR se llamó como mucho 12 veces

### Requirement: LMI-11f Diagnóstico numérico de una ventana
`analizarVentana(luma, ancho, ventana)` MUST devolver `{ candidato, medidas, umbral, bandas, motivo }`: el ajuste de LMI-11b, el umbral de borde usado (LMI-11e), el número de bandas y el motivo (`"trio"`, `"sin-columnas-utiles"`, `"menos-de-3-bandas"` o `"sin-trio-valido"`). Solo números y cajas: nunca píxeles ni texto.

#### Scenario: Ventana con trío de poco contraste
- **WHEN** se analiza la ventana `{ x: 0, y: 850, ancho: 1000, alto: 150 }` del lienzo de rectángulos de luminancia 225 de LMI-11e
- **THEN** el umbral es 15 y el motivo `"trio"`

#### Scenario: Texto nítido conserva el umbral
- **WHEN** se analiza esa ventana en el lienzo de LMI-11b con rectángulos negros
- **THEN** el umbral es 40, el motivo `"trio"` y hay 3 bandas

#### Scenario: Ventana sin tinta
- **WHEN** se analiza esa ventana en un lienzo blanco de 1000x1000
- **THEN** el umbral es 12, el motivo `"menos-de-3-bandas"`, 0 bandas y `medidas` es null

### Requirement: LMI-11g Columnas de texto por densidad de bordes en líneas y huecos
Para el recorte en x de LMI-11d, una columna MUST contar como texto solo si tiene algún borde en las filas de las 3 líneas y su densidad de bordes en las filas de los 2 huecos entre líneas es como mucho la mitad de su densidad en las filas de las líneas. Las estructuras que cruzan las líneas y sus huecos (borde de la tarjeta, dedos, vetas) no extienden la caja (foto real: la caja llegaba al borde derecho de la vista y el OCR daba de 36 a 41 caracteres por línea).

#### Scenario: Líneas verticales finas junto a las líneas
- **WHEN** el lienzo de LMI-11b (rectángulos negros) tiene además líneas verticales negras de 1 px en x = 900, 910, ..., 990, de y = 900 a 975
- **THEN** el primer candidato `"franja"` es `{ x: 91, y: 892, ancho: 807, alto: 91 }`

#### Scenario: Réplica con estructuras a la derecha de la MRZ
- **WHEN** se lee la réplica borrosa de LMI-11e con, antes de suavizar, líneas horizontales de 2 px oscurecidas en 120 cada 20 px, de x = 60 a 270 e y = 1290 a 1599 (verticales en la vista `@270`, a la derecha de la MRZ)
- **THEN** el lector devuelve las líneas de R con los 4 dígitos de control válidos, `intento` terminado en `"@270"`, y el OCR se llamó como mucho 12 veces
