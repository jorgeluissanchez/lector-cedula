// SDK-56 (tarea B.6): presupuesto de descarga del modo back ligero. Empaqueta con esbuild el grafo que el modo back
// carga en el navegador (núcleo, dependencias por omisión y cliente del protocolo, con todo lo que importan) y suma el
// gzip nivel 9 de ese JS más los recursos no `pesado` de `manifest.json` (Worker de calidad) y el propio manifiesto.
// Uso: node packages/web/scripts/tamano-back.mjs [--fixture <archivo>]  (con --fixture mide solo ese archivo)
// Sale con 1 si supera PRESUPUESTO_BACK (design.md de sdk-integracion).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

/** design.md, "Pruebas del modelo backend propio": medido en B.6 (21 574 B, 2026-10-09) + 10 %, tope 300 KiB. */
export const PRESUPUESTO_BACK = 23_732;

const raiz = fileURLToPath(new URL("..", import.meta.url));
const gz = (b) => gzipSync(b, { level: 9 }).byteLength;

export async function medirBack() {
  const dist = join(raiz, "dist");
  const entrada = [
    `import { crearLector } from "./dist/index.js";`,
    `import * as d from "./dist/dependencias.js";`,
    `import * as v from "./dist/verificacion.js";`,
    "globalThis.__back = [crearLector, d, v];",
  ].join("\n");
  const r = await build({
    stdin: { contents: entrada, resolveDir: raiz, loader: "js" },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    logLevel: "silent",
    external: ["node:*"],
    // Los imports dinámicos del modo front (lectura headless, precarga) no se cargan en el modo back.
    plugins: [
      {
        name: "sin-motor-front",
        setup(b) {
          b.onResolve({ filter: /lectura-headless\.js$/ }, (a) => ({ path: a.path, external: true }));
        },
      },
    ],
  });
  const js = r.outputFiles.reduce((s, f) => s + gz(f.contents), 0);
  const manifiestoBytes = await readFile(join(dist, "assets", "manifest.json"));
  const manifiesto = JSON.parse(manifiestoBytes.toString("utf8"));
  let ligeros = 0;
  for (const e of manifiesto.recursos) if (e.pesado !== true && e.archivo.endsWith(".js")) ligeros += gz(await readFile(join(dist, "assets", e.archivo)));
  return { js, ligeros, manifiesto: gz(manifiestoBytes), total: js + ligeros + gz(manifiestoBytes) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf("--fixture");
  let total;
  if (i > 0) {
    total = (await readFile(process.argv[i + 1])).byteLength;
    process.stdout.write(`modo back (fixture): ${total} B (límite ${PRESUPUESTO_BACK} B)\n`);
  } else {
    const m = await medirBack();
    total = m.total;
    process.stdout.write(`modo back: ${total} B gzip (JS ${m.js}, Worker de calidad ${m.ligeros}, manifiesto ${m.manifiesto}; límite ${PRESUPUESTO_BACK} B)\n`);
  }
  if (total > PRESUPUESTO_BACK) {
    process.stdout.write("modo back: supera PRESUPUESTO_BACK\n");
    process.exitCode = 1;
  }
}
