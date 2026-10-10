## MODIFIED Requirements

### Requirement: LMI-01b Criterio de la proyección
El candidato `"proyeccion"` MUST obtenerse binarizando con Otsu y proyectando la tinta por filas en la mitad inferior, y MUST existir solo si hay exactamente 3 bandas consecutivas con alturas que difieren menos del 35 % de su media y separaciones entre centros que difieren menos del 25 %. Su caja une las 3 bandas con un margen de 0,5 veces la altura media por lado, recortada a la imagen.

El umbral de Otsu `umbralOtsu(luma)` (tinta: `luma <= t`) MUST ser el `t` de 0 a 255 que maximiza la varianza entre clases `n0 * n1 * (m0 - m1)^2`, donde `n0` y `m0` son el número y la media de las luminancias `<= t` y `n1` y `m1` los de las `> t`; los `t` con una clase vacía tienen varianza 0. Ante empate MUST ganar el umbral más bajo. El cálculo MUST ser exacto: la varianza de cada `t` es la fracción `d^2 / (n0 * n1)` con `d = S0 * N - S * n0` (`S0` suma de la clase baja, `S` suma total, `N` número de píxeles), y dos umbrales se comparan multiplicando en cruz con enteros sin redondeo (BigInt), nunca con coma flotante. Si la varianza máxima es 0 (un solo nivel), MUST devolver `null`.

#### Scenario: Margen de la caja
- **WHEN** se localiza la franja en un lienzo blanco de 1000x600 con 3 rectángulos negros de 900x20 en `x = 50` e `y = 400`, `440` y `480`
- **THEN** el primer candidato es `{ metodo: "proyeccion", caja: { x: 40, y: 390, ancho: 920, alto: 120 } }`

#### Scenario: Bandas irregulares
- **WHEN** el lienzo anterior tiene el tercer rectángulo con alto 40 en lugar de 20
- **THEN** ningún candidato tiene `metodo: "proyeccion"`

#### Scenario: Empate en la varianza entre clases
- **WHEN** se calcula `umbralOtsu` de `[245, 109, 146, 217, 13]`, donde los cortes `{13, 109} | {146, 217, 245}` y `{13, 109, 146} | {217, 245}` tienen la misma varianza entre clases (361250 / 3)
- **THEN** el resultado es `109`, el umbral más bajo que alcanza el máximo

#### Scenario: Un solo nivel y dos niveles
- **WHEN** se calcula `umbralOtsu` de `[7, 7, 7]`, de `[10, 10, 200, 200]` y de `[0, 0, 0, 100, 255, 255]`
- **THEN** los resultados son `null`, `10` y `100`

#### Scenario: Coincide con un oráculo exacto
- **WHEN** se calcula `umbralOtsu` de 1000 arrays de `fc.uint8Array({ minLength: 1, maxLength: 60 })` y se compara con un oráculo independiente que, para cada `t`, separa las clases por filtrado y compara las varianzas como fracciones exactas con BigInt
- **THEN** el resultado es siempre el primer `t` de varianza máxima, o `null` si esa varianza es 0
