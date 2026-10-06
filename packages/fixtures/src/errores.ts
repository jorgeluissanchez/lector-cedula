/** Códigos de `ErrorFixture` (FX-03). */
export type CodigoErrorFixture =
  | "persona-invalida"
  | "nuip-fuera-de-rango-sintetico"
  | "serial-fuera-de-rango-sintetico"
  | "nombre-invalido"
  | "nombre-demasiado-largo"
  | "sexo-invalido"
  | "fecha-invalida"
  | "divipol-invalido"
  | "rh-invalido"
  | "variante-invalida"
  | "semilla-invalida"
  | "opcion-ocr-invalida"
  | "nuip-no-soportado-en-mrz"
  | "nombre-excede-mrz";

/**
 * Única excepción que lanzan los generadores (FX-03): una persona u opción fuera del contrato.
 * `campo` nombra el campo de la persona o la opción culpable, o es `null` si no aplica.
 */
export class ErrorFixture extends Error {
  override readonly name = "ErrorFixture" as const;
  /** Código estable del fallo. */
  readonly codigo: CodigoErrorFixture;
  /** Campo de la persona u opción que falló, o `null`. */
  readonly campo: string | null;

  constructor(codigo: CodigoErrorFixture, campo: string | null) {
    super(campo === null ? codigo : `${codigo} (${campo})`);
    this.codigo = codigo;
    this.campo = campo;
  }
}
