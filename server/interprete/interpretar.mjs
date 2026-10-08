// Intérprete del motor real del servidor (cambio motor-real-servidor, MS-01 y decisión 1).
//
// Lee una sola petición JSON de la entrada estándar, la interpreta con los parsers TypeScript del
// repositorio (@lector-cedula/parsers, compilados en la imagen) y escribe una sola respuesta JSON en la
// salida estándar. No abre archivos, no usa red y no escribe nada en la salida de errores: el proceso
// vive solo durante una subida y sus datos solo pasan por tuberías (principio III).
//
// Entrada:  {"fuente": "pdf417", "datos_b64": "<base64>"}
//           {"fuente": "mrz", "lineas": [l1, l2, l3], "fecha_referencia": "YYYY-MM-DD"}
// Salida:   {"ok": false, "motivo": "<motivo del parser>"} o el resultado del parser sin los datos crudos.
//
// Lugar de nacimiento (divipol-consulados-2018, DC-14): misma resolución que la CLI y la PWA (`conLugarNacimiento` de
// packages/capture), que usa datos del DANE y de la Registraduría bajo CC BY-SA 4.0; atribución en
// /srv/licencias/parsers-THIRD_PARTY_NOTICES.md.
import { pathToFileURL } from "node:url";

const MAX_ENTRADA = 16_384;
const rutaParsers = process.env.RUTA_PARSERS ?? "/srv/parsers/dist/index.js";
const rutaLugar = process.env.RUTA_LUGAR ?? "/srv/lector/node_modules/@lector-cedula/capture/dist/lectura/lugar.js";

async function leerEntrada() {
  let texto = "";
  for await (const trozo of process.stdin) {
    texto += trozo;
    if (texto.length > MAX_ENTRADA) return null;
  }
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

// Minimización (revisión de privacidad): solo los campos que usa el documento del contrato.
const CAMPOS_PDF417 = [
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
const CAMPOS_MRZ = ["nuip", "apellidos", "nombres", "sexo", "fechaNacimiento", "fechaVencimiento"];

function proyectar(campos, claves) {
  return Object.fromEntries(claves.map((c) => [c, campos[c] ?? null]));
}

function interpretarPdf417(parsers, lugar, peticion) {
  if (typeof peticion.datos_b64 !== "string") return { ok: false, motivo: "entrada-no-valida" };
  const bytes = new Uint8Array(Buffer.from(peticion.datos_b64, "base64"));
  const r = parsers.parsearPdf417Amarilla(bytes, { divipol: parsers.buscarDivipol });
  if (!r.ok) return { ok: false, motivo: r.error };
  return {
    ok: true,
    campos: proyectar(r.campos, CAMPOS_PDF417),
    validaciones: r.validaciones.map((v) => ({ id: v.id, estado: v.estado })),
    warnings: r.warnings,
    lugar_nacimiento: lugar.conLugarNacimiento(r, parsers.buscarDivipol).campos.lugarNacimiento,
  };
}

function interpretarMrz(parsers, peticion) {
  const r = parsers.parsearMrzCedulaDigital(peticion.lineas, { fechaReferencia: peticion.fecha_referencia });
  if (!r.ok) return { ok: false, motivo: r.motivo };
  const d = r.digitosControl;
  return {
    ok: true,
    valido: r.valido,
    campos: proyectar(r.campos, CAMPOS_MRZ),
    digitos_control: {
      serial: d.serial.estado,
      nacimiento: d.nacimiento.estado,
      vencimiento: d.vencimiento.estado,
      compuesto: d.compuesto.estado,
    },
    errores: r.errores,
    warnings: r.warnings,
  };
}

async function principal() {
  const peticion = await leerEntrada();
  const parsers = await import(pathToFileURL(rutaParsers).href);
  const lugar = await import(pathToFileURL(rutaLugar).href);
  let salida;
  if (peticion === null || typeof peticion !== "object") salida = { ok: false, motivo: "entrada-no-valida" };
  else if (peticion.fuente === "pdf417") salida = interpretarPdf417(parsers, lugar, peticion);
  else if (peticion.fuente === "mrz") salida = interpretarMrz(parsers, peticion);
  else salida = { ok: false, motivo: "fuente-desconocida" };
  process.stdout.write(JSON.stringify(salida));
}

// Cualquier fallo (por ejemplo, parsers no cargables) sale como respuesta fija y código 1, sin mensaje ni
// traza en la salida de errores: el mensaje podría llevar datos (revisión de privacidad).
try {
  await principal();
} catch {
  process.stdout.write(JSON.stringify({ ok: false, motivo: "error-interno" }));
  process.exitCode = 1;
}
