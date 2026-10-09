// Tipos de la lectura en el dispositivo (cambio pwa-lectura-offline, OFF-06 a OFF-13).
import type {
  buscarDivipol,
  parsearPdf417Amarilla,
} from "@lector-cedula/parsers";
import type { LectorMrz } from "../mrz/lector.js";
import type { Pixeles, ResultadoPdf417Imagen } from "../pdf417/decodificar.js";

/** Lector que dio el resultado (campo `tipo`, obsoleto desde otros-documentos, OD-22): PDF417 o MRZ (TD1 o TD3). */
export type TipoLectura = "pdf417" | "mrz";

/** OD-20: contenido que vio la presencia; `"mrz"` es alias de `"mrz-td1"`. */
export type PistaLectura = TipoLectura | "mrz-td1" | "mrz-td3";

/** OD-22: tipo de documento del resultado unificado. */
export type TipoDocumento = "cedula-ciudadania" | "cedula-extranjeria" | "pasaporte" | "tarjeta-identidad";

/** OD-22: zona del documento de la que salen los campos. */
export type FuenteLectura = "pdf417" | "mrz-td1" | "mrz-td3";

/**
 * OD-22a: campos comunes. `nuip`, `rh` y `lugarNacimiento` solo aparecen cuando la fuente los aporta (la amarilla los
 * tres; la digital, el NUIP).
 */
export interface CamposDocumento {
  readonly numeroDocumento: string | null;
  readonly apellidos: string;
  readonly nombres: string;
  readonly fechaNacimiento: string | null;
  readonly sexo: string | null;
  readonly nacionalidad: string | null;
  readonly paisEmisor: string;
  readonly fechaVencimiento: string | null;
  readonly nuip?: string | null;
  readonly rh?: string;
  readonly lugarNacimiento?: unknown;
}

/** Errores de `leerDocumento` (entrada para `clasificarErrorLectura`, OFF-13). */
export type ErrorLectura =
  | "entrada-invalida"
  | "imagen-ilegible"
  | "mrz-no-encontrada"
  | "modelo-no-disponible"
  | "lector-terminado"
  | "fecha-referencia-invalida"
  | "pdf417-no-encontrado"
  | "pdf417-no-valido"
  | "mrz-no-valida"
  | "menor-de-edad"
  | "ti-mayor-de-edad"
  | "documento-no-admitido"
  | "cancelada"
  | "tiempo-agotado"
  | "motor";

export type ResultadoLectura =
  | {
      readonly ok: true;
      /** Obsoleto (OD-22): se conserva un ciclo; usa `tipoDocumento` y `fuente`. */
      readonly tipo: TipoLectura;
      readonly intento: string;
      /** Obsoleto (OD-22): salida del parser de la fuente; usa `campos`. */
      readonly resultado: unknown;
      readonly tipoDocumento: TipoDocumento;
      readonly fuente: FuenteLectura;
      readonly campos: CamposDocumento;
      readonly warnings: readonly string[];
      /** OD-32a: solo presente (`true`) en una CE o un pasaporte de un menor admitido con el parámetro encendido. */
      readonly menorDeEdad?: true;
    }
  | {
      readonly ok: false;
      readonly tipo?: TipoLectura;
      readonly error: ErrorLectura;
      /** OD-33: hipótesis que llevaron al rechazo (p. ej. `"T01"`). */
      readonly warnings?: readonly string[];
    };

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
  /** OFF-09: `false` devuelve los campos sin máscara (la PWA); por defecto `true` (CLI y servidor). */
  readonly enmascarar?: boolean;
  /** OFF-27 y OD-20: contenido que vio la presencia; empieza por ese lector (`"mrz"` es alias de `"mrz-td1"`). */
  readonly pista?: PistaLectura;
  /** OD-30a: admite la tarjeta de identidad y los menores (OD-32); por defecto `false` (OFF-24). */
  readonly admitirTarjetaIdentidad?: boolean;
  /** OFF-27 y OFF-28: `false` no prueba el otro lector cuando el de la pista no encuentra nada. */
  readonly respaldo?: boolean;
}
