// Tipos de la lectura en el dispositivo (cambio pwa-lectura-offline, OFF-06 a OFF-13).
import type {
  buscarDivipol,
  parsearPdf417Amarilla,
  Rh,
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

/** SDK-65: fecha del calendario como `AAAA-MM-DD` (alias documentado de `string`, sin hora ni zona). */
export type FechaIso = string;

/** SDK-65: sexo del documento. `X` (no especificado) solo lo da la cédula digital (MZ-14); la amarilla da `M` o `F`. */
export type SexoDocumento = "M" | "F" | "X";

/** SDK-65: lugar de nacimiento de la amarilla según DIVIPOL o los consulados 2018 (OFF-08, DC-08). */
export interface LugarNacimiento {
  /** 5 dígitos DIVIPOL (departamento y municipio). */
  readonly codigo: string;
  readonly departamento: string;
  readonly municipio: string;
}

export type { Rh };

/**
 * OD-22a y SDK-65: campos comunes. `nuip`, `rh` y `lugarNacimiento` solo aparecen cuando la fuente los aporta (la
 * amarilla y la TI por PDF417 los tres; la digital, el NUIP; CE y pasaporte, ninguno).
 */
export interface CamposDocumento {
  /** Enmascarado (`********56`) salvo con `enmascarar: false`. */
  readonly numeroDocumento: string | null;
  readonly apellidos: string;
  readonly nombres: string;
  readonly fechaNacimiento: FechaIso | null;
  readonly sexo: SexoDocumento | null;
  /** Código ICAO tal como viene en la MRZ (p. ej. `"COL"`, `"VEN"`, `"D"`); `"COL"` en la amarilla. */
  readonly nacionalidad: string | null;
  /** `"COL"` en las cédulas; el estado emisor ICAO en CE y pasaporte. */
  readonly paisEmisor: string;
  readonly fechaVencimiento: FechaIso | null;
  readonly nuip?: string | null;
  readonly rh?: Rh;
  /** `null` si el código no se resuelve (aviso `lugar-nacimiento-no-resuelto`). */
  readonly lugarNacimiento?: LugarNacimiento | null;
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
  /** OFF-27c: esta lectura es el respaldo de una pista `"pdf417"` hecho en una llamada aparte (la PWA, OFF-28 c). */
  readonly respaldoDe?: "pdf417";
}
