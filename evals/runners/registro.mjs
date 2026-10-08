/**
 * Registro de evaluadores: tipo de fixture -> función de un parser compilado.
 *
 * Cada entrada:
 *   modulo:   ruta desde la raíz del repo al módulo compilado (dist/), p. ej. "packages/parsers/dist/index.js"
 *   exportar: nombre de la función exportada que recibe `entrada` del fixture
 *   adaptar:  (opcional) transforma el resultado al objeto plano que se compara con `esperado`
 *
 * Al añadir un parser nuevo, regístralo aquí y añade fixtures en evals/fixtures/<tipo>/.
 */
export const EVALUADORES = {
  // Cambio parser-pdf417-amarilla (design.md, decisión 15): entrada hexadecimal y resultado aplanado.
  "pdf417-amarilla": { modulo: "evals/runners/adaptadores/pdf417-amarilla.mjs", exportar: "evaluarPdf417AmarillaHex" },
  "nuip-formato": { modulo: "packages/parsers/dist/index.js", exportar: "validarFormatoNuip" },
  "mrz-cedula-digital": { modulo: "packages/parsers/dist/index.js", exportar: "parsearMrzCedulaDigital", adaptar: aplanarMrz },
  // Cambio otros-documentos (OD-01 a OD-05a y OD-10 a OD-12).
  "mrz-td3": { modulo: "packages/parsers/dist/index.js", exportar: "parsearMrzTd3", adaptar: aplanarMrzIcao },
  "clasificar-documento": { modulo: "packages/parsers/dist/index.js", exportar: "clasificarDocumento", adaptar: aplanarClasificacion },
};

/**
 * Adaptador de `parsearMrzTd3` y `parsearMrzTd1` (cambio otros-documentos): rechazo `{ ok, error }` (y los estados
 * de los dígitos si `error` es `digito-control`); éxito con `campos`, nombres de país, estado de cada dígito,
 * número de correcciones y `warnings` unidos con ",".
 */
export function aplanarMrzIcao(r) {
  const digitos = (d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [`cd_${k}`, v]));
  if (!r.ok) return { ok: false, error: r.error, ...(r.digitosControl ? digitos(r.digitosControl) : {}) };
  return {
    ok: true,
    ...r.campos,
    nombrePaisEmisor: r.nombrePaisEmisor,
    nombreNacionalidad: r.nombreNacionalidad,
    ...digitos(r.digitosControl),
    correcciones: r.correcciones.length,
    warnings: r.warnings.join(","),
  };
}

/** Adaptador de `clasificarDocumento`: tipo, fuente, número, nacionalidad y warnings, o el error. */
export function aplanarClasificacion(r) {
  if (!r.ok) return { ok: false, error: r.error, warnings: (r.warnings ?? []).join(",") };
  return {
    ok: true,
    tipoDocumento: r.tipoDocumento,
    fuente: r.fuente,
    numeroDocumento: r.campos.numeroDocumento,
    nacionalidad: r.campos.nacionalidad,
    apellidos: r.campos.apellidos,
    nombres: r.campos.nombres,
    warnings: r.warnings.join(","),
  };
}

/**
 * Adaptador del parser MRZ de la cédula digital (cambio parser-mrz-cedula-digital, design.md decisión 12): resultado
 * plano para que exact match y CER se midan por campo. Rechazo: `{ ok, motivo, linea }` (`linea` `null` si no
 * aplica). Aceptado: `ok`, `valido`, las 11 claves de `campos`, el estado de cada dígito de control, el número de
 * correcciones y `errores` y `warnings` unidos con ",".
 */
export function aplanarMrz(r) {
  if (!r.ok) return { ok: false, motivo: r.motivo, linea: "linea" in r ? r.linea : null };
  const d = r.digitosControl;
  return {
    ok: true,
    valido: r.valido,
    ...r.campos,
    cdSerial: d.serial.estado,
    cdNacimiento: d.nacimiento.estado,
    cdVencimiento: d.vencimiento.estado,
    cdCompuesto: d.compuesto.estado,
    correcciones: r.correcciones.length,
    errores: r.errores.join(","),
    warnings: r.warnings.join(","),
  };
}
