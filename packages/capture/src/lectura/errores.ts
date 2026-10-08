// Clasificación de errores de lectura (OFF-13): código y texto fijo de la pantalla `error-lectura`.

export type CodigoErrorLectura = "no-encontrado" | "tiempo-agotado" | "no-valido" | "motor";

export const TEXTOS_ERROR_LECTURA: Readonly<Record<CodigoErrorLectura, string>> = Object.freeze({
  "no-encontrado": "No se encontró el código de la cédula ni la zona de lectura. Acerca el documento y evita reflejos.",
  "tiempo-agotado": "La lectura tardó demasiado. Inténtalo de nuevo con mejor luz.",
  "no-valido": "Se leyó un código, pero no corresponde a una cédula válida.",
  motor: "No se pudo iniciar el lector en este dispositivo.",
});

function codigo(r: unknown): CodigoErrorLectura {
  if (typeof r !== "object" || r === null) return "motor";
  const { tipo, error } = r as { tipo?: unknown; error?: unknown };
  // La MRZ solo se intenta tras `pdf417-no-encontrado` (OFF-06): su "no encontrada" significa que no hay documento.
  if (error === "mrz-no-encontrada" && tipo === "mrz") return "no-encontrado";
  if (error === "tiempo-agotado") return "tiempo-agotado";
  if (error === "pdf417-no-valido" || error === "mrz-no-valida") return "no-valido";
  return "motor";
}

/** Cualquier valor (incluido `undefined`) se clasifica; lo desconocido es `motor`. */
export function clasificarErrorLectura(resultado: unknown): { readonly codigo: CodigoErrorLectura; readonly texto: string } {
  const c = codigo(resultado);
  return { codigo: c, texto: TEXTOS_ERROR_LECTURA[c] };
}
