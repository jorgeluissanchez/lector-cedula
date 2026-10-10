// Genera el JSON de umbrales de calidad del núcleo nativo (sdk-nativo, NAT-03; tarea 1.3) desde la fuente TypeScript:
// `UMBRALES_POR_DEFECTO` de packages/capture/src/calidad/umbrales.ts (CAL-08; desde la recalibración del 2026-10-10 ya
// no hay `LAPLACIANO_MINIMO_GUIADO`, OFF-25). Kotlin y Swift leen este JSON; nunca copian los números. Una prueba de Vitest falla si el
// JSON versionado se desfasa de la fuente. Uso: node packages/nucleo-js/scripts/generar-umbrales.mjs [--salida <ruta>]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dirPaquete = fileURLToPath(new URL("..", import.meta.url));
const raiz = resolve(dirPaquete, "..", "..");

/** Ruta versionada que empaqueta el núcleo Android (recurso de la JVM). */
export const RUTA_UMBRALES = resolve(raiz, "native", "android", "nucleo", "src", "main", "resources", "lectorcedula", "umbrales-calidad.json");

/** Umbrales de la fuente TypeScript, en el orden de la interfaz `Umbrales`. */
export async function umbralesFuente() {
  const { build } = await import("esbuild");
  const r = await build({
    stdin: {
      contents: 'export { UMBRALES_POR_DEFECTO } from "./packages/capture/src/calidad/umbrales.ts";',
      resolveDir: raiz,
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "neutral",
    write: false,
    logLevel: "silent",
  });
  const codigo = r.outputFiles[0].text;
  const m = await import(`data:text/javascript;base64,${Buffer.from(codigo).toString("base64")}`);
  return { ...m.UMBRALES_POR_DEFECTO };
}

/** Texto del JSON (estable: 2 espacios y salto final). */
export async function textoUmbrales() {
  const u = await umbralesFuente();
  return `${JSON.stringify({ origen: "packages/capture/src/calidad/umbrales.ts (generado; no editar)", umbrales: u }, null, 2)}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const i = process.argv.indexOf("--salida");
  const salida = i >= 0 ? resolve(process.argv[i + 1]) : RUTA_UMBRALES;
  mkdirSync(dirname(salida), { recursive: true });
  writeFileSync(salida, await textoUmbrales());
  process.stdout.write(`umbrales: ${salida}\n`);
}
