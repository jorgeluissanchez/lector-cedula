// Lugar de nacimiento con DIVIPOL (OFF-08, LPI-08): `{ codigo, departamento, municipio }` o `null` con el warning
// `lugar-nacimiento-no-resuelto`. No se enmascara. Compartido con tools/leer-foto.mjs.
// DC-08 (divipol-consulados-2018): si la búsqueda principal no encuentra el código o es un consulado renombrado,
// se consulta el módulo de consulados 2018 (CC BY-SA 4.0, Registraduría) para mostrar el nombre vigente.
import type { buscarDivipol } from "@lector-cedula/parsers";
import {
  buscarConsulado2018,
  RENOMBRADOS_2018,
} from "@lector-cedula/parsers/divipol-2018";

export const AVISO_LUGAR_NO_RESUELTO = "lugar-nacimiento-no-resuelto";

interface ConCampos {
  readonly campos: {
    readonly codigoDepartamentoNacimiento?: unknown;
    readonly codigoMunicipioNacimiento?: unknown;
  };
  readonly warnings?: readonly string[];
}

/** DC-08: el módulo 2018 se consulta si el principal no encuentra el código o si es un consulado renombrado. */
function resolver(
  codigo: string,
  buscar: typeof buscarDivipol,
): ReturnType<typeof buscarDivipol> {
  const principal = buscar(codigo);
  if (principal.encontrado && !RENOMBRADOS_2018.includes(codigo))
    return principal;
  const vigente = buscarConsulado2018(codigo);
  return vigente.encontrado ? vigente : principal;
}

export function conLugarNacimiento<T extends ConCampos>(
  resultado: T,
  buscar: typeof buscarDivipol,
): T {
  const { codigoDepartamentoNacimiento: d, codigoMunicipioNacimiento: m } =
    resultado.campos;
  const r =
    typeof d === "string" && typeof m === "string"
      ? resolver(d + m, buscar)
      : null;
  if (r?.encontrado === true) {
    return {
      ...resultado,
      campos: {
        ...resultado.campos,
        lugarNacimiento: {
          codigo: r.codigo,
          departamento: r.departamento,
          municipio: r.municipio,
        },
      },
    };
  }
  const warnings = [...(resultado.warnings ?? []), AVISO_LUGAR_NO_RESUELTO];
  return {
    ...resultado,
    campos: { ...resultado.campos, lugarNacimiento: null },
    warnings,
  };
}
