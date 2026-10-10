#!/usr/bin/env node
// Control de licencias del binario nativo (sdk-nativo, NAT-16, tarea 1.5; decisión del orquestador del 2026-10-10):
// libjpeg (licencia IJG) y libpng (libpng-2.0) no están en la lista permitida, así que Leptonica se compila sin ellas.
// Falla si alguna entra en el AAR, en una biblioteca .so o en el informe de dependencias de Gradle:
//   - entradas libjpeg*.so, libturbojpeg*.so o libpng*.so (incluida libpngx.so de Tesseract4Android) en un AAR/APK/zip;
//   - símbolos de la API o mensajes propios de libjpeg o libpng dentro de un .so (los de Leptonica, como
//     "no libpng: can't read data", no cuentan: son sus stubs);
//   - coordenadas con jpeg o png en `dependencias-resueltas.txt`.
// Uso: node tools/nativo/sin-jpeg-png.mjs <archivo.aar|.so|.zip|dependencias-resueltas.txt|directorio>...
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

/** Bibliotecas prohibidas por nombre de archivo. */
export const NOMBRE_PROHIBIDO = /(^|\/)lib(jpeg|turbojpeg|png)[^/]*\.so$/u;

/** Marcas de libjpeg y libpng en un binario: símbolos de su API y mensajes de error que solo ellas contienen. */
export const MARCAS = Object.freeze([
  "jpeg_std_error",
  "jpeg_CreateDecompress",
  "jpeg_CreateCompress",
  "jpeg_read_header",
  "jpeg_start_decompress",
  "jpeg_finish_compress",
  "Not a JPEG file: starts with",
  "Bogus marker length",
  "png_create_read_struct",
  "png_create_write_struct",
  "png_read_info",
  "png_sig_cmp",
  "png_get_libpng_ver",
  "Incompatible libpng version",
  "libpng error",
]);

/** Coordenadas del informe de Gradle que delatan un códec prohibido. */
const COORDENADA_PROHIBIDA = /^[\s|+\\-]*[+\\]---\s+\S*(jpeg|png)\S*/imu;

/** Hallazgos (texto) de un binario `.so`: cada marca presente. */
export function hallazgosEnBinario(nombre, bytes) {
  const texto = Buffer.from(bytes).toString("latin1");
  const r = MARCAS.filter((m) => texto.includes(m)).map((m) => `${nombre}: contiene "${m}"`);
  if (NOMBRE_PROHIBIDO.test(nombre)) r.unshift(`${nombre}: biblioteca prohibida`);
  return r;
}

/** Hallazgos del informe `dependencias-resueltas.txt`. */
export function hallazgosEnInforme(nombre, texto) {
  return String(texto)
    .split(/\r?\n/u)
    .filter((l) => COORDENADA_PROHIBIDA.test(l))
    .map((l) => `${nombre}: dependencia prohibida ${l.replace(/^[\s|+\\-]*/u, "")}`);
}

/** Entradas `{ nombre, datos }` de un zip (AAR, APK, JAR), con compresión stored o deflate. Lanza si no es un zip. */
export function entradasZip(buf) {
  const b = Buffer.from(buf);
  let fin = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error("no es un zip");
  const n = b.readUInt16LE(fin + 10);
  let p = b.readUInt32LE(fin + 16);
  const r = [];
  for (let k = 0; k < n; k++) {
    if (b.readUInt32LE(p) !== 0x02014b50) throw new Error("directorio central dañado");
    const metodo = b.readUInt16LE(p + 10);
    const comprimido = b.readUInt32LE(p + 20);
    const largoNombre = b.readUInt16LE(p + 28);
    const extra = b.readUInt16LE(p + 30);
    const comentario = b.readUInt16LE(p + 32);
    const local = b.readUInt32LE(p + 42);
    const nombre = b.subarray(p + 46, p + 46 + largoNombre).toString("utf8");
    const inicio = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const crudo = b.subarray(inicio, inicio + comprimido);
    r.push({ nombre, datos: metodo === 0 ? crudo : metodo === 8 ? inflateRawSync(crudo) : Buffer.alloc(0) });
    p += 46 + largoNombre + extra + comentario;
  }
  return r;
}

/** Hallazgos de una ruta: zip (recorre .so y zips anidados), .so, informe o directorio. */
export function revisar(ruta) {
  if (!existsSync(ruta)) return [`${ruta}: no existe`];
  if (statSync(ruta).isDirectory()) {
    return readdirSync(ruta).flatMap((n) => {
      const r = join(ruta, n);
      return statSync(r).isDirectory() || /\.(so|aar|apk|zip|jar)$|dependencias-resueltas\.txt$/u.test(n) ? revisar(r) : [];
    });
  }
  const datos = readFileSync(ruta);
  return revisarDatos(ruta, datos);
}

function revisarDatos(nombre, datos) {
  if (nombre.endsWith(".txt")) return hallazgosEnInforme(nombre, datos.toString("utf8"));
  if (/\.(aar|apk|zip|jar)$/u.test(nombre)) {
    return entradasZip(datos).flatMap((e) => {
      const interno = `${nombre}!${e.nombre}`;
      if (NOMBRE_PROHIBIDO.test(e.nombre) || e.nombre.endsWith(".so")) return hallazgosEnBinario(interno, e.datos);
      if (/\.(jar|aar)$/u.test(e.nombre)) return revisarDatos(interno, e.datos);
      return [];
    });
  }
  return hallazgosEnBinario(nombre, datos);
}

/** Bibliotecas .so revisadas dentro de las rutas (para exigir que el control no sea vacío). */
export function contarBinarios(rutas) {
  let n = 0;
  const contar = (nombre, datos) => {
    if (/\.(aar|apk|zip|jar)$/u.test(nombre)) for (const e of entradasZip(datos)) contar(e.nombre, e.datos);
    else if (nombre.endsWith(".so")) n++;
  };
  for (const r of rutas) {
    if (existsSync(r) && statSync(r).isFile()) contar(r, readFileSync(r));
  }
  return n;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rutas = process.argv.slice(2);
  if (rutas.length === 0) {
    process.stderr.write("uso: node tools/nativo/sin-jpeg-png.mjs <aar|so|zip|txt|dir>...\n");
    process.exit(2);
  }
  const hallazgos = rutas.flatMap(revisar);
  const binarios = contarBinarios(rutas);
  // Un control que no revisa ningún .so no prueba nada: con un AAR, APK o .so en la entrada, al menos uno.
  if (binarios === 0 && rutas.some((r) => !r.endsWith(".txt"))) hallazgos.push("ninguna biblioteca .so revisada");
  if (hallazgos.length > 0) {
    process.stderr.write(`sin-jpeg-png: ${hallazgos.length} hallazgo(s)\n${hallazgos.join("\n")}\n`);
    process.exit(1);
  }
  process.stdout.write(`sin-jpeg-png: OK (${binarios} biblioteca(s) .so en archivos, sin libjpeg ni libpng)\n`);
}
