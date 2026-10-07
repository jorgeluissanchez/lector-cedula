/** CAM-05: clasificación de los rechazos de `getUserMedia` por su `name`. */
export type CodigoErrorCamara = "permiso-denegado" | "sin-camara" | "camara-ocupada" | "desconocido";

export interface ErrorCamara {
  readonly codigo: CodigoErrorCamara;
  readonly texto: string;
}

export const TEXTOS_ERROR_CAMARA: Readonly<Record<CodigoErrorCamara, string>> = Object.freeze({
  "permiso-denegado": "Permite el acceso a la cámara para continuar.",
  "sin-camara": "No encontramos una cámara disponible.",
  "camara-ocupada": "La cámara está en uso por otra aplicación.",
  desconocido: "No pudimos iniciar la cámara.",
});

const POR_NOMBRE: Readonly<Record<string, CodigoErrorCamara>> = Object.freeze({
  NotAllowedError: "permiso-denegado",
  SecurityError: "permiso-denegado",
  NotFoundError: "sin-camara",
  OverconstrainedError: "sin-camara",
  NotReadableError: "camara-ocupada",
  AbortError: "camara-ocupada",
});

export function clasificarErrorCamara(rechazo: unknown): ErrorCamara {
  const nombre = typeof rechazo === "object" && rechazo !== null ? (rechazo as { name?: unknown }).name : undefined;
  // Stryker disable next-line ConditionalExpression: equivalente; Object.hasOwn convierte la clave a texto y ningún valor no textual coincide con un nombre de la tabla.
  const codigo = typeof nombre === "string" && Object.hasOwn(POR_NOMBRE, nombre) ? (POR_NOMBRE[nombre] as CodigoErrorCamara) : "desconocido";
  return { codigo, texto: TEXTOS_ERROR_CAMARA[codigo] };
}
