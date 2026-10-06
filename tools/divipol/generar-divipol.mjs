#!/usr/bin/env node
/**
 * generar-divipol: CLI del generador DIVIPOL (cambio divipol-registraduria, design.md decisiones 7 y 8).
 *
 * Uso:
 *   node tools/divipol/generar-divipol.mjs               # genera los archivos desde las instantáneas (sin red)
 *   node tools/divipol/generar-divipol.mjs --verificar   # código 1 si los archivos versionados difieren de una regeneración
 *   node tools/divipol/generar-divipol.mjs --descargar   # descarga las fuentes del manifiesto y verifica su SHA-256 (única operación con red)
 *
 * Opciones (para pruebas):
 *   --manifiesto <ruta>   manifiesto de fuentes (por defecto tools/divipol/fuentes.json)
 *   --fuentes <dir>       directorio de instantáneas (por defecto tools/divipol/fuentes)
 *   --salida <dir>        raíz de los archivos generados (por defecto packages/parsers/src)
 *
 * El manifiesto admite URLs `https:` y `file:`. Toda escritura va a archivos temporales que se renombran solo si
 * todo el proceso tuvo éxito. Sale con código 1 ante cualquier error, sin escribir archivos.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ErrorDivipol, parsearLocalities, serializarTabla, verificarFuente } from "./divipol-lib.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const POR_DEFECTO = {
  manifiesto: join(RAIZ, "tools", "divipol", "fuentes.json"),
  fuentes: join(RAIZ, "tools", "divipol", "fuentes"),
  salida: join(RAIZ, "packages", "parsers", "src"),
};
const OPCIONES_CON_VALOR = new Set(["--manifiesto", "--fuentes", "--salida"]);
const MODOS = new Set(["--descargar", "--verificar"]);
const ARCHIVO_TABLA = "divipol/tabla.generated.ts";

function leerArgumentos(argv) {
  const opciones = { ...POR_DEFECTO, modo: "generar" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (OPCIONES_CON_VALOR.has(arg)) {
      const valor = argv[++i];
      if (valor === undefined) throw new ErrorDivipol(`falta el valor de ${arg}`);
      opciones[arg.slice(2)] = resolve(valor);
    } else if (MODOS.has(arg)) {
      if (opciones.modo !== "generar") throw new ErrorDivipol(`modos incompatibles: --${opciones.modo} y ${arg}`);
      opciones.modo = arg.slice(2);
    } else {
      throw new ErrorDivipol(`argumento desconocido: ${arg}`);
    }
  }
  return opciones;
}

function leerManifiesto(ruta) {
  let manifiesto;
  try {
    manifiesto = JSON.parse(readFileSync(ruta, "utf8"));
  } catch (e) {
    throw new ErrorDivipol(`no se pudo leer el manifiesto ${ruta}: ${e.message}`);
  }
  if (!Array.isArray(manifiesto) || manifiesto.length === 0) {
    throw new ErrorDivipol(`el manifiesto ${ruta} debe ser un arreglo no vacío de fuentes`);
  }
  for (const fuente of manifiesto) {
    const id = fuente?.id;
    if (typeof id !== "string" || id === "") throw new ErrorDivipol(`fuente sin id en ${ruta}`);
    if (typeof fuente.sha256 !== "string" || !/^[0-9a-fA-F]{64}$/.test(fuente.sha256)) {
      throw new ErrorDivipol(`fuente ${id}: sha256 debe tener 64 caracteres hexadecimales`);
    }
    if (typeof fuente.archivo !== "string" || fuente.archivo === "" || basename(fuente.archivo) !== fuente.archivo
      || fuente.archivo === "." || fuente.archivo === "..") {
      throw new ErrorDivipol(`fuente ${id}: archivo debe ser un nombre sin directorios (${fuente.archivo})`);
    }
    if (typeof fuente.url !== "string") throw new ErrorDivipol(`fuente ${id}: falta url`);
  }
  return manifiesto;
}

async function obtenerBytes(fuente) {
  let url;
  try {
    url = new URL(fuente.url);
  } catch {
    throw new ErrorDivipol(`fuente ${fuente.id}: URL inválida ${fuente.url}`);
  }
  if (url.protocol === "file:") {
    try {
      return readFileSync(fileURLToPath(url));
    } catch (e) {
      throw new ErrorDivipol(`fuente ${fuente.id}: no se pudo leer ${fuente.url}: ${e.message}`);
    }
  }
  if (url.protocol === "https:") {
    let respuesta;
    try {
      respuesta = await fetch(url, { redirect: "follow" });
    } catch (e) {
      throw new ErrorDivipol(`fuente ${fuente.id}: error de red al descargar ${fuente.url}: ${e.message}`);
    }
    if (!respuesta.ok) throw new ErrorDivipol(`fuente ${fuente.id}: HTTP ${respuesta.status} al descargar ${fuente.url}`);
    return Buffer.from(await respuesta.arrayBuffer());
  }
  throw new ErrorDivipol(`fuente ${fuente.id}: esquema ${url.protocol} no admitido (solo https: y file:)`);
}

/**
 * Escribe todos los archivos o ninguno: primero a temporales junto al destino y después renombra.
 * @param {{ruta: string, contenido: string | Uint8Array}[]} archivos
 */
