/**
 * Ensamblaje del resultado (PA-02, PA-07, PA-15, PA-17 a PA-19; design.md, decisiones 8, 9, 11 y 12):
 * elección de modo, confianza por campo, las cuatro validaciones, `warnings` y la consulta al resolutor DIVIPOL.
 */
import type {
  CampoCedulaAmarilla,
  ConfianzaCampo,
  ModoLecturaPdf417,
  ResolutorDivipol,
  ResultadoPdf417Amarilla,
  ValidacionPdf417,
  VarianteTramaPdf417,
} from "./index.js";
import type { LecturaPdf417, ResultadoLector } from "./lectura.js";

/** Orden de `campos` (PA-02); también el de los campos discrepantes de `consistencia-modos` (PA-18). */
const CAMPOS: readonly CampoCedulaAmarilla[] = [
  "numeroDocumento",
  "primerApellido",
  "segundoApellido",
  "primerNombre",
  "segundoNombre",
  "sexo",
  "fechaNacimiento",
  "rh",
  "codigoDepartamentoNacimiento",
  "codigoMunicipioNacimiento",
];
/** Campos que la asignación H15 decide en modo patrones (PA-10, PA-17). */
const CAMPOS_H15: readonly CampoCedulaAmarilla[] = ["segundoApellido", "primerNombre", "segundoNombre"];
/** Forma de un ID de hipótesis que se copia del resolutor (decisión 11). */
const ID_HIPOTESIS = /^[A-Z][0-9]{2}$/;

type Estado = ValidacionPdf417["estado"];

interface RespuestaResolutor {
  estado: Estado;
  detalle: string | null;
  ids: string[];
}

const ERROR_RESOLUTOR: RespuestaResolutor = { estado: "no-aplica", detalle: "error-resolutor", ids: [] };

function camposDivipol(): CampoCedulaAmarilla[] {
  return ["codigoDepartamentoNacimiento", "codigoMunicipioNacimiento"];
}

function validacion(
  id: ValidacionPdf417["id"],
  estado: Estado,
  campos: CampoCedulaAmarilla[],
  detalle: string | null,
): ValidacionPdf417 {
  return { id, estado, campos, detalle };
}

/** IDs bien formados de `warnings` de la respuesta; cualquier otra cosa se ignora. */
function idsHipotesis(warnings: unknown): string[] {
  if (!Array.isArray(warnings)) return [];
  return warnings.filter((w): w is string => typeof w === "string" && ID_HIPOTESIS.test(w));
}

/**
 * Llama una vez al resolutor con el código de 5 dígitos y traduce su respuesta sin confiar en su forma
 * (decisión 12): `encontrado === true` es `ok`; `false` con motivo `desconocido` o `sin-dato` se traduce;
 * cualquier otra cosa, o una excepción, es `error-resolutor` y no aporta IDs.
 */
function consultarResolutor(resolutor: ResolutorDivipol, codigo: string): RespuestaResolutor {
  try {
    const respuesta: unknown = resolutor(codigo);
    if (typeof respuesta !== "object" || respuesta === null) return ERROR_RESOLUTOR;
    const leida = respuesta as { encontrado?: unknown; motivo?: unknown; warnings?: unknown };
    const encontrado = leida.encontrado;
    let estado: Estado;
    let detalle: string | null = null;
    if (encontrado === true) {
      estado = "ok";
    } else if (encontrado === false) {
      const motivo = leida.motivo;
      if (motivo === "desconocido") estado = "fallida";
      else if (motivo === "sin-dato") estado = "no-aplica";
      else return ERROR_RESOLUTOR;
      detalle = motivo;
    } else {
      return ERROR_RESOLUTOR;
    }
    return { estado, detalle, ids: idsHipotesis(leida.warnings) };
  } catch {
    return ERROR_RESOLUTOR;
  }
}

function confianzaCampo(
  campo: CampoCedulaAmarilla,
  lectura: LecturaPdf417,
  modo: ModoLecturaPdf417,
  comparada: LecturaPdf417 | null,
): ConfianzaCampo {
  if (lectura.campos[campo] === null && !CAMPOS_H15.includes(campo)) return 0;
  if (comparada !== null) return lectura.campos[campo] === comparada.campos[campo] ? 1 : 0.5;
  return modo === "patrones" && lectura.nombresPorH15 && CAMPOS_H15.includes(campo) ? 0.6 : 0.9;
}

