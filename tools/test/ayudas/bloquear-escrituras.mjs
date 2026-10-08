// Hook de precarga (`node --import`) para LPI-07 "No escribe a disco" (backlog F1 de docs/decisiones/backlog-harness-pruebas.md).
// Sustituye en el proceso hijo toda API de node:fs que crea, modifica o borra archivos por una que lanza un error y deja
// la marca ESCRITURA-PROHIBIDA en stderr. Así la prueba detecta escrituras de la CLI sin comparar el repositorio entero,
// que otros procesos (Playwright, Lighthouse, pruebas paralelas) modifican durante la misma corrida.
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

export const MARCA = "ESCRITURA-PROHIBIDA";

function prohibir(api, objetivo) {
  const mensaje = `${MARCA}: ${api} ${typeof objetivo === "string" ? objetivo : String(objetivo ?? "")}`;
  process.stderr.write(`${mensaje}\n`);
  const error = new Error(mensaje);
  error.code = "EACCES";
  return error;
}

/** Banderas de apertura que permiten escribir: cualquier cadena con w, a o +, o un número con O_WRONLY/O_RDWR/O_CREAT/O_APPEND/O_TRUNC. */
function escribe(flags) {
  if (flags === undefined || flags === null) return false;
  if (typeof flags === "string") return /[wa+]/.test(flags);
  const { O_WRONLY, O_RDWR, O_CREAT, O_APPEND, O_TRUNC } = fs.constants;
  return (flags & (O_WRONLY | O_RDWR | O_CREAT | O_APPEND | O_TRUNC)) !== 0;
}

const SIEMPRE = [
  "writeFile", "appendFile", "mkdir", "mkdtemp", "rename", "copyFile", "cp", "rm", "rmdir", "unlink",
  "truncate", "symlink", "link", "utimes", "chmod", "chown",
];

for (const nombre of SIEMPRE) {
  const sinc = `${nombre}Sync`;
  if (typeof fs[sinc] === "function") fs[sinc] = (objetivo) => { throw prohibir(sinc, objetivo); };
  if (typeof fs[nombre] === "function") {
    fs[nombre] = (objetivo, ...resto) => {
      const cb = resto.findLast((r) => typeof r === "function");
      const error = prohibir(nombre, objetivo);
      if (cb) process.nextTick(cb, error);
      else throw error;
    };
  }
  if (typeof fs.promises[nombre] === "function") fs.promises[nombre] = async (objetivo) => { throw prohibir(`promises.${nombre}`, objetivo); };
}

const openSync = fs.openSync;
fs.openSync = (ruta, flags, ...resto) => {
  if (escribe(flags)) throw prohibir("openSync", ruta);
  return openSync(ruta, flags, ...resto);
};
const open = fs.open;
fs.open = (ruta, flags, ...resto) => {
  if (escribe(flags)) {
    const cb = resto.findLast((r) => typeof r === "function");
    const error = prohibir("open", ruta);
    if (cb) return process.nextTick(cb, error);
    throw error;
  }
  return open(ruta, flags, ...resto);
};
const openPromesa = fs.promises.open;
fs.promises.open = async (ruta, flags, ...resto) => {
  if (escribe(flags)) throw prohibir("promises.open", ruta);
  return openPromesa(ruta, flags, ...resto);
};
fs.createWriteStream = (ruta) => { throw prohibir("createWriteStream", ruta); };

// Las importaciones con nombre de node:fs (ESM) ven los reemplazos; node:fs/promises comparte el objeto fs.promises.
syncBuiltinESMExports();
