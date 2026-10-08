/**
 * Hipótesis de formato del cambio deteccion-fraude (docs/decisiones/hipotesis-formato.md). Mientras estén
 * pendientes se reportan en `warnings` (principio VI).
 */

/** H-FRA-1: región del holograma de la amarilla, relativa al cuadrilátero (55-80 mm x 30-48 mm). */
export const REGION_HOLOGRAMA_RELATIVA = Object.freeze({ s0: 55 / 85.6, s1: 80 / 85.6, t0: 30 / 53.98, t1: 48 / 53.98 });

export const HIPOTESIS_PENDIENTES = Object.freeze({ holograma: "H-FRA-1", radioDigital: "H-FRA-3" });
