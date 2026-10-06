/** IDs de `docs/decisiones/hipotesis-formato.md` que un fixture puede declarar (FX-14). */
export type IdHipotesis =
  | "H01"
  | "H02"
  | "H03"
  | "H04"
  | "H05"
  | "H06"
  | "H07"
  | "H08"
  | "H09"
  | "H11"
  | "M01"
  | "M02"
  | "M03"
  | "G01"
  | "G02"
  | "G03"
  | "G04"
  | "G05";

/** Variantes estructurales del payload PDF417 (FX-07, FX-10 a FX-12). */
export type VariantePdf417 = "completa" | "windows-truncada" | "sin-pubdsk" | "fecha-primero";

/** Hipótesis que asume cada variante PDF417, ordenadas y sin repetidos (tabla fija de FX-14). */
export const HIPOTESIS_PDF417: Readonly<Record<VariantePdf417, readonly IdHipotesis[]>> = {
  completa: ["G01", "H01", "H02", "H03", "H04", "H05", "H06", "H09", "H11"],
  "windows-truncada": ["G01", "G02", "H01", "H02", "H03", "H04", "H05", "H06", "H09", "H11"],
  "sin-pubdsk": ["G01", "G03", "H01", "H03", "H04", "H05", "H06", "H07", "H09", "H11"],
  "fecha-primero": ["G01", "G04", "H01", "H02", "H03", "H04", "H06", "H08", "H09"],
};

/** Hipótesis que asumen todas las variantes de la MRZ (FX-14). */
export const HIPOTESIS_MRZ: readonly IdHipotesis[] = ["G05", "M01", "M02", "M03"];
