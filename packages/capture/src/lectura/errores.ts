// Clasificación de errores de lectura (OFF-13): código y texto fijo de la pantalla `error-lectura`.

export type CodigoErrorLectura =
  "no-encontrado" | "tiempo-agotado" | "no-valido" | "menor-de-edad" | "motor"
  /** otros-documentos (OD-23 y OD-32): sin reintento automático. */
  | "documento-no-admitido" | "ti-mayor-de-edad";

export const TEXTOS_ERROR_LECTURA: Readonly<
  Record<CodigoErrorLectura, string>
> = Object.freeze({
  "no-encontrado":
    "No se encontró el código de la cédula ni la zona de lectura. Acerca el documento y evita reflejos.",
  "tiempo-agotado":
    "La lectura tardó demasiado. Inténtalo de nuevo con mejor luz.",
  "no-valido": "Se leyó un código, pero no corresponde a una cédula válida.",
  "menor-de-edad":
    "Este lector solo admite cédulas de ciudadanía de mayores de edad.",
  motor: "No se pudo iniciar el lector en este dispositivo.",
  "documento-no-admitido": "Este tipo de documento no está admitido en este servicio.",
  "ti-mayor-de-edad": "Esta tarjeta de identidad es de una persona mayor de edad. Usa la cédula de ciudadanía.",
});

function codigo(r: unknown): CodigoErrorLectura {
  if (typeof r !== "object" || r === null) return "motor";
  const { tipo, error } = r as { tipo?: unknown; error?: unknown };
  // La MRZ solo se intenta tras `pdf417-no-encontrado` (OFF-06): su "no encontrada" significa que no hay documento.
  if (error === "mrz-no-encontrada" && tipo === "mrz") return "no-encontrado";
  // OFF-27: con pista PDF417 sin respaldo (o tras el respaldo MRZ), "no encontrado" del PDF417.
  if (error === "pdf417-no-encontrado" && tipo === "pdf417") return "no-encontrado";
  if (error === "tiempo-agotado") return "tiempo-agotado";
  // OD-23: los errores del parser TD3 (formato o código que no es de pasaporte) son un documento no válido.
  if (error === "pdf417-no-valido" || error === "mrz-no-valida" || error === "no-es-pasaporte" || error === "formato-td3")
    return "no-valido";
  if (error === "menor-de-edad") return "menor-de-edad";
  if (error === "documento-no-admitido") return "documento-no-admitido";
  if (error === "ti-mayor-de-edad") return "ti-mayor-de-edad";
  return "motor";
}

/** Cualquier valor (incluido `undefined`) se clasifica; lo desconocido es `motor`. */
export function clasificarErrorLectura(resultado: unknown): {
  readonly codigo: CodigoErrorLectura;
  readonly texto: string;
} {
  const c = codigo(resultado);
  return { codigo: c, texto: TEXTOS_ERROR_LECTURA[c] };
}
