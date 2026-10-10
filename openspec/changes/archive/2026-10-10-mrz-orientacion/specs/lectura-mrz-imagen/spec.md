## ADDED Requirements

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
