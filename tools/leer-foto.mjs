#!/usr/bin/env node
// Lee la cédula desde una foto local (cambios leer-pdf417-desde-imagen y leer-mrz-desde-imagen, LPI-06 y LPI-07):
// prueba primero el PDF417 de la amarilla y, si no lo hay, la MRZ TD1 del reverso de la digital.
// Uso: npm run leer-foto -- [--sin-mascara] [--fecha-referencia AAAA-MM-DD] <ruta>
// Privacidad (principio III): la imagen solo se lee a memoria; no se escribe nada a disco, no hay telemetría y stdout
// solo lleva el JSON final. Por defecto enmascara NUIP y nombres. Rechaza rutas del repositorio salvo evals/real/.
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
// Máscara y lugar de nacimiento compartidos con la PWA (pwa-lectura-offline, OFF-08 y OFF-09).
import { conLugarNacimiento, crearLectorMrz, decodificarPdf417Imagen, enmascararCamposPdf417, enmascararResultadoMrz } from "../packages/capture/dist/index.js";
import { buscarDivipol, parsearPdf417Amarilla } from "../packages/parsers/dist/index.js";

const USO = "uso: npm run leer-foto -- [--sin-mascara] [--fecha-referencia AAAA-MM-DD] <ruta-de-la-foto>";
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Mensajes de error sin la ruta ni el contenido (LPI-06). */
function fallarUso(motivo) {
  process.stderr.write(`leer-foto: ${motivo}\n${USO}\n`);
  process.exitCode = 64;
}

function emitir(objeto, codigo) {
  process.stdout.write(`${JSON.stringify(objeto)}\n`);
  process.exitCode = codigo;
}

/** Fecha actual en America/Bogota como AAAA-MM-DD. */
function hoyEnBogota() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Separa opciones y rutas; devuelve `{ error }` ante uso incorrecto. */
function leerArgumentos(argv) {
  const r = { conMascara: true, fechaReferencia: null, rutas: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sin-mascara") r.conMascara = false;
    else if (a === "--fecha-referencia") {
      const f = argv[++i];
      if (typeof f !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(f)) return { error: "fecha-referencia-invalida" };
      r.fechaReferencia = f;
    } else if (a.startsWith("--")) return { error: "opcion-desconocida" };
    else r.rutas.push(a);
  }
  if (r.rutas.length !== 1) return { error: r.rutas.length === 0 ? "falta-ruta" : "demasiadas-rutas" };
  return r;
}

async function leerMrz(bytes, fechaReferencia, conMascara) {
  const rutaModelo = process.env.LECTOR_CEDULA_RUTA_MODELO_MRZ || join(RAIZ, "models", "tesseract");
  const lector = crearLectorMrz({ rutaModelo });
  let lectura;
  try {
    lectura = await lector.leer(bytes, { fechaReferencia });
  } finally {
    await lector.terminar();
  }
  if (!lectura.ok) {
    if (lectura.error === "modelo-no-disponible") {
      process.stderr.write("leer-foto: modelo MRZ no disponible; ejecuta npm run modelos:mrz\n");
      return emitir({ ok: false, tipo: "mrz", error: "modelo-no-disponible" }, 3);
    }
    if (lectura.error === "fecha-referencia-invalida") return fallarUso("fecha-referencia-invalida");
    if (lectura.error === "mrz-no-encontrada") return emitir({ ok: false, error: "documento-no-encontrado" }, 1);
    return emitir({ ok: false, error: "imagen-ilegible" }, 1);
  }
  const { resultado } = lectura;
  if (!resultado.valido) return emitir({ ok: false, tipo: "mrz", error: "mrz-no-valida", digitosValidos: lectura.digitosValidos }, 2);
  const salida = conMascara ? enmascararResultadoMrz(resultado) : resultado;
  return emitir({ ok: true, tipo: "mrz", intento: lectura.intento, enmascarado: conMascara, resultado: salida }, 0);
}

async function principal(argv) {
  const args = leerArgumentos(argv);
  if (args.error) return fallarUso(args.error);
  const { conMascara, rutas } = args;

  let real;
  try {
    real = await realpath(rutas[0]);
  } catch {
    return fallarUso("archivo-ilegible");
  }
  const raiz = await realpath(RAIZ);
  const rel = relative(raiz, real);
  const dentro = rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
  const enEvalsReal = rel.startsWith(`evals${sep}real${sep}`);
  if (dentro && !enEvalsReal) return fallarUso("ruta-dentro-del-repo");

  let bytes;
  try {
    bytes = new Uint8Array(await readFile(real));
  } catch {
    return fallarUso("archivo-ilegible");
  }

  const imagen = await decodificarPdf417Imagen(bytes);
  if (!imagen.ok && imagen.error === "pdf417-no-encontrado") {
    try {
      return await leerMrz(bytes, args.fechaReferencia ?? hoyEnBogota(), conMascara);
    } finally {
      bytes.fill(0);
      bytes = null;
    }
  }
  bytes.fill(0);
  bytes = null;
  if (!imagen.ok) return emitir({ ok: false, error: imagen.error }, 1);
  const resultado = parsearPdf417Amarilla(imagen.bytes, { divipol: buscarDivipol });
  imagen.bytes.fill(0);
  if (!resultado.ok) return emitir({ ok: false, tipo: "pdf417", error: resultado.error }, 2);
  const conLugar = conLugarNacimiento(resultado, buscarDivipol); // LPI-08, compartido con la PWA (OFF-08).
  const salida = conMascara ? { ...conLugar, campos: enmascararCamposPdf417(conLugar.campos) } : conLugar;
  return emitir({ ok: true, tipo: "pdf417", intento: imagen.intento, enmascarado: conMascara, resultado: salida }, 0);
}

await principal(process.argv.slice(2));
