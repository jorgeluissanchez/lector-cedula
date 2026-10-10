// Construye `dist/assets` de @lector-cedula/web (sdk-integracion, SDK-04, SDK-39): Workers empaquetados con esbuild
// (un archivo cada uno, sin imports relativos: se cargan desde URL blob), WASM de zxing, worker y core de tesseract.js,
// `mrz.traineddata`, `THIRD_PARTY_LICENSES.txt` (SDK-26) y `manifest.json` con bytes y SHA-256 de cada archivo. Copia además
// LICENSE (MIT de la raíz) y THIRD_PARTY_LICENSES.txt a la raíz del paquete para el tarball.
// Uso: node packages/web/scripts/construir-assets.mjs [--solo-avisos]  (--solo-avisos, en prepack: sin esbuild ni copias)
import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { textoAvisosTercerosWeb } from "../../../tools/avisos-terceros.mjs";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const repo = join(raiz, "..", "..");
const salida = join(raiz, "dist", "assets");
const requerir = createRequire(join(raiz, "package.json"));
const paquete = JSON.parse(await readFile(join(raiz, "package.json"), "utf8"));

const soloAvisos = process.argv.includes("--solo-avisos");
const TIPOS = { ".txt": "text/plain", ".js": "text/javascript", ".wasm": "application/wasm", ".traineddata": "application/octet-stream" };
const tipo = (n) => TIPOS[Object.keys(TIPOS).find((e) => n.endsWith(e))] ?? "application/octet-stream";

const avisos = textoAvisosTercerosWeb();
await copyFile(join(repo, "LICENSE"), join(raiz, "LICENSE"));
await writeFile(join(raiz, "THIRD_PARTY_LICENSES.txt"), avisos);

if (!soloAvisos) {
  await rm(salida, { recursive: true, force: true });
  await mkdir(salida, { recursive: true });
  for (const nombre of ["lector", "calidad"]) {
    await build({
      entryPoints: [join(raiz, "src", "trabajadores", `${nombre}.ts`)],
      outfile: join(salida, `${nombre}.js`),
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      minify: true,
      legalComments: "eof",
      logLevel: "warning",
      // El cargador de Node de capture (node:*) nunca se ejecuta en el Worker.
      external: ["node:*"],
    });
  }
  const directorioCore = dirname(requerir.resolve("tesseract.js-core/package.json"));
  const copias = [
    [requerir.resolve("zxing-wasm/reader/zxing_reader.wasm"), "zxing_reader.wasm"],
    [join(dirname(requerir.resolve("tesseract.js/package.json")), "dist", "worker.min.js"), "tesseract-worker.min.js"],
    [join(directorioCore, "tesseract-core-simd-lstm.wasm.js"), "tesseract-core-simd-lstm.wasm.js"],
    [join(directorioCore, "tesseract-core-lstm.wasm.js"), "tesseract-core-lstm.wasm.js"],
    [join(repo, "models", "tesseract", "mrz.traineddata"), "mrz.traineddata"],
  ];
  for (const [origen, destino] of copias) await copyFile(origen, join(salida, destino));
}
await mkdir(salida, { recursive: true });
await writeFile(join(salida, "THIRD_PARTY_LICENSES.txt"), avisos);

// SDK-56: el motor pesado (Worker lector, zxing, tesseract y modelo MRZ) no se descarga en el modo back ligero.
const LIGEROS = new Set(["calidad.js", "THIRD_PARTY_LICENSES.txt"]);
const recursos = [];
for (const archivo of (await readdir(salida)).filter((n) => n !== "manifest.json").sort()) {
  const datos = await readFile(join(salida, archivo));
  recursos.push({ archivo, bytes: datos.byteLength, sha256: createHash("sha256").update(datos).digest("hex"), tipo: tipo(archivo), pesado: !LIGEROS.has(archivo) });
}
await writeFile(join(salida, "manifest.json"), `${JSON.stringify({ version: paquete.version, recursos }, null, 2)}\n`);
const total = recursos.reduce((s, r) => s + r.bytes, 0);
process.stdout.write(`assets: ${recursos.length} archivos, ${total} bytes\n`);