function escribirAtomico(archivos) {
  const temporales = [];
  try {
    for (const { ruta, contenido } of archivos) {
      mkdirSync(dirname(ruta), { recursive: true });
      const temporal = `${ruta}.tmp-${process.pid}`;
      temporales.push({ temporal, ruta });
      writeFileSync(temporal, contenido);
    }
    for (const { temporal, ruta } of temporales) renameSync(temporal, ruta);
  } catch (e) {
    for (const { temporal } of temporales) rmSync(temporal, { force: true });
    throw e;
  }
}

async function descargar(opciones) {
  const manifiesto = leerManifiesto(opciones.manifiesto);
  const archivos = [];
  for (const fuente of manifiesto) {
    const bytes = await obtenerBytes(fuente);
    verificarFuente(bytes, fuente.sha256, fuente.id);
    archivos.push({ ruta: join(opciones.fuentes, fuente.archivo), contenido: bytes });
  }
  escribirAtomico(archivos);
  for (const fuente of manifiesto) console.log(`divipol: ${fuente.id} verificada (${fuente.sha256.toLowerCase()})`);
}

/** Lee una instantánea versionada y comprueba su SHA-256 contra el manifiesto antes de usarla. */
function leerInstantanea(opciones, manifiesto, id) {
  const fuente = manifiesto.find((f) => f.id === id);
  if (!fuente) throw new ErrorDivipol(`el manifiesto ${opciones.manifiesto} no declara la fuente ${id}`);
  const ruta = join(opciones.fuentes, fuente.archivo);
  let bytes;
  try {
    bytes = readFileSync(ruta);
  } catch (e) {
    throw new ErrorDivipol(`fuente ${id}: no se pudo leer la instantánea ${ruta}: ${e.message}`);
  }
  verificarFuente(bytes, fuente.sha256, id);
  let texto;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ErrorDivipol(`fuente ${id}: la instantánea ${ruta} no es UTF-8 válido`);
  }
  return { fuente, texto };
}

/** Genera en memoria todos los archivos de salida: [{ nombre relativo a --salida, contenido }]. */
function generarArchivos(opciones) {
  const manifiesto = leerManifiesto(opciones.manifiesto);
  const { fuente, texto } = leerInstantanea(opciones, manifiesto, "eitol-localities");
  for (const campo of ["repositorio", "commit", "ruta"]) {
    if (typeof fuente[campo] !== "string" || fuente[campo] === "") {
      throw new ErrorDivipol(`fuente ${fuente.id}: falta ${campo} en el manifiesto`);
    }
  }
  const filas = parsearLocalities(texto);
  return [{ nombre: ARCHIVO_TABLA, contenido: serializarTabla(filas, { ...fuente, sha256: fuente.sha256.toLowerCase() }) }];
}

function generar(opciones) {
  const archivos = generarArchivos(opciones);
  escribirAtomico(archivos.map(({ nombre, contenido }) => ({ ruta: join(opciones.salida, nombre), contenido })));
  for (const { nombre } of archivos) console.log(`divipol: generado ${nombre}`);
}

function verificar(opciones) {
  const distintos = generarArchivos(opciones)
    .filter(({ nombre, contenido }) => {
      const ruta = join(opciones.salida, nombre);
      return !existsSync(ruta) || !readFileSync(ruta).equals(Buffer.from(contenido, "utf8"));
    })
    .map(({ nombre }) => join(opciones.salida, nombre));
  if (distintos.length > 0) {
    throw new ErrorDivipol(
      `archivos generados desactualizados (ejecuta npm run divipol:generar):\n${distintos.map((r) => `  - ${r}`).join("\n")}`,
    );
  }
  console.log("divipol: archivos generados al día");
}

async function main(argv) {
  const opciones = leerArgumentos(argv);
  if (opciones.modo === "descargar") return descargar(opciones);
  if (opciones.modo === "verificar") return verificar(opciones);
  return generar(opciones);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`divipol: ${e instanceof ErrorDivipol ? e.message : e.stack}`);
    process.exitCode = 1;
  });
}
