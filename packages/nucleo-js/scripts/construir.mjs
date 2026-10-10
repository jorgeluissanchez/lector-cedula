// Construye dist/nucleo.js (sdk-nativo, NAT-07, design.md decisión 1): un único IIFE ES2020, sin DOM ni E/S, con
// parsers, edad, máscara y la máquina de estados importados desde su fuente (packages/parsers, packages/capture y
// packages/web), no copiados. Uso: node packages/nucleo-js/scripts/construir.mjs [--salida <ruta>]
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const dirPaquete = fileURLToPath(new URL("..", import.meta.url));
const raiz = resolve(dirPaquete, "..", "..");

/** Resuelve `@lector-cedula/parsers` a su fuente TypeScript. */
const fuentesParsers = {
  name: "fuentes-parsers",
  setup(b) {
    b.onResolve({ filter: /^@lector-cedula\/parsers$/ }, () => ({ path: resolve(raiz, "packages", "parsers", "src", "index.ts") }));
  },
};

/** Opciones de esbuild compartidas por la construcción y la medición de tamaño (NAT-18). */
export function opcionesNucleo(salida) {
  return {
    entryPoints: [resolve(dirPaquete, "src", "global.ts")],
    outfile: salida,
    bundle: true,
    format: "iife",
    target: "es2020",
    platform: "neutral",
    minify: true,
    legalComments: "none",
    charset: "utf8",
    absWorkingDir: raiz,
    logLevel: "silent",
    // Las fuentes, no dist: el bundle no depende de que los paquetes estén compilados.
    plugins: [fuentesParsers],
    // `URL` propio dentro del IIFE: QuickJS no la tiene y JavaScriptCore puede no tenerla (src/url.ts).
    inject: [resolve(dirPaquete, "src", "url.ts")],
    mainFields: ["module", "main"],
    write: true,
  };
}

/** Construye el bundle en `salida` (por omisión `dist/nucleo.js`) y devuelve la ruta. */
export async function construirNucleo({ salida = resolve(dirPaquete, "dist", "nucleo.js") } = {}) {
  const { build } = await import("esbuild");
  await build(opcionesNucleo(salida));
  return salida;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const i = process.argv.indexOf("--salida");
  const ruta = await construirNucleo(i >= 0 ? { salida: resolve(process.argv[i + 1]) } : {});
  process.stdout.write(`nucleo-js: ${ruta}\n`);
}
