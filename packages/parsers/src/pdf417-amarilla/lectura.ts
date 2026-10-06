/**
 * Tipos internos que comparten los dos lectores (offsets y patrones) y el ensamblador (design.md, decisión 2):
 * cada lector devuelve su lectura sin conocer al otro.
 */
import type { BloqueDemograficoPdf417, CamposCedulaAmarilla, MotivoErrorPdf417 } from "./index.js";

/** Estado de los códigos DIVIPOL según el bloque leído (tabla de la decisión 9). */
export type EstadoDivipolCodigos = "ok" | "longitud-inesperada" | "bloque-sin-divipol";

export interface LecturaPdf417 {
  campos: CamposCedulaAmarilla;
  bloque: BloqueDemograficoPdf417;
  /** `tipoProbable` de `validarFormatoNuip` (cédula): `nuip` o `cedula-antigua`. */
  tipoNuip: string;
  /** `true` si los nombres se asignaron por H15 (menos de 3 campos tras el primer apellido). */
  nombresPorH15: boolean;
  divipol: EstadoDivipolCodigos;
}

export type ResultadoLector = { ok: true; lectura: LecturaPdf417 } | { ok: false; error: MotivoErrorPdf417 };
