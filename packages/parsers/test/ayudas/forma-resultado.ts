/**
 * Comprobación de la forma de PA-02 (éxito) y PA-03 (error), escrita desde la spec para las pruebas de fuzz.
 * Devuelve la lista de problemas encontrados (vacía si la forma es correcta).
 */

const MOTIVOS = [
  "entrada-no-bytes",
  "opciones-invalidas",
  "entrada-vacia",
  "entrada-demasiado-larga",
  "nuip-no-encontrado",
  "nuip-invalido",
  "caracteres-invalidos-en-nombre",
  "nombres-no-reconocidos",
  "bloque-demografico-no-encontrado",
  "fecha-nacimiento-invalida",
];
const CLAVES_CAMPOS = [
  "codigoDepartamentoNacimiento",
  "codigoMunicipioNacimiento",
  "fechaNacimiento",
  "numeroDocumento",
  "primerApellido",
  "primerNombre",
  "rh",
  "segundoApellido",
  "segundoNombre",
  "sexo",
];
const CONFIANZAS = [0, 0.5, 0.6, 0.9, 1];
const RH = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const IDS_VALIDACION = ["formato-nuip", "consistencia-modos", "divipol-codigos", "divipol-existe"];
const ESTADOS = ["ok", "fallida", "no-aplica"];
/** Nombre de PA-10: letras de PA-05 separadas por un espacio simple. */
const NOMBRE = /^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]+( [A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]+)*$/;

function claves(o: object): string {
  return JSON.stringify(Object.keys(o).sort());
}

function fechaReal(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return anio >= 1900 && anio <= 2099 && d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/** Problemas de forma de un resultado de `parsearPdf417Amarilla` frente a PA-02 y PA-03. */
export function problemasDeForma(resultado: unknown): string[] {
  const p: string[] = [];
  if (typeof resultado !== "object" || resultado === null) return ["no es objeto"];
  const r = resultado as Record<string, unknown>;
  if (r.ok === false) {
    if (claves(r) !== JSON.stringify(["error", "ok"])) p.push("claves de error");
    if (!MOTIVOS.includes(r.error as string)) p.push("motivo");
    return p;
  }
  if (r.ok !== true) return ["ok no booleano"];
  const esperado = ["campos", "confianza", "fuente", "ok", "trama", "validaciones", "version", "warnings"];
  if (claves(r) !== JSON.stringify(esperado)) p.push("claves de éxito");
  if (r.version !== "cc-amarilla") p.push("version");
  if (JSON.stringify(r.fuente) !== '["pdf417"]') p.push("fuente");
  const t = r.trama as Record<string, unknown>;
  if (claves(t) !== JSON.stringify(["bloqueDemografico", "modo", "variante"])) p.push("claves de trama");
  if (!["completa", "truncada", "sin-pubdsk"].includes(t.variante as string)) p.push("variante");
  if (!["offsets", "patrones"].includes(t.modo as string)) p.push("modo");
  if (!["sexo-primero", "fecha-primero"].includes(t.bloqueDemografico as string)) p.push("bloque");
  const c = r.campos as Record<string, unknown>;
  if (claves(c) !== JSON.stringify(CLAVES_CAMPOS)) p.push("claves de campos");
  if (!/^[1-9][0-9]{4,9}$/.test(String(c.numeroDocumento))) p.push("numeroDocumento");
  for (const k of ["primerApellido", "primerNombre"]) if (!NOMBRE.test(String(c[k]))) p.push(k);
  for (const k of ["segundoApellido", "segundoNombre"]) if (c[k] !== null && !NOMBRE.test(String(c[k]))) p.push(k);
  if (c.sexo !== "M" && c.sexo !== "F") p.push("sexo");
  if (!fechaReal(String(c.fechaNacimiento))) p.push("fechaNacimiento");
  if (!RH.includes(c.rh as string)) p.push("rh");
  const dep = c.codigoDepartamentoNacimiento;
  const mun = c.codigoMunicipioNacimiento;
  if (dep !== null && !/^[0-9]{2}$/.test(String(dep))) p.push("departamento");
  if (mun !== null && !/^[0-9]{3}$/.test(String(mun))) p.push("municipio");
  const conf = r.confianza as Record<string, unknown>;
  if (claves(conf) !== JSON.stringify(CLAVES_CAMPOS)) p.push("claves de confianza");
  for (const v of Object.values(conf)) if (!CONFIANZAS.includes(v as number)) p.push("valor de confianza");
  const vals = r.validaciones as Record<string, unknown>[];
  if (!Array.isArray(vals) || vals.length !== 4) return [...p, "validaciones"];
  vals.forEach((v, i) => {
    if (claves(v) !== JSON.stringify(["campos", "detalle", "estado", "id"])) p.push("claves de validación");
    if (v.id !== IDS_VALIDACION[i]) p.push("id de validación");
    if (!ESTADOS.includes(v.estado as string)) p.push("estado");
    if (!Array.isArray(v.campos)) p.push("campos de validación");
    if (v.detalle !== null && typeof v.detalle !== "string") p.push("detalle");
  });
  const w = r.warnings as unknown[];
  if (!Array.isArray(w) || !w.every((x) => typeof x === "string" && /^[A-Z][0-9]{2}$/.test(x))) p.push("warnings");
  else if (JSON.stringify(w) !== JSON.stringify([...new Set(w)].sort())) p.push("warnings sin ordenar o duplicados");
  return p;
}