function consistencia(
  variante: VarianteTramaPdf417,
  offsets: LecturaPdf417 | null,
  patrones: ResultadoLector,
  discrepantes: CampoCedulaAmarilla[],
): ValidacionPdf417 {
  const id = "consistencia-modos";
  if (variante !== "completa") return validacion(id, "no-aplica", [], "trama-no-completa");
  if (offsets === null) return validacion(id, "no-aplica", [], "offsets-sin-resultado");
  if (!patrones.ok) return validacion(id, "no-aplica", [], "patrones-sin-resultado");
  return discrepantes.length > 0 ? validacion(id, "fallida", discrepantes, null) : validacion(id, "ok", [], null);
}

function divipolCodigos(lectura: LecturaPdf417): ValidacionPdf417 {
  const id = "divipol-codigos";
  if (lectura.divipol === "ok") return validacion(id, "ok", camposDivipol(), null);
  const estado = lectura.divipol === "longitud-inesperada" ? "fallida" : "no-aplica";
  return validacion(id, estado, camposDivipol(), lectura.divipol);
}

/** Hipótesis no confirmadas que aplicó el camino entregado (PA-19). */
function hipotesisDelCamino(variante: VarianteTramaPdf417, modo: ModoLecturaPdf417, lectura: LecturaPdf417): string[] {
  const ids: string[] = [];
  if (variante === "truncada") ids.push("H02");
  if (variante === "sin-pubdsk") ids.push("H07");
  if (lectura.bloque === "fecha-primero") ids.push("H08");
  if (modo === "patrones" && lectura.nombresPorH15) ids.push("H15");
  return ids;
}

/**
 * Compone el resultado. `offsets` es la lectura por offsets (solo en la trama completa; `null` si no hubo o
 * falló) y prevalece; si falta, se usa la de patrones, y si esta también falla, su error.
 */
export function ensamblar(
  variante: VarianteTramaPdf417,
  offsets: LecturaPdf417 | null,
  patrones: ResultadoLector,
  resolutor: ResolutorDivipol | undefined,
): ResultadoPdf417Amarilla {
  let lectura: LecturaPdf417;
  let modo: ModoLecturaPdf417;
  if (offsets !== null) {
    lectura = offsets;
    modo = "offsets";
  } else if (patrones.ok) {
    lectura = patrones.lectura;
    modo = "patrones";
  } else {
    return { ok: false, error: patrones.error };
  }

  const comparada = offsets !== null && patrones.ok ? patrones.lectura : null;
  const discrepantes = comparada === null ? [] : CAMPOS.filter((c) => lectura.campos[c] !== comparada.campos[c]);
  const confianza = {} as Record<CampoCedulaAmarilla, ConfianzaCampo>;
  for (const campo of CAMPOS) confianza[campo] = confianzaCampo(campo, lectura, modo, comparada);

  const { codigoDepartamentoNacimiento: departamento, codigoMunicipioNacimiento: municipio } = lectura.campos;
  let existe: RespuestaResolutor;
  if (departamento === null || municipio === null) existe = { estado: "no-aplica", detalle: "sin-codigos", ids: [] };
  else if (resolutor === undefined) existe = { estado: "no-aplica", detalle: "sin-resolutor", ids: [] };
  else existe = consultarResolutor(resolutor, departamento + municipio);

  const warnings = [...new Set([...existe.ids, ...hipotesisDelCamino(variante, modo, lectura)])].sort();

  return {
    ok: true,
    version: "cc-amarilla",
    fuente: ["pdf417"],
    trama: { variante, modo, bloqueDemografico: lectura.bloque },
    campos: lectura.campos,
    confianza,
    validaciones: [
      validacion("formato-nuip", "ok", ["numeroDocumento"], lectura.tipoNuip),
      consistencia(variante, offsets, patrones, discrepantes),
      divipolCodigos(lectura),
      validacion("divipol-existe", existe.estado, camposDivipol(), existe.detalle),
    ],
    warnings,
  };
}
