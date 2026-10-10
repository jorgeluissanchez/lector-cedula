/**
 * Contrato del motor en proceso (MOT-01, MOT-04, MOT-05): lo implementa `@lector-cedula/motor` y lo consume
 * `@lector-cedula/servidor` (que lo carga como peerDependency opcional o lo recibe inyectado). Aquí solo hay tipos y la
 * clase de error, para que ninguno de los dos paquetes dependa del otro en tiempo de compilación.
 */

/** D3 de design.md: mismos códigos en Node, Java y Go. */
export const CODIGOS_ERROR_MOTOR = [
  "formato-no-soportado",
  "imagen-demasiado-grande",
  "tiempo-agotado",
  "motor-ocupado",
  "motor-cerrado",
  "motor-error-interno",
  "recurso-corrupto",
  "cancelado",
  "opciones-invalidas",
] as const;
export type CodigoErrorMotor = (typeof CODIGOS_ERROR_MOTOR)[number];

const CODIGOS: ReadonlySet<string> = new Set(CODIGOS_ERROR_MOTOR);

export class ErrorMotor extends Error {
  readonly codigo: CodigoErrorMotor;
  constructor(codigo: CodigoErrorMotor) {
    // El mensaje es el código: nunca lleva datos de la imagen ni del documento (MOT-08).
    super(codigo);
    this.name = "ErrorMotor";
    this.codigo = codigo;
  }
}

/** Código de un error del motor (también si cruzó un hilo y perdió su clase); `null` si no es un error del motor. */
export function codigoErrorMotor(error: unknown): CodigoErrorMotor | null {
  if (typeof error !== "object" || error === null) return null;
  const codigo = (error as { codigo?: unknown }).codigo;
  return typeof codigo === "string" && CODIGOS.has(codigo) ? (codigo as CodigoErrorMotor) : null;
}

export type NivelRiesgo = "bajo" | "medio" | "alto";

/** Señal de riesgo de `@lector-cedula/fraud` (estructura mínima que usa el servidor). */
export interface RiesgoMotor {
  readonly nivel: NivelRiesgo;
  readonly [clave: string]: unknown;
}

/** Lectura correcta: la salida unificada de `leerDocumento` de `@lector-cedula/capture` (OD-22) sin máscara. */
export interface LecturaMotorOk {
  readonly ok: true;
  readonly tipo?: string;
  readonly intento?: string;
  readonly resultado?: unknown;
  readonly tipoDocumento: string;
  readonly fuente: string;
  /** `CamposDocumento` de OD-22a (`nuip`, `apellidos`, `nombres`, `fechaNacimiento`, `sexo`, `rh`...). */
  readonly campos: object;
  readonly warnings: readonly string[];
  readonly menorDeEdad?: true;
}

/**
 * Lectura sin documento válido. Códigos: `sin-lectura` (no se encontró ni PDF417 ni MRZ, o la imagen es ilegible),
 * `pdf417-no-valido`, `mrz-no-valida`, `menor-de-edad`, `ti-mayor-de-edad`, `documento-no-admitido`.
 */
export interface LecturaMotorFallida {
  readonly ok: false;
  readonly error: { readonly codigo: string };
}

/** RESULTADO de la spec: `confiable` siempre `false` en el motor; `riesgo` `null` con `fraude: false` o sin lectura. */
export type ResultadoMotor = (LecturaMotorOk | LecturaMotorFallida) & {
  readonly confiable: false;
  readonly riesgo: RiesgoMotor | null;
};

export interface OpcionesLecturaMotor {
  readonly senal?: AbortSignal;
  /** MOT-09: `false` omite el análisis de fraude y devuelve `riesgo: null`. */
  readonly fraude?: boolean;
  /** OD-30a: admite la tarjeta de identidad y los menores. */
  readonly admitirTarjetaIdentidad?: boolean;
  /** `AAAA-MM-DD` en America/Bogota; por omisión, hoy. */
  readonly fechaReferencia?: string;
  /** MOT-07: pone a cero el búfer recibido al terminar. */
  readonly borrarEntrada?: boolean;
  readonly tiempoMaximoMs?: number;
  /** Progreso en [0, 1] durante la lectura (sin datos). */
  readonly alProgreso?: (progreso: number) => void;
}

export interface MotorLector {
  leerDocumento(imagen: Uint8Array, opciones?: OpcionesLecturaMotor): Promise<ResultadoMotor>;
  cerrar(): Promise<void>;
}
