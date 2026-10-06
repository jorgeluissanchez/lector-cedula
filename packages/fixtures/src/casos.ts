import { congelarProfundo } from "./congelar.js";
import type { VariantePdf417 } from "./hipotesis.js";
import { type FixtureMrz, generarMrzTd1, type OpcionesMrz } from "./mrz.js";
import { type FixturePdf417, generarPdf417 } from "./pdf417.js";
import { PERSONA_BASE, type PersonaFicticia } from "./persona.js";

/** Caso con nombre del catálogo (FX-22). */
export interface Caso<F> {
  readonly id: string;
  readonly descripcion: string;
  readonly fixture: F;
}

/** Semilla de todo el catálogo (FX-22). */
const SEMILLA_CATALOGO = 1;

const con = (cambios: Partial<PersonaFicticia>): PersonaFicticia => ({ ...PERSONA_BASE, ...cambios });

const DEFINICION_PDF417: readonly (readonly [id: string, descripcion: string, persona: PersonaFicticia, variante: VariantePdf417])[] = [
  ["completa-base", "Trama completa de 531 bytes de la persona base", PERSONA_BASE, "completa"],
  ["windows-truncada-base", "Persona base con la trama de Windows sin los 11 NUL de la cabecera", PERSONA_BASE, "windows-truncada"],
  ["sin-pubdsk-base", "Persona base sin el marcador PubDSK y con los campos desplazados una posición", PERSONA_BASE, "sin-pubdsk"],
  ["fecha-primero-base", "Persona base con el bloque demográfico fecha-primero", PERSONA_BASE, "fecha-primero"],
  ["sin-segundo-nombre", "Segundo nombre ausente: 23 NUL sin desplazar los campos", con({ segundoNombre: "" }), "completa"],
  ["apellido-compuesto", "Primer apellido compuesto con espacios simples", con({ primerApellido: "DE LA OSSA" }), "completa"],
  ["enie", "Apellidos con Ñ codificada como 0xD1", con({ primerApellido: "PEÑA", segundoApellido: "NUÑEZ" }), "completa"],
  ["rh-ab-positivo", "RH AB+ de tres caracteres", con({ rh: "AB+" }), "completa"],
  ["rh-ab-negativo", "RH AB- de tres caracteres con signo", con({ rh: "AB-" }), "completa"],
  ["rh-o-negativo", "RH O- que conserva el signo", con({ rh: "O-" }), "completa"],
  ["sexo-f-apellido-con-m", "Sexo F con M en el primer apellido", con({ primerApellido: "MARTINEZ", sexo: "F" }), "completa"],
  ["nuip-corto", "NUIP de 8 dígitos rellenado con ceros a la izquierda", con({ nuip: "99991234" }), "completa"],
];

/** Opciones `{}` = variante `valida` por omisión. */
const DEFINICION_MRZ: readonly (readonly [id: string, descripcion: string, persona: PersonaFicticia, opciones: OpcionesMrz])[] = [
  ["valida-base", "MRZ TD1 válida de la persona base", PERSONA_BASE, {}],
  ["cd-documento-alterado", "Dígito de control del documento alterado", PERSONA_BASE, { variante: "cd-documento-alterado" }],
  ["cd-nacimiento-alterado", "Dígito de control de la fecha de nacimiento alterado", PERSONA_BASE, { variante: "cd-nacimiento-alterado" }],
  ["cd-vencimiento-alterado", "Dígito de control de la fecha de vencimiento alterado", PERSONA_BASE, { variante: "cd-vencimiento-alterado" }],
  ["cd-compuesto-alterado", "Dígito de control compuesto alterado", PERSONA_BASE, { variante: "cd-compuesto-alterado" }],
  ["cd-documento-relleno", "Dígito de control del documento impreso como relleno <", PERSONA_BASE, { variante: "cd-documento-relleno" }],
  ["ocr-b-un-error", "Un error OCR-B inyectado en una zona numérica", PERSONA_BASE, { variante: "ocr-b", erroresOcr: 1 }],
  ["ocr-b-cinco-errores", "Cinco errores OCR-B inyectados en zonas numéricas", PERSONA_BASE, { variante: "ocr-b", erroresOcr: 5 }],
  ["enie", "Apellidos con Ñ transliterada a N en la línea 3", con({ primerApellido: "PEÑA", segundoApellido: "NUÑEZ" }), {}],
  [
    "apellido-compuesto",
    "Primer apellido compuesto sin segundo nombre en la línea 3",
    con({ primerApellido: "DE LA OSSA", segundoNombre: "" }),
    {},
  ],
  ["sin-segundo-nombre", "Línea 3 sin segundo nombre", con({ segundoNombre: "" }), {}],
];

/** Catálogo fijo de casos PDF417 con nombre (FX-22), generados con semilla 1. Cada llamada devuelve bytes nuevos. */
export function casosPdf417(): readonly Caso<FixturePdf417>[] {
  return congelarProfundo(
    DEFINICION_PDF417.map(([id, descripcion, persona, variante]) => ({
      id,
      descripcion,
      fixture: generarPdf417(persona, { variante, semilla: SEMILLA_CATALOGO }),
    })),
  );
}

/** Catálogo fijo de casos MRZ con nombre (FX-22), generados con semilla 1. */
export function casosMrz(): readonly Caso<FixtureMrz>[] {
  return congelarProfundo(
    DEFINICION_MRZ.map(([id, descripcion, persona, opciones]) => ({
      id,
      descripcion,
      fixture: generarMrzTd1(persona, { ...opciones, semilla: SEMILLA_CATALOGO }),
    })),
  );
}
