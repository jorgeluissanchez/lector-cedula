#!/usr/bin/env node
// Lee el PDF417 de la cédula amarilla desde una foto local (cambio leer-pdf417-desde-imagen, LPI-06 y LPI-07).
// Uso: npm run leer-foto -- [--sin-mascara] <ruta>
// Privacidad (principio III): la imagen solo se lee a memoria; no se escribe nada a disco, no hay telemetría y stdout
// solo lleva el JSON final. Por defecto enmascara NUIP y nombres. Rechaza rutas del repositorio salvo evals/real/.
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { decodificarPdf417Imagen } from "../packages/capture/dist/index.js";
import { buscarDivipol, parsearPdf417Amarilla } from "../packages/parsers/dist/index.js";

const USO = "uso: npm run leer-foto -- [--sin-mascara] <ruta-de-la-foto>";
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

function enmascararNuip(nuip) {
  if (typeof nuip !== "string") return nuip;
  if (nuip.length >= 8) return nuip.slice(0, 4) + "*".repeat(nuip.length - 6) + nuip.slice(-2);
  return "*".repeat(Math.max(0, nuip.length - 2)) + nuip.slice(-2);
}

function enmascararNombre(nombre) {
  if (typeof nombre !== "string") return nombre;
  return nombre.replace(/\S+/gu, (p) => p[0] + "*".repeat(p.length - 1));
}

function enmascarar(campos) {
  return {
    ...campos,
    numeroDocumento: enmascararNuip(campos.numeroDocumento),
    primerApellido: enmascararNombre(campos.primerApellido),
    segundoApellido: enmascararNombre(campos.segundoApellido),
    primerNombre: enmascararNombre(campos.primerNombre),
    segundoNombre: enmascararNombre(campos.segundoNombre),
  };
}

async function principal(argv) {
  const opciones = argv.filter((a) => a.startsWith("--"));
  const rutas = argv.filter((a) => !a.startsWith("--"));
  if (opciones.some((o) => o !== "--sin-mascara")) return fallarUso("opcion-desconocida");
  if (rutas.length !== 1) return fallarUso(rutas.length === 0 ? "falta-ruta" : "demasiadas-rutas");
  const conMascara = !opciones.includes("--sin-mascara");

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
  bytes = null;
  if (!imagen.ok) return emitir({ ok: false, error: imagen.error }, 1);
  const resultado = parsearPdf417Amarilla(imagen.bytes, { divipol: buscarDivipol });
  imagen.bytes.fill(0);
  if (!resultado.ok) return emitir({ ok: false, error: resultado.error }, 2);
  const salida = conMascara ? { ...resultado, campos: enmascarar(resultado.campos) } : resultado;
  return emitir({ ok: true, intento: imagen.intento, enmascarado: conMascara, resultado: salida }, 0);
}

await principal(process.argv.slice(2));
