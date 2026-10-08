## ADDED Requirements

### Requirement: OFF-22b Presencia de la MRZ en las cuatro orientaciones
La búsqueda de contenido MRZ de OFF-22 MUST mirar la tarjeta en las 4 orientaciones: si es horizontal, la vista derecha y, si no hay MRZ pero sí entre 1 y 6 ventanas con trío (las líneas están arriba), la girada 180°; si es vertical, las giradas 90° y 270°. Cada vista se calcula solo si la anterior no tiene MRZ. El criterio (ventanas con trío MRZ entre 1 y 6 y evidencia >= 0,6) y el `contenido` `"mrz"` de OFF-27 no cambian.

#### Scenario: Digital al revés
- **WHEN** se evalúa la presencia de la digital sintética de `PERSONA_BASE` girada 180° en la guía, y de la digital girada 270° como tarjeta vertical
- **THEN** ambas tienen presencia con contenido `mrz`

#### Scenario: Coste
- **WHEN** se mide la evaluación en Node de la digital girada 180° en la guía
- **THEN** tarda menos de 250 ms (mínimo de 10 ejecuciones; mira dos vistas, el doble que la digital derecha, que sigue en menos de 150 ms; medido unos 100 ms sin carga)
