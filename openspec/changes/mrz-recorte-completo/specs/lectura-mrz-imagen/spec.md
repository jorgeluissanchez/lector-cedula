## ADDED Requirements

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
Si ningún candidato de la imagen da los 4 dígitos de control válidos, el lector MUST repetir la localización y la lectura sobre la imagen girada 90° y, después, 270° en sentido horario (tarjeta fotografiada en vertical), calculando cada giro solo si hace falta. `intento` lleva el sufijo del giro: `"<metodo>@90"` o `"<metodo>@270"`. Se devuelve el mejor intento de todas las vistas con el criterio de LMI-04; con 4 dígitos válidos se detiene.

#### Scenario: Reverso girado (líneas MRZ verticales)
- **WHEN** se lee el reverso sintético R girado 90° en sentido antihorario
- **THEN** el lector devuelve las líneas de R con los 4 dígitos de control válidos e `intento` terminado en `"@90"`

#### Scenario: Giro solo cuando la imagen derecha falla
- **WHEN** con OCR inyectado ningún candidato de la imagen derecha da texto legible y el primero de la vista a 90° da la MRZ de R
- **THEN** `intento` es `"proyeccion@90"` y el OCR se llamó exactamente (candidatos de la imagen derecha + 1) veces

#### Scenario: Nada legible en ninguna vista
- **WHEN** con OCR inyectado ningún intento da texto legible
- **THEN** el resultado es `{ ok: false, error: "mrz-no-encontrada" }` y el OCR se llamó una vez por candidato de las tres vistas

#### Scenario: Giro puro
- **WHEN** se gira 90° y 270° una imagen de 3x2
- **THEN** el resultado es de 2x3 con los píxeles en la posición girada, alfa intacto y la entrada sin modificar
