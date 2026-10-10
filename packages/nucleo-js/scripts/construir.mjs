// Construye dist/nucleo.js (sdk-nativo, NAT-07, design.md decisión 1): un único IIFE ES2020, sin DOM ni E/S, con
// parsers, edad, máscara y la máquina de estados importados desde su fuente (packages/parsers, packages/capture y
// packages/web), no copiados. Uso: node packages/nucleo-js/scripts/construir.mjs [--salida <ruta>]
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const dirPaquete = fileURLToPath(new URL("..", import.meta.url));
const raiz = resolve(dirPaquete, "..", "..");

/** Resuelve `@lector-cedula/parsers` y sus subrutas (`/divipola`, `/divipol-2018`) a su fuente TypeScript. */
export const fuentesParsers = {
  name: "fuentes-parsers",
  setup(b) {
    b.onResolve({ filter: /^@lector-cedula\/parsers(\/[a-z0-9-]+)?$/ }, (a) => {
      const sub = a.path.slice("@lector-cedula/parsers".length).replace(/^\//, "");
      return { path: resolve(raiz, "packages", "parsers", "src", ...(sub ? [sub] : []), "index.ts") };
    });
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

/**
 * Oráculo de calidad de las pruebas Kotlin (tarea 1.3, NAT-03 y NAT-04): `oraculo/calidad.ts` en `dist/oraculo-calidad.js`.
 * Solo pruebas: no entra en el bundle ni en el AAR, y no cuenta para el presupuesto de NAT-18.
 */
export async function construirOraculo({ salida = resolve(dirPaquete, "dist", "oraculo-calidad.js") } = {}) {
  const { build } = await import("esbuild");
  await build({ ...opcionesNucleo(salida), entryPoints: [resolve(dirPaquete, "oraculo", "calidad.ts")], minify: false });
  return salida;
}

/** Sustituye `mrz/entorno.ts` (Tesseract.js y PNG, solo E/S) por un módulo vacío: el oráculo MRZ no hace OCR. */
const sinEntornoMrz = {
  name: "sin-entorno-mrz",
  setup(b) {
    b.onResolve({ filter: /^\.\/entorno\.js$/ }, (a) => (/[\\/]mrz[\\/]lector\.ts$/u.test(a.importer) ? { path: "entorno-vacio", namespace: "sin-entorno" } : undefined));
    b.onLoad({ filter: /.*/, namespace: "sin-entorno" }, () => ({
      contents: "export const codificarPng = () => { throw new Error(\"sin-ocr\"); }; export const crearWorkerTesseract = codificarPng; export const opcionesWorker = codificarPng;",
      loader: "js",
    }));
  },
};

/**
 * Oráculo MRZ de las pruebas Kotlin (tarea 1.5, NAT-06): `oraculo/mrz.ts` en `dist/oraculo-mrz.js`, con el plan de vistas
 * de `packages/capture/src/mrz` y sin OCR. Solo pruebas: no entra en el bundle ni en el AAR.
 */
export async function construirOraculoMrz({ salida = resolve(dirPaquete, "dist", "oraculo-mrz.js") } = {}) {
  const { build } = await import("esbuild");
  const base = opcionesNucleo(salida);
  await build({ ...base, entryPoints: [resolve(dirPaquete, "oraculo", "mrz.ts")], minify: false, plugins: [...base.plugins, sinEntornoMrz] });
  return salida;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const i = process.argv.indexOf("--salida");
  const ruta = await construirNucleo(i >= 0 ? { salida: resolve(process.argv[i + 1]) } : {});
  process.stdout.write(`nucleo-js: ${ruta}\n`);
  if (i < 0) process.stdout.write(`oráculo de calidad (solo pruebas): ${await construirOraculo()}\n`);
  if (i < 0) process.stdout.write(`oráculo MRZ (solo pruebas): ${await construirOraculoMrz()}\n`);
}
