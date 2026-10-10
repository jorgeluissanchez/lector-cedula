## ADDED Requirements

### Requirement: LMI-12c Imagen girada 180°
Además de las vistas de LMI-12, el lector MUST probar la vista girada 180° (tarjeta al revés), con sufijo `"<metodo>@180"`. `girar(p, 180)` MUST devolver una copia de las mismas dimensiones con el píxel (x, y) tomado de (w - 1 - x, h - 1 - y), alfa intacto, sin modificar la entrada. El plan de LMI-12b MUST recorrer las cuatro vistas con orden de entrada derecha, 90, 270, 180 (`giro: 0 | 90 | 180 | 270`).

#### Scenario: Plan de cuatro vistas en lienzo blanco
- **WHEN** se construye el plan para un lienzo blanco
- **THEN** tiene 8 intentos de pasada 1 (2 por vista: `recorte-inferior` e `imagen-completa` de 0, 90, 270 y 180, en ese orden) y 8 + 4 x (18 + 15 + 12) intentos en total

#### Scenario: Giro 180 puro
- **WHEN** se gira 180° una imagen de 3x2 con canal R 0..5 por filas
- **THEN** el resultado es de 3x2 con canal R 5, 4, 3, 2, 1, 0, alfa intacto, igual a girar 90° dos veces, y la entrada sin modificar

#### Scenario: Lectura en las cuatro orientaciones con OCR real
- **WHEN** se lee la foto sintética 900x1600 con madera y R centrado (LMI-11), y esa foto girada 90°, 180° y 270° en sentido horario
- **THEN** las cuatro lecturas devuelven las líneas de R con los 4 dígitos de control válidos, con `intento` sin sufijo, `"@270"`, `"@180"` y `"@90"` respectivamente, cada una con como mucho 4 llamadas al OCR (medido: 3 en las cuatro)

#### Scenario: Lienzo de rectángulos al revés con OCR inyectado
- **WHEN** se calcula el plan del lienzo de rectángulos de LMI-14a girado 180° (MRZ arriba) y se lee con un OCR inyectado que da la MRZ de R en la primera llamada
- **THEN** el primer intento es de la vista 180 y el resultado tiene `intento` terminado en `"@180"` tras 1 llamada

#### Scenario: Primer intento de otra vista
- **WHEN** con OCR inyectado ningún intento de la vista derecha de R da texto legible y el primero de otra vista da la MRZ de R
- **THEN** `intento` es `"recorte-inferior@180"` y el OCR se llamó (intentos de la pasada 1 de la vista derecha + 1) veces; si la MRZ llega en el primer intento de la vista 90 (o 270), `intento` termina en `"@90"` (o `"@270"`)

### Requirement: LMI-14c Vistas opuestas comparten el eje
`ordenVistasPorEvidencia` MUST aceptar las cuatro vistas (entrada en el orden derecha, 90, 270, 180) y ordenar por el eje: de más a menos el máximo de `ventanasMrz` entre la vista y su opuesta (0 y 180; 90 y 270); empate, mayor `evidencia` (null al final); empate, el orden de entrada. Con tres vistas (sin 180) el resultado de los escenarios de LMI-14b MUST NOT cambiar.

#### Scenario: Una ventana de más en la vista opuesta no la adelanta
- **WHEN** se ordenan `[{ giro: 0, ventanasMrz: 5, evidencia: 0.86 }, { giro: 90, ventanasMrz: 0, evidencia: null }, { giro: 270, ventanasMrz: 0, evidencia: null }, { giro: 180, ventanasMrz: 6, evidencia: 0.14 }]`, y aparte el mismo con 0 y 180 intercambiando ventanas y evidencia (0: 6 y 0.14; 180: 5 y 0.86)
- **THEN** los resultados son `[0, 180, 90, 270]` y `[180, 0, 90, 270]`

#### Scenario: El eje con más ventanas va primero
- **WHEN** se ordenan `[{ giro: 0, ventanasMrz: 1, evidencia: 0.41 }, { giro: 90, ventanasMrz: 6, evidencia: 0.19 }, { giro: 270, ventanasMrz: 5, evidencia: 0.81 }, { giro: 180, ventanasMrz: 1, evidencia: 0.6 }]`
- **THEN** el resultado es `[270, 90, 180, 0]`

#### Scenario: Orden de vistas del reverso R
- **WHEN** se calcula el plan de un lienzo blanco 1000x1000, del reverso R, de R girado 180° y de la foto 900x1600 con madera y R centrado
- **THEN** el orden de vistas es `[0, 90, 270, 180]`, `[0, 180, 90, 270]`, `[180, 0, 90, 270]` y `[0, 180, 90, 270]` respectivamente (sustituye los `[0, 90, 270]` de los escenarios "Vista derecha primero" de LMI-14b y "Plan de un lienzo blanco" de LMI-12b)

### Requirement: LMI-06b Distorsión del reverso al revés en el eval
El eval de LMI-06 (`npm run eval:mrz-imagen`) MUST añadir a las 8 distorsiones leves la distorsión `rotacion180` (el reverso R girado 180° en el renderizador), sobre las mismas 50 primeras personas del conjunto E, con el mismo umbral provisional (>= 90 % correctas) y 0 lecturas falsas.

#### Scenario: Lista de distorsiones
- **WHEN** se leen las distorsiones del corredor y del renderizador
- **THEN** son `["rotacion+2", "rotacion-2", "blur1", "brillo+20", "brillo-20", "jpeg70", "escala0.8", "ruido8", "rotacion180"]` y el resumen tiene 11 líneas

#### Scenario: Eval con el modelo real
- **WHEN** se ejecuta `npm run eval:mrz-imagen`
- **THEN** el grupo `rotacion180` tiene al menos 45 de 50 correctas y 0 falsas, y ningún grupo tiene falsas
