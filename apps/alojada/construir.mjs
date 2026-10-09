// Compila la página alojada `/v/{token}` (sdk-integracion, SDK-14) en un único `index.html`: el bundle de `src/main.ts`
// (núcleo @lector-cedula/web desde su fuente) va en línea en el <script> con nonce, así la CSP del servidor no necesita
// `unsafe-inline` ni otra ruta. `__NONCE__` y `__CONFIG__` los rellena el servidor en cada petición.
// Uso: node apps/alojada/construir.mjs [directorio-de-salida]   (por omisión, apps/alojada/dist)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const aqui = fileURLToPath(new URL(".", import.meta.url));
const repo = join(aqui, "..", "..");
const salida = resolve(process.argv[2] ?? join(aqui, "dist"));
const MARCA = "/*__PAGINA__*/";

const resultado = await build({
  entryPoints: [join(aqui, "src", "main.ts")],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "none",
  logLevel: "warning",
  external: ["node:*"],
  alias: {
    "@lector-cedula/web": join(repo, "packages", "web", "src", "index.ts"),
    "@lector-cedula/capture": join(repo, "packages", "capture", "src"),
    "@lector-cedula/parsers": join(repo, "packages", "parsers", "src"),
  },
});
const js = resultado.outputFiles[0]?.text ?? "";
if (js.includes("__NONCE__") || js.includes("__CONFIG__")) throw new Error("el bundle contiene una marca de la plantilla");
const plantilla = await readFile(join(aqui, "index.html"), "utf8");
if (!plantilla.includes(MARCA)) throw new Error("index.html sin la marca del bundle");
// Dentro de <script> ningún `</script` puede cerrar el elemento.
const html = plantilla.replace(MARCA, () => js.replaceAll("</script", "<\\/script"));
await mkdir(salida, { recursive: true });
await writeFile(join(salida, "index.html"), html);
process.stdout.write(`alojada: ${join(salida, "index.html")} (${Buffer.byteLength(html)} bytes)\n`);
