// Tipos de la lectura en el dispositivo (cambio pwa-lectura-offline, OFF-06 a OFF-13).
import type { buscarDivipol, parsearPdf417Amarilla } from "@lector-cedula/parsers";
import type { LectorMrz } from "../mrz/lector.js";
import type { Pixeles, ResultadoPdf417Imagen } from "../pdf417/decodificar.js";

/** Tipo de documento leído: PDF417 de la amarilla o MRZ TD1 de la digital. */
export type TipoLectura = "pdf417" | "mrz";

/** Errores de `leerDocumento` (entrada para `clasificarErrorLectura`, OFF-13). */
export type ErrorLectura =
  | "entrada-invalida"
  | "imagen-ilegible"
  | "mrz-no-encontrada"
  | "modelo-no-disponible"
  | "lector-terminado"
  | "fecha-referencia-invalida"
  | "pdf417-no-valido"
  | "mrz-no-valida"
  | "cancelada"
  | "tiempo-agotado"
  | "motor";

export type ResultadoLectura =
  | { readonly ok: true; readonly tipo: TipoLectura; readonly intento: string; readonly resultado: unknown }
  | { readonly ok: false; readonly tipo?: TipoLectura; readonly error: ErrorLectura };

/** Dependencias inyectadas (design.md, decisión 2): el Worker usa las de navegador; Node, las suyas. */
export interface DependenciasLectura {
  readonly decodificar: (pixeles: Pixeles) => Promise<ResultadoPdf417Imagen>;
  readonly lectorMrz: Pick<LectorMrz, "leer">;
  readonly parsearPdf417: typeof parsearPdf417Amarilla;
  readonly buscarDivipol: typeof buscarDivipol;
}

export interface OpcionesLectura {
  /** `AAAA-MM-DD` en America/Bogota (design.md, decisión 11). */
  readonly fechaReferencia: string;
  readonly senal?: AbortSignal;
}
