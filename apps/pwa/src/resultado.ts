/**
 * Campos visibles de la pantalla `resultado` (OFF-09, OFF-18): etiqueta fija y valor tal como lo devuelve el Worker
 * lector (completo en la PWA, OFF-09). Solo se muestran campos de texto con valor; las líneas MRZ y las correcciones nunca se muestran.
 */
import type { LecturaCorrecta } from "./estado";

export interface CampoVisible {
  readonly clave: string;
  readonly etiqueta: string;
  readonly valor: string;
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

export function camposVisibles(lectura: LecturaCorrecta): CampoVisible[] {
  const campos = (lectura.resultado as { campos?: Record<string, unknown> } | null)?.campos;
  if (campos === undefined) return [];
  const salida: CampoVisible[] = [];
  for (const [clave, etiqueta] of lectura.tipo === "pdf417" ? PDF417 : MRZ) {
    const valor = campos[clave];
    if (typeof valor === "string" && valor !== "") salida.push({ clave, etiqueta, valor });
  }
  if (lectura.tipo === "pdf417" && "lugarNacimiento" in campos) {
    const l = campos.lugarNacimiento as { municipio?: string; departamento?: string } | null;
    salida.push({ clave: "lugarNacimiento", etiqueta: "Lugar de nacimiento", valor: l === null ? "No resuelto" : `${l.municipio ?? ""}, ${l.departamento ?? ""}` });
  }
  return salida;
}
