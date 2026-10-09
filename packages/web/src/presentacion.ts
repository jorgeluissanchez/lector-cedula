/** Resultado de presentación (SDK-08, SDK-28): el mismo objeto para `crearLector` y `leerDocumento`; nunca de confianza. */
import type { ResultadoLectura } from "@lector-cedula/capture";
import type { ResultadoPresentacion } from "./tipos.js";

export function aPresentacion(r: Extract<ResultadoLectura, { ok: true }>, validacionId: string | null = null): ResultadoPresentacion {
  return { tipo: r.tipoDocumento, campos: r.campos, warnings: [...r.warnings], confiable: false, validacion_id: validacionId };
}
