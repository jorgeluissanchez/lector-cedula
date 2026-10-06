/**
 * `@lector-cedula/fixtures`: generador sintético y determinista de payloads PDF417 de la cédula amarilla y líneas
 * MRZ TD1 de la cédula digital, para pruebas y evals. Paquete privado: nunca es dependencia de producción (FX-01).
 * Contrato público: design.md del cambio `generador-fixtures-sinteticos`, decisión 2 (FX-02).
 */

/** Versión del contrato público (FX-02). Todo cambio incompatible sube el MAJOR en un cambio OpenSpec. */
export const VERSION_CONTRATO = "1.0.0" as const;

/** Errores: `ErrorFixture` es la única excepción que lanzan los generadores (FX-03). */
export { type CodigoErrorFixture, ErrorFixture } from "./errores.js";

/** Persona ficticia y persona base de los escenarios (FX-04). */
export { PERSONA_BASE, type PersonaFicticia, type Rh, type Sexo } from "./persona.js";

/** IDs de hipótesis del formato que declara cada fixture (FX-14). */
export type { IdHipotesis, VariantePdf417 } from "./hipotesis.js";

/** Generador del payload PDF417 de la cédula amarilla (FX-07 a FX-15). */
export { type CamposPdf417, type FixturePdf417, generarPdf417, type OpcionesPdf417, type Rango, type RangosPdf417 } from "./pdf417.js";

/** Generador de la MRZ TD1 de la cédula digital (FX-16 a FX-21). */
export {
  type CamposMrz,
  type EstadoDigitoControl,
  type FixtureMrz,
  generarMrzTd1,
  type InyeccionOcr,
  type OpcionesMrz,
  type PosicionOcr,
  type VarianteMrz,
} from "./mrz.js";

/** Catálogo fijo de casos con nombre (FX-22). */
export { type Caso, casosMrz, casosPdf417 } from "./casos.js";

/** Arbitrarios de fast-check válidos por construcción (FX-23, FX-24). */
export { arbFixtureMrz, arbFixturePdf417, arbPersonaFicticia } from "./arbitrarios.js";
