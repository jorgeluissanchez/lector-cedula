## ADDED Requirements

### Requirement: LMI-10 Candidato de imagen completa
`localizarFranjaMrz` MUST añadir, después de los candidatos de LMI-01, el candidato `{ metodo: "imagen-completa", caja: { x: 0, y: 0, ancho: width, alto: height } }`, de modo que una foto que ya es el recorte de las 3 líneas de la MRZ se lea completa.

#### Scenario: Recorte que contiene solo la MRZ
- **WHEN** se localiza la franja en una imagen sintética que contiene solo las 3 líneas MRZ de la persona base, sin márgenes de tarjeta
- **THEN** el último candidato es `{ metodo: "imagen-completa", caja: { x: 0, y: 0, ancho: width, alto: height } }` y el lector devuelve las líneas con los 4 dígitos de control válidos

#### Scenario: Orden de candidatos en el reverso completo
- **WHEN** se localiza la franja en los píxeles del reverso sintético R
- **THEN** los métodos, en orden, son `["proyeccion", "recorte-inferior", "imagen-completa"]`
