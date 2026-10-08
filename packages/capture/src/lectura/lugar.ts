// Lugar de nacimiento con DIVIPOL (OFF-08, LPI-08): `{ codigo, departamento, municipio }` o `null` con el warning
// `lugar-nacimiento-no-resuelto`. No se enmascara. Compartido con tools/leer-foto.mjs.
import type { buscarDivipol } from "@lector-cedula/parsers";

export const AVISO_LUGAR_NO_RESUELTO = "lugar-nacimiento-no-resuelto";

interface ConCampos {
  readonly campos: { readonly codigoDepartamentoNacimiento?: unknown; readonly codigoMunicipioNacimiento?: unknown };
  readonly warnings?: readonly string[];
}

export function conLugarNacimiento<T extends ConCampos>(resultado: T, buscar: typeof buscarDivipol): T {
  const { codigoDepartamentoNacimiento: d, codigoMunicipioNacimiento: m } = resultado.campos;
  const r = typeof d === "string" && typeof m === "string" ? buscar(d + m) : null;
  if (r?.encontrado === true) {
    return { ...resultado, campos: { ...resultado.campos, lugarNacimiento: { codigo: r.codigo, departamento: r.departamento, municipio: r.municipio } } };
  }
  const warnings = [...(resultado.warnings ?? []), AVISO_LUGAR_NO_RESUELTO];
  return { ...resultado, campos: { ...resultado.campos, lugarNacimiento: null }, warnings };
}
