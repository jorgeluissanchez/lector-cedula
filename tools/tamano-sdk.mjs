// Presupuesto de tamaño del SDK frontal (sdk-integracion, SDK-29, SDK-34, SDK-04): gzip nivel 9 de la carga inicial de
// cada paquete, empaquetada con esbuild (minify, splitting): se cuenta la entrada y sus imports estáticos; los
// `import()` dinámicos (dependencias del navegador, leerDocumento, Workers) quedan fuera, como en el bundler del
// integrador. También informa el tamaño de `@lector-cedula/web/assets` (sin límite duro; design.md, segunda ronda).
// Uso: node tools/tamano-sdk.mjs                  -> todos los paquetes presentes
//      node tools/tamano-sdk.mjs --entrada <js> --limite <bytes>   -> mide un archivo ya empaquetado (fixtures)
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const raiz = fileURLToPath(new URL("..", import.meta.url));

export const PRESUPUESTOS = Object.freeze([
  { paquete: "web", entrada: "packages/web/dist/index.js", limite: 30_720, externos: [] },
  { paquete: "react", entrada: "packages/react/dist/index.js", limite: 3_072, externos: ["react", "@lector-cedula/web"] },
  { paquete: "angular", entrada: "packages/angular/dist/index.js", limite: 3_072, externos: ["@angular/*", "@lector-cedula/web"] },
  { paquete: "vue", entrada: "packages/vue/dist/index.js", limite: 3_072, externos: ["vue", "@lector-cedula/web"] },
  { paquete: "elementos", entrada: "packages/elementos/dist/index.js", limite: 61_440, externos: [] },
]);

export const gzip9 = (datos) => gzipSync(datos, { level: 9 }).byteLength;

/** Bytes gzip de la entrada más sus imports estáticos tras empaquetar. */
export async function medirEntrada(entrada, externos = []) {
  const { build } = await import("esbuild");
  const dir = await mkdtemp(join(tmpdir(), "tamano-sdk-"));
  try {
    const r = await build({ entryPoints: [entrada], bundle: true, splitting: true, format: "esm", minify: true, platform: "browser", target: "es2022", outdir: dir, absWorkingDir: raiz, metafile: true, write: true, external: externos, logLevel: "silent", legalComments: "none" });
    const salidas = r.metafile.outputs;
    const clave = Object.keys(salidas).find((k) => salidas[k].entryPoint !== undefined);
    const vistos = new Set();
    const pila = [clave];
    while (pila.length > 0) {
      const k = pila.pop();
      if (vistos.has(k)) continue;
      vistos.add(k);
      for (const i of salidas[k].imports) if (i.kind === "import-statement" && !i.external) pila.push(i.path);
    }
    let total = 0;
    for (const k of vistos) total += gzip9(await readFile(join(raiz, k)));
    return total;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function tamanoDirectorio(dir) {
  let total = 0;
  for (const n of await readdir(dir)) total += (await stat(join(dir, n))).size;
  return total;
}

async function existe(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function principal(argv) {
  const i = argv.indexOf("--entrada");
  if (i >= 0) {
    const archivo = argv[i + 1];
    const limite = Number(argv[argv.indexOf("--limite") + 1]);
    const t = gzip9(await readFile(archivo));
    const ok = t <= limite;
    console.log(`${archivo}: ${t} B gzip (límite ${limite} B) ${ok ? "OK" : "EXCEDE"}`);
    return ok ? 0 : 1;
  }
  let codigo = 0;
  for (const p of PRESUPUESTOS) {
    const entrada = join(raiz, p.entrada);
    if (!(await existe(entrada))) {
      console.log(`@lector-cedula/${p.paquete}: sin compilar o inexistente, se omite`);
      continue;
    }
    const t = await medirEntrada(entrada, p.externos);
    const ok = t <= p.limite;
    if (!ok) codigo = 1;
    console.log(`@lector-cedula/${p.paquete}: ${t} B gzip (límite ${p.limite} B) ${ok ? "OK" : "EXCEDE"}`);
  }
  const assets = join(raiz, "packages/web/dist/assets");
  if (await existe(assets)) console.log(`@lector-cedula/web/assets: ${await tamanoDirectorio(assets)} B (informativo)`);
  return codigo;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await principal(process.argv.slice(2));
}
