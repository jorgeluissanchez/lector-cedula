import { type CodigoErrorFixture, ErrorFixture } from "./errores.js";

/** Sexo tal como lo codifican el PDF417 y la MRZ. */
export type Sexo = "M" | "F";

/** Grupo sanguíneo y factor RH, siempre con signo. */
export type Rh = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";

/**
 * Persona ficticia de la que se generan los fixtures (FX-04). Todos los números llevan el prefijo
 * sintético `9999`; las fechas son `YYYY-MM-DD`; `segundoNombre` vacío significa ausente.
 */
export interface PersonaFicticia {
  readonly nuip: string;
  readonly serialDocumento: string;
  readonly primerApellido: string;
  readonly segundoApellido: string;
  readonly primerNombre: string;
  /** `""` = ausente. */
  readonly segundoNombre: string;
  readonly sexo: Sexo;
  /** `YYYY-MM-DD`. */
  readonly fechaNacimiento: string;
  /** `YYYY-MM-DD`. */
  readonly fechaVencimiento: string;
  /** DIVIPOL de 2 dígitos. */
  readonly departamento: string;
  /** DIVIPOL de 3 dígitos. */
  readonly municipio: string;
  /** DIVIPOL de 5 dígitos (opcional de la línea 1 de la MRZ, M03). */
  readonly lugarExpedicion: string;
  readonly rh: Rh;
}

/** Persona ficticia de referencia de los escenarios de la spec (congelada). */
export const PERSONA_BASE: PersonaFicticia = Object.freeze({
  nuip: "9999123456",
  serialDocumento: "999912345",
  primerApellido: "PRUEBA",
  segundoApellido: "EJEMPLO",
  primerNombre: "FICTICIA",
  segundoNombre: "LUZ",
  sexo: "F",
  fechaNacimiento: "1985-03-14",
  fechaVencimiento: "2035-03-14",
  departamento: "16",
  municipio: "001",
  lugarExpedicion: "16001",
  rh: "O+",
});

/** Grupos RH admitidos. */
export const GRUPOS_RH: readonly Rh[] = Object.freeze(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);

/** Longitud máxima de cada campo de nombre (23 bytes en el PDF417, H04). */
export const LONGITUD_NOMBRE = 23;

const RE_NUIP = /^9999[0-9]{1,6}$/;
const RE_SERIAL = /^9999[0-9]{5}$/;
const RE_NOMBRE = /^[A-ZÑ]+( [A-ZÑ]+)*$/;
const RE_FECHA = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;

type Validador = (valor: unknown) => CodigoErrorFixture | null;

const segun =
  (re: RegExp, codigo: CodigoErrorFixture): Validador =>
  (v) =>
    typeof v === "string" && re.test(v) ? null : codigo;

function nombre(vacioPermitido: boolean): Validador {
  return (v) => {
    if (typeof v !== "string") return "nombre-invalido";
    if (v === "" && vacioPermitido) return null;
    if (!RE_NOMBRE.test(v)) return "nombre-invalido";
    return v.length > LONGITUD_NOMBRE ? "nombre-demasiado-largo" : null;
  };
}

const esBisiesto = (anio: number): boolean => anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0);

/** Días del mes en el calendario gregoriano. */
export function diasDelMes(anio: number, mes: number): number {
  if (mes === 2) return esBisiesto(anio) ? 29 : 28;
  return mes === 4 || mes === 6 || mes === 9 || mes === 11 ? 30 : 31;
}

/** Fecha gregoriana `YYYY-MM-DD` con año de 1900 a 2099, comprobada sin `Date` (design.md, decisión 3). */
const fecha: Validador = (v) => {
  const m = typeof v === "string" ? RE_FECHA.exec(v) : null;
  if (m === null) return "fecha-invalida";
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (anio < 1900 || anio > 2099 || mes < 1 || mes > 12 || dia < 1) return "fecha-invalida";
  return dia > diasDelMes(anio, mes) ? "fecha-invalida" : null;
};

/** Validadores en el orden de FX-03. */
const VALIDADORES: readonly (readonly [keyof PersonaFicticia, Validador])[] = [
  ["nuip", segun(RE_NUIP, "nuip-fuera-de-rango-sintetico")],
  ["serialDocumento", segun(RE_SERIAL, "serial-fuera-de-rango-sintetico")],
  ["primerApellido", nombre(false)],
  ["segundoApellido", nombre(false)],
  ["primerNombre", nombre(false)],
  ["segundoNombre", nombre(true)],
  ["sexo", (v) => (v === "M" || v === "F" ? null : "sexo-invalido")],
  ["fechaNacimiento", fecha],
  ["fechaVencimiento", fecha],
  ["departamento", segun(/^[0-9]{2}$/, "divipol-invalido")],
  ["municipio", segun(/^[0-9]{3}$/, "divipol-invalido")],
  ["lugarExpedicion", segun(/^[0-9]{5}$/, "divipol-invalido")],
  ["rh", (v) => ((GRUPOS_RH as readonly unknown[]).includes(v) ? null : "rh-invalido")],
];

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/**
 * Valida una persona recibida como `unknown` (FX-03, FX-04) y devuelve una copia congelada.
 * Lanza el primer `ErrorFixture` en el orden de FX-03.
 */
export function validarPersona(valor: unknown): PersonaFicticia {
  if (!esObjeto(valor)) throw new ErrorFixture("persona-invalida", null);
  const claves = Object.keys(valor);
  if (claves.length !== VALIDADORES.length || !VALIDADORES.every(([campo]) => Object.hasOwn(valor, campo))) {
    throw new ErrorFixture("persona-invalida", null);
  }
  const copia: Record<string, unknown> = {};
  for (const [campo, validar] of VALIDADORES) {
    const codigo = validar(valor[campo]);
    if (codigo !== null) throw new ErrorFixture(codigo, campo);
    copia[campo] = valor[campo];
  }
  return Object.freeze(copia) as unknown as PersonaFicticia;
}
