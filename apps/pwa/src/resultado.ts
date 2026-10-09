/**
 * Campos visibles de la pantalla `resultado` (OFF-09, OFF-18): etiqueta fija y valor tal como lo devuelve el Worker
 * lector (completo en la PWA, OFF-09). Solo se muestran campos de texto con valor; las líneas MRZ y las correcciones nunca se muestran.
 * otros-documentos (OD-22a, OD-23): la etiqueta del documento sale de `tipoDocumento`; la cédula de ciudadanía y la TI
 * conservan los campos de su fuente (PDF417 o MRZ de la digital) y el pasaporte y la CE muestran los campos comunes.
 */
import type { TipoDocumento } from "@lector-cedula/capture";
import type { LecturaCorrecta } from "./estado";

export interface CampoVisible {
  readonly clave: string;
  readonly etiqueta: string;
  readonly valor: string;
}

/** OD-23: etiquetas literales de la spec. */
export const ETIQUETAS_DOCUMENTO: Readonly<Record<TipoDocumento, string>> = Object.freeze({
  "cedula-ciudadania": "Cédula de ciudadanía",
  "cedula-extranjeria": "Cédula de extranjería",
  pasaporte: "Pasaporte",
  "tarjeta-identidad": "Tarjeta de identidad",
});

/** Título del resultado: el documento y, solo en la cédula de ciudadanía, su variante (amarilla o digital). */
export function tituloResultado(lectura: LecturaCorrecta): { readonly documento: string; readonly variante: string | null } {
  const documento = ETIQUETAS_DOCUMENTO[lectura.tipoDocumento];
  if (lectura.tipoDocumento !== "cedula-ciudadania") return { documento, variante: null };
  return { documento, variante: lectura.fuente === "pdf417" ? "Cédula amarilla" : "Cédula digital" };
}

const PDF417: readonly (readonly [string, string])[] = [
  ["numeroDocumento", "Número de documento"],
  ["primerApellido", "Primer apellido"],
  ["segundoApellido", "Segundo apellido"],
  ["primerNombre", "Primer nombre"],
  ["segundoNombre", "Segundo nombre"],
  ["sexo", "Sexo"],
  ["fechaNacimiento", "Fecha de nacimiento"],
  ["rh", "RH"],
];

const MRZ: readonly (readonly [string, string])[] = [
  ["nuip", "Número de documento"],
  ["serial", "Serial"],
  ["apellidos", "Apellidos"],
  ["nombres", "Nombres"],
  ["sexo", "Sexo"],
  ["fechaNacimiento", "Fecha de nacimiento"],
  ["fechaVencimiento", "Fecha de vencimiento"],
  ["nacionalidad", "Nacionalidad"],
];

/** OD-22a: campos comunes del pasaporte y la CE (sin RH ni NUIP). */
const COMUNES: readonly (readonly [string, string])[] = [
  ["numeroDocumento", "Número de documento"],
  ["apellidos", "Apellidos"],
  ["nombres", "Nombres"],
  ["sexo", "Sexo"],
  ["fechaNacimiento", "Fecha de nacimiento"],
  ["fechaVencimiento", "Fecha de vencimiento"],
  ["nacionalidad", "Nacionalidad"],
  ["paisEmisor", "País emisor"],
];

function deTexto(campos: Record<string, unknown>, lista: readonly (readonly [string, string])[]): CampoVisible[] {
  const salida: CampoVisible[] = [];
  for (const [clave, etiqueta] of lista) {
    const valor = campos[clave];
    if (typeof valor === "string" && valor !== "") salida.push({ clave, etiqueta, valor });
  }
  return salida;
}

export function camposVisibles(lectura: LecturaCorrecta): CampoVisible[] {
  if (lectura.tipoDocumento === "pasaporte" || lectura.tipoDocumento === "cedula-extranjeria")
    return deTexto(lectura.campos as unknown as Record<string, unknown>, COMUNES);
  const campos = (lectura.resultado as { campos?: Record<string, unknown> } | null)?.campos;
  if (campos === undefined) return [];
  const salida = deTexto(campos, lectura.tipo === "pdf417" ? PDF417 : MRZ);
  if (lectura.tipo === "pdf417" && "lugarNacimiento" in campos) {
    const l = campos.lugarNacimiento as { municipio?: string; departamento?: string } | null;
    salida.push({ clave: "lugarNacimiento", etiqueta: "Lugar de nacimiento", valor: l === null ? "No resuelto" : `${l.municipio ?? ""}, ${l.departamento ?? ""}` });
  }
  return salida;
}
